// GET /api/resumes/:id/export?format=pdf|docx -> stream the rendered resume file
// (build brief §5, ADR-012). Thin: auth, validate format, one facade call, stream
// the bytes as an attachment. The bytes come from the FileStore (rendered by the
// worker at generate time) — this route never imports the render deps (CLAUDE.md §7).
import { resumeEngine } from '@tailor/modules';
import { exportFormatSchema } from '@tailor/shared-types';
import { requireAuth } from '../../../../../lib/auth';
import { errorResponse } from '../../../../../lib/http';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { userId } = await requireAuth(req);
    const { id } = await params;
    const format = exportFormatSchema.parse(new URL(req.url).searchParams.get('format'));
    const { bytes, contentType, filename } = await resumeEngine.getResumeExport(userId, id, format);
    return new Response(bytes, {
      status: 200,
      headers: {
        'content-type': contentType,
        'content-disposition': `attachment; filename="${filename}"`,
        'content-length': String(bytes.length),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
