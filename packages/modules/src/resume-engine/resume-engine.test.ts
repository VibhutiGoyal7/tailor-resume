// resume-engine facade — parse + retrieve + confirm stages (Milestones 4–5).
// Parser, embedder, and enqueuer are injected fakes/stubs (no LLM, no Voyage,
// no Redis). The DB + pgvector flow is gated on RUN_DB_TESTS=1.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@tailor/db';
import type {
  GenerateResumeJob,
  JdParsed,
  ParseJDJob,
  RetrieveCandidatesJob,
} from '@tailor/shared-types';
import { profileModule } from '../profile/index.js';
import { resumeEngine } from './index.js';
import { setJdParser, type JdParser } from './jd-parser.js';
import { setResumeGenerator, StubResumeGenerator } from './generator.js';
import { setResumeRenderer, type RenderInput } from './renderer.js';
import { setFileStore, type FileStore } from '../storage/index.js';
import { setEnqueuer, type Enqueuer } from './queue.js';
import { setEmbedder, StubEmbedder } from '../embedding/index.js';

/** In-memory FileStore so the generate stage can store exports without disk/R2. */
function memFileStore(): FileStore & { map: Map<string, Buffer> } {
  const map = new Map<string, Buffer>();
  return {
    map,
    put: async (key, bytes) => void map.set(key, bytes),
    get: async (key) => map.get(key) ?? null,
    delete: async (key) => void map.delete(key),
  };
}

