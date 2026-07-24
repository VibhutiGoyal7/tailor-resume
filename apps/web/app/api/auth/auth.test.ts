// Auth route integration tests at the real HTTP-handler layer.
// - The "validation & auth header" block is DB-free and runs everywhere.
// - The "full flow" block is gated on RUN_DB_TESTS=1 (CI / opt-in local DB).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@tailor/db';
import { requireAuth } from '../../../lib/auth';
import { POST as signup } from './signup/route';
import { POST as login } from './login/route';
import { POST as refresh } from './refresh/route';
import { POST as logout } from './logout/route';

function jsonReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('auth routes — validation & auth header (no DB)', () => {
  it('signup with an invalid email → 400 VALIDATION_FAILED with field detail', async () => {
    const res = await signup(jsonReq({ email: 'not-an-email', password: 'longenough1' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.fields.some((f: { field: string }) => f.field === 'email')).toBe(true);
  });

  it('signup with a too-short password → 400', async () => {
    const res = await signup(jsonReq({ email: 'a@b.com', password: 'short' }));
    expect(res.status).toBe(400);
  });

  it('non-JSON body → 400', async () => {
    const res = await signup(jsonReq('{not json'));
    expect(res.status).toBe(400);
  });

  it('requireAuth rejects a request with no Authorization header', async () => {
    await expect(requireAuth(new Request('http://localhost/x'))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('requireAuth rejects a malformed Authorization header', async () => {
    await expect(
      requireAuth(new Request('http://localhost/x', { headers: { authorization: 'Basic xyz' } })),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});

const runDb = process.env.RUN_DB_TESTS === '1';

describe.skipIf(!runDb)('auth routes — full flow (DB)', () => {
  const email = 'route-flow@example.com';
  const password = 'sup3r-secret-pw';

  async function cleanup(): Promise<void> {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.refreshToken.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
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

  it('signup → login → requireAuth → refresh → logout', async () => {
    const signupRes = await signup(jsonReq({ email, password }));
    expect(signupRes.status).toBe(201);

    const loginRes = await login(jsonReq({ email, password }));
    expect(loginRes.status).toBe(200);
    const { accessToken, refreshToken } = await loginRes.json();
    expect(accessToken).toBeTruthy();

    const ctx = await requireAuth(
      new Request('http://localhost/x', { headers: { authorization: `Bearer ${accessToken}` } }),
    );
    expect(ctx.userId).toBeTruthy();

    const refreshRes = await refresh(jsonReq({ refreshToken }));
    expect(refreshRes.status).toBe(200);
    const rotated = await refreshRes.json();
    expect(rotated.refreshToken).not.toBe(refreshToken);

    const logoutRes = await logout(jsonReq({ refreshToken: rotated.refreshToken }));
    expect(logoutRes.status).toBe(204);
  });

  it('login with a wrong password → 401 INVALID_CREDENTIALS', async () => {
    await signup(jsonReq({ email, password })).catch(() => undefined);
    const res = await login(jsonReq({ email, password: 'wrong-password' }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('INVALID_CREDENTIALS');
  });
});
