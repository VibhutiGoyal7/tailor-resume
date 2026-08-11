// Resume-tailoring contracts (build brief Sections 4, 5, 7). Shared by the web
// routes, the resume-engine module, and the worker.
import { z } from 'zod';
import type { JobStage } from './dto.js';

// --- JD parsing (parseJD task output; TailoredResume.jdParsed) ---

/** Structured job-description parse (build brief Section 4). */
export interface JdParsed {
  required_skills: string[];
  role_type: string;
  seniority: string;
  company_type: string;
  key_responsibilities: string[];
}

/**
 * Zod schema for the parsed JD — also the JSON-schema source for Claude's
 * structured output. Kept free of min/max constraints since structured-output
 * schemas don't support them.
 */
export const jdParsedSchema = z.object({
  required_skills: z.array(z.string()),
  role_type: z.string(),
  seniority: z.string(),
  company_type: z.string(),
  key_responsibilities: z.array(z.string()),
});

// --- Requests / responses ---

export const requestTailoredResumeSchema = z.object({
  jdText: z.string().min(1).max(20000),
});
export type RequestTailoredResumeInput = z.infer<typeof requestTailoredResumeSchema>;

/** POST /api/resumes/jobs/:jobId/confirm — the ADR-017 checkpoint. */
export const confirmRetrievedMatchesSchema = z.object({
  keptCandidateIds: z.array(z.string().min(1)),
});
export type ConfirmRetrievedMatchesInput = z.infer<typeof confirmRetrievedMatchesSchema>;

/**
 * One retrieved Experience Bank bullet, surfaced on the ADR-017 "Here's what we
 * found" checkpoint so the user can uncheck wrong matches before Generate runs.
 */
export interface RetrievedCandidateView {
  bulletId: string;
  experienceItemId: string;
  text: string;
  tags: string[];
  /** Final hybrid score (semantic similarity + tag boost, ADR-003). Higher = better. */
  score: number;
}

/** GET /api/resumes/jobs/:jobId (build brief Section 5, ADR-015). */
export interface JobStatusView {
  jobId: string;
  stage: JobStage;
  failedStage: string | null;
  /**
   * The TailoredResume this job produced, once parsing has created it. Null while
   * still `parsing`. The mobile flow uses this to navigate from a finished job to
   * the result/export screens (which are keyed on the resume, not the job).
   */
  resumeId: string | null;
  /** Present once parsing has completed. */
  jdParsed: JdParsed | null;
  /** Present once retrieval has completed (stage `awaiting_confirmation`+). */
  retrievedCandidates: RetrievedCandidateView[] | null;
  /** Present once generation has completed (stage `done`). */
  renderedContent: RenderedResume | null;
}

// --- Templates (ADR-018, ADR-012 rule-based suggestion) ---

