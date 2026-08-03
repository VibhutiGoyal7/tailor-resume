/* eslint-disable @typescript-eslint/no-require-imports */
// Metro config for the Expo app in an npm-workspaces monorepo. Must be CommonJS
// (Metro loads this config with require), hence the require/module.exports below.
//
// The shared `@tailor/*` packages are consumed as TypeScript *source* (their
// package.json `main` points at `src/index.ts`), and their internal imports use
// explicit `.js` extensions — which is REQUIRED for the backend's Node ESM /
// NodeNext resolution (`export * from './errors.js'` resolves to errors.ts there).
// Metro's resolver, however, can't map a `.js` specifier onto a `.ts` file, so it
// fails with `Unable to resolve "./errors.js"`.
//
// Fix: when a specifier ends in `.js`, first try resolving it without the
// extension (letting Metro find the `.ts`/`.tsx` source); fall back to the
// original specifier if that fails. This only affects `.js` specifiers and is a
// no-op for real `.js` files (they still resolve). Keeps the shared packages
// consumable from source with no build step, without touching the backend.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith('.js')) {
    try {
      return context.resolveRequest(context, moduleName.replace(/\.js$/, ''), platform);
    } catch {
      // Not a TS-source `.js` specifier — fall through to normal resolution.
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
