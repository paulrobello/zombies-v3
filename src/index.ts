/**
 * App entry point. Loads the stylesheet, parses agent-operability URL params
 * (`?seed=`, `?fixedStep=1`, `?exitAfter=MS`, `?exitFrames=N`,
 * `?width=W&height=H`, `?dumpState=1` — see `src/util/params.ts`), seeds the
 * PRNG BEFORE
 * constructing {@link World} (boid spawn positions and flow-field jitter
 * depend on it), wires top-level error handlers (SEC-006), and starts the
 * render loop — unless the constructor returned with `world.disabled` set
 * (WebGL2 unavailable, QA-009), in which case the user-facing fallback
 * message is already on screen.
 *
 * The module is imported by `webpack` as the bundle entry (see
 * `webpack.config.js`). Side-effectful by design — no exports.
 */
import '../static/css/main.css';
import { World } from './World';
import { setSeed } from './math/random';
import { parseUrlParams } from './util/params';

// SEC-006: top-level error handler so an uncaught exception (e.g. a thrown
// Error that interpolates coordinates) doesn't leave the user with a white
// screen and a raw stack trace in the console. A single console.error keeps
// the failure observable for development without swallowing it silently.
window.addEventListener('error', (event: ErrorEvent) => {
  console.error('[par-zombie3] Uncaught error:', event.message, event.error);
});
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  console.error('[par-zombie3] Unhandled promise rejection:', event.reason);
});

// Agent-operability: parse URL params once at startup. `seed` is set BEFORE
// `new World()` so the per-World field initializers (e.g. `fieldRandomScale`)
// and `initBoids()` spawn positions draw from the deterministic sequence.
// When no `?seed=` is present the PRNG keeps its module-load default (a
// one-shot random value), so the live demo still varies per page-load.
const params = parseUrlParams();
if (params.seed !== null) {
  setSeed(params.seed);
}

const world: World = new World({
  fixedStep: params.fixedStep,
  exitAfter: params.exitAfter,
  exitFrames: params.exitFrames,
  fixedWidth: params.width,
  fixedHeight: params.height,
  dumpState: params.dumpState
});
// QA-009: when WebGL2 is unavailable the constructor shows a fallback message
// and sets `disabled` — do not start the render loop in that state.
if (!world.disabled) {
  world.draw();
}
