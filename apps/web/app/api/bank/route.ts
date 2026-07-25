// GET /api/bank -> ExperienceItem[] grouped by type (requires auth).
import { profileModule } from '@tailor/modules';
import { requireAuth } from '../../../lib/auth';
import { errorResponse } from '../../../lib/http';

export async function GET(req: Request): Promise<Response> {
  try {
    const { userId } = await requireAuth(req);
    return Response.json(await profileModule.getExperienceBank(userId));
  } catch (err) {
    return errorResponse(err);
  }
}
