// Experience Bank + Resume Basics contracts (build brief Section 5, profile
// module). Shared by web routes (validation) and the profile facade / tests.
import { z } from 'zod';
import type { BulletStatus, ExperienceType } from './dto.js';

export const EXPERIENCE_TYPES = ['role', 'project', 'education', 'skill'] as const;
export const BULLET_STATUSES = ['suggested', 'accepted', 'edited', 'rejected'] as const;

// --- Requests ---

export const addExperienceItemSchema = z.object({
  type: z.enum(EXPERIENCE_TYPES),
  // Structured path for now (LLM freeform extraction lands with M4). Both are
  // optional here; the facade defaults source to "structured_form".
  structuredFields: z.record(z.string(), z.unknown()).default({}),
  rawInput: z.string().default(''),
});
export type AddExperienceItemInput = z.infer<typeof addExperienceItemSchema>;

export const addBulletSchema = z.object({
  text: z.string().min(1).max(1000),
  tags: z.array(z.string()).default([]),
  impactMetric: z.string().max(500).optional(),
});
export type AddBulletInput = z.infer<typeof addBulletSchema>;

export const updateBulletSchema = z
  .object({
    status: z.enum(BULLET_STATUSES),
    text: z.string().min(1).max(1000).optional(),
  })
  // Editing text without an explicit status still counts as "edited"; the
  // status field is required so the accept/edit/reject intent is always clear.
  .strict();
export type UpdateBulletInput = z.infer<typeof updateBulletSchema>;

export const resumeLinksSchema = z.object({
  linkedin: z.string().url().optional(),
  portfolio: z.string().url().optional(),
  github: z.string().url().optional(),
});

export const updateResumeBasicsSchema = z.object({
  fullName: z.string().min(1).max(200),
  phone: z.string().max(50).optional(),
  location: z.string().max(200).optional(),
  links: resumeLinksSchema.default({}),
  summary: z.string().max(2000).optional(),
});
export type UpdateResumeBasicsInput = z.infer<typeof updateResumeBasicsSchema>;

// --- LLM extraction (freeform "Write about it" / item-description → bullets) ---

/**
 * The structured output Claude returns when extracting an Experience Bank entry
 * from freeform text (build brief §5/§7, ADR-004: Haiku for extraction). Kept free
 * of min/max constraints — structured-output schemas don't support them (same rule
 * as `jdParsedSchema`). Absent fields come back as null and are dropped on persist.
 */
export const extractedBulletSchema = z.object({
  text: z.string(),
  impactMetric: z.string().nullable(),
  tags: z.array(z.string()),
});

export const extractedFieldsSchema = z.object({
  // role
  title: z.string().nullable(),
  company: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  location: z.string().nullable(),
  // project
  name: z.string().nullable(),
  context: z.string().nullable(),
  timeframe: z.string().nullable(),
  // education
  school: z.string().nullable(),
  degree: z.string().nullable(),
  field: z.string().nullable(),
  startYear: z.string().nullable(),
  endYear: z.string().nullable(),
  // skill
  category: z.string().nullable(),
});

export const extractionResultSchema = z.object({
  type: z.enum(EXPERIENCE_TYPES),
  structuredFields: extractedFieldsSchema,
  bullets: z.array(extractedBulletSchema),
});
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

/** POST /api/bank/extract — create an item from freeform text (type optional hint). */
export const extractFromTextSchema = z.object({
  text: z.string().min(1).max(5000),
  type: z.enum(EXPERIENCE_TYPES).optional(),
});
export type ExtractFromTextInput = z.infer<typeof extractFromTextSchema>;

// --- Responses ---

export interface BulletView {
  id: string;
  text: string;
  tags: string[];
  impactMetric: string | null;
  status: BulletStatus;
}

export interface ExperienceItemView {
  id: string;
  type: ExperienceType;
  source: string;
  rawInput: string;
  structuredFields: Record<string, unknown>;
  createdAt: string; // ISO 8601
  updatedAt: string;
  bullets: BulletView[];
}

/** GET /api/bank: items grouped by type (build brief Section 5). */
export type ExperienceBankView = Record<ExperienceType, ExperienceItemView[]>;

export interface ResumeBasicsView {
  fullName: string;
  phone: string | null;
  location: string | null;
  links: { linkedin?: string; portfolio?: string; github?: string };
  summary: string | null;
  updatedAt: string;
}
