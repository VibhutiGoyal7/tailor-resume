// Pure helpers for the Profile account screens (Account details, Password), kept out
// of the screens so validation + formatting are unit-testable (ADR-019).
import { PASSWORD_MIN } from '@tailor/shared-types';

export interface PasswordForm {
  current: string;
  next: string;
  confirm: string;
}

export type PasswordField = 'current' | 'next' | 'confirm';
export type PasswordFieldErrors = Partial<Record<PasswordField, string>>;

/**
 * Client-side validation for the change-password form, mirroring the backend policy
 * (`PASSWORD_MIN`) so obvious mistakes are caught before the round-trip. The server
 * still validates and owns the "current password is incorrect" check.
 */
export function validatePasswordChange(form: PasswordForm): PasswordFieldErrors {
  const errors: PasswordFieldErrors = {};
  if (!form.current) errors.current = 'Enter your current password.';
  if (form.next.length < PASSWORD_MIN) errors.next = `Use at least ${PASSWORD_MIN} characters.`;
  if (form.confirm !== form.next) errors.confirm = 'These passwords don’t match.';
  return errors;
}

/** True when the validation result has at least one field error. */
export function hasFieldErrors(errors: PasswordFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "Member since" label for the account screen: an ISO date → "August 2026". */
export function formatJoinDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
