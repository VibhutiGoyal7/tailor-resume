// Match score (0–100) — the RAG pipeline's signature output (project doc §9b:
// the dial/badge is "the visual expression of the RAG pipeline's output"). Pure,
// so it's unit-tested without a DB or LLM; the facade calls it at generate time
// over the *selected* candidates and persists the result on TailoredResume.
//
// Formula (a defensible first definition — no exact formula was specified in the
// docs, flagged for the owner): a 50/50 blend of two explainable components —
//   • coverage — the fraction of the JD's required skills that at least one
//     selected bullet is tagged with (does the resume actually speak to what the
//     JD asks for?), and
//   • strength — the mean retrieval fit of the selected bullets (their hybrid
//     semantic+tag score from ADR-003, clamped to [0,1]) (how strong are the
//     matches we're putting forward?).
// When the JD lists no required skills, coverage is undefined, so the score is
// strength alone. No selected candidates → 0.
import type { JdParsed, RetrievedCandidateView } from '@tailor/shared-types';

/** Weight on JD required-skill coverage in the blended score. */
export const COVERAGE_WEIGHT = 0.5;
/** Weight on the mean retrieval fit of the selected bullets. */
export const STRENGTH_WEIGHT = 0.5;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * Compute the 0–100 match score for a resume from its parsed JD and the set of
 * retrieved candidates the user kept (each carrying its hybrid `score` + `tags`).
 */
export function computeMatchScore(jd: JdParsed, selected: RetrievedCandidateView[]): number {
  if (selected.length === 0) return 0;

  const strength =
    selected.reduce((sum, c) => sum + clamp01(c.score), 0) / selected.length;

  const skills = jd.required_skills.map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (skills.length === 0) return toPercent(strength);

  const selectedTags = new Set(
    selected.flatMap((c) => c.tags.map((t) => t.trim().toLowerCase())).filter(Boolean),
  );
  const covered = skills.filter((s) => selectedTags.has(s)).length;
  const coverage = covered / skills.length;

  return toPercent(COVERAGE_WEIGHT * coverage + STRENGTH_WEIGHT * strength);
}

/** Blended [0,1] value → integer percentage in [0,100]. */
function toPercent(value: number): number {
  return Math.round(clamp01(value) * 100);
}
