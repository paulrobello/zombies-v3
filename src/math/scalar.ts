/**
 * Scalar helpers shared across the simulation. `clamp` is NaN/finiteness-
 * aware (NaN → `min`, ±Infinity → `max`) so a stray `NaN` from a degenerate
 * `vec2` operation cannot propagate into a position or velocity. `wrap`
 * modulo-adds `max` until the value lands in `[0, max)` (used by
 * `HashGrid.getCellIndex` on the wrap-enabled grids).
 */
export const clamp = (input: number, min: number, max: number): number => {
  if (isNaN(input)) return min;
  if (!isFinite(input)) return max;
  return input < min ? min : input > max ? max : input;
};
export const wrap = (value: number, max: number): number => {
  while (value < 0) value += max;
  while (value >= max) value -= max;
  return value;
};

