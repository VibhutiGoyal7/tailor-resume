// POST /api/bank/extract { text, type? } -> 201 ExperienceItem with suggested
// bullets. The "Write about it" flow: Claude infers the type + structured fields
// and drafts bullets from freeform text; the user reviews before anything is kept.
import { profileModule } from '@tailor/modules';
import { extractFromTextSchema } from '@tailor/shared-types';
import { requireAuth } from '../../../../lib/auth';
import { errorResponse, readJson } from '../../../../lib/http';

export async function POST(req: Request): Promise<Response> {
  try {
    const { userId } = await requireAuth(req);
    const input = await readJson(req, extractFromTextSchema);
    const item = await profileModule.extractItemFromText(userId, input);
    return Response.json(item, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
