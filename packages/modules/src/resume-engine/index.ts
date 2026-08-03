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
  DEFAULT_LAYOUT_VARIANT,
  EXPORT_CONTENT_TYPES,
  EXPORT_FORMATS,
  isValidLayoutVariant,
  resolveSectionOrder,
  suggestTemplateId,
  type ExportFormat,
  type JdParsed,
  type JobStage,
  type JobStatusView,
  type RenderedResume,
  type ResumeExportFile,
  type ResumeSection,
  type RetrievedCandidateView,
  type StoredExportFiles,
  type TailoredResumeSummary,
  type TailoredResumeView,
  type TemplateId,
  type UpdateResumeLayoutInput,
} from '@tailor/shared-types';
import { logger } from '../logger.js';
import { profileModule } from '../profile/index.js';
import { getEmbedder } from '../embedding/index.js';
import { getFileStore } from '../storage/index.js';
import { getJdParser } from './jd-parser.js';
import { getResumeGenerator } from './generator.js';
import { getResumeRenderer, type RenderBasics } from './renderer.js';
import { getEnqueuer } from './queue.js';
import { buildRetrievalQueries, rerankCandidates, TOP_K_PER_QUERY } from './retrieval.js';
import {
  buildGenerationInput,
  reconcileGeneratedResume,
  selectKeptCandidates,
} from './generation.js';
import { computeMatchScore } from './match-score.js';

/** Kebab-case a name for a download filename; empty → falls back at the call site. */
function slug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Render each export format for a resume and store the bytes via the FileStore,
 * returning the stored-file map to persist on `TailoredResume.exportFiles`. The
 * renderer is injected (worker-only, ADR-012 / CLAUDE.md §7); the FileStore is R2
 * in prod or local disk in dev (keyless).
 */
async function renderAndStoreExports(
  resumeId: string,
  opts: {
    templateId: TemplateId;
    rendered: RenderedResume;
    basics: RenderBasics;
    skills: string[];
    sectionOrder: ResumeSection[];
    hiddenSections: ResumeSection[];
    layoutVariantId: string;
  },
): Promise<StoredExportFiles> {
  const renderer = getResumeRenderer();
  const store = getFileStore();
  const files: StoredExportFiles = {};
  for (const format of EXPORT_FORMATS) {
    const bytes = await renderer.render({
      format,
      templateId: opts.templateId,
      content: opts.rendered,
      basics: opts.basics,
      skills: opts.skills,
      sectionOrder: opts.sectionOrder,
      hiddenSections: opts.hiddenSections,
      layoutVariantId: opts.layoutVariantId,
    });
    // Deterministic keys per resume+format, so a Milestone-7 re-render overwrites
    // the same objects in place (the download URL never changes).
    const key = `resumes/${resumeId}/resume.${format}`;
    const filename = `${slug(opts.basics.fullName) || 'resume'}.${format}`;
    await store.put(key, bytes, EXPORT_CONTENT_TYPES[format]);
    const file: ResumeExportFile = { key, contentType: EXPORT_CONTENT_TYPES[format], filename };
    files[format] = file;
  }
  return files;
}

/** The RenderBasics contact block for a user (shared by generate + re-render). */
async function resumeBasicsFor(userId: string): Promise<RenderBasics> {
  const basics = await profileModule.getResumeBasics(userId);
  return {
    fullName: basics?.fullName ?? '',
    phone: basics?.phone,
    location: basics?.location,
    links: basics?.links,
  };
}

