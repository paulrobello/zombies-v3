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

export const map = (current: number, in_min: number, in_max: number, out_min: number, out_max: number): number => {
  const mapped: number = ((current - in_min) * (out_max - out_min)) / (in_max - in_min) + out_min;
  return clamp(mapped, out_min, out_max);
};
