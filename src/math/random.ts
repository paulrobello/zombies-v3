/**
 * Seeded pseudo-random number generator — the canonical replacement for
 * `Math.random()` across the simulation. Makes the sequence of "random"
 * values reproducible given a seed, which is required for deterministic
 * screenshot-equivalence testing of the upcoming `World` split
 * (audit ARC-002 cluster — see AUDIT-REMEDIATION.md).
 *
 * Design:
 *
 * - **Algorithm**: mulberry32 — a single-uint32-state PRNG with good
 *   statistical quality for simulation use, tiny state (one 32-bit int),
 *   and a fast inner loop. Not cryptographic; never use for security tokens.
 * - **Module-level instance**: a single module-level `state` is mutated by
 *   each {@link rand} call, and {@link setSeed} resets it. This mirrors
 *   `Math.random` ergonomics (no PRNG instance to thread through call sites)
 *   while making the sequence reproducible.
 * - **Load-time seeding**: at module load the seed is taken from `?seed=N`
 *   in the URL if present (see {@link parseSeedFromUrl}); otherwise from a
 *   one-shot `Math.random() >>> 0`. The live demo therefore still varies
 *   per page-load, but a test/agent harness can pin the seed via the URL
 *   to get a deterministic run. The single remaining `Math.random` call in
 *   this module is that one-shot fallback — every other call site in `src/`
 *   routes through {@link rand}.
 * - **SSR guard**: `parseSeedFromUrl` returns `null` when `window` is
 *   undefined (e.g. a Vitest `node` import) so the module loads cleanly
 *   outside a browser, falling back to the random seed.
 *
 * @see src/util/params.ts — parses the other agent-operability URL params.
 */
const UINT32_MOD: number = 4294967296; // 2**32

/**
 * Read `?seed=N` (integer) from `window.location.search`. Returns the seed
 * as an unsigned 32-bit integer, or `null` if absent, non-numeric, or when
 * running outside a browser (no `window`). Safe to call at module load.
 */
export function parseSeedFromUrl(): number | null {
  if (typeof window === 'undefined') return null;
  const search: string = window.location.search;
  if (!search) return null;
  const raw: string | null = new URLSearchParams(search).get('seed');
  if (raw === null) return null;
  const parsed: number = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed >>> 0;
}

// Initial seed: explicit `?seed=` from URL, else a one-shot random value.
// This is the ONLY use of `Math.random` permitted in this module — it seeds
// the PRNG that replaces `Math.random` everywhere else.
const initialSeed: number = parseSeedFromUrl() ?? ((Math.random() * UINT32_MOD) >>> 0);

let currentSeed: number = initialSeed >>> 0;
let state: number = currentSeed;

/**
 * Reset the PRNG to the given seed. After this call, the sequence of values
 * returned by {@link rand} is deterministic for that seed.
 */
export function setSeed(seed: number): void {
  currentSeed = seed >>> 0;
  state = currentSeed;
}

/**
 * The seed the PRNG was last set to — either via {@link setSeed}, the URL,
 * or the one-shot fallback at module load. Useful for "what seed produced
 * this run?" debugging: log this on a screenshot to reproduce the sequence.
 */
export function getSeed(): number {
  return currentSeed;
}

/**
 * Returns the next pseudo-random number in `[0, 1)`, advancing the module
 * state. Drop-in replacement for `Math.random()` — same range, but the
 * sequence is deterministic given the seed.
 */
export function rand(): number {
  state = (state + 0x6d2b79f5) | 0;
  let t: number = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t = t ^ (t + Math.imul(t ^ (t >>> 7), t | 61));
  return ((t ^ (t >>> 14)) >>> 0) / UINT32_MOD;
}
