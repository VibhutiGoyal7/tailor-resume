// POST /api/resumes/jobs/:jobId/confirm -> the ADR-017 checkpoint confirmation.
// The user's kept subset of retrieved candidates. Thin: auth, validate, one
// facade call, respond 202 (generate stage is enqueued here in Milestone 6).
import { resumeEngine } from '@tailor/modules';
import { confirmRetrievedMatchesSchema } from '@tailor/shared-types';
import { requireAuth } from '../../../../../../lib/auth';
import { errorResponse, readJson } from '../../../../../../lib/http';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  try {
    const { userId } = await requireAuth(req);
    const { jobId } = await params;
    const { keptCandidateIds } = await readJson(req, confirmRetrievedMatchesSchema);
    await resumeEngine.confirmRetrievedMatches(userId, jobId, keptCandidateIds);
    return new Response(null, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
