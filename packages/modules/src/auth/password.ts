// Password hashing (build brief Section 6): argon2id, never bcrypt/sha256/hand-rolled.
import argon2 from 'argon2';

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

/** Returns true iff `plain` matches `hash`. Never throws on a bad password. */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // argon2.verify throws on a malformed hash — treat as a failed match.
    return false;
  }
}
