// JD parsing via Claude (build brief Section 7, ADR-004: Haiku for
// parsing/extraction). Behind an interface so the pipeline is testable with a
// fake — CLAUDE.md Section 2: worker LLM calls are never made for real in tests.
import { jdParsedSchema, type JdParsed } from '@tailor/shared-types';
import { logger } from '../logger.js';

export interface JdParser {
  parse(jdText: string): Promise<JdParsed>;
}

export const JD_PARSE_MODEL = 'claude-haiku-4-5';

export const JD_PARSE_SYSTEM_PROMPT =
  'You extract structured facts from a job description. Return only the required ' +
  'skills, the role type, the seniority level, the company type, and the key ' +
  'responsibilities. Be faithful to the text — do not invent requirements that ' +
  'are not stated.';

/** Trim/clean a parsed JD: drop blank entries, dedupe skills. Pure — unit-tested. */
export function normalizeJdParsed(raw: JdParsed): JdParsed {
  const clean = (arr: string[]): string[] =>
    Array.from(new Set(arr.map((s) => s.trim()).filter((s) => s.length > 0)));
  return {
    required_skills: clean(raw.required_skills),
    key_responsibilities: clean(raw.key_responsibilities),
    role_type: raw.role_type.trim(),
    seniority: raw.seniority.trim(),
    company_type: raw.company_type.trim(),
  };
}

/**
 * Placeholder parser used until a real ANTHROPIC_API_KEY is configured. Returns
 * a fixed, standard JdParsed so the whole pipeline (queue → parseJD → persist →
 * poll) can be built and demoed end-to-end without any external key. Swap-in is
 * automatic: once ANTHROPIC_API_KEY is set, getJdParser() uses the real Haiku
 * parser instead (see below). Edit STUB_JD_PARSED to change the canned output.
 */
export const STUB_JD_PARSED: JdParsed = {
  required_skills: ['TypeScript', 'Node.js', 'React', 'PostgreSQL', 'AWS'],
  role_type: 'Full-Stack Engineer',
  seniority: 'Mid-Senior',
  company_type: 'Startup',
  key_responsibilities: [
    'Design and ship customer-facing product features end to end',
    'Build and maintain REST APIs and data models',
    'Collaborate with design and product on scope and trade-offs',
    'Write tests and participate in code review',
  ],
};

export class StubJdParser implements JdParser {
  async parse(jdText: string): Promise<JdParsed> {
    logger.info(
      { jdChars: jdText.length },
      'StubJdParser: returning canned JD parse (no ANTHROPIC_API_KEY configured)',
    );
    // Return a fresh normalized copy so callers can't mutate the shared constant.
    return normalizeJdParsed(STUB_JD_PARSED);
  }
}

/**
 * Production parser: Claude Haiku with structured output. `@anthropic-ai/sdk`
 * and its zod helper are imported lazily so nothing loads (or needs an API key)
 * unless a real parse actually runs.
 */
export class AnthropicJdParser implements JdParser {
  async parse(jdText: string): Promise<JdParsed> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod');
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

    const response = await client.messages.parse({
      model: JD_PARSE_MODEL,
      max_tokens: 2000,
      system: JD_PARSE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: jdText }],
      // The SDK's zod helper is typed against zod v4; this project is on zod v3
      // (3.25). The runtime value is the real schema — only the type is cast, and
      // the cast is isolated to this one SDK boundary.
      output_config: { format: zodOutputFormat(jdParsedSchema as never) },
    });

    if (!response.parsed_output) {
      throw new Error('JD parse returned no structured output');
    }
    return normalizeJdParsed(response.parsed_output as JdParsed);
  }
}

// Swappable default. When ANTHROPIC_API_KEY is present we use the real Haiku
// parser; otherwise we fall back to the stub so the pipeline runs without a key.
// Tests inject their own fake via setJdParser().
let jdParser: JdParser | undefined;
export function getJdParser(): JdParser {
  if (!jdParser) {
    if (process.env.ANTHROPIC_API_KEY) {
      jdParser = new AnthropicJdParser();
      logger.debug('using AnthropicJdParser');
    } else {
      jdParser = new StubJdParser();
      logger.warn('ANTHROPIC_API_KEY not set — using StubJdParser (canned JD parse)');
    }
  }
  return jdParser;
}
export function setJdParser(parser: JdParser): void {
  jdParser = parser;
}
