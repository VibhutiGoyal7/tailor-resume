// Typed tailoring-pipeline API calls (build brief §5, ADR-015/017). Thin wrappers
// over the shared client; screens drive these through TanStack Query. The pipeline
// is async: POST /resumes returns a jobId, the client polls GET /resumes/jobs/:id
// for stage progress, confirms the retrieval checkpoint, then reads the finished
// resume by id for the result/customize/export screens.
import { apiRequest, getAccessToken, joinUrl } from './client';
import { API_BASE_URL } from '../lib/config';
import type {
  ExportFormat,
  JobStatusView,
  TailoredResumeView,
  UpdateResumeLayoutInput,
} from '@tailor/shared-types';

/** POST /resumes — start a pipeline from a job description. Returns the job to poll. */
export function requestTailoredResume(jdText: string): Promise<{ jobId: string }> {
  return apiRequest<{ jobId: string }>('/resumes', { method: 'POST', body: { jdText } });
}

/** GET /resumes/jobs/:jobId — stage-level status for polling. */
export function getJobStatus(jobId: string): Promise<JobStatusView> {
  return apiRequest<JobStatusView>(`/resumes/jobs/${jobId}`, { method: 'GET' });
}

/** POST /resumes/jobs/:jobId/confirm — the ADR-017 checkpoint: the kept candidate subset. */
export function confirmMatches(jobId: string, keptCandidateIds: string[]): Promise<void> {
  return apiRequest<void>(`/resumes/jobs/${jobId}/confirm`, {
    method: 'POST',
    body: { keptCandidateIds },
  });
}

/** GET /resumes/:id — full resume detail (score, template, rendered content, formats). */
export function getResume(resumeId: string): Promise<TailoredResumeView> {
  return apiRequest<TailoredResumeView>(`/resumes/${resumeId}`, { method: 'GET' });
}

/** PATCH /resumes/:id/layout — partial layout update; returns the updated detail view. */
export function updateResumeLayout(
  resumeId: string,
  input: UpdateResumeLayoutInput,
): Promise<TailoredResumeView> {
  return apiRequest<TailoredResumeView>(`/resumes/${resumeId}/layout`, {
    method: 'PATCH',
    body: input,
  });
}

/** The authenticated download URL for a rendered export file (used with downloadAsync). */
export function exportUrl(resumeId: string, format: ExportFormat): string {
  return joinUrl(API_BASE_URL, `/resumes/${resumeId}/export?format=${format}`);
}

/** The bearer header for the export download (expo-file-system streams straight to a file). */
export function exportHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}