/** Fake renderer: records what it was asked to render, returns marker bytes per format. */
function fakeRenderer(sink?: RenderInput[]) {
  return {
    render: async (input: RenderInput): Promise<Buffer> => {
      sink?.push(input);
      return Buffer.from(`FAKE-${input.format}-${input.templateId}`);
    },
  };
}

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
  generate?: GenerateResumeJob[];
}): Enqueuer {
  return {
    enqueueParse: async (job) => void sink?.parse?.push(job),
    enqueueRetrieve: async (job) => void sink?.retrieve?.push(job),
    enqueueGenerate: async (job) => void sink?.generate?.push(job),
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
    setResumeGenerator(new StubResumeGenerator());
    setResumeRenderer(fakeRenderer());
    setFileStore(memFileStore());
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

  it('confirm records the kept subset, advances to generating, and enqueues generate', async () => {
    const sink = { generate: [] as GenerateResumeJob[] };
    setEnqueuer(fakeEnqueuer(sink));

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
    expect(job?.stage).toBe('generating');
    expect(sink.generate).toEqual([{ jobId, keptCandidateIds: keep }]);
  });

  it('confirm rejects ids not in the retrieved set (and does not enqueue generate)', async () => {
    const sink = { generate: [] as GenerateResumeJob[] };
    setEnqueuer(fakeEnqueuer(sink));

    const { jobId } = await resumeEngine.requestTailoredResume(userId, 'jd');
    await resumeEngine.runParseStage(jobId, 'jd');
    await resumeEngine.runRetrieveStage(jobId);

    await expect(
      resumeEngine.confirmRetrievedMatches(userId, jobId, ['not-a-real-candidate']),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(sink.generate).toEqual([]);
    const status = await resumeEngine.getJobStatus(userId, jobId);
    expect(status.stage).toBe('awaiting_confirmation');
  });

  it('generate produces grounded renderedContent and advances to done', async () => {
    const { jobId } = await resumeEngine.requestTailoredResume(userId, 'jd');
    await resumeEngine.runParseStage(jobId, 'jd');
    await resumeEngine.runRetrieveStage(jobId);
    const { retrievedCandidates } = await resumeEngine.getJobStatus(userId, jobId);
    const keep = retrievedCandidates!.map((c) => c.bulletId);

    await resumeEngine.confirmRetrievedMatches(userId, jobId, keep);
    await resumeEngine.runGenerateStage(jobId, keep);

    const status = await resumeEngine.getJobStatus(userId, jobId);
    expect(status.stage).toBe('done');
    expect(status.failedStage).toBeNull();
    expect(status.renderedContent).not.toBeNull();
    const rendered = status.renderedContent!;
    // 'Scale-up' company_type → suggestTemplateId picks 'modern' (ADR-012).
    expect(rendered.templateId).toBe('modern');
    expect(rendered.summary.length).toBeGreaterThan(0);
    expect(rendered.bullets.length).toBeGreaterThan(0);
    // Every rendered bullet is grounded in a kept candidate and carries its trace.
    const keptSet = new Set(keep);
    for (const b of rendered.bullets) {
      expect(keptSet.has(b.sourceBulletId)).toBe(true);
      expect(b.experienceItemId.length).toBeGreaterThan(0);
      expect(b.text.length).toBeGreaterThan(0);
    }
  });

  it('generate renders + stores both export formats; detail + export expose them', async () => {
    const renders: RenderInput[] = [];
    setResumeRenderer(fakeRenderer(renders));

    const { jobId } = await resumeEngine.requestTailoredResume(userId, 'jd');
    await resumeEngine.runParseStage(jobId, 'jd');
    await resumeEngine.runRetrieveStage(jobId);
    const { retrievedCandidates } = await resumeEngine.getJobStatus(userId, jobId);
    const keep = retrievedCandidates!.map((c) => c.bulletId);
    await resumeEngine.confirmRetrievedMatches(userId, jobId, keep);
    await resumeEngine.runGenerateStage(jobId, keep);

    // Renderer was invoked once per format, with the suggested template + skills.
    expect(renders.map((r) => r.format).sort()).toEqual(['docx', 'pdf']);
    expect(renders.every((r) => r.templateId === 'modern')).toBe(true);
    expect(renders[0]!.skills).toContain('Kubernetes');

    // Resume detail lists both formats as available.
    const job = await prisma.tailoringJob.findUnique({ where: { id: jobId } });
    const detail = await resumeEngine.getResume(userId, job!.tailoredResumeId!);
    expect(detail.availableFormats.sort()).toEqual(['docx', 'pdf']);
    expect(detail.templateId).toBe('modern');

    // Export returns the stored bytes for a format.
    const pdf = await resumeEngine.getResumeExport(userId, job!.tailoredResumeId!, 'pdf');
    expect(pdf.contentType).toBe('application/pdf');
    expect(pdf.bytes.toString()).toBe('FAKE-pdf-modern');
    expect(pdf.filename.endsWith('.pdf')).toBe(true);
  });

  it('getResume + getResumeExport 404 for another user / missing format', async () => {
    const { jobId } = await resumeEngine.requestTailoredResume(userId, 'jd');
    await resumeEngine.runParseStage(jobId, 'jd');
    await resumeEngine.runRetrieveStage(jobId);
    const { retrievedCandidates } = await resumeEngine.getJobStatus(userId, jobId);
    const keep = retrievedCandidates!.map((c) => c.bulletId);
    await resumeEngine.confirmRetrievedMatches(userId, jobId, keep);
    await resumeEngine.runGenerateStage(jobId, keep);
    const job = await prisma.tailoringJob.findUnique({ where: { id: jobId } });
    const resumeId = job!.tailoredResumeId!;

    await expect(resumeEngine.getResume('someone-else', resumeId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      resumeEngine.getResumeExport('someone-else', resumeId, 'pdf'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('generate drops hallucinated grounding refs from the model output', async () => {
    setResumeGenerator({
      generate: async (input) => ({
        summary: 'A tailored summary.',
        bullets: [
          // One valid ref (first kept candidate) + one hallucinated id.
          { sourceBulletId: input.candidates[0]!.bulletId, text: 'Rewritten bullet.' },
          { sourceBulletId: 'hallucinated-id', text: 'Invented experience.' },
        ],
      }),
    });

    const { jobId } = await resumeEngine.requestTailoredResume(userId, 'jd');
    await resumeEngine.runParseStage(jobId, 'jd');
    await resumeEngine.runRetrieveStage(jobId);
    const { retrievedCandidates } = await resumeEngine.getJobStatus(userId, jobId);
    const keep = retrievedCandidates!.map((c) => c.bulletId);

    await resumeEngine.confirmRetrievedMatches(userId, jobId, keep);
    await resumeEngine.runGenerateStage(jobId, keep);

    const { renderedContent } = await resumeEngine.getJobStatus(userId, jobId);
    expect(renderedContent!.bullets).toHaveLength(1);
    expect(renderedContent!.bullets[0]!.text).toBe('Rewritten bullet.');
  });

  it('generate records failedStage=generating when the generator throws', async () => {
    const { jobId } = await resumeEngine.requestTailoredResume(userId, 'jd');
    await resumeEngine.runParseStage(jobId, 'jd');
    await resumeEngine.runRetrieveStage(jobId);
    const { retrievedCandidates } = await resumeEngine.getJobStatus(userId, jobId);
    const keep = retrievedCandidates!.map((c) => c.bulletId);
    await resumeEngine.confirmRetrievedMatches(userId, jobId, keep);

    setResumeGenerator({
      generate: async () => {
        throw new Error('Sonnet down');
      },
    });
    await expect(resumeEngine.runGenerateStage(jobId, keep)).rejects.toThrow('Sonnet down');

    const status = await resumeEngine.getJobStatus(userId, jobId);
    expect(status.stage).toBe('generating');
    expect(status.failedStage).toBe('generating');
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

  /** Drive one JD all the way to a `done` resume; returns its resumeId. */
  async function driveToDone(): Promise<string> {
    const { jobId } = await resumeEngine.requestTailoredResume(userId, 'jd');
    await resumeEngine.runParseStage(jobId, 'jd');
    await resumeEngine.runRetrieveStage(jobId);
    const { retrievedCandidates } = await resumeEngine.getJobStatus(userId, jobId);
    const keep = retrievedCandidates!.map((c) => c.bulletId);
    await resumeEngine.confirmRetrievedMatches(userId, jobId, keep);
    await resumeEngine.runGenerateStage(jobId, keep);
    const job = await prisma.tailoringJob.findUnique({ where: { id: jobId } });
    return job!.tailoredResumeId!;
  }

  it('listResumes returns the user’s resumes newest-first with ready formats', async () => {
    const store = memFileStore();
    setFileStore(store);
    const firstId = await driveToDone();
    const secondId = await driveToDone();

    const list = await resumeEngine.listResumes(userId);
    const ids = list.map((r) => r.id);
    // Both appear, newest first.
    expect(ids.indexOf(secondId)).toBeLessThan(ids.indexOf(firstId));
    const row = list.find((r) => r.id === secondId)!;
    expect(row.roleType).toBe(PARSED.role_type);
    expect(row.companyType).toBe(PARSED.company_type);
    expect(row.availableFormats.sort()).toEqual(['docx', 'pdf']);
  });

  it('listResumes is user-scoped (empty for a stranger)', async () => {
    await driveToDone();
    expect(await resumeEngine.listResumes('someone-else')).toEqual([]);
  });

  it('deleteResume removes the resume, its export files, and the linked job', async () => {
    const store = memFileStore();
    setFileStore(store);
    const resumeId = await driveToDone();
    expect(store.map.size).toBeGreaterThan(0);

    await resumeEngine.deleteResume(userId, resumeId);

    // Resume gone, its stored files gone, no orphaned job left pointing at it.
    expect(await prisma.tailoredResume.findUnique({ where: { id: resumeId } })).toBeNull();
    expect(store.map.size).toBe(0);
    expect(
      await prisma.tailoringJob.findFirst({ where: { tailoredResumeId: resumeId } }),
    ).toBeNull();
    // No longer in the history list.
    expect((await resumeEngine.listResumes(userId)).some((r) => r.id === resumeId)).toBe(false);
  });

  it('deleteResume 404s for a missing or another user’s resume', async () => {
    const resumeId = await driveToDone();
    await expect(resumeEngine.deleteResume('someone-else', resumeId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(resumeEngine.deleteResume(userId, 'nope')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    // The real owner can still delete it (was untouched by the failed attempts).
    await resumeEngine.deleteResume(userId, resumeId);
  });
});
