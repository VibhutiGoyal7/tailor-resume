import { defineWorkspace } from 'vitest/config';

// Runs every workspace package's tests from the repo root (`npm test`).
// Each package can add its own vitest.config.ts later for package-specific setup.
export default defineWorkspace(['packages/*', 'apps/*']);
