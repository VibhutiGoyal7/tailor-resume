// POST /api/bank/items/:id/extract -> ExperienceItem with newly-suggested bullets.
// Runs Claude over the item's saved description (the manual forms' "Save and
// extract bullets"); the user then reviews the suggestions (PATCH bullets/:id).
import { profileModule } from '@tailor/modules';
import { requireAuth } from '../../../../../../lib/auth';
import { errorResponse } from '../../../../../../lib/http';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { userId } = await requireAuth(req);
    const { id } = await params;
    const item = await profileModule.extractBulletsForItem(userId, id);
    return Response.json(item);
  } catch (err) {
    return errorResponse(err);
  }
}
