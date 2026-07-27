// File storage for rendered resume exports (build brief §1 stack: Cloudflare R2).
// Behind a FileStore interface so the rest of the app depends on the interface,
// not on R2 — same stub-fallback pattern as the Embedder / Jd parser / generator.
//
// Two implementations, auto-selected by getFileStore():
//   R2FileStore    — Cloudflare R2 (S3-compatible), when the R2_* env vars are set
//   LocalFileStore — writes under a local directory, used when R2 is not configured
//                    so exports work keyless in dev/demo (web + worker run on the
//                    same machine locally, so both see the same directory; in
//                    production the two deployables share R2 instead).
//
// Note: this module never imports the renderers (@react-pdf/renderer / docx) — it
// only moves bytes — so it is safe to import from the `web` deployable, which
// serves stored files but must never pull in worker-only render deps (CLAUDE.md §7).
import { createRequire } from 'node:module';
import { logger } from '../logger.js';

export interface FileStore {
  /** Store `bytes` at `key` (overwrites). `contentType` is metadata for R2. */
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  /** Fetch the bytes at `key`, or null if absent. */
  get(key: string): Promise<Buffer | null>;
}

/** Reject keys that could escape the store root (keys are app-generated; belt-and-braces). */
function assertSafeKey(key: string): void {
  if (!key || key.startsWith('/') || key.includes('..')) {
    throw new Error(`Unsafe file store key: ${key}`);
  }
}

/**
 * Local-filesystem store. Root dir is `FILE_STORE_DIR` (default `.tailor-files`
 * under the process cwd). Keys map to nested paths; parent dirs are created on put.
 */
export class LocalFileStore implements FileStore {
  private readonly root: string;
  // Node built-ins imported lazily so this module stays light for the web bundle.
  private readonly require = createRequire(import.meta.url);

  constructor(root?: string) {
    this.root = root ?? process.env.FILE_STORE_DIR ?? '.tailor-files';
  }

  private resolve(key: string): string {
    assertSafeKey(key);
    const path = this.require('node:path') as typeof import('node:path');
    return path.join(this.root, key);
  }

  async put(key: string, bytes: Buffer, _contentType: string): Promise<void> {
    const fs = this.require('node:fs/promises') as typeof import('node:fs/promises');
    const path = this.require('node:path') as typeof import('node:path');
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, bytes);
    logger.info({ key, bytes: bytes.length }, 'LocalFileStore: wrote export file');
  }

  async get(key: string): Promise<Buffer | null> {
    const fs = this.require('node:fs/promises') as typeof import('node:fs/promises');
    try {
      return await fs.readFile(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }
}

/**
 * Cloudflare R2 store (S3-compatible). `@aws-sdk/client-s3` is imported lazily so
 * nothing loads (or needs R2 credentials) unless a real R2 store is actually used.
 */
interface S3Like {
  send(cmd: unknown): Promise<{ Body?: { transformToByteArray(): Promise<Uint8Array> } }>;
}

export class R2FileStore implements FileStore {
  private client: S3Like | undefined;
  private readonly bucket: string;

  constructor() {
    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket) throw new Error('R2_BUCKET_NAME not set — cannot use R2FileStore.');
    this.bucket = bucket;
  }

  private async getClient(): Promise<S3Like> {
    if (!this.client) {
      const { S3Client } = await import('@aws-sdk/client-s3');
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
        },
      }) as unknown as S3Like;
    }
    return this.client;
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    assertSafeKey(key);
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    );
    logger.info({ key, bytes: bytes.length }, 'R2FileStore: uploaded export file');
  }

  async get(key: string): Promise<Buffer | null> {
    assertSafeKey(key);
    const { GetObjectCommand, S3ServiceException } = await import('@aws-sdk/client-s3');
    const client = await this.getClient();
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!res.Body) return null;
      return Buffer.from(await res.Body.transformToByteArray());
    } catch (err) {
      if (err instanceof S3ServiceException && err.name === 'NoSuchKey') return null;
      throw err;
    }
  }
}

// Swappable singleton: R2 when configured, local disk otherwise.
let fileStore: FileStore | undefined;
export function getFileStore(): FileStore {
  if (!fileStore) {
    const hasR2 =
      process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME;
    if (hasR2) {
      fileStore = new R2FileStore();
      logger.debug('using R2FileStore');
    } else {
      fileStore = new LocalFileStore();
      logger.warn('R2_* not set — using LocalFileStore (exports written to local disk)');
    }
  }
  return fileStore;
}
export function setFileStore(next: FileStore): void {
  fileStore = next;
}
