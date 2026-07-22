/**
 * Shared numeric constants. `epsilon` (1e-5) is the canonical "treat as
 * zero" threshold used throughout `src/math`, the simulation, and the
 * shaders (`#define EPSILON 0.00001` in `src/shaders/common.glsl`). Keep
 * the TS and GLSL values in lockstep.
 */
export const epsilon = 0.00001;
export const TWO_PI = Math.PI * 2;
export const TAU = Math.PI * 2;
