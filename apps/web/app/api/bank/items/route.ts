// POST /api/bank/items { type, structuredFields?, rawInput? } -> 201 item
import { profileModule } from '@tailor/modules';
import { addExperienceItemSchema } from '@tailor/shared-types';
import { requireAuth } from '../../../../lib/auth';
import { errorResponse, readJson } from '../../../../lib/http';

export async function POST(req: Request): Promise<Response> {
  try {
    const { userId } = await requireAuth(req);
    const input = await readJson(req, addExperienceItemSchema);
    const item = await profileModule.addExperienceItem(userId, input);
    return Response.json(item, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
