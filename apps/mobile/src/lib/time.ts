// Relative-time formatting for history cards ("2 days ago", "1 week ago"),
// matching the copy style in screens/tailor_home_screen.svg. Pure so it can be
// unit-tested without a clock — the caller passes `now` (defaults to Date.now()).
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Human "time ago" for an ISO timestamp, relative to `now` (ms epoch). */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, now - then);

  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return plural(Math.floor(diff / MINUTE), 'minute');
  if (diff < DAY) return plural(Math.floor(diff / HOUR), 'hour');
  if (diff < WEEK) return plural(Math.floor(diff / DAY), 'day');
  const weeks = Math.floor(diff / WEEK);
  if (weeks < 5) return plural(weeks, 'week');
  const months = Math.floor(diff / (30 * DAY));
  if (months < 12) return plural(Math.max(1, months), 'month');
  return plural(Math.floor(diff / (365 * DAY)), 'year');
}

function plural(n: number, unit: string): string {
  const count = Math.max(1, n);
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}
