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
4. **Embrace TS 7's strict-by-default** (user decision): TS 7 turns `strict: true` and `noUncheckedSideEffectImports: true` on by default. Rather than revert them, fix the type errors they surface.

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
- `moduleResolution`: `"node"` → `"bundler"`. TS 7 removed the legacy `node10` (`"node"`) resolution; `"bundler"` is the correct choice for a webpack project with `module: "esnext"` and preserves extensionless imports.
- `strict` left at its new default (on) — see decision 4.
- `skipLibCheck: true` (added previously) keeps the transitive `@types/node` `.d.ts` quiet under tsgo too.

### `glsl.d.ts`
- Add `declare module '*.css'` (matches the existing `*.glsl`/`*.vs`/`*.fs` pattern) so the side-effect CSS import in `index.ts` satisfies TS 7's `noUncheckedSideEffectImports`.

### Strict-mode source fixes (52 → 0 errors)
- **Definite-assignment `!`** on properties assigned in `init*()`/`resize()` methods called from the constructor, not detectable by TS: `World` (width/height/dims/grids/GL handles), `HashGrid` (options/cells), `BoidBehavior` (name — set by subclasses).
- **`getCell()` returns `Cell | undefined`:** callers fixed by context — `FlowBehavior` (drop annotation; existing guard narrows), `Boid` (`!` — cell provably exists, boid inserted 3 lines above), `FlowGrid` (added `if (!cell) return false` — mouse can be out of grid), and internal `HashGrid.computeNeighbors` (`!` — loop is bounds-checked).
- **`World` GL init restructured** to compute the typed arrays and `bufferInfo` before assigning the GL handle objects — removes the `bufferInfo: undefined` intermediate state (4 errors) and keeps the same array references the draw code mutates.
- **`bufferInfo.attribs!`** at 9 draw sites: twgl types `BufferInfo.attribs` as optional, but it is always populated by `createBufferInfoFromArrays`.
- **Math return types widened** to `matX | null` for `inverse`/`toInverseMat3`/`rotate` — they legitimately return `null` on singular matrices / zero-length axes (these methods are unused in src, so no caller cascade).
- **`getDataRadius(closest?: boolean)` → `closest: boolean = false`** (was leaking `boolean | undefined` into the cache record); **`nearestDv!: vec2`** definite assignment (assigned in the same branch that sets `nearestData`, use is guarded).
- **`IRingOptions.id`** made required (`id: number`) — the sole caller always provides it.
- **`getContext('webgl2')!`** and **`FlowTypeColor.get(...)!`** — runtime-guaranteed non-null.

## Verification gate
- `yarn typecheck` (`tsc --noEmit` via TS 7) → 0 errors in project source.
- `yarn build` → webpack 5 compiles clean (only pre-existing bundle-size warnings) AND type-check passes; exit 0.
