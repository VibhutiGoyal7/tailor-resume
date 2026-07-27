// PATCH /api/bank/bullets/:id { status, text? } -> bullet (accept/edit/reject)
import { profileModule } from '@tailor/modules';
import { updateBulletSchema } from '@tailor/shared-types';
import { requireAuth } from '../../../../../lib/auth';
import { errorResponse, readJson } from '../../../../../lib/http';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { userId } = await requireAuth(req);
    const { id } = await params;
    const input = await readJson(req, updateBulletSchema);
    const bullet = await profileModule.updateBullet(userId, id, input);
    return Response.json(bullet);
  } catch (err) {
    return errorResponse(err);
  }
}
