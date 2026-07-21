# TypeScript 7 Toolchain Migration — Design

**Date:** 2026-07-21
**Status:** Approved
**Goal:** Run the project on the latest TypeScript (7.x, the Go-native compiler) while keeping `yarn build` a real gate that fails on type errors.

## Why the previous pin to TS 5.9.3 exists

TS 7's npm package exposes **no usable programmatic JS API** for bundler loaders:

- `require('typescript')` returns only `{ version, versionMajorMinor }`.
- The compiler API lives under `./unstable/*` subpaths, which are **ESM-only** (the `exports` map has an `"import"` condition but no `"require"`), so CommonJS-based loaders cannot consume them.
- `ts-loader` (9.6.2, latest) and `fork-ts-checker-webpack-plugin` (9.1.0, latest) are built around the now-removed JS compiler API (`readConfigFile`, `createProgram`, …) and have **no TS 7 release or path to one**.

Therefore TS 7 cannot be run *through* a JS-API webpack loader. The fix is the modern standard split: **transpile with a standalone parser; type-check with the native `tsc` CLI** (which is what tsgo excels at — ~10× faster).

This matches how the project already works: `ts-loader` runs `transpileOnly: true` (no type-checking) and `fork-ts-checker-webpack-plugin` does the checking separately. The migration just swaps *which tools* fill each role.

## Decisions (approved)

1. **Transpiler: `esbuild-loader`** (own TS grammar, reads `tsconfig.json`, no extra config file, fastest). Verified the source is esbuild-safe: no `const enum`, no `namespace`, no cross-file type-dependent transpilation, no decorators in use.
2. **Build gate preserved:** `yarn build` runs `tsc --noEmit` **then** webpack, so a type error still fails the build (fail-fast, no stale bundle emitted).
3. Type-checking is also exposed as a standalone `yarn typecheck` script for dev iteration.

## Changes

### `package.json`
- `dependencies`: remove `ts-loader`.
- `devDependencies`: remove `fork-ts-checker-webpack-plugin`; add `esbuild-loader` (^4.5.0); bump `typescript` `^5.9.3` → `^7` (native).
- `scripts.build`: `webpack --config-node-env production` → `tsc --noEmit && webpack --config-node-env production`.
- `scripts`: add `"typecheck": "tsc --noEmit"`.
- `watch` / `dev` / `start` unchanged (watch/serve modes don't type-check — speed).

### `webpack.config.js`
- Remove `ForkTsCheckerWebpackPlugin` import and its instantiation in `plugins`.
- Replace the `ts-loader` rule with `esbuild-loader` (`target: 'esnext'` to match `tsconfig`).

### `tsconfig.json`
- No change required. `skipLibCheck: true` (added previously) keeps the transitive `@types/node` `.d.ts` quiet under tsgo too.

## Verification gate
- `yarn typecheck` (`tsc --noEmit` via TS 7) → 0 errors in project source.
- `yarn build` → webpack 5 compiles clean (only pre-existing bundle-size warnings) AND type-check passes; exit 0.
