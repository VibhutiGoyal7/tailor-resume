// Queue producer for the tailoring pipeline (build brief Section 7, ADR-009).
// The resume-engine module is the *producer* — it adds jobs to BullMQ queues;
// apps/worker is the *consumer*. Both share QUEUE_NAMES + payload shapes from
// shared-types so there's one source of truth.
//
// The real BullMQ/Redis client is behind the Enqueuer interface and lazy-loaded,
// so unit tests inject an in-memory fake (setEnqueuer) and never need Redis —
// CLAUDE.md Section 2 (no real infra calls in tests).
import {
  QUEUE_NAMES,
  type GenerateResumeJob,
  type ParseJDJob,
  type RetrieveCandidatesJob,
} from '@tailor/shared-types';
import { logger } from '../logger.js';

export interface Enqueuer {
  /** Enqueue the parse-JD job that kicks off a tailoring pipeline (ADR-017). */
  enqueueParse(job: ParseJDJob): Promise<void>;
  /** Enqueue the retrieve job (chained after a successful parse, ADR-009). */
  enqueueRetrieve(job: RetrieveCandidatesJob): Promise<void>;
  /** Enqueue the generate job (only from POST /confirm — ADR-017 two-phase). */
  enqueueGenerate(job: GenerateResumeJob): Promise<void>;
}

/**
 * Production enqueuer backed by BullMQ + Redis. `bullmq` and `ioredis` are
 * imported lazily and the Redis connection is opened on first use, so nothing
 * connects (or needs REDIS_URL) until a job is actually enqueued.
 */
export class BullMqEnqueuer implements Enqueuer {
  // Loosely typed on purpose: bullmq's types are only pulled in at call time.
  private connection: unknown;
  private readonly queues = new Map<
    string,
    { add(name: string, data: unknown): Promise<unknown> }
  >();

  private async getQueue(
    name: string,
  ): Promise<{ add(name: string, data: unknown): Promise<unknown> }> {
    const existing = this.queues.get(name);
    if (existing) return existing;

    const { Queue } = await import('bullmq');
    const { Redis } = await import('ioredis');
    if (!this.connection) {
      const url = process.env.REDIS_URL;
      if (!url) throw new Error('REDIS_URL not set — cannot enqueue pipeline jobs.');
      this.connection = new Redis(url, { maxRetriesPerRequest: null });
    }
    const queue = new Queue(name, { connection: this.connection as never });
    this.queues.set(name, queue);
    return queue;
  }

  async enqueueParse(job: ParseJDJob): Promise<void> {
    const queue = await this.getQueue(QUEUE_NAMES.parse);
    await queue.add('parse', job);
    logger.info({ jobId: job.jobId }, 'enqueued parse-jd job');
  }

  async enqueueRetrieve(job: RetrieveCandidatesJob): Promise<void> {
    const queue = await this.getQueue(QUEUE_NAMES.retrieve);
    await queue.add('retrieve', job);
    logger.info({ jobId: job.jobId }, 'enqueued retrieve-candidates job');
  }

  async enqueueGenerate(job: GenerateResumeJob): Promise<void> {
    const queue = await this.getQueue(QUEUE_NAMES.generate);
    await queue.add('generate', job);
    logger.info({ jobId: job.jobId }, 'enqueued generate-resume job');
  }
}

// Swappable singleton: BullMQ in prod, an in-memory fake injected in tests.
let enqueuer: Enqueuer | undefined;
export function getEnqueuer(): Enqueuer {
  if (!enqueuer) enqueuer = new BullMqEnqueuer();
  return enqueuer;
}
export function setEnqueuer(next: Enqueuer): void {
  enqueuer = next;
}
