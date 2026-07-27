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

/** GET /api/resumes/jobs/:jobId (build brief Section 5, ADR-015). */
export interface JobStatusView {
  jobId: string;
  stage: JobStage;
  failedStage: string | null;
  /** Present once parsing has completed. */
  jdParsed: JdParsed | null;
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
