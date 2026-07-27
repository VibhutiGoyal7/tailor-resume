// Stage 3 worker task: generate the tailored resume from the confirmed matches.
// Thin by design (CLAUDE.md Section 1) — all logic (build the generator input,
// call the mockable LLM, reconcile grounding, persist renderedContent, advance
// the job to `done`) lives in the resume-engine facade. A thrown error marks the
// BullMQ job failed and records failedStage="generating".
import { resumeEngine } from '@tailor/modules';
import type { GenerateResumeJob } from '../queues.js';

export async function generateResume(job: GenerateResumeJob): Promise<void> {
  await resumeEngine.runGenerateStage(job.jobId, job.keptCandidateIds);
}
