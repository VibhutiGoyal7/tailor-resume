// resume-engine facade — parse + retrieve + confirm stages (Milestones 4–5).
// Parser, embedder, and enqueuer are injected fakes/stubs (no LLM, no Voyage,
// no Redis). The DB + pgvector flow is gated on RUN_DB_TESTS=1.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@tailor/db';
import type { JdParsed, ParseJDJob, RetrieveCandidatesJob } from '@tailor/shared-types';
import { profileModule } from '../profile/index.js';
import { resumeEngine } from './index.js';
import { setJdParser, type JdParser } from './jd-parser.js';
import { setEnqueuer, type Enqueuer } from './queue.js';
import { setEmbedder, StubEmbedder } from '../embedding/index.js';

const runDb = process.env.RUN_DB_TESTS === '1';

const PARSED: JdParsed = {
  required_skills: ['Go', 'Kubernetes'],
  role_type: 'Platform Engineer',
  seniority: 'Senior',
  company_type: 'Scale-up',
  key_responsibilities: ['Own the CI/CD platform'],
};

/** No-op enqueuer: tests drive stage transitions by calling run*Stage directly. */
function fakeEnqueuer(sink?: {
  parse?: ParseJDJob[];
  retrieve?: RetrieveCandidatesJob[];
}): Enqueuer {
  return {
    enqueueParse: async (job) => void sink?.parse?.push(job),
    enqueueRetrieve: async (job) => void sink?.retrieve?.push(job),
  };
}

describe.skipIf(!runDb)('resumeEngine parse + retrieve (DB)', () => {
  const email = 'resume-engine@itest.local';
  let userId: string;

  const fakeParser: JdParser = { parse: async () => PARSED };

  async function cleanup(): Promise<void> {
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u) return;
    const items = await prisma.experienceItem.findMany({
      where: { userId: u.id },
      select: { id: true },
    });
    await prisma.experienceBullet.deleteMany({
      where: { experienceItemId: { in: items.map((i) => i.id) } },
    });
    await prisma.experienceItem.deleteMany({ where: { userId: u.id } });
    await prisma.tailoringJob.deleteMany({ where: { userId: u.id } });
    await prisma.tailoredResume.deleteMany({ where: { userId: u.id } });
    await prisma.user.deleteMany({ where: { id: u.id } });
  }

  beforeAll(async () => {
    await cleanup();
    const user = await prisma.user.create({ data: { email, passwordHash: 'x' } });
    userId = user.id;
    // A small Experience Bank to retrieve against.
    const item = await profileModule.addExperienceItem(userId, {
      type: 'role',
      rawInput: 'Platform team',
      structuredFields: {},
    });
    await profileModule.addBullet(userId, item.id, {
      text: 'Built the CI/CD platform on Kubernetes',
      tags: ['Kubernetes', 'Go'],
    });
    await profileModule.addBullet(userId, item.id, {
      text: 'Wrote unrelated marketing copy',
      tags: ['Writing'],
    });
  });

  beforeEach(() => {
    setJdParser(fakeParser);
    setEmbedder(new StubEmbedder());
    setEnqueuer(fakeEnqueuer());
  });

  afterAll(cleanup);

  it('requestTailoredResume creates a parsing job and enqueues parse', async () => {
    const sink = { parse: [] as ParseJDJob[], retrieve: [] as RetrieveCandidatesJob[] };
    setEnqueuer(fakeEnqueuer(sink));

    const { jobId } = await resumeEngine.requestTailoredResume(userId, 'a job description');
    const job = await prisma.tailoringJob.findUnique({ where: { id: jobId } });
    expect(job?.stage).toBe('parsing');
    expect(sink.parse).toEqual([{ jobId, jdText: 'a job description' }]);
  });

  it('parse advances to retrieving and enqueues the retrieve job', async () => {
    const sink = { parse: [] as ParseJDJob[], retrieve: [] as RetrieveCandidatesJob[] };
    setEnqueuer(fakeEnqueuer(sink));

    const { jobId } = await resumeEngine.requestTailoredResume(userId, 'jd');
    await resumeEngine.runParseStage(jobId, 'jd');

    const status = await resumeEngine.getJobStatus(userId, jobId);
    expect(status.stage).toBe('retrieving');
    expect(status.jdParsed).toEqual(PARSED);
    expect(sink.retrieve).toEqual([{ jobId }]);
  });

  it('retrieve embeds, searches, ranks, and stops at awaiting_confirmation', async () => {
    const { jobId } = await resumeEngine.requestTailoredResume(userId, 'jd');
    await resumeEngine.runParseStage(jobId, 'jd');
    await resumeEngine.runRetrieveStage(jobId);

    const status = await resumeEngine.getJobStatus(userId, jobId);
    expect(status.stage).toBe('awaiting_confirmation');
    expect(status.failedStage).toBeNull();
    expect(status.retrievedCandidates).not.toBeNull();
    const candidates = status.retrievedCandidates!;
    expect(candidates.length).toBeGreaterThan(0);
    // Every candidate is a real bullet with a numeric score.
    for (const c of candidates) {
      expect(typeof c.score).toBe('number');
      expect(c.text.length).toBeGreaterThan(0);
    }
    // The Kubernetes/Go bullet carries required-skill tags → gets the tag boost,
    // so it should out-rank the unrelated marketing bullet.
    const top = candidates[0]!;
    expect(top.text).toContain('CI/CD platform');
  });

  it('confirm records the kept subset; rejects ids not in the retrieved set', async () => {
    const { jobId } = await resumeEngine.requestTailoredResume(userId, 'jd');
    await resumeEngine.runParseStage(jobId, 'jd');
    await resumeEngine.runRetrieveStage(jobId);

    const { retrievedCandidates } = await resumeEngine.getJobStatus(userId, jobId);
    const keep = [retrievedCandidates![0]!.bulletId];

    await resumeEngine.confirmRetrievedMatches(userId, jobId, keep);
    const job = await prisma.tailoringJob.findUnique({ where: { id: jobId } });
    const resume = await prisma.tailoredResume.findUniqueOrThrow({
      where: { id: job!.tailoredResumeId! },
    });
    expect(resume.selectedBulletIds).toEqual(keep);

    await expect(
      resumeEngine.confirmRetrievedMatches(userId, jobId, ['not-a-real-candidate']),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('retrieve records failedStage=retrieving when the embedder throws', async () => {
    setEmbedder({
      embed: async () => {
        throw new Error('Voyage down');
      },
    });
    const { jobId } = await resumeEngine.requestTailoredResume(userId, 'jd');
    await resumeEngine.runParseStage(jobId, 'jd');
    await expect(resumeEngine.runRetrieveStage(jobId)).rejects.toThrow('Voyage down');

    const status = await resumeEngine.getJobStatus(userId, jobId);
    expect(status.stage).toBe('retrieving');
    expect(status.failedStage).toBe('retrieving');
  });

  it('getJobStatus 404s for another user’s job', async () => {
    const { jobId } = await resumeEngine.requestTailoredResume(userId, 'mine');
    await expect(resumeEngine.getJobStatus('someone-else', jobId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
