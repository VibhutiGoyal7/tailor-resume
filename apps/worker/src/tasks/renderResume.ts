// Milestone 7 worker task: re-render a resume's export files after a layout
// change. Thin by design (CLAUDE.md Section 1) — all logic (load renderedContent
// + layout, re-render PDF/DOCX, overwrite the stored files) lives in the
// resume-engine facade. Runs after the pipeline is `done`, so it's keyed on the
// resume, not a TailoringJob. A thrown error marks the BullMQ job failed so it retries.
import { resumeEngine } from '@tailor/modules';
import type { RenderResumeJob } from '../queues.js';

export async function renderResume(job: RenderResumeJob): Promise<void> {
  await resumeEngine.runRenderStage(job.resumeId);
}
