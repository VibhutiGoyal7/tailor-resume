import path from 'node:path';
import { config as loadEnv } from 'dotenv';

// Load the single repo-root .env into the server process (build brief: one .env
// at the repo root, not per-app). Next only auto-loads .env from apps/web, so
// without this the shared DATABASE_URL / JWT_SECRET wouldn't reach the API
// routes. dotenv does not override vars already set in the real environment
// (e.g. on Render/Railway), so production env still wins.
const repoRoot = path.join(import.meta.dirname, '../..');
loadEnv({ path: path.join(repoRoot, '.env') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  // API-only app (build brief Section 1): no frontend pages. Deployed as a
  // long-running Node server via `next start` — NOT Vercel serverless, so the
  // worker's queue-consumer design (ADR-009) stays intact.
  reactStrictMode: true,
  // Shared workspace packages are consumed as TS source, so let Next transpile them.
  transpilePackages: ['@tailor/modules', '@tailor/shared-types', '@tailor/db'],
  // This is a monorepo; pin the file-tracing root so Next doesn't infer the wrong
  // one from a stray lockfile elsewhere on the machine.
  outputFileTracingRoot: repoRoot,
  webpack: (config) => {
    // Our shared packages use NodeNext-style imports with explicit `.js`
    // extensions (required by tsc + vitest). Teach webpack to resolve a `.js`
    // specifier to the real `.ts`/`.tsx` source when bundling those packages.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
