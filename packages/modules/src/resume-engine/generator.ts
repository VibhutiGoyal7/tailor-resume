// Resume generation via Claude (build brief Section 7, ADR-004: Sonnet for
// generation). Behind an interface so the pipeline is testable with a fake —
// CLAUDE.md Section 2: worker LLM calls are never made for real in tests. Same
// stub-fallback pattern as the JD parser: when no ANTHROPIC_API_KEY is set we use
// a deterministic StubResumeGenerator so the whole pipeline runs and demos
// keyless; setting the key switches to the real Sonnet generator with no code
// change.
import { generatedResumeSchema, type GeneratedResume, type JdParsed } from '@tailor/shared-types';
import { logger } from '../logger.js';

/** One kept candidate bullet handed to the generator to select/rewrite from. */
export interface GenerationCandidate {
  bulletId: string;
  experienceItemId: string;
  text: string;
  tags: string[];
}

/** Everything the generator needs to produce a tailored resume for one job. */
export interface GenerationInput {
  jdParsed: JdParsed;
  /** The user's kept subset of retrieved candidates (ADR-017 confirmation). */
  candidates: GenerationCandidate[];
  /** Upper bound on bullets to include (template constraint, see generation.ts). */
  maxBullets: number;
  /** Optional Resume Basics context (name/summary) to steer the tailored summary. */
  basics?: { fullName?: string; summary?: string } | null;
}

export interface ResumeGenerator {
  generate(input: GenerationInput): Promise<GeneratedResume>;
}

// ADR-004: Claude Sonnet for generation (Haiku is used for parsing).
export const RESUME_GEN_MODEL = 'claude-sonnet-5';

export const RESUME_GEN_SYSTEM_PROMPT =
  'You are an expert resume writer. You will be given a structured job description ' +
  'and a set of candidate bullet points drawn from the user’s real experience. ' +
  'Select the bullets most relevant to the job and rewrite each to foreground the ' +
  'skills and responsibilities the job asks for, while staying faithful to what the ' +
  'source bullet actually says — never invent experience, employers, metrics, or ' +
  'skills that are not in the source. Also write a short professional summary tuned ' +
  'to this job. For every bullet you output, set sourceBulletId to the id of the ' +
  'candidate bullet you rewrote it from.';

/**
 * Deterministic offline generator used until a real ANTHROPIC_API_KEY is
 * configured. Selects the first `maxBullets` candidates in order and echoes their
 * text (grounded on their own ids), plus a canned summary derived from the parsed
 * JD. Not semantically tailored — just enough to exercise the whole generate
 * pipeline (confirm → generate → persist → poll) end-to-end without any key.
 */
export class StubResumeGenerator implements ResumeGenerator {
  async generate(input: GenerationInput): Promise<GeneratedResume> {
    logger.info(
      { candidates: input.candidates.length, maxBullets: input.maxBullets },
      'StubResumeGenerator: returning canned tailored resume (no ANTHROPIC_API_KEY configured)',
    );
    const bullets = input.candidates.slice(0, input.maxBullets).map((c) => ({
      sourceBulletId: c.bulletId,
      text: c.text,
    }));
    const summary =
      `${input.jdParsed.seniority} ${input.jdParsed.role_type} with experience across ` +
      `${input.jdParsed.required_skills.slice(0, 3).join(', ') || 'relevant areas'}.`;
    return { summary, bullets };
  }
}

/**
 * Production generator: Claude Sonnet with structured output (ADR-004). `@anthropic-ai/sdk`
 * and its zod helper are imported lazily so nothing loads (or needs an API key)
 * unless a real generation actually runs. Mirrors AnthropicJdParser.
 */
export class AnthropicResumeGenerator implements ResumeGenerator {
  async generate(input: GenerationInput): Promise<GeneratedResume> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod');
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

    const response = await client.messages.parse({
      model: RESUME_GEN_MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      system: RESUME_GEN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
      // The SDK's zod helper is typed against zod v4; this project is on zod v3
      // (3.25). The runtime value is the real schema — only the type is cast, and
      // the cast is isolated to this one SDK boundary (same as AnthropicJdParser).
      output_config: { format: zodOutputFormat(generatedResumeSchema as never) },
    });

    if (!response.parsed_output) {
      throw new Error('Resume generation returned no structured output');
    }
    return response.parsed_output as GeneratedResume;
  }
}

/** The user-turn prompt: the JD facts + the kept candidate bullets to choose from. */
function buildUserPrompt(input: GenerationInput): string {
  const jd = input.jdParsed;
  const lines: string[] = [];
  lines.push('# Job description (parsed)');
  lines.push(`Role: ${jd.role_type}`);
  lines.push(`Seniority: ${jd.seniority}`);
  lines.push(`Company type: ${jd.company_type}`);
  lines.push(`Required skills: ${jd.required_skills.join(', ')}`);
  lines.push(`Key responsibilities:\n${jd.key_responsibilities.map((r) => `- ${r}`).join('\n')}`);
  if (input.basics?.fullName) lines.push(`\nCandidate: ${input.basics.fullName}`);
  if (input.basics?.summary) lines.push(`Existing summary: ${input.basics.summary}`);
  lines.push('\n# Candidate bullets (select and rewrite from these only)');
  for (const c of input.candidates) {
    const tags = c.tags.length ? ` [tags: ${c.tags.join(', ')}]` : '';
    lines.push(`- id=${c.bulletId}${tags}: ${c.text}`);
  }
  lines.push(
    `\nSelect at most ${input.maxBullets} bullets. Return each with the sourceBulletId it was rewritten from.`,
  );
  return lines.join('\n');
}

// Swappable default. When ANTHROPIC_API_KEY is present we use the real Sonnet
// generator; otherwise we fall back to the stub so the pipeline runs without a
// key. Tests inject their own fake via setResumeGenerator().
let resumeGenerator: ResumeGenerator | undefined;
export function getResumeGenerator(): ResumeGenerator {
  if (!resumeGenerator) {
    if (process.env.ANTHROPIC_API_KEY) {
      resumeGenerator = new AnthropicResumeGenerator();
      logger.debug('using AnthropicResumeGenerator');
    } else {
      resumeGenerator = new StubResumeGenerator();
      logger.warn('ANTHROPIC_API_KEY not set — using StubResumeGenerator (canned tailored resume)');
    }
  }
  return resumeGenerator;
}
export function setResumeGenerator(generator: ResumeGenerator): void {
  resumeGenerator = generator;
}
