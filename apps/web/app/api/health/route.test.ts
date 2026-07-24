import { describe, expect, it } from 'vitest';
import { GET } from './route';

// Integration test at the actual HTTP-handler layer (CLAUDE.md Section 2):
// invoke the route's exported handler and assert on the real Response it returns.
describe('GET /api/health', () => {
  it('returns 200 with an ok status body', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok', service: 'web' });
  });
});
