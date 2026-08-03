// Pure helpers for the tailoring flow — kept out of the screens so the stage→step
// mapping and score banding are unit-testable (ADR-019). The two staged-progress
// screens (retrieve, generate) render the same step machine driven by the polled
// job stage; the result screen bands the 0–100 match score into a friendly label.
import type { JobStage } from '@tailor/shared-types';

export type StepState = 'done' | 'active' | 'pending';
export type TailorPhase = 'retrieve' | 'generate';

/** The step labels shown per phase (screens/tailor_screen_staged_progress_*.svg). */
export const RETRIEVE_STEPS = [
  'Reading the job description',
  'Finding your best-fit experience',
  'Ready for your review',
] as const;

export const GENERATE_STEPS = [
  'Reading the job description',
  'Finding your best-fit experience',
  'Writing it in their language',
  'Formatting your resume',
] as const;

export function stepsForPhase(phase: TailorPhase): readonly string[] {
  return phase === 'retrieve' ? RETRIEVE_STEPS : GENERATE_STEPS;
}

/** Linear order of the pipeline stages (for "how far have we got" comparisons). */
const STAGE_INDEX: Record<JobStage, number> = {
  parsing: 0,
  retrieving: 1,
  awaiting_confirmation: 2,
  generating: 3,
  done: 4,
  failed: -1,
};

// The stage index at which each step becomes fully done. A step is `done` once the
// job has reached that stage; the first not-yet-done step is `active`; the rest are
// `pending`. (retrieve: reading→after parse, finding→after retrieve, ready→at the
// checkpoint; generate: the first two are already behind us, then writing/formatting
// both complete when generation finishes.)
const DONE_AT: Record<TailorPhase, number[]> = {
  retrieve: [1, 2, 3],
  generate: [1, 2, 4, 4],
};

/**
 * The per-step state for a phase given the current job stage. Exactly one step is
 * `active` (the first not-yet-done step) unless every step is done.
 */
export function stepStates(phase: TailorPhase, stage: JobStage): StepState[] {
  const idx = STAGE_INDEX[stage];
  const states: StepState[] = DONE_AT[phase].map((threshold) =>
    idx >= threshold ? 'done' : 'pending',
  );
  const firstPending = states.indexOf('pending');
  if (firstPending !== -1) states[firstPending] = 'active';
  return states;
}

/** The stage this phase waits to reach before the flow moves on. */
export function phaseTargetStage(phase: TailorPhase): JobStage {
  return phase === 'retrieve' ? 'awaiting_confirmation' : 'done';
}

/** Whether the polled stage means this phase is complete (time to navigate on). */
export function isPhaseComplete(phase: TailorPhase, stage: JobStage): boolean {
  return STAGE_INDEX[stage] >= STAGE_INDEX[phaseTargetStage(phase)];
}

/**
 * Friendly banding of the 0–100 match score for the result dial
 * (screens/tailor_screen_result_template.svg shows "Great match"). Null (older
 * resumes generated before scoring) falls back to a neutral label.
 */
export function matchLabel(score: number | null): string {
  if (score === null) return 'Your match';
  if (score >= 85) return 'Great match';
  if (score >= 70) return 'Strong match';
  if (score >= 50) return 'Solid match';
  return 'Partial match';
}
