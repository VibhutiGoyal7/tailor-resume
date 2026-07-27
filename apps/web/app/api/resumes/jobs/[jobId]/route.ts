// GET /api/resumes/jobs/:jobId -> stage-level status for polling (ADR-015).
// Scoped to the authenticated user by the facade (404 for others' jobs).
import { resumeEngine } from '@tailor/modules';
import { requireAuth } from '../../../../../lib/auth';
import { errorResponse } from '../../../../../lib/http';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  try {
    const { userId } = await requireAuth(req);
    const { jobId } = await params;
    return Response.json(await resumeEngine.getJobStatus(userId, jobId));
  } catch (err) {
    return errorResponse(err);
  }
}
