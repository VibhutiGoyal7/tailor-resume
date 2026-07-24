// POST /api/auth/signup { email, password } -> 201 { user }
// Thin route (build brief Section 3): validate, rate-limit, one facade call.
import { authModule } from '@tailor/modules';
import { signupSchema } from '@tailor/shared-types';
import { errorResponse, getClientIp, readJson } from '../../../../lib/http';
import { enforceRateLimit } from '../../../../lib/rate-limit';

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await readJson(req, signupSchema);
    enforceRateLimit(`signup:${getClientIp(req)}:${body.email}`);
    const user = await authModule.signup(body);
    return Response.json({ user }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
