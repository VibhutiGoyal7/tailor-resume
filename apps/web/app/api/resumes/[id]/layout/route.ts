// PATCH /api/resumes/:id/layout -> customize a generated resume's layout
// (build brief §5, Milestone 7). Thin: auth, validate body, one facade call,
// respond with the updated detail view. User-scoped by the facade (404). The
// facade enqueues a re-render (worker-only renderers, CLAUDE.md §7) and returns
// immediately; the export files refresh in place once the worker runs.
import { resumeEngine } from '@tailor/modules';
import { updateResumeLayoutSchema } from '@tailor/shared-types';
import { requireAuth } from '../../../../../lib/auth';
import { errorResponse, readJson } from '../../../../../lib/http';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { userId } = await requireAuth(req);
    const { id } = await params;
    const input = await readJson(req, updateResumeLayoutSchema);
    return Response.json(await resumeEngine.updateResumeLayout(userId, id, input));
  } catch (err) {
    return errorResponse(err);
  }
}
