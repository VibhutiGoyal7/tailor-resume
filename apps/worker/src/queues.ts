// Queue names + job payloads for the tailoring pipeline (build brief Section 7,
// ADR-009). These are the single source of truth in shared-types so the producer
// (resume-engine module) and this consumer (the worker) can never drift apart —
// re-exported here for the worker's local imports.
export { QUEUE_NAMES } from '@tailor/shared-types';
export type {
  QueueName,
  ParseJDJob,
  RetrieveCandidatesJob,
  GenerateResumeJob,
  RenderResumeJob,
} from '@tailor/shared-types';
