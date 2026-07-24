// Facade-surface tests (CLAUDE.md Section 2): every declared method exists and,
// until its milestone lands, fails consistently with NotImplementedError rather
// than silently returning undefined. Real behavior tests replace these per method
// as each is implemented.
import { describe, expect, it } from 'vitest';
import { NotImplementedError } from './common.js';
import { profileModule } from './profile/index.js';
import { resumeEngine } from './resume-engine/index.js';

describe('profileModule facade', () => {
  it.each([
    ['getExperienceBank', () => profileModule.getExperienceBank('u1')],
    ['addExperienceItem', () => profileModule.addExperienceItem('u1', { type: 'role' })],
    ['getResumeBasics', () => profileModule.getResumeBasics('u1')],
    ['updateResumeBasics', () => profileModule.updateResumeBasics('u1', { fullName: 'Ada' })],
  ])('%s throws NotImplementedError in the scaffold', (_name, call) => {
    expect(call).toThrow(NotImplementedError);
  });
});

describe('resumeEngine facade', () => {
  it.each([
    ['requestTailoredResume', () => resumeEngine.requestTailoredResume('u1', 'jd text')],
    ['getJobStatus', () => resumeEngine.getJobStatus('job1')],
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
