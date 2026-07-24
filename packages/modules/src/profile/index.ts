// profile module facade (ADR-008). The ONE entry point into profile data —
// other modules (e.g. resume-engine) call these methods and never touch
// profile's Prisma models directly.
//
// Scaffold: signatures are final; bodies land in Milestone 3.
import type { ExperienceType } from '@tailor/shared-types';
import { NotImplementedError } from '../common.js';

export interface AddExperienceItemInput {
  type: ExperienceType;
  rawInput?: string;
  structuredFields?: Record<string, unknown>;
}

export interface UpdateResumeBasicsInput {
  fullName?: string;
  phone?: string;
  location?: string;
  links?: { linkedin?: string; portfolio?: string; github?: string };
  summary?: string;
}

export const profileModule = {
  getExperienceBank(_userId: string): Promise<never> {
    throw new NotImplementedError('profileModule.getExperienceBank');
  },
  addExperienceItem(_userId: string, _input: AddExperienceItemInput): Promise<never> {
    throw new NotImplementedError('profileModule.addExperienceItem');
  },
  getResumeBasics(_userId: string): Promise<never> {
    throw new NotImplementedError('profileModule.getResumeBasics');
  },
  updateResumeBasics(_userId: string, _input: UpdateResumeBasicsInput): Promise<never> {
    throw new NotImplementedError('profileModule.updateResumeBasics');
  },
};
