// POST /api/bank/items/:id/bullets { text, tags?, impactMetric? } -> 201 bullet
// Manual bullet-add path (the LLM /extract path lands with M4).
import { profileModule } from '@tailor/modules';
import { addBulletSchema } from '@tailor/shared-types';
import { requireAuth } from '../../../../../../lib/auth';
import { errorResponse, readJson } from '../../../../../../lib/http';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { userId } = await requireAuth(req);
    const { id } = await params;
    const input = await readJson(req, addBulletSchema);
    const bullet = await profileModule.addBullet(userId, id, input);
    return Response.json(bullet, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
