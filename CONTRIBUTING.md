# Contributing to Zombies Simulator V3

Thanks for investing the time to contribute. This guide describes how to set up
the project, the verification gate every change must pass, the conventions the
commit history already follows, and the two most common kinds of contribution —
adding a behaviour and adding a shader.

A separate [Architecture note](docs/architecture/toolchain.md) covers the
TypeScript 7 / esbuild-loader toolchain decisions. Read that first if you are
touching build config.

## Prerequisites

- **Node.js 20.x** — the same major pinned in CI (`.github/workflows/deploy.yml`).
  Use `node --version` to confirm. Other majors may work but are not tested.
- **Yarn 1.x** (classic) — `npm install -g yarn` if you don't have it.

## Setup

```sh
git clone https://github.com/paulrobello/zombies-v3.git
cd zombies-v3
yarn install
```

`yarn install` respects the `resolutions` block in `package.json`
(`picomatch` is pinned for a known transitive vulnerability). Do not delete
that block when upgrading dependencies.

## Development loop

| Command | Purpose |
| --- | --- |
| `yarn watch` | Rebuild on every file change (watch mode, no dev server). |
| `yarn dev` | One-shot development build (`webpack --mode development`). |
| `yarn start` | Dev server with hot reload and auto-opened browser. |
| `yarn typecheck` | `tsc --noEmit` using the TypeScript 7 native compiler. |
| `yarn test` | Run the Vitest unit-test suite. |
| `yarn lint` | ESLint over the whole tree (flat config). |
| `yarn fmt` | Prettier write over the whole tree. |
| `yarn build` | Type-check then bundle with `webpack --mode production`. |

`yarn start` is the fastest iteration loop for visual changes. `yarn watch` is
preferable when you only want rebuilds without a browser tab (for example,
when driving the build from an editor).

## Verification gate (`make checkall`)

Every change must pass the project's combined gate before merge:

```sh
make checkall
```

This runs `typecheck → lint → test → build` in order, stopping at the first
failure. CI runs the same target (see
`.github/workflows/deploy.yml`), so a green `make checkall` locally means a
green CI run. A failing gate is a blocker — do not merge around it.

Format your changes before pushing:

```sh
make fmt        # Prettier write
make lint       # ESLint
make pre-commit # gitleaks + detect-private-key secret scan
```

## Branch and commit conventions

This repository uses **trunk-based development** on `main` with short-lived
feature branches. Recent history uses **Conventional Commits** — please follow
the same format so changelogs and release notes can be generated mechanically.

### Branch naming

```
<kind>/<short-slug>
```

Examples: `fix/audit-remediation`, `feat/new-layer`, `docs/api-reference`.

### Commit message format

```
<type>(<optional scope>): <imperative summary>
```

Common `type` values used in this repo:

| Type | When |
| --- | --- |
| `feat` | A new simulation feature, behaviour, or shader. |
| `fix` | A bug fix (correctness, render, perf regression). |
| `docs` | Documentation only. |
| `refactor` | Internal restructuring with no behaviour change. |
| `perf` | A performance improvement. |
| `test` | Test additions or fixes. |
| `chore` | Tooling, deps, CI, build config. |
| `security` | A security-relevant change. |

Reference the audit ID when relevant (e.g. `fix(audit): ARC-001 cell-leak`).

### Pull request process

1. Open a PR against `main` from your feature branch.
2. CI runs `make checkall` automatically — it must be green.
3. Request a review; address comments inline.
4. Squash-merge on approval, deleting the feature branch afterwards.

## Project layout

```
src/
  boids/        Entity types (Boid base, Human, Zombie, Food) — Strategy-pattern composition
  behaviors/    Pluggable steering behaviours implementing BoidBehavior
  grids/        Spatial-hash grids (HashGrid, FlowGrid, BoidGrid) and Cell
  math/         Local math primitives (vec2, vec4, scalar) — twgl.js m4 is used for mat4
  shaders/      Static GLSL shaders (.vs/.fs/.glsl), loaded via ts-shader-loader
  World.ts      Orchestrator: owns the grids, GL programs, frame loop, input
docs/
  architecture/ Design notes (toolchain decisions, future system overview)
  troubleshooting/  Operational runbooks (blank/black canvas, etc.)
```

The `behaviors/` directory uses American spelling by policy (audit QA-025);
please do not reintroduce the British `behaviours/`.

## How to add a new behaviour

Behaviours follow the **Strategy pattern**. Each behaviour is a class that
extends `BoidBehavior<T>` and overrides `tick(gameTime)` to add steering
impulses directly onto its boid's velocity (`boid.v`). Behaviours are installed
into a `Boid` subclass's constructor via `this.behaviors.set(name, behavior)`,
optionally disabled at construction and toggled later.

