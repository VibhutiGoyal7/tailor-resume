import { afterEach, describe, expect, it } from 'vitest';
import {
  createDefaultEmailSender,
  DevEmailSender,
  ResendEmailSender,
  passwordResetUrl,
  verificationUrl,
} from './email.js';

describe('email link builders', () => {
  const original = process.env.PUBLIC_APP_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = original;
  });

  it('builds verification/reset URLs from PUBLIC_APP_URL', () => {
    process.env.PUBLIC_APP_URL = 'https://app.tailor.test';
    expect(verificationUrl('abc')).toBe('https://app.tailor.test/verify-email?token=abc');
    expect(passwordResetUrl('xyz')).toBe('https://app.tailor.test/reset-password?token=xyz');
  });

  it('url-encodes the token', () => {
    process.env.PUBLIC_APP_URL = 'https://app.tailor.test';
    expect(verificationUrl('a b/c')).toBe('https://app.tailor.test/verify-email?token=a%20b%2Fc');
  });

  it('falls back to localhost when PUBLIC_APP_URL is unset', () => {
    delete process.env.PUBLIC_APP_URL;
    expect(verificationUrl('t')).toBe('http://localhost:3000/verify-email?token=t');
  });
});

describe('createDefaultEmailSender', () => {
  const original = process.env.RESEND_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = original;
  });

  it('uses the dev sender when RESEND_API_KEY is unset', () => {
    delete process.env.RESEND_API_KEY;
    expect(createDefaultEmailSender()).toBeInstanceOf(DevEmailSender);
  });

  it('uses the Resend sender when RESEND_API_KEY is set', () => {
    process.env.RESEND_API_KEY = 're_test_key';
    expect(createDefaultEmailSender()).toBeInstanceOf(ResendEmailSender);
  });
});

describe('DevEmailSender', () => {
  it('never throws (logs only)', async () => {
    const sender = new DevEmailSender();
    await expect(sender.sendVerificationEmail('a@b.com', 'http://x')).resolves.toBeUndefined();
    await expect(sender.sendPasswordResetEmail('a@b.com', 'http://x')).resolves.toBeUndefined();
  });
});
