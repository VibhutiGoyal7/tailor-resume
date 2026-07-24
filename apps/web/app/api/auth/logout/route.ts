// POST /api/auth/logout { refreshToken } -> 204
// Revokes the refresh token. Idempotent — an unknown/already-revoked token
// still returns 204.
import { authModule } from '@tailor/modules';
import { logoutSchema } from '@tailor/shared-types';
import { errorResponse, readJson } from '../../../../lib/http';

export async function POST(req: Request): Promise<Response> {
  try {
    const { refreshToken } = await readJson(req, logoutSchema);
    await authModule.logout(refreshToken);
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
