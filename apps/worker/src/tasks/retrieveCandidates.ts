// Stage 2: embed each key_responsibility + required_skill (Voyage), pgvector
// cosine search per query, union+dedupe, hybrid tag re-rank (ADR-003).
// On success: stage -> "awaiting_confirmation", store retrievedCandidateIds.
// Does NOT enqueue generate — waits for POST /confirm (ADR-017).
// Implemented in Milestone 5.
import type { RetrieveCandidatesJob } from '../queues.js';

export async function retrieveCandidates(_job: RetrieveCandidatesJob): Promise<void> {
  throw new Error('retrieveCandidates task is not implemented yet (scaffold).');
}
