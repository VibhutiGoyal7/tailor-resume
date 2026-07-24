// Stage-aware retry routing (ADR-015): POST /resumes/jobs/:jobId/retry
// re-enqueues ONLY the queue matching the failed stage, reusing the failed
// attempt's input — it does not restart the pipeline from parseJD. Pure lookup,
// unit-tested in isolation.
import { QUEUE_NAMES, type QueueName } from './queues.js';

/** Job stages that correspond to an actual worker task/queue. */
export type FailableStage = 'parsing' | 'retrieving' | 'generating';

const STAGE_TO_QUEUE: Record<FailableStage, QueueName> = {
  parsing: QUEUE_NAMES.parse,
  retrieving: QUEUE_NAMES.retrieve,
  generating: QUEUE_NAMES.generate,
};

/**
 * The queue to re-enqueue for a given failed stage, or null if the stage isn't
 * one a worker task runs (e.g. `awaiting_confirmation` never "fails" into a retry).
 */
export function queueForStage(failedStage: string): QueueName | null {
  return STAGE_TO_QUEUE[failedStage as FailableStage] ?? null;
}
