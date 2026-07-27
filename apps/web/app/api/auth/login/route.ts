// POST /api/auth/login { email, password } -> { accessToken, refreshToken, user }
// (contract requires the token pair; `user` is included as a convenience so the
// client needn't make a second call for its own profile.)
import { authModule } from '@tailor/modules';
import { loginSchema } from '@tailor/shared-types';
import { errorResponse, getClientIp, readJson } from '../../../../lib/http';
import { enforceRateLimit, resetRateLimit } from '../../../../lib/rate-limit';

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await readJson(req, loginSchema);
    const key = `login:${getClientIp(req)}:${body.email}`;
    enforceRateLimit(key);
    const { user, tokens } = await authModule.login(body);
    resetRateLimit(key); // successful login clears the attempt counter
    return Response.json({ ...tokens, user });
  } catch (err) {
    return errorResponse(err);
  }
}
