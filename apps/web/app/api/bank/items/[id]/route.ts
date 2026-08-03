// DELETE /api/bank/items/:id -> 204. Removes an Experience Bank item and its
// bullets (user-scoped; 404 for a missing or others' item).
import { profileModule } from '@tailor/modules';
import { requireAuth } from '../../../../../lib/auth';
import { errorResponse } from '../../../../../lib/http';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { userId } = await requireAuth(req);
    const { id } = await params;
    await profileModule.deleteExperienceItem(userId, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
