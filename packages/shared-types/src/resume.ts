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

/** GET /api/resumes/:id — resume detail (per-bullet source trace, build brief §5). */
export interface TailoredResumeView {
  id: string;
  templateId: TemplateId;
  jdParsed: JdParsed;
  renderedContent: RenderedResume | null;
  /** Which export formats are ready to download. */
  availableFormats: ExportFormat[];
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
