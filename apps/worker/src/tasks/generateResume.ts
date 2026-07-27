// Stage 3: call Claude Sonnet with structured JD + kept candidates + template
// constraints; structured output selects bullets, rewrites phrasing, with
// grounding references. On success: TailoredResume created, stage -> "done".
// Implemented in Milestone 6.
import type { GenerateResumeJob } from '../queues.js';

export async function generateResume(_job: GenerateResumeJob): Promise<void> {
  throw new Error('generateResume task is not implemented yet (scaffold).');
}
