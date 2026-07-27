// Stage 2 worker task: retrieve candidate bullets for the parsed JD.
// Thin by design (CLAUDE.md Section 1) — all logic (embed queries, pgvector
// search via profile, hybrid re-rank, stop at the ADR-017 checkpoint) lives in
// the resume-engine facade. A thrown error marks the BullMQ job failed.
import { resumeEngine } from '@tailor/modules';
import type { RetrieveCandidatesJob } from '../queues.js';

export async function retrieveCandidates(job: RetrieveCandidatesJob): Promise<void> {
  await resumeEngine.runRetrieveStage(job.jobId);
}
