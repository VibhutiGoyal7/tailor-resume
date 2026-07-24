// resume-engine module facade (ADR-008). Enqueues pipeline work and reads job
// state; the actual parse/retrieve/generate happens in the worker's tasks,
// which call back into this module. Gets bank data via profileModule, never
// via its own Prisma query against profile's models.
//
// Scaffold: signatures are final; bodies land in Milestones 4–7.
import { NotImplementedError } from '../common.js';

export interface UpdateResumeLayoutInput {
  sectionOrder: string[];
  hiddenSections: string[];
  layoutVariantId?: string;
}

export const resumeEngine = {
  /** Enqueues the "parse" task only (ADR-017). Returns the job to poll. */
  requestTailoredResume(_userId: string, _jdText: string): Promise<{ jobId: string }> {
    throw new NotImplementedError('resumeEngine.requestTailoredResume');
  },
  /** Stage-level status for polling (ADR-015). */
  getJobStatus(_jobId: string): Promise<never> {
    throw new NotImplementedError('resumeEngine.getJobStatus');
  },
  /** Two-phase confirm (ADR-017) — enqueues the "generate" task. */
  confirmRetrievedMatches(_jobId: string, _keptCandidateIds: string[]): Promise<never> {
    throw new NotImplementedError('resumeEngine.confirmRetrievedMatches');
  },
  getResume(_resumeId: string): Promise<never> {
    throw new NotImplementedError('resumeEngine.getResume');
  },
  updateResumeLayout(_resumeId: string, _input: UpdateResumeLayoutInput): Promise<never> {
    throw new NotImplementedError('resumeEngine.updateResumeLayout');
  },
};

export { isActive, isTerminal, nextStage } from './stage.js';
