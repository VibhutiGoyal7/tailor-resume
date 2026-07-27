// Resume file rendering (ADR-012: PDF via @react-pdf/renderer, DOCX via a dedicated
// library — both run in the worker process, ADR-001). The render *implementation*
// lives in apps/worker and is INJECTED here via setResumeRenderer() at worker
// startup — this module only knows the interface. That injection is what keeps the
// heavy render deps out of the `web` deployable (CLAUDE.md §7): web imports this
// facade but never registers a renderer, and the default renderer imports nothing.
import type { ExportFormat, RenderedResume, TemplateId } from '@tailor/shared-types';

/** Contact block for the rendered resume header / sidebar. */
export interface RenderBasics {
  fullName: string;
  phone?: string | null;
  location?: string | null;
  links?: { linkedin?: string; portfolio?: string; github?: string };
}

/** Everything a renderer needs to produce one file. */
export interface RenderInput {
  format: ExportFormat;
  templateId: TemplateId;
  /** The generated summary + grounded bullets (from runGenerateStage). */
  content: RenderedResume;
  basics: RenderBasics;
  /** Candidate skills (aggregated bullet tags) — shown in the two-column sidebar. */
  skills: string[];
}

export interface ResumeRenderer {
  /** Render one resume file, returning its raw bytes. */
  render(input: RenderInput): Promise<Buffer>;
}

/**
 * Default renderer: refuses to render. The real renderer (react-pdf / docx) is
 * worker-only and registered by apps/worker at startup via setResumeRenderer().
 * If this fires, rendering was attempted somewhere that didn't register one
 * (e.g. the web deployable, which must never pull in the render deps).
 */
export class NoopResumeRenderer implements ResumeRenderer {
  render(input: RenderInput): Promise<Buffer> {
    throw new Error(
      `No ResumeRenderer registered (format=${input.format}). ` +
        'The worker must call setResumeRenderer() at startup; the web deployable must not render.',
    );
  }
}

let resumeRenderer: ResumeRenderer = new NoopResumeRenderer();
export function getResumeRenderer(): ResumeRenderer {
  return resumeRenderer;
}
export function setResumeRenderer(next: ResumeRenderer): void {
  resumeRenderer = next;
}
