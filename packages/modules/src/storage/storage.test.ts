import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getFileStore, LocalFileStore, setFileStore } from './index.js';

const dir = mkdtempSync(join(tmpdir(), 'tailor-store-'));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('LocalFileStore', () => {
  it('round-trips bytes through nested keys', async () => {
    const store = new LocalFileStore(dir);
    const bytes = Buffer.from('%PDF-1.7 hello');
    await store.put('resumes/abc/resume.pdf', bytes, 'application/pdf');
    const got = await store.get('resumes/abc/resume.pdf');
    expect(got).not.toBeNull();
    expect(got!.equals(bytes)).toBe(true);
  });

  it('returns null for a missing key', async () => {
    expect(await new LocalFileStore(dir).get('resumes/nope/resume.pdf')).toBeNull();
  });

  it('delete removes a stored file and is idempotent for a missing key', async () => {
    const store = new LocalFileStore(dir);
    await store.put('resumes/del/resume.pdf', Buffer.from('x'), 'application/pdf');
    await store.delete('resumes/del/resume.pdf');
    expect(await store.get('resumes/del/resume.pdf')).toBeNull();
    // Deleting again (now absent) must not throw.
    await expect(store.delete('resumes/del/resume.pdf')).resolves.toBeUndefined();
  });

  it('rejects unsafe keys (traversal / absolute)', async () => {
    const store = new LocalFileStore(dir);
    await expect(store.put('../escape', Buffer.from('x'), 'text/plain')).rejects.toThrow();
    await expect(store.get('/etc/passwd')).rejects.toThrow();
  });
});

describe('getFileStore default selection', () => {
  it('falls back to LocalFileStore when R2 is not configured', () => {
    setFileStore(undefined as unknown as LocalFileStore);
    const original = { ...process.env };
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET_NAME;
    try {
      expect(getFileStore()).toBeInstanceOf(LocalFileStore);
    } finally {
      Object.assign(process.env, original);
      setFileStore(undefined as unknown as LocalFileStore);
    }
  });
});