/** Shape a TailoredResume row into the API detail view (getResume + updateResumeLayout). */
function toTailoredResumeView(resume: {
  id: string;
  templateId: string;
  jdParsed: unknown;
  renderedContent: unknown;
  sectionOrder: string[];
  hiddenSections: string[];
  layoutVariantId: string | null;
  exportFiles: unknown;
  matchScore: number | null;
  createdAt: Date;
}): TailoredResumeView {
  const templateId = resume.templateId as TemplateId;
  const exportFiles = (resume.exportFiles as StoredExportFiles | null) ?? {};
  return {
    id: resume.id,
    templateId,
    jdParsed: resume.jdParsed as unknown as JdParsed,
    renderedContent: (resume.renderedContent as unknown as RenderedResume | null) ?? null,
    sectionOrder: resolveSectionOrder(resume.sectionOrder),
    hiddenSections: resume.hiddenSections as ResumeSection[],
    layoutVariantId: resume.layoutVariantId ?? DEFAULT_LAYOUT_VARIANT[templateId],
    availableFormats: EXPORT_FORMATS.filter((f) => exportFiles[f]),
    matchScore: resume.matchScore,
    createdAt: resume.createdAt.toISOString(),
  };
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
            // Rule-based auto-suggestion from company_type (ADR-012); user can override later.
            templateId: suggestTemplateId(jdParsed),
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
      resumeId: job.tailoredResumeId,
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
      // Match score (0–100) over the kept candidates, which retain their hybrid
      // scores in the retrieved snapshot. The signature RAG output, persisted for
      // the result dial and the history badge (project doc §9b).
      const keptSet = new Set(keptCandidateIds);
      const matchScore = computeMatchScore(
        jdParsed,
        retrievedCandidates.filter((c) => keptSet.has(c.bulletId)),
      );
      const basics = await profileModule.getResumeBasics(job.userId);
      const input = buildGenerationInput(jdParsed, candidates, {
        fullName: basics?.fullName,
        summary: basics?.summary ?? undefined,
      });

      // Candidate skills for the two-column sidebar: the unique tags on the kept
      // bullets. Carried into renderedContent so a later layout re-render (M7) has
      // them without the candidates in hand.
      const skills = Array.from(
        new Set(candidates.flatMap((c) => c.tags.map((t) => t.trim())).filter(Boolean)),
      );

      const generated = await getResumeGenerator().generate(input);
      const rendered: RenderedResume = reconcileGeneratedResume(
        generated,
        candidates,
        resume.templateId,
        input.maxBullets,
        skills,
      );

      // Render the export files (PDF + DOCX) and store them (ADR-012). The renderer
      // is injected by the worker (react-pdf / docx) — worker-only, so the web
      // deployable never pulls in the render deps (CLAUDE.md §7). Layout is the
      // as-parsed default here (sectionOrder=[] → default order, no hidden sections,
      // template's default variant); the user tunes it later via updateResumeLayout.
      const templateId = resume.templateId as TemplateId;
      const exportFiles = await renderAndStoreExports(resume.id, {
        templateId,
        rendered,
        basics: {
          fullName: basics?.fullName ?? '',
          phone: basics?.phone,
          location: basics?.location,
          links: basics?.links,
        },
        skills,
        sectionOrder: resolveSectionOrder(resume.sectionOrder),
        hiddenSections: resume.hiddenSections as ResumeSection[],
        layoutVariantId: resume.layoutVariantId ?? DEFAULT_LAYOUT_VARIANT[templateId],
      });

      await prisma.$transaction(async (tx) => {
        await tx.tailoredResume.update({
          where: { id: resume.id },
          data: {
            renderedContent: rendered as unknown as Prisma.InputJsonValue,
            exportFiles: exportFiles as unknown as Prisma.InputJsonValue,
            matchScore,
          },
        });
        await tx.tailoringJob.update({
          where: { id: jobId },
          data: { stage: 'done', failedStage: null },
        });
      });

      logger.info(
        { jobId, bulletCount: rendered.bullets.length, matchScore, formats: Object.keys(exportFiles) },
        'generate stage complete; renderedContent + exports persisted, stage -> done',
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
  /**
   * Resume history list (GET /api/resumes, build brief §5), newest first and
   * user-scoped. Returns lightweight summaries (role/company + ready formats),
   * not full detail — the mobile history screen renders one card per row.
   */
  async listResumes(userId: string): Promise<TailoredResumeSummary[]> {
    const rows = await prisma.tailoredResume.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        templateId: true,
        jdParsed: true,
        exportFiles: true,
        matchScore: true,
        createdAt: true,
      },
    });
    return rows.map((r) => {
      const jd = r.jdParsed as unknown as JdParsed;
      const exportFiles = (r.exportFiles as StoredExportFiles | null) ?? {};
      return {
        id: r.id,
        templateId: r.templateId as TemplateId,
        roleType: jd.role_type,
        companyType: jd.company_type,
        seniority: jd.seniority,
        availableFormats: EXPORT_FORMATS.filter((f) => exportFiles[f]),
        matchScore: r.matchScore,
        createdAt: r.createdAt.toISOString(),
      };
    });
  },

  /**
   * Delete a tailored resume (DELETE /api/resumes/:id, build brief §5). User-scoped
   * (404 for a missing or others' resume). Cleans up in three parts: the stored
   * export files (via the FileStore — best-effort, a missing file never blocks the
   * delete), then the linked TailoringJob and the resume row in one transaction.
   */
  async deleteResume(userId: string, resumeId: string): Promise<void> {
    const resume = await prisma.tailoredResume.findFirst({
      where: { id: resumeId, userId },
      select: { id: true, exportFiles: true },
    });
    if (!resume) throw new AppError('NOT_FOUND', `Resume ${resumeId} not found.`);

    const exportFiles = (resume.exportFiles as StoredExportFiles | null) ?? {};
    const store = getFileStore();
    for (const format of EXPORT_FORMATS) {
      const file = exportFiles[format];
      if (!file) continue;
      try {
        await store.delete(file.key);
      } catch (err) {
        // A stuck file shouldn't strand the user with an undeletable resume row.
        logger.warn(
          { resumeId, key: file.key, err: (err as Error).message },
          'failed to delete export file during resume delete; continuing',
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      // The linked job references this resume (no DB-level FK — loose userId/id
      // references per the schema), so clear it in the same transaction.
      await tx.tailoringJob.deleteMany({ where: { tailoredResumeId: resumeId, userId } });
      await tx.tailoredResume.delete({ where: { id: resumeId } });
    });
    logger.info({ resumeId, userId }, 'resume deleted (exports + linked job cleaned up)');
  },

  /**
   * Resume detail (build brief §5). User-scoped (404 for a missing or others'
   * resume, so ids aren't enumerable). `availableFormats` lists which exports have
   * been rendered and are ready to download.
   */
  async getResume(userId: string, resumeId: string): Promise<TailoredResumeView> {
    const resume = await prisma.tailoredResume.findFirst({ where: { id: resumeId, userId } });
    if (!resume) throw new AppError('NOT_FOUND', `Resume ${resumeId} not found.`);
    return toTailoredResumeView(resume);
  },

  /**
   * Fetch a rendered export file's bytes for download (GET /resumes/:id/export).
   * User-scoped; 404 if the resume, the requested format, or the stored bytes are
   * missing. The route streams the returned bytes with the given content type.
   */
  async getResumeExport(
    userId: string,
    resumeId: string,
    format: ExportFormat,
  ): Promise<{ bytes: Buffer; contentType: string; filename: string }> {
    const resume = await prisma.tailoredResume.findFirst({
      where: { id: resumeId, userId },
      select: { exportFiles: true },
    });
    if (!resume) throw new AppError('NOT_FOUND', `Resume ${resumeId} not found.`);
    const exportFiles = (resume.exportFiles as StoredExportFiles | null) ?? {};
    const file = exportFiles[format];
    if (!file) {
      throw new AppError('NOT_FOUND', `Resume ${resumeId} has no ${format} export ready.`);
    }
    const bytes = await getFileStore().get(file.key);
    if (!bytes) {
      throw new AppError('NOT_FOUND', `Export file for resume ${resumeId} is missing.`);
    }
    return { bytes, contentType: file.contentType, filename: file.filename };
  },
  /**
   * Customize a generated resume's layout (PATCH /api/resumes/:id/layout,
   * Milestone 7). Partial update: reorder/hide sections, switch the layout
   * variant, or override the template. User-scoped (404). Only valid once the
   * resume has rendered content (409 otherwise — nothing to lay out). Persists the
   * new layout and enqueues a re-render (the renderers are worker-only, so the
   * actual PDF/DOCX regeneration happens in the worker and overwrites the export
   * files in place). Returns the updated detail view immediately.
   */
  async updateResumeLayout(
    userId: string,
    resumeId: string,
    input: UpdateResumeLayoutInput,
  ): Promise<TailoredResumeView> {
    const resume = await prisma.tailoredResume.findFirst({ where: { id: resumeId, userId } });
    if (!resume) throw new AppError('NOT_FOUND', `Resume ${resumeId} not found.`);
    if (!resume.renderedContent) {
      throw new AppError(
        'CONFLICT',
        `Resume ${resumeId} hasn't been generated yet — there's no layout to change.`,
      );
    }

    const templateId: TemplateId = input.templateId ?? (resume.templateId as TemplateId);
    const templateChanged =
      input.templateId !== undefined && input.templateId !== resume.templateId;
    // When switching template without naming a variant, fall back to the new
    // template's default — the old variant may not exist for the new template.
    const layoutVariantId =
      input.layoutVariantId ??
      (templateChanged
        ? DEFAULT_LAYOUT_VARIANT[templateId]
        : (resume.layoutVariantId ?? DEFAULT_LAYOUT_VARIANT[templateId]));
    if (!isValidLayoutVariant(templateId, layoutVariantId)) {
      throw new AppError(
        'VALIDATION_FAILED',
        `"${layoutVariantId}" is not a valid layout variant for the ${templateId} template.`,
      );
    }

    const sectionOrder = input.sectionOrder ?? resume.sectionOrder;
    const hiddenSections = input.hiddenSections ?? resume.hiddenSections;
    // Keep renderedContent.templateId in sync so a template override is reflected
    // in the polled content, not just the export files.
    const renderedContent = {
      ...(resume.renderedContent as object),
      templateId,
    } as unknown as Prisma.InputJsonValue;

    const updated = await prisma.tailoredResume.update({
      where: { id: resumeId },
      data: { templateId, layoutVariantId, sectionOrder, hiddenSections, renderedContent },
    });

    await getEnqueuer().enqueueRender({ resumeId });
    logger.info(
      { resumeId, templateId, layoutVariantId, hidden: hiddenSections.length },
      'layout updated; re-render enqueued',
    );
    return toTailoredResumeView(updated);
  },

  /**
   * Re-render a resume's export files after a layout change (invoked by the
   * worker's renderResume task, Milestone 7). Reads the stored renderedContent +
   * current layout, re-renders PDF/DOCX via the injected renderer, and overwrites
   * the export files in place (same FileStore keys). Resume-scoped — no TailoringJob
   * stage machine (this runs after the pipeline is `done`). A thrown error lets
   * BullMQ retry the render job.
   */
  async runRenderStage(resumeId: string): Promise<void> {
    const resume = await prisma.tailoredResume.findUnique({ where: { id: resumeId } });
    if (!resume) throw new AppError('NOT_FOUND', `Resume ${resumeId} not found.`);
    const rendered = resume.renderedContent as unknown as RenderedResume | null;
    if (!rendered) {
      throw new AppError('CONFLICT', `Resume ${resumeId} has no rendered content to re-render.`);
    }

    const templateId = resume.templateId as TemplateId;
    const exportFiles = await renderAndStoreExports(resumeId, {
      templateId,
      rendered,
      basics: await resumeBasicsFor(resume.userId),
      skills: rendered.skills ?? [],
      sectionOrder: resolveSectionOrder(resume.sectionOrder),
      hiddenSections: resume.hiddenSections as ResumeSection[],
      layoutVariantId: resume.layoutVariantId ?? DEFAULT_LAYOUT_VARIANT[templateId],
    });

    await prisma.tailoredResume.update({
      where: { id: resumeId },
      data: { exportFiles: exportFiles as unknown as Prisma.InputJsonValue },
    });
    logger.info(
      { resumeId, formats: Object.keys(exportFiles) },
      're-render complete; export files replaced in place',
    );
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
export { getResumeRenderer, setResumeRenderer, NoopResumeRenderer } from './renderer.js';
export type { ResumeRenderer, RenderInput, RenderBasics } from './renderer.js';
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
