// profile module facade (ADR-008). The ONE entry point into profile data
// (Experience Bank + Resume Basics). resume-engine reads the bank through this
// facade, never through its own Prisma query against ExperienceItem/Bullet.
//
// Milestone 3: structured item CRUD, manual bullets + accept/edit/reject, and
// Resume Basics. LLM freeform extraction (POST /items/:id/extract) and bullet
// embeddings (Voyage) land with Milestones 4–5.
import { prisma, Prisma, type ExperienceItem, type ExperienceBullet } from '@tailor/db';
import {
  AppError,
  EXPERIENCE_TYPES,
  type BulletVectorMatch,
  type AddBulletInput,
  type AddExperienceItemInput,
  type BulletView,
  type ExperienceBankView,
  type ExperienceItemView,
  type ExperienceType,
  type ExtractFromTextInput,
  type ResumeBasicsView,
  type UpdateBulletInput,
  type UpdateResumeBasicsInput,
} from '@tailor/shared-types';
import { getBankExtractor } from './extractor.js';
import { logger } from '../logger.js';

type ItemWithBullets = ExperienceItem & { bullets: ExperienceBullet[] };

function toBulletView(b: ExperienceBullet): BulletView {
  return {
    id: b.id,
    text: b.text,
    tags: b.tags,
    impactMetric: b.impactMetric,
    status: b.status as BulletView['status'],
  };
}

function toItemView(item: ItemWithBullets): ExperienceItemView {
  return {
    id: item.id,
    type: item.type as ExperienceType,
    source: item.source,
    rawInput: item.rawInput,
    structuredFields: (item.structuredFields ?? {}) as Record<string, unknown>,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    bullets: item.bullets.map(toBulletView),
  };
}

function emptyBank(): ExperienceBankView {
  return { role: [], project: [], education: [], skill: [] };
}

