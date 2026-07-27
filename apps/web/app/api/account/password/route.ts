// PATCH /api/account/password { currentPassword, newPassword } -> 200
// Requires auth; verifies the current password and revokes other sessions.
import { authModule } from '@tailor/modules';
import { changePasswordSchema } from '@tailor/shared-types';
import { requireAuth } from '../../../../lib/auth';
import { errorResponse, readJson } from '../../../../lib/http';

export async function PATCH(req: Request): Promise<Response> {
  try {
    const { userId } = await requireAuth(req);
    const { currentPassword, newPassword } = await readJson(req, changePasswordSchema);
    await authModule.changePassword(userId, currentPassword, newPassword);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
