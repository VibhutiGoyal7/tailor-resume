// GET /api/bank/basics -> ResumeBasics | null
// PUT /api/bank/basics { fullName, phone?, location?, links?, summary? } -> ResumeBasics
import { profileModule } from '@tailor/modules';
import { updateResumeBasicsSchema } from '@tailor/shared-types';
import { requireAuth } from '../../../../lib/auth';
import { errorResponse, readJson } from '../../../../lib/http';

export async function GET(req: Request): Promise<Response> {
  try {
    const { userId } = await requireAuth(req);
    return Response.json(await profileModule.getResumeBasics(userId));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(req: Request): Promise<Response> {
  try {
    const { userId } = await requireAuth(req);
    const input = await readJson(req, updateResumeBasicsSchema);
    return Response.json(await profileModule.updateResumeBasics(userId, input));
  } catch (err) {
    return errorResponse(err);
  }
}
