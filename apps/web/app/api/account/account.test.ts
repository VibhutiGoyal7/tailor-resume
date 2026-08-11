// Account route tests. Auth-required checks are DB-free; the full flow is gated
// on RUN_DB_TESTS=1.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@tailor/db';
import { DELETE as deleteAccount, GET as getAccount } from './route';
import { PATCH as changePassword } from './password/route';
import { POST as signup } from '../auth/signup/route';
import { POST as login } from '../auth/login/route';

function req(method: string, body?: unknown, token?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request('http://localhost/api/account', {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('account routes — auth required (no DB)', () => {
  it('GET without a token → 401', async () => {
    expect((await getAccount(req('GET'))).status).toBe(401);
  });
  it('DELETE without a token → 401', async () => {
    expect((await deleteAccount(req('DELETE'))).status).toBe(401);
  });
  it('PATCH /password without a token → 401', async () => {
    const res = await changePassword(
      req('PATCH', { currentPassword: 'x', newPassword: 'longenough1' }),
    );
    expect(res.status).toBe(401);
  });
});

const runDb = process.env.RUN_DB_TESTS === '1';

describe.skipIf(!runDb)('account routes — full flow (DB)', () => {
  const email = 'account-flow@itest.local';
  const password = 'supersecret1';

  async function cleanup(): Promise<void> {
    const u = await prisma.user.findUnique({ where: { email } });
    if (u) {
      await prisma.refreshToken.deleteMany({ where: { userId: u.id } });
      await prisma.verificationToken.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }
  }
  beforeAll(async () => {
    if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';
    await cleanup();
  });
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  async function accessToken(pw = password): Promise<string> {
    const res = await login(req('POST', { email, password: pw }));
    return (await res.json()).accessToken;
  }

  it('signup → GET account → change password → delete', async () => {
    expect((await signup(req('POST', { email, password }))).status).toBe(201);

    const token = await accessToken();
    const getRes = await getAccount(req('GET', undefined, token));
    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toMatchObject({ email, emailVerified: false });

    const patchRes = await changePassword(
      req('PATCH', { currentPassword: password, newPassword: 'a-new-password' }, token),
    );
    expect(patchRes.status).toBe(200);
    // The change returns a fresh token pair for this device (it stays signed in).
    const rotated = await patchRes.json();
    expect(rotated).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    // New password now logs in.
    expect((await login(req('POST', { email, password: 'a-new-password' }))).status).toBe(200);

    const freshToken = await accessToken('a-new-password');
    expect((await deleteAccount(req('DELETE', undefined, freshToken))).status).toBe(204);
    // Account is gone.
    expect((await getAccount(req('GET', undefined, freshToken))).status).toBe(404);
  });
});
