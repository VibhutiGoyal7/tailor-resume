// POST /api/bank/import -> 201 ExperienceItem[] (source freeform_extracted,
// suggested bullets). Multipart upload of a PDF/DOCX resume: parse it to text,
// then let Claude pull out every experience for the user to review. Node runtime
// (unpdf/mammoth need Node APIs).
import { profileModule } from '@tailor/modules';
import { AppError } from '@tailor/shared-types';
import { requireAuth } from '../../../../lib/auth';
import { errorResponse } from '../../../../lib/http';
import { MAX_UPLOAD_BYTES, extractResumeText } from '../../../../lib/parseResume';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  try {
    const { userId } = await requireAuth(req);

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new AppError('VALIDATION_FAILED', 'No file uploaded.');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new AppError('VALIDATION_FAILED', 'That file is too large — the limit is 5MB.');
    }

    const text = await extractResumeText(file);
    if (text.trim().length < 30) {
      throw new AppError(
        'VALIDATION_FAILED',
        "We couldn't read any text from that file. Try a different export.",
      );
    }

    const items = await profileModule.importResumeFromText(userId, text);
    return Response.json(items, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
