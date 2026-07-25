// Facade-surface tests (CLAUDE.md Section 2): every declared method exists and,
// until its milestone lands, fails consistently with NotImplementedError rather
// than silently returning undefined. Real behavior tests replace these per method
// as each is implemented.
//
// profileModule is implemented (Milestone 3) — its behavior is covered by
// profile/profile.test.ts. Only resume-engine remains a stub here.
import { describe, expect, it } from 'vitest';
import { NotImplementedError } from './common.js';
import { resumeEngine } from './resume-engine/index.js';

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
