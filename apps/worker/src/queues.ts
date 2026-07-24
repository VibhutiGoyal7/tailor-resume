// Queue definitions for the tailoring pipeline (build brief Section 7, ADR-009).
// Three named queues — one per stage — so concurrency limits and monitoring can
// be tuned per stage (the LLM calls in parse/generate are the expensive ones).
export const QUEUE_NAMES = {
  parse: 'parse-jd',
  retrieve: 'retrieve-candidates',
  generate: 'generate-resume',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Job payloads carried on each queue. `jobId` == TailoringJob.id throughout. */
export interface ParseJDJob {
  jobId: string;
  jdText: string;
}
export interface RetrieveCandidatesJob {
  jobId: string;
}
export interface GenerateResumeJob {
  jobId: string;
  keptCandidateIds: string[];
}
