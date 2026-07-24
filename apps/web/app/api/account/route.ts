// GET    /api/account -> { email, emailVerified, createdAt }
// DELETE /api/account -> 204  (cascades to all user-owned rows)
// Both require a valid access token.
import { authModule } from '@tailor/modules';
import { requireAuth } from '../../../lib/auth';
import { errorResponse } from '../../../lib/http';

export async function GET(req: Request): Promise<Response> {
  try {
    const { userId } = await requireAuth(req);
    return Response.json(await authModule.getAccount(userId));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  try {
    const { userId } = await requireAuth(req);
    await authModule.deleteAccount(userId);
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
