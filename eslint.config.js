// Flat ESLint config (ESLint 9) for the whole monorepo.
// Kept intentionally lean for the scaffold: TS recommended rules (non-type-checked
// so it runs without a full project graph), plus prettier to defer formatting to Prettier.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
      '**/*.d.ts',
      'packages/db/generated/**',
      'apps/mobile/.expo/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // CLAUDE.md Section 3: no raw console. Route logs through the app logger
      // (mobile) / structured logger (backend). The two intentional sinks that
      // wrap console opt out explicitly with an eslint-disable line.
      'no-console': 'error',
    },
  },
  // CommonJS config files (e.g. babel.config.js) need Node globals + CJS module syntax.
  {
    files: ['**/babel.config.js', '**/*.cjs', '**/metro.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  prettier,
);