The contract lives in `src/behaviors/BoidBehavior.ts`:

```ts
export class BoidBehavior<T extends Boid> implements IProgressible {
  public name!: string;
  public enabled: boolean;
  public boid: T;
  public scale: number;

  constructor(boid: T, scale: number = 1, options: IBehaviorOptions);

  tick(_gameTime: IGameTime): boolean;   // return true if it applied a force
}
```

- **`enabled`** — set `false` in the options to install a behaviour dormant
  and turn it on later (e.g. `Human.foodFlow` activates only when hunger
  crosses a threshold).
- **`scale`** — the per-behaviour weight applied to its computed impulse.
  Tune relative weights between behaviours rather than their internals.
- **`name`** — assigned by the subclass constructor; used as the
  `behaviors.set(key, …)` key so the same behaviour can be looked up by name
  at runtime.

### Worked example: a "flee from nearest threat" behaviour

```ts
// src/behaviors/FleeBehavior.ts
import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { vec2, clamp, epsilon } from '../math';
import { BoidBehavior, IBehaviorOptions } from './BoidBehavior';

export interface IFleeBehaviorOptions extends IBehaviorOptions {
  margin: number;          // how far away the threat can be and still register
  threatLayer: number;     // grid layer to query (e.g. zombies)
}

export class FleeBehavior<T extends Boid> extends BoidBehavior<T> {
  margin: number;
  threatLayer: number;

  constructor(boid: T, scale: number = 1, options: IFleeBehaviorOptions) {
    super(boid, scale, options);
    this.name = 'FleeBehavior';
    this.margin = options.margin;
    this.threatLayer = options.threatLayer;
  }

  public override tick(_gameTime: IGameTime): boolean {
    if (!this.enabled) return false;
    const b = this.boid;
    const grid = b.options.grid;
    // getDataRadius returns distance-sorted neighbours within `margin`.
    const nearest = grid.getDataRadius(b.p.x, b.p.y, this.margin, true, b, false);
    if (!nearest.length) return false;

    const threat = nearest[0];                 // closest
    const tempD = b.scratch.dTemp;             // reuse the per-Boid scratch vec2
    const d = vec2.difference(threat.data.p, b.p, tempD).scale(-1).normalize();
    const strength = clamp(threat.dist2 / (this.margin * this.margin), 0, 1);
    b.v.x += d.x * strength * this.scale;
    b.v.y += d.y * strength * this.scale;
    return true;
  }
}
```

Install it in a `Boid` subclass constructor:

```ts
// inside Human.constructor
import { FleeBehavior } from '../behaviors/FleeBehavior';
// …
this.behaviors.set('FleeZombies', new FleeBehavior(this, 1.5, {
  enabled: true,
  margin: 120,
  threatLayer: this.options.world.layerByName.zombie,
}));
```

The base `Boid.tick` iterates `this.behaviors.values()` and calls `tick()` on
each, so adding to the map is all that's needed for the new behaviour to take
effect next frame.

### Behaviour conventions

- **Reuse `b.scratch.dTemp`** (and other pre-allocated scratch fields) for
  intermediate `vec2` math — never allocate inside `tick()`. The hot loop runs
  at 60 fps × N boids.
- **Early-out on `!this.enabled`** so toggling a behaviour is free when off.
- **Return `true` only when you applied a force** — this surfaces in debugging
  and future metrics.

## How to add a shader

Shaders are static GLSL files in `src/shaders/` and are imported as strings
via [`ts-shader-loader`](https://github.com/ricardomatias/ts-shader-loader)
(see `webpack.config.js`). Existing programs: `boid`, `grid`, `ring`, plus the
shared `common.glsl`.

1. Create `src/shaders/<name>.vs` and/or `<name>.fs`. The `#include "./common.glsl";`
   macro is available for shared defines (`EPSILON`, etc.).
2. Import them at the top of `src/World.ts`:

   ```ts
   import my_vs_shader from './shaders/myname.vs';
   import my_fs_shader from './shaders/myname.fs';
   ```
3. Compile the program with twgl and set up buffer attributes in a new
   `init<MyName>Gl()` method on `World`, mirroring the existing `initBoidGl`,
   `initGridGl`, and `initRingGl`. Add a `draw<MyName>()` method and call it
   from the frame loop.
4. WebGL2 is the supported context (no WebGL1 fallback). Always handle context
   loss: any new GL state set up in `init<MyName>Gl` is re-established by the
   `webglcontextrestored` handler.

## Licensing

By contributing you agree that your changes will be released under the project's
[MIT license](LICENSE.txt).
