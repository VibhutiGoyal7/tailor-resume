// Facade-surface tests (CLAUDE.md Section 2): every declared method exists and,
// until its milestone lands, fails consistently with NotImplementedError rather
// than silently returning undefined. Real behavior tests replace these per method
// as each is implemented.
//
// profileModule (Milestone 3) and resume-engine's parse stage (Milestone 4) are
// implemented — covered by profile/profile.test.ts and resume-engine/*.test.ts.
// Only the still-unbuilt resume-engine methods (Milestones 5–7) remain stubs here.
import { describe, expect, it } from 'vitest';
import { NotImplementedError } from './common.js';
import { resumeEngine } from './resume-engine/index.js';

describe('resumeEngine facade — unbuilt stages still stubbed', () => {
  it.each([
    ['confirmRetrievedMatches', () => resumeEngine.confirmRetrievedMatches('job1', ['c1'])],
    ['getResume', () => resumeEngine.getResume('r1')],
    [
      'updateResumeLayout',
      () =>
        resumeEngine.updateResumeLayout('r1', {
          sectionOrder: [],
          hiddenSections: [],
        }),
    ],
  ])('%s throws NotImplementedError in the scaffold', (_name, call) => {
    expect(call).toThrow(NotImplementedError);
  });
});
