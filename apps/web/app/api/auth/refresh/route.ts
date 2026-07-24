// POST /api/auth/refresh { refreshToken } -> { accessToken, refreshToken }
// Rotates the refresh token (ADR-010). Reuse of a revoked token 401s and
// revokes the whole session (handled in the auth module).
import { authModule } from '@tailor/modules';
import { refreshSchema } from '@tailor/shared-types';
import { errorResponse, readJson } from '../../../../lib/http';

export async function POST(req: Request): Promise<Response> {
  try {
    const { refreshToken } = await readJson(req, refreshSchema);
    const tokens = await authModule.refresh(refreshToken);
    return Response.json(tokens);
  } catch (err) {
    return errorResponse(err);
  }
}
