// Email delivery for auth flows (build brief Section 6: Resend).
// Behind an interface so the facade is testable with a fake sender, and so dev
// works with no Resend key (links are logged instead of sent).
import { logger } from '../logger.js';

export interface EmailSender {
  sendVerificationEmail(to: string, verifyUrl: string): Promise<void>;
  sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>;
}

/** Base URL used to build the links that go in emails/deep-links. */
export function appBaseUrl(): string {
  return process.env.PUBLIC_APP_URL ?? 'http://localhost:3000';
}

export function verificationUrl(token: string): string {
  return `${appBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

export function passwordResetUrl(token: string): string {
  return `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Dev/local sender: no external calls — logs the link so you can copy it from
 * the server output. Also the fallback whenever RESEND_API_KEY is unset.
 */
export class DevEmailSender implements EmailSender {
  async sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
    logger.info({ to, verifyUrl }, '[dev-email] verification link (not actually sent)');
  }
  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    logger.info({ to, resetUrl }, '[dev-email] password-reset link (not actually sent)');
  }
}

/** Production sender via Resend. `resend` is imported lazily so dev/test/CI
 * without the dependency configured never pays for it. */
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string = process.env.EMAIL_FROM ?? 'Tailor <noreply@tailor.app>',
  ) {}

  private async client() {
    const { Resend } = await import('resend');
    return new Resend(this.apiKey);
  }

  async sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
    const resend = await this.client();
    await resend.emails.send({
      from: this.from,
      to,
      subject: 'Verify your email',
      html: `<p>Welcome to Tailor. Confirm your email:</p><p><a href="${verifyUrl}">Verify email</a></p>`,
    });
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    const resend = await this.client();
    await resend.emails.send({
      from: this.from,
      to,
      subject: 'Reset your password',
      html: `<p>Reset your Tailor password:</p><p><a href="${resetUrl}">Reset password</a></p><p>If you didn't request this, ignore this email.</p>`,
    });
  }
}

/** Pick the sender from the environment: Resend if configured, else dev. */
export function createDefaultEmailSender(): EmailSender {
  const key = process.env.RESEND_API_KEY;
  return key ? new ResendEmailSender(key) : new DevEmailSender();
}
