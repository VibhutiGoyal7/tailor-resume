// Integration tests for the profile facade. Gated on RUN_DB_TESTS=1.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@tailor/db';
import type { BankExtractor, ExtractInput } from './index.js';
import { profileModule, setBankExtractor } from './index.js';
import type { ExtractionResult } from '@tailor/shared-types';

const EMPTY_FIELDS = {
  title: null,
  company: null,
  startDate: null,
  endDate: null,
  location: null,
  name: null,
  context: null,
  timeframe: null,
  school: null,
  degree: null,
  field: null,
  startYear: null,
  endYear: null,
  category: null,
} as ExtractionResult['structuredFields'];

/** Fake extractor with a fixed result, so facade tests never hit an LLM. */
function fakeExtractor(result: ExtractionResult): BankExtractor & { calls: ExtractInput[] } {
  const calls: ExtractInput[] = [];
  return {
    calls,
    extract: async (input: ExtractInput) => {
      calls.push(input);
      return result;
    },
  };
}

const runDb = process.env.RUN_DB_TESTS === '1';
const EMAIL = 'profile-test@example.com';
const OTHER = 'profile-other@example.com';

describe.skipIf(!runDb)('profileModule (DB integration)', () => {
  let userId: string;
  let otherUserId: string;

  async function cleanupUser(email: string): Promise<void> {
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u) return;
    const items = await prisma.experienceItem.findMany({
      where: { userId: u.id },
      select: { id: true },
    });
    await prisma.experienceBullet.deleteMany({
      where: { experienceItemId: { in: items.map((i) => i.id) } },
    });
    await prisma.experienceItem.deleteMany({ where: { userId: u.id } });
    await prisma.resumeBasics.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  }
  async function freshUser(email: string): Promise<string> {
    await cleanupUser(email);
    const u = await prisma.user.create({ data: { email, passwordHash: 'x' } });
    return u.id;
  }

  beforeEach(async () => {
    userId = await freshUser(EMAIL);
    otherUserId = await freshUser(OTHER);
  });
  afterAll(async () => {
    await cleanupUser(EMAIL);
    await cleanupUser(OTHER);
    await prisma.$disconnect();
  });

  const role = (fields: Record<string, unknown> = {}) =>
    profileModule.addExperienceItem(userId, {
      type: 'role',
      structuredFields: fields,
      rawInput: '',
    });

  it('addExperienceItem + getExperienceBank groups by type', async () => {
    await role({ title: 'Engineer' });
    await profileModule.addExperienceItem(userId, {
      type: 'skill',
      structuredFields: { name: 'TypeScript' },
      rawInput: '',
    });
    const bank = await profileModule.getExperienceBank(userId);
    expect(bank.role).toHaveLength(1);
    expect(bank.skill).toHaveLength(1);
    expect(bank.project).toHaveLength(0);
    expect(bank.role[0]?.structuredFields).toMatchObject({ title: 'Engineer' });
    expect(bank.role[0]?.source).toBe('structured_form');
  });

  it('addBullet attaches an accepted bullet to your own item', async () => {
    const item = await role();
    const bullet = await profileModule.addBullet(userId, item.id, {
      text: 'Shipped X',
      tags: ['impact'],
      impactMetric: '20% faster',
    });
    expect(bullet).toMatchObject({
      text: 'Shipped X',
      status: 'accepted',
      impactMetric: '20% faster',
    });
    const bank = await profileModule.getExperienceBank(userId);
    expect(bank.role[0]?.bullets).toHaveLength(1);
  });

  it("addBullet to another user's item → NOT_FOUND", async () => {
    const item = await profileModule.addExperienceItem(otherUserId, {
      type: 'role',
      structuredFields: {},
      rawInput: '',
    });
    await expect(
      profileModule.addBullet(userId, item.id, { text: 'x', tags: [] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('deleteExperienceItem removes the item and its bullets', async () => {
    const item = await role();
    await profileModule.addBullet(userId, item.id, { text: 'a bullet', tags: [] });
    await profileModule.deleteExperienceItem(userId, item.id);

    const bank = await profileModule.getExperienceBank(userId);
    expect(bank.role).toHaveLength(0);
    const orphanBullets = await prisma.experienceBullet.findMany({
      where: { experienceItemId: item.id },
    });
    expect(orphanBullets).toHaveLength(0);
  });

  it("deleteExperienceItem on another user's item → NOT_FOUND", async () => {
    const item = await profileModule.addExperienceItem(otherUserId, {
      type: 'role',
      structuredFields: {},
      rawInput: '',
    });
    await expect(profileModule.deleteExperienceItem(userId, item.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('extractBulletsForItem appends suggested bullets and fills missing fields', async () => {
    const item = await profileModule.addExperienceItem(userId, {
      type: 'role',
      structuredFields: { title: 'Senior Engineer' },
      rawInput: 'I led the checkout migration and owned CI/CD.',
    });
    setBankExtractor(
      fakeExtractor({
        type: 'role',
        structuredFields: { ...EMPTY_FIELDS, title: 'IGNORED', company: 'Acme Co.' },
        bullets: [
          {
            text: 'Led the checkout migration',
            impactMetric: '18% less abandonment',
            tags: ['impact'],
          },
          { text: 'Owned the CI/CD pipeline', impactMetric: null, tags: [] },
        ],
      }),
    );

    const updated = await profileModule.extractBulletsForItem(userId, item.id);
    // Two suggested bullets were added.
    expect(updated.bullets).toHaveLength(2);
    expect(updated.bullets.every((b) => b.status === 'suggested')).toBe(true);
    // A missing field was filled, but the user's existing title was NOT overwritten.
    expect(updated.structuredFields.title).toBe('Senior Engineer');
    expect(updated.structuredFields.company).toBe('Acme Co.');
  });

  it("extractBulletsForItem on another user's item → NOT_FOUND", async () => {
    const item = await profileModule.addExperienceItem(otherUserId, {
      type: 'role',
      structuredFields: {},
      rawInput: 'text',
    });
    await expect(profileModule.extractBulletsForItem(userId, item.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('extractItemFromText creates a freeform item with suggested bullets', async () => {
    setBankExtractor(
      fakeExtractor({
        type: 'project',
        structuredFields: { ...EMPTY_FIELDS, name: 'On-device CV pipeline', timeframe: '2023' },
        bullets: [
          { text: 'Built an on-device document scanner', impactMetric: null, tags: ['ml'] },
        ],
      }),
    );

    const item = await profileModule.extractItemFromText(userId, {
      text: 'I built an on-device CV pipeline in 2023 with TensorFlow Lite.',
    });
    expect(item.type).toBe('project');
    expect(item.source).toBe('freeform_extracted');
    expect(item.rawInput).toContain('TensorFlow Lite');
    expect(item.structuredFields.name).toBe('On-device CV pipeline');
    expect(item.bullets).toHaveLength(1);
    expect(item.bullets[0]?.status).toBe('suggested');

    const bank = await profileModule.getExperienceBank(userId);
    expect(bank.project).toHaveLength(1);
  });

  it('updateBullet: edit changes text, reject keeps text', async () => {
    const item = await role();
    const b = await profileModule.addBullet(userId, item.id, { text: 'orig', tags: [] });

    const edited = await profileModule.updateBullet(userId, b.id, {
      status: 'edited',
      text: 'better wording',
    });
    expect(edited).toMatchObject({ status: 'edited', text: 'better wording' });

    const rejected = await profileModule.updateBullet(userId, b.id, { status: 'rejected' });
    expect(rejected.status).toBe('rejected');
    expect(rejected.text).toBe('better wording'); // text unchanged when omitted
  });

  it("updateBullet on another user's bullet → NOT_FOUND", async () => {
    const item = await profileModule.addExperienceItem(otherUserId, {
      type: 'role',
      structuredFields: {},
      rawInput: '',
    });
    const b = await profileModule.addBullet(otherUserId, item.id, { text: 'x', tags: [] });
    await expect(
      profileModule.updateBullet(userId, b.id, { status: 'accepted' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('resume basics: null initially, then upsert create + update (PUT semantics)', async () => {
    expect(await profileModule.getResumeBasics(userId)).toBeNull();

    const created = await profileModule.updateResumeBasics(userId, {
      fullName: 'Ada Lovelace',
      links: { github: 'https://github.com/ada' },
    });
    expect(created).toMatchObject({ fullName: 'Ada Lovelace' });
    expect(created.links).toMatchObject({ github: 'https://github.com/ada' });

    const updated = await profileModule.updateResumeBasics(userId, {
      fullName: 'Ada L.',
      links: {},
    });
    expect(updated.fullName).toBe('Ada L.');
    expect((await profileModule.getResumeBasics(userId))?.fullName).toBe('Ada L.');
  });
});
