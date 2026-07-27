// GET /api/resumes/:id -> tailored-resume detail (build brief §5, ADR-011).
// Thin: auth, one facade call, respond. User-scoped by the facade (404 for a
// missing or another user's resume). Note: the sibling static `jobs/` segment
// takes precedence, so this dynamic route only matches real resume ids.
import { resumeEngine } from '@tailor/modules';
import { requireAuth } from '../../../../lib/auth';
import { errorResponse } from '../../../../lib/http';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { userId } = await requireAuth(req);
    const { id } = await params;
    return Response.json(await resumeEngine.getResume(userId, id));
  } catch (err) {
    return errorResponse(err);
  }
}
