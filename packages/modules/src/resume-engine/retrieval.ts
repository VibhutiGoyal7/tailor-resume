// Retrieval helpers (ADR-003 / ADR-004 step 2). Pure functions — no DB, no
// embedder — so the query construction and the hybrid semantic+tag re-rank are
// unit-tested in isolation. The facade's runRetrieveStage wires these to the
// real embedder and profile's pgvector search.
import type { BulletVectorMatch, JdParsed, RetrievedCandidateView } from '@tailor/shared-types';

/** How many nearest bullets to pull per query vector before union/re-rank. */
export const TOP_K_PER_QUERY = 5;
/** Score added per required-skill tag a bullet carries (ADR-003 symbolic boost). */
export const TAG_BOOST = 0.15;
/** Cap on total tag boost so a heavily-tagged bullet can't dominate on tags alone. */
export const MAX_TAG_BOOST = 0.3;
/** Upper bound on candidates surfaced at the checkpoint. */
export const MAX_CANDIDATES = 15;

/**
 * The search strings for a parsed JD: each key responsibility and each required
 * skill is embedded *separately* (ADR-004 — finer-grained queries retrieve more
 * precisely than one blended JD vector). Trimmed, de-duped, blanks dropped.
 */
export function buildRetrievalQueries(jd: JdParsed): string[] {
  const raw = [...jd.key_responsibilities, ...jd.required_skills];
  return Array.from(new Set(raw.map((s) => s.trim()).filter((s) => s.length > 0)));
}

/**
 * Union the per-query matches into a ranked candidate set (ADR-003 hybrid
 * re-rank). Each bullet keeps its best (smallest-distance) semantic hit across
 * queries; bullets whose tags exactly match a required skill get a bounded
 * symbolic boost so exact skill matches rank above pure-semantic neighbors.
 */
export function rerankCandidates(
  matches: BulletVectorMatch[],
  requiredSkills: string[],
): RetrievedCandidateView[] {
  const skillSet = new Set(requiredSkills.map((s) => s.trim().toLowerCase()).filter(Boolean));

  // Union by bullet, keeping the closest (best) distance seen across queries.
  const best = new Map<string, BulletVectorMatch>();
  for (const m of matches) {
    const prev = best.get(m.bulletId);
    if (!prev || m.distance < prev.distance) best.set(m.bulletId, m);
  }

  const scored = Array.from(best.values()).map((m) => {
    const semantic = 1 - m.distance; // cosine similarity
    const tagHits = m.tags.filter((t) => skillSet.has(t.trim().toLowerCase())).length;
    const boost = Math.min(MAX_TAG_BOOST, TAG_BOOST * tagHits);
    return {
      bulletId: m.bulletId,
      experienceItemId: m.experienceItemId,
      text: m.text,
      tags: m.tags,
      score: Number((semantic + boost).toFixed(6)),
    };
  });

  // Highest score first; deterministic tie-break by bulletId.
  scored.sort((a, b) => b.score - a.score || a.bulletId.localeCompare(b.bulletId));
  return scored.slice(0, MAX_CANDIDATES);
}
