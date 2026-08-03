import { describe, expect, it } from 'vitest';
import { relativeTime } from './time';

const NOW = new Date('2026-07-28T12:00:00.000Z').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('relativeTime', () => {
  it('reads "just now" under a minute', () => {
    expect(relativeTime(ago(30_000), NOW)).toBe('just now');
  });

  it('singular vs plural minutes/hours', () => {
    expect(relativeTime(ago(60_000), NOW)).toBe('1 minute ago');
    expect(relativeTime(ago(5 * 60_000), NOW)).toBe('5 minutes ago');
    expect(relativeTime(ago(60 * 60_000), NOW)).toBe('1 hour ago');
  });

  it('days and weeks match the home-card copy', () => {
    expect(relativeTime(ago(2 * 24 * 3600_000), NOW)).toBe('2 days ago');
    expect(relativeTime(ago(6 * 24 * 3600_000), NOW)).toBe('6 days ago');
    expect(relativeTime(ago(7 * 24 * 3600_000), NOW)).toBe('1 week ago');
  });

  it('clamps future timestamps to "just now" and rejects garbage', () => {
    expect(relativeTime(new Date(NOW + 5000).toISOString(), NOW)).toBe('just now');
    expect(relativeTime('not-a-date', NOW)).toBe('');
  });
});
