// Pure pipeline-stage helpers for the tailoring job lifecycle (ADR-009, ADR-015,
// ADR-017). No DB / queue here — just the stage transition rules — so this is
// unit-testable in isolation and reused by both the worker and the status API.
import type { JobStage } from '@tailor/shared-types';

/**
 * The happy-path successor of a stage, or null if the stage is terminal or
 * waits on external input. Note `retrieving -> awaiting_confirmation`: the
 * worker stops there and does NOT auto-advance to `generating` — that gap is
 * the ADR-017 two-phase confirmation checkpoint, closed by POST /confirm.
 */
export function nextStage(current: JobStage): JobStage | null {
  switch (current) {
    case 'parsing':
      return 'retrieving';
    case 'retrieving':
      return 'awaiting_confirmation';
    case 'awaiting_confirmation':
      // Intentionally null: only POST /confirm moves this to `generating`.
      return null;
    case 'generating':
      return 'done';
    case 'done':
    case 'failed':
      return null;
  }
}

/** A job in a terminal stage does no further work. */
export function isTerminal(stage: JobStage): boolean {
  return stage === 'done' || stage === 'failed';
}

/** Stages during which the worker is actively processing (vs. waiting/terminal). */
export function isActive(stage: JobStage): boolean {
  return stage === 'parsing' || stage === 'retrieving' || stage === 'generating';
}
