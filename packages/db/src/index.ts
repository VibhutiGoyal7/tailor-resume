// Single shared Prisma client for the whole monorepo (web + worker).
// The generated client lives in ../generated/client (git-ignored); run
// `npm run db:generate` after install and before first use.
//
// Uses a global singleton in development so Next.js hot-reload / repeated
// worker restarts don't exhaust the Postgres connection pool.
import { PrismaClient } from '../generated/client/index.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '../generated/client/index.js';