export const profileModule = {
  /** All of a user's Experience Bank items, grouped by type (build brief §5). */
  async getExperienceBank(userId: string): Promise<ExperienceBankView> {
    const items = await prisma.experienceItem.findMany({
      where: { userId },
      include: { bullets: true },
      orderBy: { createdAt: 'asc' },
    });
    const bank = emptyBank();
    for (const item of items) {
      const view = toItemView(item);
      (bank[view.type] ??= []).push(view);
    }
    return bank;
  },

  /** Add a structured Experience Bank item (role/project/education/skill). */
  async addExperienceItem(
    userId: string,
    input: AddExperienceItemInput,
  ): Promise<ExperienceItemView> {
    const item = await prisma.experienceItem.create({
      data: {
        userId,
        type: input.type,
        source: 'structured_form',
        rawInput: input.rawInput,
        structuredFields: input.structuredFields as Prisma.InputJsonValue,
      },
      include: { bullets: true },
    });
    return toItemView(item);
  },

  /**
   * Manually add a bullet to one of the user's items. Manual bullets are
   * "accepted" by definition (the user wrote them). Embedding stays null until
   * Milestone 5 computes it.
   */
  async addBullet(userId: string, itemId: string, input: AddBulletInput): Promise<BulletView> {
    // Scope by userId so you can only add to your own items (404 otherwise).
    const item = await prisma.experienceItem.findFirst({ where: { id: itemId, userId } });
    if (!item) throw new AppError('NOT_FOUND', 'Experience item not found.');

    const bullet = await prisma.experienceBullet.create({
      data: {
        experienceItemId: itemId,
        text: input.text,
        tags: input.tags,
        impactMetric: input.impactMetric ?? null,
        status: 'accepted',
      },
    });
    return toBulletView(bullet);
  },

  /**
   * Extract suggested bullets for an existing item from its saved description
   * (POST /bank/items/:id/extract — the manual forms' "Save and extract bullets").
   * Runs Claude over the item's rawInput (with its type + fields for context) and
   * appends the results as "suggested" bullets for the user to review. Any fields
   * the model recovers that the item is missing are filled in. Returns the updated
   * item. If the item has no text to work from, it's returned unchanged.
   */
  async extractBulletsForItem(userId: string, itemId: string): Promise<ExperienceItemView> {
    const item = await prisma.experienceItem.findFirst({
      where: { id: itemId, userId },
      include: { bullets: true },
    });
    if (!item) throw new AppError('NOT_FOUND', 'Experience item not found.');
    if (!item.rawInput.trim()) return toItemView(item);

    const existingFields = (item.structuredFields ?? {}) as Record<string, unknown>;
    const result = await getBankExtractor().extract({
      text: item.rawInput,
      typeHint: item.type as ExperienceType,
      structuredFields: existingFields,
    });

    // Fill only fields the item is missing (never overwrite what the user typed).
    const mergedFields = { ...existingFields };
    for (const [k, v] of Object.entries(result.structuredFields)) {
      if (v && !mergedFields[k]) mergedFields[k] = v;
    }

    await prisma.$transaction([
      prisma.experienceItem.update({
        where: { id: itemId },
        data: { structuredFields: mergedFields as Prisma.InputJsonValue },
      }),
      ...result.bullets.map((b) =>
        prisma.experienceBullet.create({
          data: {
            experienceItemId: itemId,
            text: b.text,
            tags: b.tags,
            impactMetric: b.impactMetric,
            status: 'suggested',
          },
        }),
      ),
    ]);

    const updated = await prisma.experienceItem.findUniqueOrThrow({
      where: { id: itemId },
      include: { bullets: true },
    });
    logger.info(
      { itemId, suggested: result.bullets.length },
      'extracted suggested bullets for item',
    );
    return toItemView(updated);
  },

  /**
   * Create an Experience Bank item from freeform text (POST /bank/extract — the
   * "Write about it" flow). Claude infers the type (unless hinted), the structured
   * fields, and a set of "suggested" bullets; the original text is kept as rawInput.
   * Returns the new item with its suggested bullets for the review step.
   */
  async extractItemFromText(
    userId: string,
    input: ExtractFromTextInput,
  ): Promise<ExperienceItemView> {
    const result = await getBankExtractor().extract({
      text: input.text,
      typeHint: input.type,
    });
    const structuredFields = Object.fromEntries(
      Object.entries(result.structuredFields).filter(([, v]) => v != null),
    );

    const item = await prisma.experienceItem.create({
      data: {
        userId,
        type: result.type,
        source: 'freeform_extracted',
        rawInput: input.text,
        structuredFields: structuredFields as Prisma.InputJsonValue,
        bullets: {
          create: result.bullets.map((b) => ({
            text: b.text,
            tags: b.tags,
            impactMetric: b.impactMetric,
            status: 'suggested',
          })),
        },
      },
      include: { bullets: true },
    });
    logger.info(
      { itemId: item.id, type: result.type, suggested: result.bullets.length },
      'created item from freeform extraction',
    );
    return toItemView(item);
  },

  /** Accept / edit / reject a bullet (build brief §5: PATCH /bank/bullets/:id). */
  async updateBullet(
    userId: string,
    bulletId: string,
    input: UpdateBulletInput,
  ): Promise<BulletView> {
    // Ownership: the bullet's item must belong to the user.
    const bullet = await prisma.experienceBullet.findFirst({
      where: { id: bulletId, experienceItem: { userId } },
    });
    if (!bullet) throw new AppError('NOT_FOUND', 'Bullet not found.');

    const updated = await prisma.experienceBullet.update({
      where: { id: bulletId },
      data: {
        status: input.status,
        ...(input.text !== undefined ? { text: input.text } : {}),
      },
    });
    return toBulletView(updated);
  },

  /**
   * Delete an Experience Bank item and its bullets (DELETE /bank/items/:id).
   * User-scoped (404 for a missing or others' item). The bullet→item relation
   * has no DB-level cascade, so bullets are removed first in the same
   * transaction (this also clears their pgvector embeddings with the rows).
   */
  async deleteExperienceItem(userId: string, itemId: string): Promise<void> {
    const item = await prisma.experienceItem.findFirst({
      where: { id: itemId, userId },
      select: { id: true },
    });
    if (!item) throw new AppError('NOT_FOUND', 'Experience item not found.');

    await prisma.$transaction([
      prisma.experienceBullet.deleteMany({ where: { experienceItemId: itemId } }),
      prisma.experienceItem.delete({ where: { id: itemId } }),
    ]);
  },

  /** The user's Resume Basics, or null if never set. */
  async getResumeBasics(userId: string): Promise<ResumeBasicsView | null> {
    const basics = await prisma.resumeBasics.findUnique({ where: { userId } });
    if (!basics) return null;
    return {
      fullName: basics.fullName,
      phone: basics.phone,
      location: basics.location,
      links: (basics.links ?? {}) as ResumeBasicsView['links'],
      summary: basics.summary,
      updatedAt: basics.updatedAt.toISOString(),
    };
  },

  /** Create or replace the user's Resume Basics (PUT semantics). */
  async updateResumeBasics(
    userId: string,
    input: UpdateResumeBasicsInput,
  ): Promise<ResumeBasicsView> {
    const data = {
      fullName: input.fullName,
      phone: input.phone ?? null,
      location: input.location ?? null,
      links: input.links as Prisma.InputJsonValue,
      summary: input.summary ?? null,
    };
    const basics = await prisma.resumeBasics.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return {
      fullName: basics.fullName,
      phone: basics.phone,
      location: basics.location,
      links: (basics.links ?? {}) as ResumeBasicsView['links'],
      summary: basics.summary,
      updatedAt: basics.updatedAt.toISOString(),
    };
  },

  // --- Embeddings & vector search (ADR-003) ---------------------------------
  // profile owns the ExperienceBullet table, so the pgvector reads/writes live
  // here (raw SQL — Prisma's typed client can't touch an Unsupported vector
  // column). resume-engine computes the vectors and consumes these via the
  // facade, never querying this table itself (ADR-008 boundary). Retrieval only
  // considers bullets the user kept: status "accepted" or "edited".

  /** Accepted/edited bullets that still need an embedding (lazy backfill, M5). */
  async getBulletsNeedingEmbedding(userId: string): Promise<Array<{ id: string; text: string }>> {
    return prisma.$queryRaw<Array<{ id: string; text: string }>>`
      SELECT b.id, b.text
      FROM "ExperienceBullet" b
      JOIN "ExperienceItem" i ON i.id = b."experienceItemId"
      WHERE i."userId" = ${userId}
        AND b.status IN ('accepted', 'edited')
        AND b.embedding IS NULL
    `;
  },

  /** Store a bullet's embedding (vector written via raw SQL + ::vector cast). */
  async setBulletEmbedding(bulletId: string, vector: number[]): Promise<void> {
    const literal = `[${vector.join(',')}]`;
    await prisma.$executeRaw`
      UPDATE "ExperienceBullet" SET embedding = ${literal}::vector WHERE id = ${bulletId}
    `;
  },

  /**
   * Top-k of the user's kept bullets nearest to a query vector, by pgvector
   * cosine distance (`<=>`). Returns distance so the caller can re-rank/union.
   */
  async searchBulletsByVector(
    userId: string,
    queryVector: number[],
    topK: number,
  ): Promise<BulletVectorMatch[]> {
    const literal = `[${queryVector.join(',')}]`;
    const rows = await prisma.$queryRaw<
      Array<{
        bulletId: string;
        experienceItemId: string;
        text: string;
        tags: string[];
        distance: number;
      }>
    >`
      SELECT b.id AS "bulletId",
             b."experienceItemId" AS "experienceItemId",
             b.text AS text,
             b.tags AS tags,
             (b.embedding <=> ${literal}::vector) AS distance
      FROM "ExperienceBullet" b
      JOIN "ExperienceItem" i ON i.id = b."experienceItemId"
      WHERE i."userId" = ${userId}
        AND b.status IN ('accepted', 'edited')
        AND b.embedding IS NOT NULL
      ORDER BY b.embedding <=> ${literal}::vector
      LIMIT ${topK}
    `;
    // pg returns double precision as string in some drivers; coerce defensively.
    return rows.map((r) => ({ ...r, distance: Number(r.distance) }));
  },
};

// Keep EXPERIENCE_TYPES reachable for callers that iterate the bank shape.
export { EXPERIENCE_TYPES };

// Extractor injection points (tests swap in a fake; production auto-selects the
// Anthropic extractor when a key is set, else the stub).
export {
  getBankExtractor,
  setBankExtractor,
  StubBankExtractor,
  type BankExtractor,
  type ExtractInput,
} from './extractor.js';
