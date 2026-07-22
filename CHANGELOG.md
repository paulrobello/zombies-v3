# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Versioning policy

This package is marked `"private": true` in `package.json` and is **not published
to a registry**. Versions therefore track **meaningful milestones** of the live
demo (https://paulrobello.github.io/zombies-v3/), not registry releases.

- **MAJOR** — a milestone change in the simulation's scope or a non-trivial
  migration (new toolchain, new render pipeline).
- **MINOR** — user-visible gameplay or visual changes (new behaviour, new
  layer, controls rework).
- **PATCH** — correctness, performance, security, and documentation fixes that
  don't change the user-facing surface.

Each release ships to GitHub Pages from `main` via
`.github/workflows/deploy.yml`.

## [0.1.0] — 2026-07-21

First milestone after the project audit. The simulation is correct, the
toolchain is modernised, and the project meets its mandatory build/lint/test
baseline.

### Goal-completion pass (architecture refactor + verification infra)

A follow-up `/goal` pass closed the items deferred as too risky to auto-fix
without a verification net. All behavior-preserving, verified by deterministic
screenshot equivalence (`?seed=42&fixedStep=1&exitFrames=120` → 1-pixel diff).

- **ARC-002 / ARC-011 — `World.ts` split.** The 1110-line God object is now a
  570-line thin orchestrator over `Renderer`, `Input`, `Spawner`, and
  `FlowFieldGenerator` (injected collaborators). GL buffer writes moved out of
  `Boid`/`Ring` into `Renderer`; entities expose pure state and no longer touch
  WebGL.
- **ARC-008 — circular imports broken.** An `IWorld` interface in the leaf
  `interfaces.ts`; entities/grids depend on the abstraction, not the concrete
  `World`.
- **ARC-006 / QA-017 — layer bitmask decoupled from storage.** Each layer has a
  dense `[0,layerCount)` slot alongside its query bitmask; `FlowGrid.cell.items`
  is sized to the layer count (the `256` magic removed; 9th+ layers no longer
  overflow).
- **Determinism / agent-operability hooks.** Seeded PRNG (`mulberry32`,
  `?seed=`), `?fixedStep` (fixed 1/60 s timestep), `?exitFrames` (frame-count
  stop), `?width`/`?height` (fixed canvas), `?dumpState` (`window.__zombies`).
  Enables reproducible screenshots and headless verification.
- **Low-priority backlog.** `BoidBehavior.name` readonly; frozen shared
  `IAttractionPointBehaviorOptions` default; exhaustive magic-number → `TUNING`
  extraction in behaviours/shaders; `Ring.draw` slot-write comment; load-bearing
  `resolutions` doc note.
- **Fix:** `boid.fs` heading-stripe comment was prepended above `#include`,
  pushing `#version 300 es` off line 1 and silently breaking fragment-shader
  compilation (the sim crashed on frame 1). Caught by the new screenshot
  equivalence check — latent since it had never been run in a browser.

### Added

- **Build tooling baseline.** ESLint (flat config) + Prettier + Vitest + a
  `Makefile` with the standard targets (`build`, `typecheck`, `test`, `lint`,
  `fmt`, `checkall`, `pre-commit`). CI runs `make checkall`, not just
  `yarn build`.
- **47 unit tests** covering `vec2`, `HashGrid.getDataRadius` (cache
  invariants, layer masking, closest-only, wrap mode, cell-index edges), and
  `Boid.tick` cell-tracking regressions for ARC-001.
- **WebGL context-loss handling.** `webglcontextlost` / `webglcontextrestored`
  listeners now re-run the `init*Gl` methods and re-upload buffers; the
  simulation auto-recovers instead of silently freezing.
- **WebGL2 capability fallback.** If `getContext('webgl2')` returns `null`, the
  app shows a fallback message instead of crashing with a `TypeError`.
- **Resize listener.** The window-resize handler is no longer a no-op curried
  function; resizing the browser actually resizes the canvas and resyncs the
  grid.
- **Pre-commit secret scanning** (gitleaks + detect-private-key) and
  **Dependabot** for both npm and github-actions ecosystems.
- **Documentation:** `CONTRIBUTING.md`, this `CHANGELOG.md`, a project-local
  style guide, a docs index (`docs/README.md`), a troubleshooting runbook
  (`docs/troubleshooting/common-issues.md`), and the relocated TS 7 toolchain
  spec at `docs/architecture/toolchain.md`.

### Changed

- **TypeScript 7 (native) toolchain.** `ts-loader` + `fork-ts-checker-webpack-plugin`
  replaced by `esbuild-loader` for transpilation with the native `tsc` CLI as
  the type gate. `tsc --noEmit` is ~10× faster. See
  [`docs/architecture/toolchain.md`](docs/architecture/toolchain.md).
- **`tsconfig.json` is now `strict: true`.** All previously-silent null/undefined
  paths now surface at compile time.
- **Build mode is explicit.** Scripts use `webpack --mode production|development`;
  webpack sets `NODE_ENV` from `mode` (the previous `--config-node-env` flag was
  a typo and a no-op). Production ships an external `source-map` file rather
  than the inflated inline-source-map bundle.
- **Directory rename:** `src/behaviours/` → `src/behaviors/` (American English,
  consistent with `neighbors`/`color`).

### Fixed

- **ARC-001 — Boid cell-leak.** Every boid silently lived in two cells after
  its first move, doubling all steering/collision/align/separate forces. The
  spatial hash now removes a boid from the cell it actually occupies before
  re-adding it.
- **QA-001 — `vec2.divide()` ignored its `dest` argument** and silently
  mutated `this`. Now honours the same mutate-or-`dest` contract as
  `add`/`subtract`/`multiply`/`scale`.
- **QA-002 — `HashGrid.getDataRadius` cache `.filter()` result was discarded**,
  returning neighbours outside the requested radius. The narrowed-radius path
  now reassigns.
- **Boid heading-stripe render.** The heading stripe is drawn on the leading
  half of the boid so it aligns with the motion direction (encoded as an
  in-shader comment in `src/shaders/boid.fs`).
- **GLSL guards.** Stationary-boid divide-by-zero in `boid.vs` and the
  `length()`/`normalize()` of a scalar in `grid.vs` are now guarded.

### Security

- **Zero dependency vulnerabilities** (`yarn audit` = 0 across 435 deps).
- **`.gitignore` excludes `.claude/`, `.env*`, `*.pem`, `*.key`, `*.local`**
  so per-project agent configuration and secret-bearing files cannot be
  committed by accident.
- **GitHub Actions pinned to commit SHAs**, bumped via Dependabot
  (no floating-major supply-chain risk).
- **Load-bearing `resolutions` block.** The `picomatch` (and historical
    `ajv`) entries in `package.json`'s `resolutions` are intentional
    security/compat pins — they are what drove `yarn audit` to zero
    (commit `fe8a68d`). `package.json` is strict JSON and cannot hold a
    comment, so the rule lives here and in `CONTRIBUTING.md`: **do not
    delete or widen these pins on a `yarn upgrade` without re-running
    `yarn audit` and confirming it still reports 0 vulnerabilities.**

### Removed

- **~2,276 LOC of dead math library** (`mat2.ts`, `mat3.ts`, `mat4.ts`,
  `vec3.ts`, `quat.ts`, and the `map` export from `scalar.ts`). The simulation
  uses twgl.js's `m4` for the only matrix work it actually does; the local
  copies were ~40% of the codebase, shipped in the bundle, and hid the
  `vec2.divide` and shared-mutable-static bugs fixed above.
- **~133 lines of commented-out dead code** across `src/`.

## Pre-history

The following were shipped before this changelog was introduced and are
captured here for completeness. Future work should record entries as they
land.

### Toolchain & CI

- Migrated the build to **TypeScript 7 (native)** via `esbuild-loader`.
- Added the **GitHub Pages deploy workflow** with OIDC-scoped permissions
  and concurrency-based cancel-in-progress.
- Drove dependency vulnerabilities to **zero** and added the `resolutions`
  block (`picomatch`, `ajv`) that the upgrade depended on.

### Render

- Fixed the **boid heading-stripe direction** so the stripe points where the
  boid is going, not where it came from.
- Moved the heading stripe to the **leading half** of the boid so it lines up
  with motion.

### Security

- Added `.gitignore` coverage for `.claude/`, `.env*`, and secret-bearing path
  patterns (AUDIT SEC-002).

## [Unreleased]

_Nothing yet._ Reserve this section for changes that have landed on `main` but
not yet been tagged.
