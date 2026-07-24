// POST /api/auth/forgot-password { email } -> 200
// Always 200 (never reveals whether the email exists). Rate-limited to curb
// abuse / email bombing.
import { authModule } from '@tailor/modules';
import { forgotPasswordSchema } from '@tailor/shared-types';
import { errorResponse, getClientIp, readJson } from '../../../../lib/http';
import { enforceRateLimit } from '../../../../lib/rate-limit';

export async function POST(req: Request): Promise<Response> {
  try {
    const { email } = await readJson(req, forgotPasswordSchema);
    enforceRateLimit(`forgot:${getClientIp(req)}:${email}`);
    await authModule.forgotPassword(email);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
