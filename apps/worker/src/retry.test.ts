import { describe, expect, it } from 'vitest';
import { QUEUE_NAMES } from './queues.js';
import { queueForStage } from './retry.js';

describe('queueForStage', () => {
  it('routes each failable stage to its own queue', () => {
    expect(queueForStage('parsing')).toBe(QUEUE_NAMES.parse);
    expect(queueForStage('retrieving')).toBe(QUEUE_NAMES.retrieve);
    expect(queueForStage('generating')).toBe(QUEUE_NAMES.generate);
  });

  it('returns null for stages with no worker task (never retried into a queue)', () => {
    expect(queueForStage('awaiting_confirmation')).toBeNull();
    expect(queueForStage('done')).toBeNull();
    expect(queueForStage('unknown')).toBeNull();
  });
});
