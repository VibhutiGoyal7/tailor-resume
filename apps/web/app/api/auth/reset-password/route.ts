// POST /api/auth/reset-password { token, newPassword } -> 200
// Consumes the reset token, sets the new password, and revokes all sessions.
import { authModule } from '@tailor/modules';
import { resetPasswordSchema } from '@tailor/shared-types';
import { errorResponse, readJson } from '../../../../lib/http';

export async function POST(req: Request): Promise<Response> {
  try {
    const { token, newPassword } = await readJson(req, resetPasswordSchema);
    await authModule.resetPassword(token, newPassword);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
