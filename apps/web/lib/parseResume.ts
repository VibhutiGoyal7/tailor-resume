// Resume file → plain text for the "Import from resume" flow. PDF via unpdf
// (pdfjs under the hood, serverless-friendly), DOCX via mammoth, and .txt passed
// through. Isolated here so the module facade stays free of file-parsing deps
// (the facade takes text, this is the web route's I/O concern). Node runtime only.
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import { AppError } from '@tailor/shared-types';

/** Upload size ceiling (build brief / design: "PDF or DOCX, up to 5MB"). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function extractResumeText(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const type = file.type;

  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value;
  }
  if (type === 'text/plain' || name.endsWith('.txt')) {
    return buf.toString('utf8');
  }
  throw new AppError('VALIDATION_FAILED', 'Unsupported file type — upload a PDF or DOCX.');
}
