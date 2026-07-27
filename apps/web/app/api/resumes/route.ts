// POST /api/resumes -> start a tailoring pipeline from a job description.
// Thin (CLAUDE.md Section 1): auth, validate body, one facade call, respond.
// Returns 202 Accepted with { jobId } — the work runs async in the worker; the
// client polls GET /api/resumes/jobs/:jobId for stage progress (ADR-015).
import { resumeEngine } from '@tailor/modules';
import { requestTailoredResumeSchema } from '@tailor/shared-types';
import { requireAuth } from '../../../lib/auth';
import { errorResponse, readJson } from '../../../lib/http';

export async function POST(req: Request): Promise<Response> {
  try {
    const { userId } = await requireAuth(req);
    const { jdText } = await readJson(req, requestTailoredResumeSchema);
    const result = await resumeEngine.requestTailoredResume(userId, jdText);
    return Response.json(result, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}

// GET /api/resumes -> resume history (newest first), user-scoped by the facade.
export async function GET(req: Request): Promise<Response> {
  try {
    const { userId } = await requireAuth(req);
    return Response.json(await resumeEngine.listResumes(userId));
  } catch (err) {
    return errorResponse(err);
  }
}