/** The three Phase-1 resume templates (ADR-018). `ats` is the default. */
export const TEMPLATE_IDS = ['ats', 'modern', 'compact'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

/** Default template until the user picks one (retires the old `"classic"` placeholder). */
export const DEFAULT_TEMPLATE_ID: TemplateId = 'ats';

export interface ResumeTemplate {
  id: TemplateId;
  name: string;
  description: string;
  /** Layout family — drives the renderer's column structure. */
  layout: 'single-column' | 'two-column';
}

/** Template metadata, shared so the mobile template-picker and renderers agree (ADR-018). */
export const TEMPLATES: Record<TemplateId, ResumeTemplate> = {
  ats: {
    id: 'ats',
    name: 'Clean / ATS-safe',
    description: 'Single column, minimal styling — safest for applicant-tracking systems.',
    layout: 'single-column',
  },
  modern: {
    id: 'modern',
    name: 'Modern two-column',
    description: 'Sidebar for contact + skills alongside a main experience column.',
    layout: 'two-column',
  },
  compact: {
    id: 'compact',
    name: 'Compact / dense',
    description: 'Tighter spacing and smaller type to fit more on one page.',
    layout: 'single-column',
  },
};

/**
 * Rule-based template auto-suggestion (ADR-012 — deliberately NOT an LLM call).
 * Maps the parsed JD's company type to a starting template; the user can override.
 */
export function suggestTemplateId(jd: Pick<JdParsed, 'company_type'>): TemplateId {
  const company = jd.company_type.trim().toLowerCase();
  if (/startup|scale-?up|early|seed/.test(company)) return 'modern';
  if (/enterprise|corporate|bank|government|gov|agency/.test(company)) return 'ats';
  return DEFAULT_TEMPLATE_ID;
}

// --- Layout customization (PATCH /api/resumes/:id/layout, Milestone 7) ---

/**
 * The reorderable / hideable body sections of a rendered resume. The contact
 * header (name + contact line) is always rendered and is not part of this set.
 * In the two-column `modern` template, `skills` is pinned to the sidebar and the
 * order below governs the main column (summary / experience / projects / education).
 * `experience`, `projects`, and `education` each render the tailored bullets whose
 * source Experience item is of that kind (see `BULLET_SECTIONS` / `sectionForItemType`);
 * an empty one (no bullets of that kind) is skipped by the renderers.
 */
export const RESUME_SECTIONS = [
  'summary',
  'skills',
  'experience',
  'projects',
  'education',
] as const;
export type ResumeSection = (typeof RESUME_SECTIONS)[number];

/**
 * Default section order when the user hasn't customized it. Kept identical to
 * `RESUME_SECTIONS` order so it equals `resolveSectionOrder([])` for a fresh resume.
 */
export const DEFAULT_SECTION_ORDER: ResumeSection[] = [
  'summary',
  'skills',
  'experience',
  'projects',
  'education',
];

/**
 * The sections a rendered *bullet* can belong to — the subset of RESUME_SECTIONS
 * that carries generated bullets (summary and skills are not bullet sections). Each
 * tailored bullet is filed under one of these based on the kind of Experience item
 * it traces back to, so Projects/Education render as their own resume sections.
 */
export const BULLET_SECTIONS = ['experience', 'projects', 'education'] as const;
export type BulletSection = (typeof BULLET_SECTIONS)[number];

/**
 * Map an Experience item's `type` to the resume section its bullets render under:
 * projects → Projects, education → Education, everything else (roles, and any
 * unknown/legacy type) → Experience.
 */
export function sectionForItemType(type: string | undefined): BulletSection {
  if (type === 'project') return 'projects';
  if (type === 'education') return 'education';
  return 'experience';
}

/**
 * Normalize a stored section order into a full, valid ordering: drop unknown
 * entries, then append any missing known sections in their default position. So
 * an empty stored order (freshly parsed resume) resolves to DEFAULT_SECTION_ORDER.
 */
export function resolveSectionOrder(stored: string[]): ResumeSection[] {
  const known = stored.filter((s): s is ResumeSection =>
    (RESUME_SECTIONS as readonly string[]).includes(s),
  );
  const missing = RESUME_SECTIONS.filter((s) => !known.includes(s));
  return [...known, ...missing];
}

/**
 * A layout variant within a template (ADR-018 follow-up). Kept deliberately small
 * for Phase 1: only `modern` (two-column) has a genuinely meaningful choice — which
 * side the sidebar sits on — while the single-column templates have one canonical
 * variant each. Richer per-template variants are a documented follow-up (build brief §10).
 */
export interface LayoutVariant {
  id: string;
  name: string;
  description: string;
}

export const LAYOUT_VARIANTS: Record<TemplateId, LayoutVariant[]> = {
  ats: [
    { id: 'ats-standard', name: 'Standard', description: 'Single column, accent-ruled header.' },
  ],
  modern: [
    { id: 'modern-left', name: 'Sidebar left', description: 'Contact + skills on the left.' },
    { id: 'modern-right', name: 'Sidebar right', description: 'Contact + skills on the right.' },
  ],
  compact: [
    { id: 'compact-standard', name: 'Standard', description: 'Dense single column, small type.' },
  ],
};

/** The default variant for each template. */
export const DEFAULT_LAYOUT_VARIANT: Record<TemplateId, string> = {
  ats: 'ats-standard',
  modern: 'modern-left',
  compact: 'compact-standard',
};

/** Whether `variantId` is a valid layout variant for `templateId`. */
export function isValidLayoutVariant(templateId: TemplateId, variantId: string): boolean {
  return LAYOUT_VARIANTS[templateId].some((v) => v.id === variantId);
}

/**
 * PATCH /api/resumes/:id/layout body. Every field is optional (a partial update);
 * the facade merges with the resume's current layout. `templateId` is a template
 * override — the build brief's contract lists the three layout fields, but the
 * project doc's Milestone 7 scope also names template override, so it's included
 * here (validated against TEMPLATE_IDS). `layoutVariantId` is validated against the
 * effective template in the facade (it can't be checked in isolation here).
 */
export const updateResumeLayoutSchema = z
  .object({
    sectionOrder: z.array(z.enum(RESUME_SECTIONS)).optional(),
    hiddenSections: z.array(z.enum(RESUME_SECTIONS)).optional(),
    layoutVariantId: z.string().min(1).optional(),
    templateId: z.enum(TEMPLATE_IDS).optional(),
  })
  .refine((o) => !o.sectionOrder || new Set(o.sectionOrder).size === o.sectionOrder.length, {
    message: 'sectionOrder must not contain duplicate sections.',
    path: ['sectionOrder'],
  });
export type UpdateResumeLayoutInput = z.infer<typeof updateResumeLayoutSchema>;

// --- Export (GET /api/resumes/:id/export?format=pdf|docx; TailoredResume.exportFiles) ---

/** Downloadable resume file formats (build brief §5, ADR-012). */
export const EXPORT_FORMATS = ['pdf', 'docx'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** `?format=` query validation for the export route. */
export const exportFormatSchema = z.enum(EXPORT_FORMATS);

/** MIME type per export format. */
export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** One stored rendered file, pointed at by the FileStore key. */
export interface ResumeExportFile {
  /** FileStore key (opaque; local path segment or R2 object key). */
  key: string;
  contentType: string;
  filename: string;
}

/** `TailoredResume.exportFiles` — the rendered files, keyed by format. */
export type StoredExportFiles = Partial<Record<ExportFormat, ResumeExportFile>>;

/**
 * One row in the resume history list (GET /api/resumes, build brief §5). Kept
 * lighter than the detail view — the list card shows the target role/company
 * and which downloads are ready, not the full parsed JD or rendered content.
 */
export interface TailoredResumeSummary {
  id: string;
  templateId: TemplateId;
  /** Target role from the parsed JD — the history card's title line. */
  roleType: string;
  /** Company type from the parsed JD — the history card's subtitle. */
  companyType: string;
  seniority: string;
  /** Which export formats are ready to download. */
  availableFormats: ExportFormat[];
  /**
   * Overall JD match score (0–100) — the RAG pipeline's signature output, shown
   * as the compact badge on the history card. Computed at generate time over the
   * selected candidates (see resume-engine `computeMatchScore`). Null for resumes
   * generated before match scoring shipped.
   */
  matchScore: number | null;
  createdAt: string;
}

/** GET /api/resumes/:id — resume detail (per-bullet source trace, build brief §5). */
export interface TailoredResumeView {
  id: string;
  templateId: TemplateId;
  jdParsed: JdParsed;
  renderedContent: RenderedResume | null;
  /** Resolved section order (never empty) — the layout the exports were rendered with. */
  sectionOrder: ResumeSection[];
  /** Sections the user has hidden from the rendered resume. */
  hiddenSections: ResumeSection[];
  /** Active layout variant for the current template (LAYOUT_VARIANTS). */
  layoutVariantId: string;
  /** Which export formats are ready to download. */
  availableFormats: ExportFormat[];
  /** Overall JD match score (0–100) — the hero dial on the result screen. Null pre-scoring. */
  matchScore: number | null;
  createdAt: string;
}

// --- Generation (generateResume task; TailoredResume.renderedContent) ---

/**
 * The structured output Claude Sonnet must return for the generate stage (ADR-004).
 * The model selects from the kept candidate bullets and rewrites their phrasing to
 * fit the JD, grounding each rewrite in the source bullet it came from
 * (`sourceBulletId`). Kept free of min/max constraints — structured-output schemas
 * don't support them (same rule as `jdParsedSchema`).
 */
export const generatedResumeSchema = z.object({
  /** A tailored professional summary written for this specific JD. */
  summary: z.string(),
  bullets: z.array(
    z.object({
      /** The retained candidate bullet this rewrite is grounded in (must be a kept id). */
      sourceBulletId: z.string(),
      /** The rewritten bullet text, tuned to the JD but faithful to the source. */
      text: z.string(),
    }),
  ),
});
/** Raw generator output before the facade reconciles grounding refs (see RenderedResume). */
export type GeneratedResume = z.infer<typeof generatedResumeSchema>;

/**
 * One generated bullet after the facade has reconciled it: the rewritten text plus
 * a grounding trace back to the Experience Bank bullet it came from. Hallucinated
 * `sourceBulletId`s (not in the kept set) are dropped during reconciliation, so
 * every rendered bullet traces to a real, user-approved source.
 */
export interface RenderedBullet {
  /** Grounding reference — the kept candidate bullet this was rewritten from. */
  sourceBulletId: string;
  /** The bullet's parent Experience item (per-bullet source trace, build brief §5). */
  experienceItemId: string;
  text: string;
  /**
   * Which resume section this bullet renders under (`sectionForItemType` of the
   * source item's kind). Optional for backward-compatibility: resumes generated
   * before first-class Projects/Education shipped have no section — consumers treat
   * a missing value as `experience`.
   */
  section?: BulletSection;
}

/**
 * The persisted generate-stage output (`TailoredResume.renderedContent`). What the
 * "done" job returns and the mobile app renders. Template-agnostic content; the
 * react-pdf/docx renderers (ADR-012, Milestone 6+) lay this out per `templateId`.
 */
export interface RenderedResume {
  templateId: string;
  summary: string;
  bullets: RenderedBullet[];
  /**
   * Skills shown in the resume (aggregated candidate tags). Persisted with the
   * rendered content so a later layout change can re-render the export files
   * without the retrieval candidates being in hand (Milestone 7).
   */
  skills: string[];
}

// --- Embeddings (ADR-003: Voyage voyage-4 family, pgvector) ---

/** Dimensionality of the stored bullet/query embeddings — matches schema vector(1024). */
export const EMBEDDING_DIMENSIONS = 1024;

/**
 * One bullet returned by profile's pgvector similarity search, crossing the
 * profile→resume-engine facade boundary (profile owns the table; resume-engine
 * re-ranks + unions these). `distance` is pgvector cosine distance (0 = identical,
 * 2 = opposite); semantic similarity = 1 - distance.
 */
export interface BulletVectorMatch {
  bulletId: string;
  experienceItemId: string;
  text: string;
  tags: string[];
  distance: number;
}

// --- Worker queues (build brief Section 7) ---
// Defined here so the producer (resume-engine module) and the consumer
// (apps/worker) share one source of truth for names + payload shapes.

export const QUEUE_NAMES = {
  parse: 'parse-jd',
  retrieve: 'retrieve-candidates',
  generate: 'generate-resume',
  render: 'render-resume',
} as const;
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

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
/**
 * Re-render a resume's export files after a layout change (Milestone 7). Unlike
 * the other jobs this is keyed on the resume, not a TailoringJob — it runs after
 * the pipeline is `done`, re-rendering PDF/DOCX in place from the stored
 * renderedContent + the new layout, overwriting the same FileStore keys.
 */
export interface RenderResumeJob {
  resumeId: string;
}
