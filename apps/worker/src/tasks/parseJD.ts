// Stage 1: parse the JD with Claude Haiku (structured output) → jd_parsed JSON.
// On success: persist to TailoringJob and enqueue retrieveCandidates.
// On failure: TailoringJob.failedStage = "parsing" (stage stays "parsing").
// Implemented in Milestone 4.
import type { ParseJDJob } from '../queues.js';

export async function parseJD(_job: ParseJDJob): Promise<void> {
  throw new Error('parseJD task is not implemented yet (scaffold).');
}
