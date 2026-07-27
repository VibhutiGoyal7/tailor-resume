import { describe, expect, it } from 'vitest';
import type { ParseJDJob } from '@tailor/shared-types';
import { getEnqueuer, setEnqueuer, type Enqueuer } from './queue.js';

describe('enqueuer injection', () => {
  it('uses an injected in-memory enqueuer (no Redis)', async () => {
    const enqueued: ParseJDJob[] = [];
    const fake: Enqueuer = {
      enqueueParse: async (job) => {
        enqueued.push(job);
      },
      enqueueRetrieve: async () => {},
      enqueueGenerate: async () => {},
    };
    setEnqueuer(fake);
    expect(getEnqueuer()).toBe(fake);

    await getEnqueuer().enqueueParse({ jobId: 'job-1', jdText: 'hello' });
    expect(enqueued).toEqual([{ jobId: 'job-1', jdText: 'hello' }]);
  });
});
