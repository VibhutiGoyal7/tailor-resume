/**
 * Thrown by facade methods that are declared but not yet implemented in this
 * milestone. Keeps the facade surface (ADR-008) complete and callable while
 * later milestones fill in behavior — callers/tests get a consistent, typed
 * failure instead of `undefined`.
 */
export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`${method} is not implemented yet (scaffold).`);
    this.name = 'NotImplementedError';
  }
}
