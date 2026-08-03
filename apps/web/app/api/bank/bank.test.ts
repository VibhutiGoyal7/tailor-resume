// Experience Bank route tests. Auth-required checks are DB-free; the full flow
// is gated on RUN_DB_TESTS=1.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@tailor/db';
import { GET as getBank } from './route';
import { POST as postItem } from './items/route';
import { POST as postBullet } from './items/[id]/bullets/route';
import { DELETE as deleteItem } from './items/[id]/route';
import { POST as extractItem } from './items/[id]/extract/route';
import { POST as extractFromText } from './extract/route';
import { POST as importResume } from './import/route';
import { PATCH as patchBullet } from './bullets/[id]/route';
import { GET as getBasics, PUT as putBasics } from './basics/route';
import { POST as signup } from '../auth/signup/route';
import { POST as login } from '../auth/login/route';

function req(method: string, body?: unknown, token?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request('http://localhost/api/bank', {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const p = (id: string) => ({ params: Promise.resolve({ id }) });

describe('bank routes — auth required (no DB)', () => {
  it('every protected route → 401 without a token', async () => {
    expect((await getBank(req('GET'))).status).toBe(401);
    expect((await postItem(req('POST', { type: 'role' }))).status).toBe(401);
    expect((await postBullet(req('POST', { text: 'x' }), p('id'))).status).toBe(401);
    expect((await patchBullet(req('PATCH', { status: 'accepted' }), p('id'))).status).toBe(401);
    expect((await deleteItem(req('DELETE'), p('id'))).status).toBe(401);
    expect((await extractItem(req('POST'), p('id'))).status).toBe(401);
    expect((await extractFromText(req('POST', { text: 'x' }))).status).toBe(401);
    expect((await importResume(req('POST'))).status).toBe(401);
    expect((await getBasics(req('GET'))).status).toBe(401);
    expect((await putBasics(req('PUT', { fullName: 'A' }))).status).toBe(401);
  });
});

const runDb = process.env.RUN_DB_TESTS === '1';

describe.skipIf(!runDb)('bank routes — full flow (DB)', () => {
  const email = 'bank-flow@itest.local';
  const password = 'supersecret1';
  let token: string;

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
    await prisma.resumeBasics.deleteMany({ where: { userId: u.id } });
    await prisma.refreshToken.deleteMany({ where: { userId: u.id } });
    await prisma.verificationToken.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  }

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';
    await cleanup();
    await signup(req('POST', { email, password }));
    const res = await login(req('POST', { email, password }));
    token = (await res.json()).accessToken;
  });
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('add item → add bullet → get bank → accept/reject bullet', async () => {
    const itemRes = await postItem(
      req('POST', { type: 'role', structuredFields: { title: 'Engineer' } }, token),
    );
    expect(itemRes.status).toBe(201);
    const item = await itemRes.json();

    const bulletRes = await postBullet(req('POST', { text: 'Shipped X' }, token), p(item.id));
    expect(bulletRes.status).toBe(201);
    const bullet = await bulletRes.json();
    expect(bullet.status).toBe('accepted');

    const bankRes = await getBank(req('GET', undefined, token));
    expect(bankRes.status).toBe(200);
    const bank = await bankRes.json();
    expect(bank.role).toHaveLength(1);
    expect(bank.role[0].bullets).toHaveLength(1);

    const patched = await patchBullet(req('PATCH', { status: 'rejected' }, token), p(bullet.id));
    expect(patched.status).toBe(200);
    expect((await patched.json()).status).toBe('rejected');
  });

  it('delete item → 204, and it disappears from the bank', async () => {
    const itemRes = await postItem(req('POST', { type: 'project' }, token));
    const item = await itemRes.json();
    await postBullet(req('POST', { text: 'a bullet' }, token), p(item.id));

    const del = await deleteItem(req('DELETE', undefined, token), p(item.id));
    expect(del.status).toBe(204);

    const bank = await (await getBank(req('GET', undefined, token))).json();
    expect(bank.project.find((i: { id: string }) => i.id === item.id)).toBeUndefined();

    // Deleting again → 404 (already gone / not the user's).
    const again = await deleteItem(req('DELETE', undefined, token), p(item.id));
    expect(again.status).toBe(404);
  });

  it('extract from freeform text → item with suggested bullets (stub extractor)', async () => {
    const res = await extractFromText(
      req(
        'POST',
        { text: 'I led the checkout migration. I owned the mobile CI/CD pipeline.', type: 'role' },
        token,
      ),
    );
    expect(res.status).toBe(201);
    const item = await res.json();
    expect(item.type).toBe('role');
    expect(item.source).toBe('freeform_extracted');
    expect(item.bullets.length).toBeGreaterThan(0);
    expect(item.bullets.every((b: { status: string }) => b.status === 'suggested')).toBe(true);
  });

  it('extract bullets for an existing item → suggested bullets appended', async () => {
    const created = await postItem(
      req(
        'POST',
        {
          type: 'project',
          structuredFields: { name: 'CV pipeline' },
          rawInput: 'Built an on-device scanner. Shipped it to production.',
        },
        token,
      ),
    );
    const item = await created.json();
    const res = await extractItem(req('POST', undefined, token), p(item.id));
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.bullets.length).toBeGreaterThan(0);
    expect(updated.bullets.every((b: { status: string }) => b.status === 'suggested')).toBe(true);
  });

  it('import a resume (.txt) → 201 with extracted items (stub extractor)', async () => {
    const fd = new FormData();
    fd.append(
      'file',
      new File(
        ['I led the checkout migration at Acme. I owned the mobile CI/CD pipeline.'],
        'resume.txt',
        { type: 'text/plain' },
      ),
    );
    const request = new Request('http://localhost/api/bank/import', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: fd,
    });
    const res = await importResume(request);
    expect(res.status).toBe(201);
    const items = await res.json();
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i: { source: string }) => i.source === 'freeform_extracted')).toBe(true);
  });

  it('import with no file → 400', async () => {
    const request = new Request('http://localhost/api/bank/import', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: new FormData(),
    });
    expect((await importResume(request)).status).toBe(400);
  });

  it('add item with a missing type → 400', async () => {
    const res = await postItem(req('POST', { structuredFields: {} }, token));
    expect(res.status).toBe(400);
  });

  it('resume basics: null → PUT → GET', async () => {
    const before = await getBasics(req('GET', undefined, token));
    expect(await before.json()).toBeNull();

    const put = await putBasics(req('PUT', { fullName: 'Ada Lovelace' }, token));
    expect(put.status).toBe(200);
    expect((await put.json()).fullName).toBe('Ada Lovelace');

    const after = await getBasics(req('GET', undefined, token));
    expect((await after.json()).fullName).toBe('Ada Lovelace');
  });
});
