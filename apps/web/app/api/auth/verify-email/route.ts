// POST /api/auth/verify-email { token } -> 200 { user }
import { authModule } from '@tailor/modules';
import { verifyEmailSchema } from '@tailor/shared-types';
import { errorResponse, readJson } from '../../../../lib/http';

export async function POST(req: Request): Promise<Response> {
  try {
    const { token } = await readJson(req, verifyEmailSchema);
    const user = await authModule.verifyEmail(token);
    return Response.json({ user });
  } catch (err) {
    return errorResponse(err);
  }
}
