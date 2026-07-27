// Resume tailoring routes. Auth-required checks are DB-free; the full parse
// flow is gated on RUN_DB_TESTS=1. The queue is stubbed so no Redis is needed.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@tailor/db';
import {
  setEmbedder,
  setEnqueuer,
  setFileStore,
  setJdParser,
  setResumeGenerator,
  setResumeRenderer,
  StubEmbedder,
  StubResumeGenerator,
} from '@tailor/modules';
import { POST as postResume, GET as listResumes } from './route';
import { GET as getJob } from './jobs/[jobId]/route';
import { POST as confirmJob } from './jobs/[jobId]/confirm/route';
import { GET as getResumeDetail, DELETE as deleteResume } from './[id]/route';
import { GET as exportResume } from './[id]/export/route';
import { PATCH as patchLayout } from './[id]/layout/route';
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
/** A GET request to an arbitrary URL (for query strings like ?format=pdf). */
function getReq(url: string, token?: string): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(url, { method: 'GET', headers });
}
const jp = (jobId: string) => ({ params: Promise.resolve({ jobId }) });
const idp = (id: string) => ({ params: Promise.resolve({ id }) });

describe('resume routes — auth required (no DB)', () => {
  it('every resume route → 401 without a token', async () => {
    expect((await postResume(req('POST', { jdText: 'x' }))).status).toBe(401);
    expect((await getJob(req('GET'), jp('job-1'))).status).toBe(401);
    expect((await confirmJob(req('POST', { keptCandidateIds: [] }), jp('job-1'))).status).toBe(401);
    expect((await getResumeDetail(req('GET'), idp('r-1'))).status).toBe(401);
    expect(
      (await exportResume(getReq('http://localhost/api/resumes/r-1/export?format=pdf'), idp('r-1')))
        .status,
    ).toBe(401);
    expect((await listResumes(req('GET'))).status).toBe(401);
    expect((await deleteResume(req('DELETE'), idp('r-1'))).status).toBe(401);
    expect(
      (await patchLayout(req('PATCH', { hiddenSections: ['skills'] }), idp('r-1'))).status,
    ).toBe(401);
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
    // No Redis / no LLM / no Voyage / no R2 in tests: inject stubs + fakes across
    // the whole pipeline so the routes run end-to-end without external infra.
    setEnqueuer({
      enqueueParse: async () => {},
      enqueueRetrieve: async () => {},
      enqueueGenerate: async () => {},
      enqueueRender: async () => {},
    });
    setJdParser({
      parse: async () => ({
        required_skills: ['TypeScript'],
        role_type: 'Engineer',
        seniority: 'Mid',
        company_type: 'Startup',
        key_responsibilities: ['Ship things'],
      }),
    });
    setEmbedder(new StubEmbedder());
    setResumeGenerator(new StubResumeGenerator());
    setResumeRenderer({ render: async (i) => Buffer.from(`FAKE-${i.format}`) });
    const store = new Map<string, Buffer>();
    setFileStore({
      put: async (k, b) => void store.set(k, b),
      get: async (k) => store.get(k) ?? null,
      delete: async (k) => void store.delete(k),
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

  it('full pipeline → GET /resumes/:id detail + export streams the file', async () => {
    const { resumeEngine } = await import('@tailor/modules');

    // Drive the whole pipeline the way the worker would (routes cover the HTTP edge).
    const post = await postResume(req('POST', { jdText: 'Senior TS role at a startup' }, token));
    const { jobId } = (await post.json()) as { jobId: string };
    await resumeEngine.runParseStage(jobId, 'Senior TS role at a startup');
    await resumeEngine.runRetrieveStage(jobId);
    const status = (await (await getJob(req('GET', undefined, token), jp(jobId))).json()) as {
      retrievedCandidates: { bulletId: string }[] | null;
    };
    const keep = (status.retrievedCandidates ?? []).map((c) => c.bulletId);
    const confirmRes = await confirmJob(req('POST', { keptCandidateIds: keep }, token), jp(jobId));
    expect(confirmRes.status).toBe(202);
    await resumeEngine.runGenerateStage(jobId, keep);

    const job = await prisma.tailoringJob.findUnique({ where: { id: jobId } });
    const resumeId = job!.tailoredResumeId!;

    // Detail lists the rendered formats.
    const detailRes = await getResumeDetail(req('GET', undefined, token), idp(resumeId));
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as { availableFormats: string[]; templateId: string };
    expect(detail.availableFormats.sort()).toEqual(['docx', 'pdf']);

    // Export streams the file with download headers.
    const exp = await exportResume(
      getReq(`http://localhost/api/resumes/${resumeId}/export?format=pdf`, token),
      idp(resumeId),
    );
    expect(exp.status).toBe(200);
    expect(exp.headers.get('content-type')).toBe('application/pdf');
    expect(exp.headers.get('content-disposition')).toContain('attachment');
    expect(Buffer.from(await exp.arrayBuffer()).toString()).toBe('FAKE-pdf');

    // Bad format → 400; unknown id → 404.
    expect(
      (
        await exportResume(
          getReq(`http://localhost/api/resumes/${resumeId}/export?format=txt`, token),
          idp(resumeId),
        )
      ).status,
    ).toBe(400);
    expect((await getResumeDetail(req('GET', undefined, token), idp('nope'))).status).toBe(404);
  });

  it('GET /resumes lists history; DELETE /resumes/:id removes it and 404s afterward', async () => {
    const { resumeEngine } = await import('@tailor/modules');

    const post = await postResume(req('POST', { jdText: 'Senior TS role at a startup' }, token));
    const { jobId } = (await post.json()) as { jobId: string };
    await resumeEngine.runParseStage(jobId, 'Senior TS role at a startup');
    await resumeEngine.runRetrieveStage(jobId);
    const status = (await (await getJob(req('GET', undefined, token), jp(jobId))).json()) as {
      retrievedCandidates: { bulletId: string }[] | null;
    };
    const keep = (status.retrievedCandidates ?? []).map((c) => c.bulletId);
    await confirmJob(req('POST', { keptCandidateIds: keep }, token), jp(jobId));
    await resumeEngine.runGenerateStage(jobId, keep);
    const job = await prisma.tailoringJob.findUnique({ where: { id: jobId } });
    const resumeId = job!.tailoredResumeId!;

    // History lists the resume with its ready formats.
    const listRes = await listResumes(req('GET', undefined, token));
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { id: string; availableFormats: string[] }[];
    const row = list.find((r) => r.id === resumeId);
    expect(row).toBeTruthy();
    expect(row!.availableFormats.sort()).toEqual(['docx', 'pdf']);

    // Delete → 204, then detail 404s and it's gone from history.
    const del = await deleteResume(req('DELETE', undefined, token), idp(resumeId));
    expect(del.status).toBe(204);
    expect((await getResumeDetail(req('GET', undefined, token), idp(resumeId))).status).toBe(404);
    const after = (await (await listResumes(req('GET', undefined, token))).json()) as {
      id: string;
    }[];
    expect(after.some((r) => r.id === resumeId)).toBe(false);

    // Deleting again (now missing) → 404.
    expect((await deleteResume(req('DELETE', undefined, token), idp(resumeId))).status).toBe(404);
  });

  it('PATCH /resumes/:id/layout updates layout; bad variant → 400', async () => {
    const { resumeEngine } = await import('@tailor/modules');

    const post = await postResume(req('POST', { jdText: 'Senior TS role at a startup' }, token));
    const { jobId } = (await post.json()) as { jobId: string };
    await resumeEngine.runParseStage(jobId, 'Senior TS role at a startup');
    await resumeEngine.runRetrieveStage(jobId);
    const status = (await (await getJob(req('GET', undefined, token), jp(jobId))).json()) as {
      retrievedCandidates: { bulletId: string }[] | null;
    };
    const keep = (status.retrievedCandidates ?? []).map((c) => c.bulletId);
    await confirmJob(req('POST', { keptCandidateIds: keep }, token), jp(jobId));
    await resumeEngine.runGenerateStage(jobId, keep);
    const job = await prisma.tailoringJob.findUnique({ where: { id: jobId } });
    const resumeId = job!.tailoredResumeId!;

    // Reorder + hide a section, keep template.
    const patched = await patchLayout(
      req(
        'PATCH',
        { sectionOrder: ['experience', 'summary', 'skills'], hiddenSections: ['skills'] },
        token,
      ),
      idp(resumeId),
    );
    expect(patched.status).toBe(200);
    const view = (await patched.json()) as { hiddenSections: string[]; sectionOrder: string[] };
    expect(view.hiddenSections).toEqual(['skills']);
    expect(view.sectionOrder).toEqual(['experience', 'summary', 'skills']);

    // A variant that isn't valid for the current (startup→modern) template → 400.
    const bad = await patchLayout(
      req('PATCH', { layoutVariantId: 'ats-standard' }, token),
      idp(resumeId),
    );
    expect(bad.status).toBe(400);

    // Duplicate sections in the order → 400 (schema refinement).
    const dup = await patchLayout(
      req('PATCH', { sectionOrder: ['summary', 'summary'] }, token),
      idp(resumeId),
    );
    expect(dup.status).toBe(400);
  });
});
