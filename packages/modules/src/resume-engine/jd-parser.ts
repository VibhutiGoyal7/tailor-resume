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
      output_config: { format: zodOutputFormat(jdParsedSchema) },
    });

    if (!response.parsed_output) {
      throw new Error('JD parse returned no structured output');
    }
    return normalizeJdParsed(response.parsed_output);
  }
}

// Swappable default (Anthropic in prod; a fake injected in tests).
let jdParser: JdParser | undefined;
export function getJdParser(): JdParser {
  if (!jdParser) {
    jdParser = new AnthropicJdParser();
    logger.debug('using AnthropicJdParser');
  }
  return jdParser;
}
export function setJdParser(parser: JdParser): void {
  jdParser = parser;
}
