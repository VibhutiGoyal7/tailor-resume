// resume-engine facade — parse stage (Milestone 4).
// The parser and enqueuer are injected fakes (no LLM, no Redis). The DB flow is
// gated on RUN_DB_TESTS=1 so CI without a database still runs the rest.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@tailor/db';
import type { JdParsed, ParseJDJob } from '@tailor/shared-types';
import { resumeEngine } from './index.js';
import { setJdParser, type JdParser } from './jd-parser.js';
import { setEnqueuer, type Enqueuer } from './queue.js';

const runDb = process.env.RUN_DB_TESTS === '1';

const PARSED: JdParsed = {
  required_skills: ['Go', 'Kubernetes'],
  role_type: 'Platform Engineer',
  seniority: 'Senior',
  company_type: 'Scale-up',
  key_responsibilities: ['Own the CI/CD platform'],
};

describe.skipIf(!runDb)('resumeEngine parse stage (DB)', () => {
  const email = 'resume-engine@itest.local';
  let userId: string;
  let enqueued: ParseJDJob[];

  const fakeParser: JdParser = { parse: async () => PARSED };

  async function cleanup(): Promise<void> {
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u) return;
    await prisma.tailoringJob.deleteMany({ where: { userId: u.id } });
    await prisma.tailoredResume.deleteMany({ where: { userId: u.id } });
    await prisma.user.deleteMany({ where: { id: u.id } });
  }

  beforeAll(async () => {
    await cleanup();
    const user = await prisma.user.create({
      data: { email, passwordHash: 'x' },
    });
    userId = user.id;
  });

  afterEach(() => {
    // Restore real (lazy) singletons between tests where needed by re-injecting.
    setJdParser(fakeParser);
  });

  afterAll(cleanup);

  it('requestTailoredResume creates a parsing job and enqueues parse', async () => {
    enqueued = [];
    const fakeEnqueuer: Enqueuer = {
      enqueueParse: async (job) => {
        enqueued.push(job);
      },
    };
    setEnqueuer(fakeEnqueuer);

    const { jobId } = await resumeEngine.requestTailoredResume(userId, 'a job description');

    const job = await prisma.tailoringJob.findUnique({ where: { id: jobId } });
    expect(job?.stage).toBe('parsing');
    expect(job?.userId).toBe(userId);
    expect(enqueued).toEqual([{ jobId, jdText: 'a job description' }]);
  });

  it('runParseStage persists jd_parsed and advances the job to retrieving', async () => {
    setEnqueuer({ enqueueParse: async () => {} });
    setJdParser(fakeParser);

    const { jobId } = await resumeEngine.requestTailoredResume(userId, 'senior platform role');
    await resumeEngine.runParseStage(jobId, 'senior platform role');

    const status = await resumeEngine.getJobStatus(userId, jobId);
    expect(status.stage).toBe('retrieving');
    expect(status.failedStage).toBeNull();
    expect(status.jdParsed).toEqual(PARSED);

    const job = await prisma.tailoringJob.findUnique({ where: { id: jobId } });
    expect(job?.tailoredResumeId).toBeTruthy();
  });

  it('runParseStage records failedStage=parsing when the parser throws', async () => {
    setEnqueuer({ enqueueParse: async () => {} });
    setJdParser({
      parse: async () => {
        throw new Error('LLM exploded');
      },
    });

    const { jobId } = await resumeEngine.requestTailoredResume(userId, 'will fail');
    await expect(resumeEngine.runParseStage(jobId, 'will fail')).rejects.toThrow('LLM exploded');

    const status = await resumeEngine.getJobStatus(userId, jobId);
    expect(status.stage).toBe('parsing'); // stage unchanged
    expect(status.failedStage).toBe('parsing');
    expect(status.jdParsed).toBeNull();
  });

  it('getJobStatus 404s for another user’s job', async () => {
    setEnqueuer({ enqueueParse: async () => {} });
    const { jobId } = await resumeEngine.requestTailoredResume(userId, 'mine');
    await expect(resumeEngine.getJobStatus('someone-else', jobId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
