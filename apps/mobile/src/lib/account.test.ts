import { describe, expect, it } from 'vitest';
import { formatJoinDate, hasFieldErrors, validatePasswordChange } from './account';

describe('validatePasswordChange', () => {
  it('passes for a valid, matching new password', () => {
    const errors = validatePasswordChange({
      current: 'oldpass1',
      next: 'newpass12',
      confirm: 'newpass12',
    });
    expect(hasFieldErrors(errors)).toBe(false);
  });
  it('requires the current password', () => {
    const errors = validatePasswordChange({ current: '', next: 'newpass12', confirm: 'newpass12' });
    expect(errors.current).toBeDefined();
  });
  it('enforces the minimum length on the new password', () => {
    const errors = validatePasswordChange({ current: 'oldpass1', next: 'short', confirm: 'short' });
    expect(errors.next).toContain('8');
  });
  it('flags a confirmation mismatch', () => {
    const errors = validatePasswordChange({
      current: 'oldpass1',
      next: 'newpass12',
      confirm: 'newpass99',
    });
    expect(errors.confirm).toBeDefined();
    expect(errors.next).toBeUndefined();
  });
});

describe('formatJoinDate', () => {
  it('formats an ISO date as "Month Year"', () => {
    expect(formatJoinDate('2026-08-11T00:00:00Z')).toBe('August 2026');
  });
  it('is empty for an invalid date', () => {
    expect(formatJoinDate('not-a-date')).toBe('');
  });
});
