// profile module facade (ADR-008). The ONE entry point into profile data
// (Experience Bank + Resume Basics). resume-engine reads the bank through this
// facade, never through its own Prisma query against ExperienceItem/Bullet.
//
// Milestone 3: structured item CRUD, manual bullets + accept/edit/reject, and
// Resume Basics. LLM freeform extraction (POST /items/:id/extract) and bullet
// embeddings (Voyage) land with Milestones 4–5.
import { prisma, type ExperienceItem, type ExperienceBullet } from '@tailor/db';
import {
  AppError,
  EXPERIENCE_TYPES,
  type AddBulletInput,
  type AddExperienceItemInput,
  type BulletView,
  type ExperienceBankView,
  type ExperienceItemView,
  type ExperienceType,
  type ResumeBasicsView,
  type UpdateBulletInput,
  type UpdateResumeBasicsInput,
} from '@tailor/shared-types';

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
        structuredFields: input.structuredFields,
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
      links: input.links,
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
};

// Keep EXPERIENCE_TYPES reachable for callers that iterate the bank shape.
export { EXPERIENCE_TYPES };
