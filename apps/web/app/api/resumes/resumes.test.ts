// Resume tailoring routes. Auth-required checks are DB-free; the full parse
// flow is gated on RUN_DB_TESTS=1. The queue is stubbed so no Redis is needed.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@tailor/db';
import { setEnqueuer, setJdParser } from '@tailor/modules';
import { POST as postResume } from './route';
import { GET as getJob } from './jobs/[jobId]/route';
import { POST as signup } from '../auth/signup/route';
import { POST as login } from '../auth/login/route';

function req(method: string, body?: unknown, token?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request('http://localhost/api/resumes', {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const jp = (jobId: string) => ({ params: Promise.resolve({ jobId }) });

describe('resume routes — auth required (no DB)', () => {
  it('POST /resumes and GET /jobs/:id → 401 without a token', async () => {
    expect((await postResume(req('POST', { jdText: 'x' }))).status).toBe(401);
    expect((await getJob(req('GET'), jp('job-1'))).status).toBe(401);
  });
});

const runDb = process.env.RUN_DB_TESTS === '1';

describe.skipIf(!runDb)('resume routes — parse flow (DB)', () => {
  const email = 'resumes-route@itest.local';
  const password = 'supersecret1';
  let token: string;

  async function cleanup(): Promise<void> {
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u) return;
    await prisma.tailoringJob.deleteMany({ where: { userId: u.id } });
    await prisma.tailoredResume.deleteMany({ where: { userId: u.id } });
    await prisma.refreshToken.deleteMany({ where: { userId: u.id } });
    await prisma.user.deleteMany({ where: { id: u.id } });
  }

  beforeAll(async () => {
    await cleanup();
    // No Redis / no LLM in tests: stub the enqueuer and force the stub parser.
    setEnqueuer({ enqueueParse: async () => {} });
    setJdParser({
      parse: async () => ({
        required_skills: ['TypeScript'],
        role_type: 'Engineer',
        seniority: 'Mid',
        company_type: 'Startup',
        key_responsibilities: ['Ship things'],
      }),
    });
    await signup(req('POST', { email, password }));
    const res = await login(req('POST', { email, password }));
    token = ((await res.json()) as { accessToken: string }).accessToken;
  });

  afterAll(cleanup);

  it('POST /resumes returns 202 + jobId, GET reflects parse result after the worker runs', async () => {
    const res = await postResume(req('POST', { jdText: 'Senior TS role at a startup' }, token));
    expect(res.status).toBe(202);
    const { jobId } = (await res.json()) as { jobId: string };
    expect(jobId).toBeTruthy();

    // Before the worker runs: still parsing, no parsed data.
    let status = await getJob(req('GET', undefined, token), jp(jobId));
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ stage: 'parsing', jdParsed: null });

    // Simulate the worker picking up the parse job.
    const { resumeEngine } = await import('@tailor/modules');
    await resumeEngine.runParseStage(jobId, 'Senior TS role at a startup');

    status = await getJob(req('GET', undefined, token), jp(jobId));
    const body = (await status.json()) as { stage: string; jdParsed: { role_type: string } | null };
    expect(body.stage).toBe('retrieving');
    expect(body.jdParsed?.role_type).toBe('Engineer');
  });

  it('POST /resumes with empty jdText → 400', async () => {
    const res = await postResume(req('POST', { jdText: '' }, token));
    expect(res.status).toBe(400);
  });
});
