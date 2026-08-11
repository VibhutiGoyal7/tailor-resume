// PATCH /api/account/password { currentPassword, newPassword } -> { accessToken, refreshToken }
// Requires auth; verifies the current password, revokes all *other* sessions, and
// returns a fresh token pair for the calling device (which must swap to it — its old
// refresh token is revoked too). The client stays signed in; other devices are ended.
import { authModule } from '@tailor/modules';
import { changePasswordSchema } from '@tailor/shared-types';
import { requireAuth } from '../../../../lib/auth';
import { errorResponse, readJson } from '../../../../lib/http';

export async function PATCH(req: Request): Promise<Response> {
  try {
    const { userId } = await requireAuth(req);
    const { currentPassword, newPassword } = await readJson(req, changePasswordSchema);
    const tokens = await authModule.changePassword(userId, currentPassword, newPassword);
    return Response.json(tokens);
  } catch (err) {
    return errorResponse(err);
  }
}
