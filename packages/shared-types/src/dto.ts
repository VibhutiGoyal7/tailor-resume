// DTOs shared across web / worker / mobile. Kept minimal for the scaffold —
// expand alongside each milestone's endpoints (build brief Section 5).

/** Tailoring job lifecycle stages (build brief Section 4, ADR-015). */
export const JOB_STAGES = [
  'parsing',
  'retrieving',
  'awaiting_confirmation',
  'generating',
  'done',
  'failed',
] as const;

export type JobStage = (typeof JOB_STAGES)[number];

/** Experience Bank item types. */
export type ExperienceType = 'role' | 'project' | 'education' | 'skill';

/** Bullet review status (accept/edit/reject flow). */
export type BulletStatus = 'suggested' | 'accepted' | 'edited' | 'rejected';

/** Access + refresh pair returned by login / refresh / google (ADR-010). */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Cursor-paginated list envelope (build brief Section 5). */
export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}
