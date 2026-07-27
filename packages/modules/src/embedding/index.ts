// Embedding service (ADR-003: Voyage AI + pgvector). A thin provider layer so
// the rest of the app depends on the Embedder interface, not on Voyage — the
// provider "could be swapped later without touching the rest of the system".
//
// Two implementations, auto-selected by getEmbedder():
//   VoyageEmbedder — real voyage-4-family model (needs VOYAGE_API_KEY)
//   StubEmbedder   — deterministic offline vectors, used when no key is set,
//                    so retrieval runs and demos without any external account
//                    (same pattern as the JD parser's StubJdParser).
import { EMBEDDING_DIMENSIONS } from '@tailor/shared-types';
import { logger } from '../logger.js';

/**
 * Voyage supports asymmetric retrieval: stored bullets are embedded as
 * "document", the JD-derived search strings as "query". Passing the right side
 * improves retrieval quality on real Voyage; the stub ignores it.
 */
export type EmbeddingInputType = 'document' | 'query';

export interface Embedder {
  /** Embed a batch of texts into EMBEDDING_DIMENSIONS-length vectors, order-preserving. */
  embed(texts: string[], inputType: EmbeddingInputType): Promise<number[][]>;
}

/** Model + endpoint are env-overridable so the exact voyage-4 id can be set with the key. */
export const VOYAGE_MODEL = process.env.VOYAGE_MODEL ?? 'voyage-3.5';
const VOYAGE_ENDPOINT = 'https://api.voyageai.com/v1/embeddings';

export class VoyageEmbedder implements Embedder {
  async embed(texts: string[], inputType: EmbeddingInputType): Promise<number[][]> {
    if (texts.length === 0) return [];
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) throw new Error('VOYAGE_API_KEY not set — cannot embed with Voyage.');

    const res = await fetch(VOYAGE_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        input: texts,
        model: VOYAGE_MODEL,
        input_type: inputType,
        // Force the dimension our pgvector column expects (voyage-3.5 / -3-large
        // support output_dimension); keeps us aligned with vector(1024).
        output_dimension: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Voyage embeddings failed (${res.status}): ${detail.slice(0, 300)}`);
    }

    const body = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    const vectors = body.data?.map((d) => d.embedding);
    if (!vectors || vectors.length !== texts.length) {
      throw new Error('Voyage returned an unexpected number of embeddings.');
    }
    return vectors;
  }
}

/**
 * Deterministic offline embedder. Produces a stable unit vector per input string
 * so cosine search is reproducible in tests and demos without a Voyage key. It
 * is NOT semantically meaningful (identical text → identical vector; unrelated
 * text → arbitrary but stable vector) — enough to exercise the whole retrieve
 * pipeline, not to judge match quality.
 */
export class StubEmbedder implements Embedder {
  async embed(texts: string[], _inputType: EmbeddingInputType): Promise<number[][]> {
    return texts.map((t) => stubVector(t));
  }
}

/** FNV-1a hash → seeds a deterministic pseudo-random unit vector. */
function stubVector(text: string): number[] {
  const normalized = text.trim().toLowerCase();
  let seed = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    seed ^= normalized.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  const vec = new Array<number>(EMBEDDING_DIMENSIONS);
  let state = seed >>> 0;
  let sumSq = 0;
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    // xorshift32 for a stable per-dimension value in [-1, 1).
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    const v = (state / 0xffffffff) * 2 - 1;
    vec[i] = v;
    sumSq += v * v;
  }
  const norm = Math.sqrt(sumSq) || 1;
  return vec.map((v) => v / norm);
}

// Swappable singleton: Voyage when a key is present, stub otherwise.
let embedder: Embedder | undefined;
export function getEmbedder(): Embedder {
  if (!embedder) {
    if (process.env.VOYAGE_API_KEY) {
      embedder = new VoyageEmbedder();
      logger.debug('using VoyageEmbedder');
    } else {
      embedder = new StubEmbedder();
      logger.warn('VOYAGE_API_KEY not set — using StubEmbedder (deterministic offline vectors)');
    }
  }
  return embedder;
}
export function setEmbedder(next: Embedder): void {
  embedder = next;
}
