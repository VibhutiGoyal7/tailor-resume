// Typed experience-bank API calls (build brief §5). Thin wrappers over apiRequest;
// screens consume these through TanStack Query. Mirrors the profile facade surface
// the mobile app needs: read the bank, add a structured item, add a bullet, update
// a bullet's status, delete an item, and read resume basics.
import { apiRequest, apiUpload } from './client';
import type {
  AddBulletInput,
  AddExperienceItemInput,
  BulletView,
  ExperienceBankView,
  ExperienceItemView,
  ExtractFromTextInput,
  ResumeBasicsView,
  UpdateBulletInput,
  UpdateResumeBasicsInput,
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

/** POST /bank/extract — create an item from freeform text (Claude infers the rest). */
export function extractFromText(input: ExtractFromTextInput): Promise<ExperienceItemView> {
  return apiRequest<ExperienceItemView>('/bank/extract', { method: 'POST', body: input });
}

/** POST /bank/items/:id/extract — append suggested bullets from an item's description. */
export function extractBulletsForItem(itemId: string): Promise<ExperienceItemView> {
  return apiRequest<ExperienceItemView>(`/bank/items/${itemId}/extract`, { method: 'POST' });
}

/** A picked file to upload (shape from expo-document-picker). */
export interface UploadFile {
  uri: string;
  name: string;
  mimeType?: string;
}

/** POST /bank/import — upload a resume file; returns the extracted items (suggested). */
export function importResume(file: UploadFile): Promise<ExperienceItemView[]> {
  const form = new FormData();
  // React Native's FormData accepts this {uri,name,type} file descriptor.
  form.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.mimeType ?? 'application/octet-stream',
  } as unknown as Blob);
  return apiUpload<ExperienceItemView[]>('/bank/import', form);
}

/** GET /bank/basics — the user's resume basics, or null if not set yet. */
export function getResumeBasics(): Promise<ResumeBasicsView | null> {
  return apiRequest<ResumeBasicsView | null>('/bank/basics', { method: 'GET' });
}

/** PUT /bank/basics — upsert the user's resume basics; returns the saved record. */
export function updateResumeBasics(input: UpdateResumeBasicsInput): Promise<ResumeBasicsView> {
  return apiRequest<ResumeBasicsView>('/bank/basics', { method: 'PUT', body: input });
}
