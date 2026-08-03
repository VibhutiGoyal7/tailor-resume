// Typed resume-history API calls (build brief §5). Thin wrappers over apiRequest;
// screens consume these through TanStack Query. GET /resumes returns the history
// list newest-first (the facade scopes it to the current user).
import { apiRequest } from './client';
import type { TailoredResumeSummary } from '@tailor/shared-types';

/** GET /resumes — full tailoring history, newest first. */
export function listResumes(): Promise<TailoredResumeSummary[]> {
  return apiRequest<TailoredResumeSummary[]>('/resumes', { method: 'GET' });
}

/** DELETE /resumes/:id — remove a tailored resume and its export files (204). */
export function deleteResume(id: string): Promise<void> {
  return apiRequest<void>(`/resumes/${id}`, { method: 'DELETE' });
}
