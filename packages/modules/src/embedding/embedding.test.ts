import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMBEDDING_DIMENSIONS } from '@tailor/shared-types';
import { getEmbedder, setEmbedder, StubEmbedder, VoyageEmbedder, type Embedder } from './index.js';

describe('StubEmbedder', () => {
  it('produces deterministic, correctly-sized unit vectors', async () => {
    const e = new StubEmbedder();
    const [a1] = (await e.embed(['machine learning'], 'document')) as [number[]];
    const [a2] = (await e.embed(['machine learning'], 'query')) as [number[]];
    const [b] = (await e.embed(['unrelated text'], 'document')) as [number[]];

    expect(a1).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(a1).toEqual(a2); // deterministic + input_type-independent
    expect(a1).not.toEqual(b); // different text → different vector

    // Unit length (cosine-friendly).
    const norm = Math.sqrt(a1.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('preserves order and handles empty input', async () => {
    const e = new StubEmbedder();
    expect(await e.embed([], 'query')).toEqual([]);
    const [x, y] = await e.embed(['x', 'y'], 'document');
    expect(x).not.toEqual(y);
  });
});

describe('getEmbedder default selection', () => {
  const original = process.env.VOYAGE_API_KEY;
  beforeEach(() => setEmbedder(undefined as unknown as Embedder));
  afterEach(() => {
    if (original === undefined) delete process.env.VOYAGE_API_KEY;
    else process.env.VOYAGE_API_KEY = original;
    setEmbedder(undefined as unknown as Embedder);
  });

  it('falls back to StubEmbedder without VOYAGE_API_KEY', () => {
    delete process.env.VOYAGE_API_KEY;
    expect(getEmbedder()).toBeInstanceOf(StubEmbedder);
  });

  it('uses VoyageEmbedder when VOYAGE_API_KEY is set', () => {
    process.env.VOYAGE_API_KEY = 'pa-test-not-real';
    expect(getEmbedder()).toBeInstanceOf(VoyageEmbedder);
  });
});
