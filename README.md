# Zombies Simulator V3

A real-time **WebGL2 boid simulation** in which humans (blue) try to survive an
ever-growing horde of zombies (green). Every entity steers through a shared
flow field — seeking food, flocking, avoiding walls, and converting on contact.

Built with TypeScript, webpack, and [twgl.js](https://twgljs.org/).

**▶ Live demo:** <https://zombies-v3.pardev.net>

![CI](https://github.com/paulrobello/zombies-v3/actions/workflows/deploy.yml/badge.svg)

## How it works

- **Humans** (blue) wander, flock, and grow hungry over time. The hungrier a
  human gets, the more it turns red and prioritizes finding **food** (yellow).
  A human that doesn't eat starves.
- **Zombies / "zed"** (green) chase humans. When a zombie touches a human, the
  human dies and is converted into a zombie — a red ring emanates from the new
  zombie to signal the conversion.
- Newly converted zombies are stunned for 3 seconds: they can't move or convert
  anyone.
- The world is a **paintable flow field**. You sculpt where and how things move
  by drawing walls and flow strokes, per layer:

| Layer | Color | Affects |
|-------|-------|---------|
| Boid  | white | both humans and zombies |
| Human | blue  | humans only |
| Zombie| green | zombies only |
| Food  | yellow| food-seeking humans |

## Controls

| Input | Action |
|-------|--------|
| `H` | Toggle the in-app help panel |
| `G` | Cycle the grid debug draw mode (none / flow / boid) |
| `0`–`9` | Set flow brush size |
| **Left click** | Add flow / wall |
| **Right click** | Remove flow / wall |
| **Middle click** | Cycle flow paint mode (wall → stroke → attract → repel) |
| **Shift + middle click** | Cycle flow layer (boid / human / zombie / food) |
| **Shift + click** | Alter *static* flows |

Paint modes: **wall** (white, solid), **flow stroke** (blue, direction of drag),
**attract** (green, toward center), **repel** (red, away from center).

## Screenshots

<!-- TODO: capture screenshot -->

![Simulation screenshot](docs/img/screenshot.png)

_A screenshot should be captured from the
[live demo](https://zombies-v3.pardev.net) and saved to
`docs/img/screenshot.png` (or replace the link above with a GIF)._

## Tech stack

- **TypeScript 7** — the native (Go) compiler, via `tsc` for type-checking
- **webpack 5** with **esbuild-loader** for fast transpilation
- **twgl.js** / **WebGL2** for instanced rendering of boids, grid, and rings
- **chroma-js** for color gradients (hunger, density)
- **fast-simplex-noise** for procedural flow-field generation

## Local development

Requires **[Node.js 20](https://nodejs.org/)** (the major pinned in CI; other
versions may work but are not tested) and **[Yarn](https://yarnpkg.com/) 1.x**
(classic).

```sh
yarn install        # install dependencies (honours the `resolutions` block)
yarn start          # dev server with hot reload (opens browser)
yarn watch          # rebuild on every change (no dev server)
yarn dev            # one-shot development build
yarn typecheck      # tsc --noEmit (TS 7 native compiler)
yarn test           # run the Vitest unit-test suite
yarn lint           # ESLint (flat config)
yarn fmt            # Prettier write over the whole tree
yarn build          # type-check + production bundle to dist/
```

The dev scripts (`watch` / `dev` / `start`) invoke webpack with
`--mode development`; `yarn build` invokes it with `--mode production`.
Webpack derives `NODE_ENV` from `mode`, so `process.env.NODE_ENV === 'production'`
inside the bundle only on a production build. See
[`webpack.config.js`](webpack.config.js) and
[`docs/architecture/toolchain.md`](docs/architecture/toolchain.md) for details.

The project also has a `Makefile` with the standard targets. The full
verification gate is:

```sh
make checkall       # typecheck → lint → test → build (must pass before merge)
```

CI (`.github/workflows/deploy.yml`) runs the same `make checkall`, so a green
run locally is a green run in CI. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for
the branch/PR workflow and [`docs/troubleshooting/common-issues.md`](docs/troubleshooting/common-issues.md)
for diagnosing build/runtime failures.

## Deployment

Every push to `main` builds the site and publishes it to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). The built bundle
uses relative asset paths, so it serves correctly from the Pages subpath.

## License

[MIT](LICENSE.txt) © Paul Robello
