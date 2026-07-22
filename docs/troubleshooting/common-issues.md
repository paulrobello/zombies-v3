# Troubleshooting

Common issues with the live demo (https://paulrobello.github.io/zombies-v3/)
and local development. For build/toolchain decisions, see
[../architecture/toolchain.md](../architecture/toolchain.md).

## Blank or white canvas

**Likely cause:** the browser does not support **WebGL2**.

The simulation requires WebGL2 (it uses instanced rendering and GLSL ES 3.00).
On browsers without WebGL2 the app now shows a fallback banner instead of
crashing; if you see neither the canvas nor the banner, the failure is earlier
in the bundle.

**Browser support floor:**

- Chrome / Edge 113+ (2023)
- Firefox 102+ (ESR)
- Safari 15+ (macOS 11+), Safari on iOS 15+

**Fix:**

- Confirm support at <https://get.webgl.org/webgl2/>.
- On Linux, ensure accelerated drivers are installed (`glxinfo | grep "OpenGL version"`).
- Disable "software rendering" overrides in `chrome://flags` if set.

## Black canvas after backgrounding the tab

**Likely cause:** the **WebGL context was lost** when the OS reclaimed GPU
memory (common on macOS when backgrounding a GPU-heavy tab, or after the
machine went to sleep).

The app now listens for `webglcontextlost` and `webglcontextrestored` and
re-builds the GL programs and buffers automatically, so most context losses
self-heal within a frame.

**If the canvas stays black after the tab is focused again:**

1. Reload the page (`Cmd-R` / `Ctrl-R`). A fresh context is created on load.
2. Check the browser console — a persistent `webglcontextrestored` failure
   will print the failing `init*Gl` step.
3. On macOS with an external GPU, ejecting/reconnecting the eGPU can leave the
   context in a bad state; restart the browser.

## Shader compile failures

Shaders are **static** GLSL files in `src/shaders/` compiled once at startup;
there is no runtime shader generation, so shader-injection is not a vector. A
compile failure at load time almost always means the GPU driver rejected valid
GLSL ES 3.00 (rare, but possible on outdated drivers).

**Diagnosis:**

1. Open the browser devtools console.
2. Look for a `*** Shader compile errors ***` block printed by twgl. The full
   info log is included.
3. Cross-check the failing shader source in `src/shaders/`.

**Fix:** update the GPU driver. If you are editing a shader locally, revert
your change and re-run `yarn start` — the shipped shaders compile on every
push to `main` via CI (`make checkall`).

## `yarn start` opens a tab but nothing renders

**Likely causes, in order of likelihood:**

1. **You didn't run `yarn install` after pulling.** A stale `node_modules`
   trips up `esbuild-loader`. Run `yarn install` and reload.
2. **`yarn install` finished but webpack is still bundling.** The dev server
   serves the page before the first bundle is ready. Wait for the
   "compiled successfully" line in the terminal, then reload.
3. **A previous `yarn start` is still running** and holding the port.
   Check `lsof -i :8080` and kill the orphan.
4. **WebGL2 unsupported** — see "Blank or white canvas" above.

## `make checkall` fails locally but passed CI

Almost always a stale type cache or a format drift. In order:

```sh
yarn fmt           # apply Prettier
yarn lint --fix    # apply ESLint autofixes
yarn typecheck     # TS 7 native tsc --noEmit
yarn test          # Vitest
yarn build         # production webpack bundle
```

If `yarn typecheck` reports errors you can't reproduce in CI, confirm you are
on Node 20 (`node --version`); TypeScript 7's native compiler assumes a
recent Node runtime.

## Dev commands

The full set, mirrored from `package.json` and the `Makefile`:

| Command | Purpose |
| --- | --- |
| `yarn install` | Install dependencies (honours the `resolutions` block). |
| `yarn watch` | Rebuild on every file change (no dev server). |
| `yarn dev` | One-shot development build (`webpack --mode development`). |
| `yarn start` | Dev server with hot reload and auto-opened browser. |
| `yarn typecheck` | `tsc --noEmit` (TypeScript 7 native). |
| `yarn test` | Vitest unit tests. |
| `yarn lint` | ESLint (flat config). |
| `yarn fmt` | Prettier write over the whole tree. |
| `yarn build` | Type-check then bundle with `webpack --mode production`. |
| `make checkall` | The full gate: typecheck + lint + test + build. |
| `make pre-commit` | gitleaks + detect-private-key secret scan. |

## Reporting a new issue

If none of the above matches, capture the following and open an issue:

1. Browser and OS version.
2. The exact URL (the GitHub Pages path carries no query params, so the
   deployed commit is the one shown in the footer or the most recent
   [`main` commit](https://github.com/paulrobello/zombies-v3/commits/main)).
3. The browser console output from a fresh reload.
4. Whether `glxinfo` / `about:gpu` reports WebGL2 support.

For source-level bugs, run `make checkall` locally and include the failing
step's output.
