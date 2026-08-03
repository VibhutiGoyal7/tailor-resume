// Typed experience-bank API calls (build brief §5). Thin wrappers over apiRequest;
// screens consume these through TanStack Query. Mirrors the profile facade surface
// the mobile app needs: read the bank, add a structured item, add a bullet, update
// a bullet's status, delete an item, and read resume basics.
import { apiRequest } from './client';
import type {
  AddBulletInput,
  AddExperienceItemInput,
  BulletView,
  ExperienceBankView,
  ExperienceItemView,
  ResumeBasicsView,
  UpdateBulletInput,
} from '@tailor/shared-types';

/** GET /bank — all items grouped by type (role/project/education/skill). */
export function getExperienceBank(): Promise<ExperienceBankView> {
  return apiRequest<ExperienceBankView>('/bank', { method: 'GET' });
}

/** POST /bank/items — add a structured item. */
export function addExperienceItem(input: AddExperienceItemInput): Promise<ExperienceItemView> {
  return apiRequest<ExperienceItemView>('/bank/items', { method: 'POST', body: input });
}

/** POST /bank/items/:id/bullets — add a bullet to an item (created "accepted"). */
export function addBullet(itemId: string, input: AddBulletInput): Promise<BulletView> {
  return apiRequest<BulletView>(`/bank/items/${itemId}/bullets`, { method: 'POST', body: input });
}

/** PATCH /bank/bullets/:id — accept / edit / reject a bullet. */
export function updateBullet(bulletId: string, input: UpdateBulletInput): Promise<BulletView> {
  return apiRequest<BulletView>(`/bank/bullets/${bulletId}`, { method: 'PATCH', body: input });
}

/** DELETE /bank/items/:id — remove an item and its bullets (204). */
export function deleteExperienceItem(itemId: string): Promise<void> {
  return apiRequest<void>(`/bank/items/${itemId}`, { method: 'DELETE' });
}

/** GET /bank/basics — the user's resume basics, or null if not set yet. */
export function getResumeBasics(): Promise<ResumeBasicsView | null> {
  return apiRequest<ResumeBasicsView | null>('/bank/basics', { method: 'GET' });
}
