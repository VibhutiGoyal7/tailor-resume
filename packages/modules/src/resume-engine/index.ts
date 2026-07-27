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
import {
  AppError,
  type JdParsed,
  type JobStage,
  type JobStatusView,
  type RenderedResume,
  type RetrievedCandidateView,
} from '@tailor/shared-types';
import { logger } from '../logger.js';
import { NotImplementedError } from '../common.js';
import { profileModule } from '../profile/index.js';
import { getEmbedder } from '../embedding/index.js';
import { getJdParser } from './jd-parser.js';
import { getResumeGenerator } from './generator.js';
import { getEnqueuer } from './queue.js';
import { buildRetrievalQueries, rerankCandidates, TOP_K_PER_QUERY } from './retrieval.js';
import {
  buildGenerationInput,
  reconcileGeneratedResume,
  selectKeptCandidates,
} from './generation.js';

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
   * persists jd_parsed onto a TailoredResume linked to the job, advances the
   * stage to `retrieving`, and enqueues the retrieve job (ADR-009 chaining). On
   * any failure, records `failedStage = "parsing"` (stage stays `parsing`) and
   * rethrows so BullMQ's retry policy applies.
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
      await getEnqueuer().enqueueRetrieve({ jobId });
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
   * Run the retrieve stage (invoked by the worker's retrieveCandidates task).
   * Lazily embeds any kept bullets missing a vector (M5 decision: embedding runs
   * in the worker, not the web write path), embeds each JD query string, runs
   * pgvector cosine search per query via profileModule (ADR-008 — never touches
   * profile's table directly), unions + hybrid-re-ranks the hits (ADR-003), then
   * persists the candidate set and stops at `awaiting_confirmation` (ADR-017 —
   * does NOT auto-enqueue generate; that waits for POST /confirm). On failure:
   * `failedStage = "retrieving"`, stage unchanged, rethrow.
   */
  async runRetrieveStage(jobId: string): Promise<void> {
    const job = await prisma.tailoringJob.findUnique({ where: { id: jobId } });
    if (!job) throw new AppError('NOT_FOUND', `Tailoring job ${jobId} not found.`);
    if (!job.tailoredResumeId) {
      throw new AppError('CONFLICT', `Job ${jobId} has no parsed resume to retrieve against.`);
    }

    try {
      const resume = await prisma.tailoredResume.findUniqueOrThrow({
        where: { id: job.tailoredResumeId },
      });
      const jdParsed = resume.jdParsed as unknown as JdParsed;
      const embedder = getEmbedder();

      // 1. Lazy embedding backfill for kept bullets that don't have a vector yet.
      const missing = await profileModule.getBulletsNeedingEmbedding(job.userId);
      if (missing.length > 0) {
        const vectors = await embedder.embed(
          missing.map((b) => b.text),
          'document',
        );
        for (let i = 0; i < missing.length; i++) {
          await profileModule.setBulletEmbedding(missing[i]!.id, vectors[i]!);
        }
        logger.info({ jobId, embedded: missing.length }, 'backfilled bullet embeddings');
      }

      // 2. Embed each JD query separately, search, union + re-rank (ADR-003/004).
      const queries = buildRetrievalQueries(jdParsed);
      const queryVectors = queries.length ? await embedder.embed(queries, 'query') : [];
      const matches = (
        await Promise.all(
          queryVectors.map((qv) =>
            profileModule.searchBulletsByVector(job.userId, qv, TOP_K_PER_QUERY),
          ),
        )
      ).flat();
      const candidates = rerankCandidates(matches, jdParsed.required_skills);

      // 3. Persist candidates and stop at the ADR-017 checkpoint.
      await prisma.$transaction(async (tx) => {
        await tx.tailoredResume.update({
          where: { id: resume.id },
          data: {
            retrievedCandidateIds: candidates.map((c) => c.bulletId),
            retrievedCandidates: candidates as unknown as Prisma.InputJsonValue,
          },
        });
        await tx.tailoringJob.update({
          where: { id: jobId },
          data: { stage: 'awaiting_confirmation', failedStage: null },
        });
      });

      logger.info(
        { jobId, candidateCount: candidates.length },
        'retrieve stage complete; stage -> awaiting_confirmation',
      );
    } catch (err) {
      await prisma.tailoringJob.update({
        where: { id: jobId },
        data: { failedStage: 'retrieving' },
      });
      logger.error({ jobId, err: (err as Error).message }, 'retrieve stage failed');
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
    let retrievedCandidates: RetrievedCandidateView[] | null = null;
    let renderedContent: RenderedResume | null = null;
    if (job.tailoredResumeId) {
      const resume = await prisma.tailoredResume.findUnique({
        where: { id: job.tailoredResumeId },
        select: { jdParsed: true, retrievedCandidates: true, renderedContent: true },
      });
      jdParsed = (resume?.jdParsed as JdParsed | undefined) ?? null;
      retrievedCandidates =
        (resume?.retrievedCandidates as RetrievedCandidateView[] | undefined) ?? null;
      renderedContent = (resume?.renderedContent as RenderedResume | undefined) ?? null;
    }

    return {
      jobId: job.id,
      stage: job.stage as JobStage,
      failedStage: job.failedStage,
      jdParsed,
      retrievedCandidates,
      renderedContent,
    };
  },

  /**
   * ADR-017 checkpoint confirmation: the user's kept subset of the retrieved
   * candidates. Validates the kept ids are a subset of what was retrieved,
   * records them as `selectedBulletIds`, advances the job to `generating`, and
   * enqueues the generate stage (this is the *only* place generate is enqueued —
   * ADR-017 two-phase). User-scoped (404 for others' jobs) and only valid while
   * awaiting confirmation.
   */
  async confirmRetrievedMatches(
    userId: string,
    jobId: string,
    keptCandidateIds: string[],
  ): Promise<void> {
    const job = await prisma.tailoringJob.findFirst({ where: { id: jobId, userId } });
    if (!job) throw new AppError('NOT_FOUND', `Tailoring job ${jobId} not found.`);
    if (job.stage !== 'awaiting_confirmation') {
      throw new AppError(
        'CONFLICT',
        `Job ${jobId} is not awaiting confirmation (stage: ${job.stage}).`,
      );
    }
    if (!job.tailoredResumeId) {
      throw new AppError('CONFLICT', `Job ${jobId} has no retrieved candidates to confirm.`);
    }

    const resume = await prisma.tailoredResume.findUniqueOrThrow({
      where: { id: job.tailoredResumeId },
      select: { retrievedCandidateIds: true },
    });
    const retrievedSet = new Set(resume.retrievedCandidateIds);
    const invalid = keptCandidateIds.filter((id) => !retrievedSet.has(id));
    if (invalid.length > 0) {
      throw new AppError(
        'VALIDATION_FAILED',
        'keptCandidateIds must be a subset of the retrieved candidates.',
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.tailoredResume.update({
        where: { id: job.tailoredResumeId! },
        data: { selectedBulletIds: keptCandidateIds },
      });
      await tx.tailoringJob.update({
        where: { id: jobId },
        data: { stage: 'generating', failedStage: null },
      });
    });
    await getEnqueuer().enqueueGenerate({ jobId, keptCandidateIds });
    logger.info(
      { jobId, kept: keptCandidateIds.length },
      'retrieval checkpoint confirmed; stage -> generating, generate enqueued',
    );
  },

  /**
   * Run the generate stage (invoked by the worker's generateResume task). Loads
   * the parsed JD + the kept candidate snapshot, calls the injectable generator
   * (stub when no ANTHROPIC_API_KEY — Claude Sonnet otherwise, ADR-004) for a
   * structured selection/rewrite, reconciles grounding refs against the kept set
   * (ADR-004 — drops any hallucinated source id and attaches the real
   * experienceItemId), persists `renderedContent`, and advances the stage
   * `generating -> done`. On any failure: `failedStage = "generating"` (stage
   * unchanged), rethrow so BullMQ's retry policy applies.
   */
  async runGenerateStage(jobId: string, keptCandidateIds: string[]): Promise<void> {
    const job = await prisma.tailoringJob.findUnique({ where: { id: jobId } });
    if (!job) throw new AppError('NOT_FOUND', `Tailoring job ${jobId} not found.`);
    if (!job.tailoredResumeId) {
      throw new AppError('CONFLICT', `Job ${jobId} has no resume to generate.`);
    }

    try {
      const resume = await prisma.tailoredResume.findUniqueOrThrow({
        where: { id: job.tailoredResumeId },
      });
      const jdParsed = resume.jdParsed as unknown as JdParsed;
      const retrievedCandidates =
        (resume.retrievedCandidates as unknown as RetrievedCandidateView[] | null) ?? [];

      const candidates = selectKeptCandidates(retrievedCandidates, keptCandidateIds);
      const basics = await profileModule.getResumeBasics(job.userId);
      const input = buildGenerationInput(jdParsed, candidates, {
        fullName: basics?.fullName,
        summary: basics?.summary ?? undefined,
      });

      const generated = await getResumeGenerator().generate(input);
      const rendered: RenderedResume = reconcileGeneratedResume(
        generated,
        candidates,
        resume.templateId,
        input.maxBullets,
      );

      await prisma.$transaction(async (tx) => {
        await tx.tailoredResume.update({
          where: { id: resume.id },
          data: { renderedContent: rendered as unknown as Prisma.InputJsonValue },
        });
        await tx.tailoringJob.update({
          where: { id: jobId },
          data: { stage: 'done', failedStage: null },
        });
      });

      logger.info(
        { jobId, bulletCount: rendered.bullets.length },
        'generate stage complete; renderedContent persisted, stage -> done',
      );
    } catch (err) {
      await prisma.tailoringJob.update({
        where: { id: jobId },
        data: { failedStage: 'generating' },
      });
      logger.error({ jobId, err: (err as Error).message }, 'generate stage failed');
      throw err;
    }
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
export {
  getResumeGenerator,
  setResumeGenerator,
  StubResumeGenerator,
  AnthropicResumeGenerator,
  RESUME_GEN_MODEL,
} from './generator.js';
export type { ResumeGenerator, GenerationInput, GenerationCandidate } from './generator.js';
export { getEnqueuer, setEnqueuer, BullMqEnqueuer } from './queue.js';
export type { Enqueuer } from './queue.js';
export {
  buildRetrievalQueries,
  rerankCandidates,
  TOP_K_PER_QUERY,
  TAG_BOOST,
  MAX_TAG_BOOST,
  MAX_CANDIDATES,
} from './retrieval.js';
export {
  buildGenerationInput,
  reconcileGeneratedResume,
  selectKeptCandidates,
  MAX_GENERATED_BULLETS,
} from './generation.js';
