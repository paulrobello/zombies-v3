/**
 * Startup URL-parameter parsing for agent-operability. Reads
 * `window.location.search` once at module load and exposes a typed
 * {@link UrlParams} consumed by `src/index.ts` to wire the simulation into
 * a deterministic, self-terminating, fixed-size mode for screenshot
 * equivalence testing.
 *
 * Parameters (all opt-in — when absent, defaults preserve today's behavior):
 *
 * - `?seed=N`           — seeds the PRNG in `src/math/random.ts`. Set before
 *                         `new World()` so spawn positions and flow-field
 *                         jitter are reproducible.
 * - `?fixedStep=1`      — locks `GameClock.deltaTime` to `1/60`s per frame
 *                         regardless of real elapsed time, so a slow or fast
 *                         frame cannot perturb the simulation.
 * - `?exitAfter=MS`     — `World` cancels its RAF after `MS` milliseconds
 *                         of wall-clock time. The framebuffer freezes on
 *                         the last fully-rendered frame.
 * - `?exitFrames=N`     — `World` cancels its RAF after `N` logical frames;
 *                         preferred over `?exitAfter` for deterministic screenshot
 *                         equivalence (independent of wall clock / refresh).
 * - `?width=W&height=H` — forces the canvas to fixed pixel dimensions; the
 *                         window-resize listener will not overwrite them.
 * - `?dumpState=1`      — exposes `window.__zombies` with live simulation
 *                         state for an external driver to inspect without
 *                         the DOM.
 *
 * Outside a browser (`typeof window === 'undefined'`), every field takes
 * its default so the module is safe to import from a Vitest `node` test.
 */
import { parseSeedFromUrl } from '../math/random';

export interface UrlParams {
  /** Integer PRNG seed, or `null` to use the per-load random fallback. */
  seed: number | null;
  /** True iff `?fixedStep=1` (or `?fixedStep=`) is present. */
  fixedStep: boolean;
  /** Exit the RAF loop after this many milliseconds, or `null` to never exit. */
  exitAfter: number | null;
  /** Exit the RAF loop after this many logical frames, or `null` to never exit.
   *  Frame-count stop is independent of wall clock / display refresh — the
   *  deterministic-capture mode for screenshot equivalence. */
  exitFrames: number | null;
  /** Forced canvas width in pixels, or `null` to size from the window. */
  width: number | null;
  /** Forced canvas height in pixels, or `null` to size from the window. */
  height: number | null;
  /** True iff `?dumpState=1` (or `?dumpState=`) is present. */
  dumpState: boolean;
}

/**
 * Parse a `?key=value` flag from `window.location.search`. Returns `true`
 * iff the key is present and its value is `"1"` or empty. Returns `false`
 * outside a browser or when the key is absent.
 */
function parseFlag(key: string): boolean {
  if (typeof window === 'undefined') return false;
  const search: string = window.location.search;
  if (!search) return false;
  const raw: string | null = new URLSearchParams(search).get(key);
  if (raw === null) return false;
  return raw === '1' || raw === '';
}

/**
 * Parse a non-negative integer query parameter. Returns `null` if absent,
 * non-numeric, negative, or running outside a browser.
 */
function parsePositiveInt(key: string): number | null {
  if (typeof window === 'undefined') return null;
  const search: string = window.location.search;
  if (!search) return null;
  const raw: string | null = new URLSearchParams(search).get(key);
  if (raw === null) return null;
  const parsed: number = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/**
 * Read all agent-operability params from the URL. Called once from
 * `src/index.ts` at startup; the parse is O(length of search string) and
 * does not touch the DOM.
 */
export function parseUrlParams(): UrlParams {
  return {
    seed: parseSeedFromUrl(),
    fixedStep: parseFlag('fixedStep'),
    exitAfter: parsePositiveInt('exitAfter'),
    exitFrames: parsePositiveInt('exitFrames'),
    width: parsePositiveInt('width'),
    height: parsePositiveInt('height'),
    dumpState: parseFlag('dumpState')
  };
}
