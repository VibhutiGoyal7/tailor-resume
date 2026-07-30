// Integration tests for the profile facade. Gated on RUN_DB_TESTS=1.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@tailor/db';
import { profileModule } from './index.js';

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
