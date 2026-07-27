// Generation helpers (ADR-004 step 3). Pure functions — no DB, no LLM — so the
// generator-input construction and the grounding-reconciliation of the model's
// output are unit-tested in isolation. The facade's runGenerateStage wires these
// to the real generator and persists the result.
import type { GeneratedResume, RenderedResume, RetrievedCandidateView } from '@tailor/shared-types';
import type { GenerationCandidate, GenerationInput } from './generator.js';

/**
 * Max bullets a generated resume includes (template constraint). Single-column
 * "classic" template default until per-template layout ships (build brief §9b/§10).
 */
export const MAX_GENERATED_BULLETS = 12;

/**
 * The kept subset of retrieved candidates, in the order they were retrieved
 * (best-ranked first). `keptIds` is the user's confirmation set; anything not in
 * the retrieved snapshot is silently ignored here (the facade validated the
 * subset at confirm time).
 */
export function selectKeptCandidates(
  retrieved: RetrievedCandidateView[],
  keptIds: string[],
): GenerationCandidate[] {
  const keep = new Set(keptIds);
  return retrieved
    .filter((c) => keep.has(c.bulletId))
    .map((c) => ({
      bulletId: c.bulletId,
      experienceItemId: c.experienceItemId,
      text: c.text,
      tags: c.tags,
    }));
}

/** Assemble the generator input from the JD, kept candidates, and template limits. */
export function buildGenerationInput(
  jdParsed: GenerationInput['jdParsed'],
  candidates: GenerationCandidate[],
  basics?: GenerationInput['basics'],
): GenerationInput {
  return { jdParsed, candidates, maxBullets: MAX_GENERATED_BULLETS, basics: basics ?? null };
}

/**
 * Reconcile raw generator output into the persisted RenderedResume (ADR-004 —
 * grounding). Drops any bullet whose `sourceBulletId` isn't a kept candidate (so
 * a hallucinated ref can't slip through), attaches the real `experienceItemId`
 * for the per-bullet source trace (build brief §5), dedupes by source bullet
 * (keeping the first rewrite), and caps at `maxBullets`. Text is trimmed; blank
 * rewrites are dropped.
 */
export function reconcileGeneratedResume(
  generated: GeneratedResume,
  candidates: GenerationCandidate[],
  templateId: string,
  maxBullets: number = MAX_GENERATED_BULLETS,
  skills: string[] = [],
): RenderedResume {
  const byId = new Map(candidates.map((c) => [c.bulletId, c]));
  const seen = new Set<string>();
  const bullets: RenderedResume['bullets'] = [];
  for (const b of generated.bullets) {
    const source = byId.get(b.sourceBulletId);
    const text = b.text.trim();
    if (!source || !text || seen.has(source.bulletId)) continue;
    seen.add(source.bulletId);
    bullets.push({
      sourceBulletId: source.bulletId,
      experienceItemId: source.experienceItemId,
      text,
    });
    if (bullets.length >= maxBullets) break;
  }
  return { templateId, summary: generated.summary.trim(), bullets, skills };
}
