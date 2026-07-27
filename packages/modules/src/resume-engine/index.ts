// resume-engine module facade (ADR-008). Enqueues pipeline work and reads job
// state; the actual parse/retrieve/generate happens in the worker's tasks, which
// call back into this module (so business logic lives here, not in the worker —
// CLAUDE.md Section 1). Gets bank data via profileModule, never via its own
// Prisma query against profile's models.
//
// Milestone 4 implements the *parse* stage end-to-end:
//   requestTailoredResume -> create job + enqueue parse
//   runParseStage         -> (worker) parse JD, persist jd_parsed, advance stage
//   getJobStatus          -> poll job + parsed result (ADR-015)
// retrieve/generate/confirm land in Milestones 5–7 (still scaffolded below).
import { prisma, Prisma } from '@tailor/db';
import { AppError, type JdParsed, type JobStage, type JobStatusView } from '@tailor/shared-types';
import { logger } from '../logger.js';
import { NotImplementedError } from '../common.js';
import { getJdParser } from './jd-parser.js';
import { getEnqueuer } from './queue.js';

/** Template used until template selection ships (build brief open items). */
const DEFAULT_TEMPLATE_ID = 'classic';

export interface UpdateResumeLayoutInput {
  sectionOrder: string[];
  hiddenSections: string[];
  layoutVariantId?: string;
}

export const resumeEngine = {
  /**
   * Start a tailoring pipeline: create the job in `parsing`, enqueue the parse
   * task only (ADR-017 two-phase), and return the id to poll. The heavy work
   * happens asynchronously in the worker (ADR-009).
   */
  async requestTailoredResume(userId: string, jdText: string): Promise<{ jobId: string }> {
    const job = await prisma.tailoringJob.create({
      data: { userId, stage: 'parsing', failedStage: null },
    });
    await getEnqueuer().enqueueParse({ jobId: job.id, jdText });
    logger.info({ jobId: job.id, userId }, 'tailoring job created; parse enqueued');
    return { jobId: job.id };
  },

  /**
   * Run the parse stage for a job (invoked by the worker's parseJD task).
   * Parses the JD via the injectable parser (stub when no ANTHROPIC_API_KEY),
   * persists jd_parsed onto a TailoredResume linked to the job, and advances the
   * stage to `retrieving`. On any failure, records `failedStage = "parsing"`
   * (stage stays `parsing`) and rethrows so BullMQ's retry policy applies.
   *
   * Note: enqueuing the *next* stage (retrieve) is intentionally deferred to
   * Milestone 5, when the retrieve task exists — so an M4 job cleanly reaches
   * `retrieving` with its parse visible, without a failing downstream job.
   */
  async runParseStage(jobId: string, jdText: string): Promise<void> {
    const job = await prisma.tailoringJob.findUnique({ where: { id: jobId } });
    if (!job) throw new AppError('NOT_FOUND', `Tailoring job ${jobId} not found.`);

    try {
      const jdParsed = await getJdParser().parse(jdText);

      await prisma.$transaction(async (tx) => {
        const resume = await tx.tailoredResume.create({
          data: {
            userId: job.userId,
            jdText,
            // JdParsed is a fixed-shape interface; Prisma's Json input wants a
            // structural JSON type, so cast at the persistence boundary.
            jdParsed: jdParsed as unknown as Prisma.InputJsonValue,
            templateId: DEFAULT_TEMPLATE_ID,
            sectionOrder: [],
            hiddenSections: [],
            selectedBulletIds: [],
            retrievedCandidateIds: [],
          },
        });
        await tx.tailoringJob.update({
          where: { id: jobId },
          data: { tailoredResumeId: resume.id, stage: 'retrieving', failedStage: null },
        });
      });

      logger.info({ jobId }, 'parse stage complete; jd_parsed persisted, stage -> retrieving');
    } catch (err) {
      await prisma.tailoringJob.update({
        where: { id: jobId },
        data: { failedStage: 'parsing' },
      });
      logger.error({ jobId, err: (err as Error).message }, 'parse stage failed');
      throw err;
    }
  },

  /**
   * Stage-level status for polling (ADR-015). Scoped by userId so a user can
   * only poll their own jobs — 404 (not 403) for a missing or others' job, so
   * job ids aren't enumerable.
   */
  async getJobStatus(userId: string, jobId: string): Promise<JobStatusView> {
    const job = await prisma.tailoringJob.findFirst({ where: { id: jobId, userId } });
    if (!job) throw new AppError('NOT_FOUND', `Tailoring job ${jobId} not found.`);

    let jdParsed: JdParsed | null = null;
    if (job.tailoredResumeId) {
      const resume = await prisma.tailoredResume.findUnique({
        where: { id: job.tailoredResumeId },
        select: { jdParsed: true },
      });
      jdParsed = (resume?.jdParsed as JdParsed | undefined) ?? null;
    }

    return {
      jobId: job.id,
      stage: job.stage as JobStage,
      failedStage: job.failedStage,
      jdParsed,
    };
  },

  /** Two-phase confirm (ADR-017) — enqueues the "generate" task. (Milestone 6) */
  confirmRetrievedMatches(_jobId: string, _keptCandidateIds: string[]): Promise<never> {
    throw new NotImplementedError('resumeEngine.confirmRetrievedMatches');
  },
  getResume(_resumeId: string): Promise<never> {
    throw new NotImplementedError('resumeEngine.getResume');
  },
  updateResumeLayout(_resumeId: string, _input: UpdateResumeLayoutInput): Promise<never> {
    throw new NotImplementedError('resumeEngine.updateResumeLayout');
  },
};

export { isActive, isTerminal, nextStage } from './stage.js';
export { getJdParser, setJdParser, StubJdParser, AnthropicJdParser } from './jd-parser.js';
export type { JdParser } from './jd-parser.js';
export { getEnqueuer, setEnqueuer, BullMqEnqueuer } from './queue.js';
export type { Enqueuer } from './queue.js';
