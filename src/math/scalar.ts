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

