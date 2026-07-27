// Stage 1 worker task: parse the JD and persist jd_parsed.
// Thin by design (CLAUDE.md Section 1) — all logic lives in the resume-engine
// facade, which parses (mockable LLM), stores the result, and advances the job.
// A thrown error here marks the BullMQ job failed and lets its retry policy run.
import { resumeEngine } from '@tailor/modules';
import type { ParseJDJob } from '../queues.js';

export async function parseJD(job: ParseJDJob): Promise<void> {
  await resumeEngine.runParseStage(job.jobId, job.jdText);
}
