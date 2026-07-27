// Protected-route helper (build brief Section 6). Pulls the Bearer access token
// off the Authorization header and verifies it via the auth module. Throws a
// typed AppError (→ 401) that the route's errorResponse serializes.
import { authModule } from '@tailor/modules';
import { AppError } from '@tailor/shared-types';

export interface AuthContext {
  userId: string;
}

export async function requireAuth(req: Request): Promise<AuthContext> {
  const header = req.headers.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new AppError('UNAUTHENTICATED', 'Missing or malformed Authorization header.');
  }
  try {
    const { userId } = await authModule.verifyAccessToken(token);
    return { userId };
  } catch {
    throw new AppError('UNAUTHENTICATED', 'Invalid or expired access token.');
  }
}
