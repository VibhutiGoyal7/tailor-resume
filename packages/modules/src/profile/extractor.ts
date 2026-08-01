// Experience Bank extraction via Claude (build brief §5/§7, ADR-004: Haiku for
// parsing/extraction). Turns freeform text ("Write about it") or a saved item's
// description ("Save and extract bullets") into structured fields + suggested
// achievement bullets. Behind an interface so the flow is testable with a fake —
// CLAUDE.md §2: LLM calls are never made for real in tests. Same stub-fallback
// pattern as the JD parser: no ANTHROPIC_API_KEY → deterministic StubBankExtractor.
import {
  EXPERIENCE_TYPES,
  extractionResultSchema,
  type ExperienceType,
  type ExtractionResult,
} from '@tailor/shared-types';
import { logger } from '../logger.js';

export interface ExtractInput {
  /** The freeform text to extract from (item description or "write about it" text). */
  text: string;
  /** Known type (the manual forms / a picked type); the model must honor it. */
  typeHint?: ExperienceType;
  /** Known structured fields (from a manual form) for context. */
  structuredFields?: Record<string, unknown>;
}

export interface BankExtractor {
  extract(input: ExtractInput): Promise<ExtractionResult>;
}

export const EXTRACT_MODEL = 'claude-haiku-4-5';

export const EXTRACT_SYSTEM_PROMPT =
  "You turn a person's freeform description of their work history into structured " +
  'resume data. Identify whether it describes a role, project, education, or skill, ' +
  'fill in the structured fields you can find, and write concise, achievement-oriented ' +
  'bullet points (start with a strong verb, quantify impact where the text supports it). ' +
  'Be faithful — never invent employers, dates, or metrics that are not in the text. ' +
  'Leave a field null if the text does not state it.';

/**
 * Clean a raw extraction: honor a known type, trim/dedupe/blank-drop bullets, cap
 * the count, and null out blank structured fields. Pure — unit-tested in isolation.
 */
export const MAX_EXTRACTED_BULLETS = 8;

export function normalizeExtraction(
  raw: ExtractionResult,
  typeHint?: ExperienceType,
): ExtractionResult {
  const seen = new Set<string>();
  const bullets = raw.bullets
    .map((b) => ({
      text: b.text.trim(),
      impactMetric: b.impactMetric?.trim() ? b.impactMetric.trim() : null,
      tags: Array.from(new Set(b.tags.map((t) => t.trim()).filter(Boolean))),
    }))
    .filter((b) => {
      if (!b.text || seen.has(b.text.toLowerCase())) return false;
      seen.add(b.text.toLowerCase());
      return true;
    })
    .slice(0, MAX_EXTRACTED_BULLETS);

  const fields = Object.fromEntries(
    Object.entries(raw.structuredFields).map(([k, v]) => [
      k,
      typeof v === 'string' && v.trim() ? v.trim() : null,
    ]),
  ) as ExtractionResult['structuredFields'];

  return { type: typeHint ?? raw.type, structuredFields: fields, bullets };
}

/**
 * Deterministic offline extractor used until a real ANTHROPIC_API_KEY is set, so
 * the write-about-it / extract-bullets flow runs end to end without a key. Splits
 * the text into a couple of naive bullets and echoes the type hint.
 */
export class StubBankExtractor implements BankExtractor {
  async extract(input: ExtractInput): Promise<ExtractionResult> {
    logger.info(
      { chars: input.text.length, typeHint: input.typeHint },
      'StubBankExtractor: returning canned extraction (no ANTHROPIC_API_KEY configured)',
    );
    const sentences = input.text
      .split(/[.\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 8)
      .slice(0, 3);
    const bullets = (sentences.length > 0 ? sentences : ['Contributed to the work described']).map(
      (text) => ({ text, impactMetric: null, tags: [] as string[] }),
    );
    const empty = {
      title: null,
      company: null,
      startDate: null,
      endDate: null,
      location: null,
      name: null,
      context: null,
      timeframe: null,
      school: null,
      degree: null,
      field: null,
      startYear: null,
      endYear: null,
      category: null,
    };
    return normalizeExtraction(
      { type: input.typeHint ?? 'role', structuredFields: empty, bullets },
      input.typeHint,
    );
  }
}

/**
 * Production extractor: Claude Haiku with structured output. `@anthropic-ai/sdk`
 * and its zod helper are imported lazily so nothing loads (or needs a key) unless
 * a real extraction runs.
 */
export class AnthropicBankExtractor implements BankExtractor {
  async extract(input: ExtractInput): Promise<ExtractionResult> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod');
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

    const context = [
      input.typeHint ? `This describes a ${input.typeHint}.` : '',
      input.structuredFields && Object.keys(input.structuredFields).length > 0
        ? `Known details: ${JSON.stringify(input.structuredFields)}.`
        : '',
      '',
      input.text,
    ]
      .filter(Boolean)
      .join('\n');

    const response = await client.messages.parse({
      model: EXTRACT_MODEL,
      max_tokens: 2000,
      system: EXTRACT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: context }],
      // The SDK's zod helper is typed against zod v4; this project is on zod v3
      // (3.25). The runtime value is the real schema — only the type is cast, and
      // the cast is isolated to this one SDK boundary (same as AnthropicJdParser).
      output_config: { format: zodOutputFormat(extractionResultSchema as never) },
    });

    if (!response.parsed_output) {
      throw new Error('Extraction returned no structured output');
    }
    return normalizeExtraction(response.parsed_output as ExtractionResult, input.typeHint);
  }
}

// Swappable default — real Haiku extractor when a key is present, else the stub.
// Tests inject their own fake via setBankExtractor().
let extractor: BankExtractor | undefined;
export function getBankExtractor(): BankExtractor {
  if (!extractor) {
    if (process.env.ANTHROPIC_API_KEY) {
      extractor = new AnthropicBankExtractor();
      logger.debug('using AnthropicBankExtractor');
    } else {
      extractor = new StubBankExtractor();
      logger.warn('ANTHROPIC_API_KEY not set — using StubBankExtractor (canned extraction)');
    }
  }
  return extractor;
}
export function setBankExtractor(next: BankExtractor): void {
  extractor = next;
}

// Reachable for callers that iterate the type set.
export { EXPERIENCE_TYPES };
