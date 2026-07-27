// The worker's ResumeRenderer implementation (ADR-012). Dispatches by format to
// the react-pdf (pdf.ts) or docx (docx.ts) renderer. Registered into the shared
// resume-engine facade at worker startup via setResumeRenderer() — this is the
// injection point that keeps the heavy render deps out of the `web` deployable
// (CLAUDE.md §7): only apps/worker imports these files.
import { setResumeRenderer, type RenderInput, type ResumeRenderer } from '@tailor/modules';
import { renderPdf } from './pdf.js';
import { renderDocx } from './docx.js';

export class WorkerResumeRenderer implements ResumeRenderer {
  async render(input: RenderInput): Promise<Buffer> {
    return input.format === 'pdf' ? renderPdf(input) : renderDocx(input);
  }
}

/** Called once at worker startup so runGenerateStage can render exports. */
export function registerWorkerRenderer(): void {
  setResumeRenderer(new WorkerResumeRenderer());
}
