# Zombies Simulator V3

A real-time **WebGL2 boid simulation** in which humans (blue) try to survive an
ever-growing horde of zombies (green). Every entity steers through a shared
flow field — seeking food, flocking, avoiding walls, and converting on contact.

Built with TypeScript, webpack, and [twgl.js](https://twgljs.org/).

**▶ Live demo:** <https://paulrobello.github.io/zombies-v3/>

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

## Tech stack

- **TypeScript 7** — the native (Go) compiler, via `tsc` for type-checking
- **webpack 5** with **esbuild-loader** for fast transpilation
- **twgl.js** / **WebGL2** for instanced rendering of boids, grid, and rings
- **chroma-js** for color gradients (hunger, density)
- **fast-simplex-noise** for procedural flow-field generation

## Local development

Requires [Node.js](https://nodejs.org/) (LTS) and [Yarn](https://yarnpkg.com/) 1.x.

```sh
yarn install        # install dependencies
yarn start          # dev server with hot reload (opens browser)
yarn dev            # one-off development build
yarn typecheck      # tsc --noEmit (TS 7 native)
yarn build          # production build to dist/
```

The type-check gate runs as part of `yarn build` (`tsc --noEmit && webpack`),
so type errors fail the build.

## Deployment

Every push to `main` builds the site and publishes it to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). The built bundle
uses relative asset paths, so it serves correctly from the Pages subpath.

## License

[MIT](LICENSE.txt) © Paul Robello
