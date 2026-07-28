// Typed experience-bank API calls (build brief §5). Thin wrappers over apiRequest;
// screens consume these through TanStack Query. More bank endpoints (items,
// bullets) are added as the Bank screens land — this starts with resume basics,
// which the Home header greeting reads for the user's name.
import { apiRequest } from './client';
import type { ResumeBasicsView } from '@tailor/shared-types';

/** GET /bank/basics — the user's resume basics, or null if not set yet. */
export function getResumeBasics(): Promise<ResumeBasicsView | null> {
  return apiRequest<ResumeBasicsView | null>('/bank/basics', { method: 'GET' });
}
