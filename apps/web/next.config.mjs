/** @type {import('next').NextConfig} */
const nextConfig = {
  // API-only app (build brief Section 1): no frontend pages. Deployed as a
  // long-running Node server via `next start` — NOT Vercel serverless, so the
  // worker's queue-consumer design (ADR-009) stays intact.
  reactStrictMode: true,
  // Shared workspace packages are consumed as TS source, so let Next transpile them.
  transpilePackages: ['@tailor/modules', '@tailor/shared-types', '@tailor/db'],
};

export default nextConfig;
