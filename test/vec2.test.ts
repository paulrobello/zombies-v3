import { describe, it, expect } from 'vitest';
import { vec2 } from '../src/math';

/**
 * QA-004 vec2 unit coverage. The vec2 API is hand-rolled and underlies every
 * boid/grid/behaviour computation; one silent regression in `divide`'s dest
 * handling (QA-001) already shipped, so these tests pin the dest contract
 * plus the basic algebraic invariants the simulation relies on.
 *
 * Conventions under test:
 *   - `dest?` out-param: when omitted, the method mutates `this`; when
 *     provided, it writes to `dest` and leaves `this` unchanged.
 *   - Static factory methods (`vec2.sum/difference/product/quotient/direction`)
 *     follow the same dest contract, defaulting to a fresh vec2.
 *   - Algebraic invariants: multiply/divide and add/subtract are inverses,
 *     normalize is idempotent on a non-zero vector, length/lengthSq agree.
 *
 * QA-003 regression coverage lives at the bottom: the shared static
 * "constants" (`vec2.zero`, `vec2.up`, ...) are Object.freeze'd so any stray
 * mutation throws (or fails silently outside strict mode) instead of
 * corrupting every consumer.
 */

describe('vec2', () => {
  // ---------------------------------------------------------------------------
  // QA-001 regression: dest contract on the instance methods.
  // ---------------------------------------------------------------------------

  describe('dest out-param contract (QA-001 regression)', () => {
    it('divide writes to dest and leaves this unchanged when dest is provided', () => {
      const a = new vec2(10, 20);
      const b = new vec2(2, 4);
      const dest = new vec2(0, 0);

      const result = a.divide(b, dest);

      expect(result).toBe(dest);           // returns the dest it wrote to
      expect(dest.x).toBe(5);              // 10 / 2
      expect(dest.y).toBe(5);              // 20 / 4
      // Critical: `a` (this) must be untouched when dest is supplied.
      expect(a.x).toBe(10);
      expect(a.y).toBe(20);
    });

    it('divide mutates this when dest is omitted', () => {
      const a = new vec2(10, 20);
      const b = new vec2(2, 4);

      const result = a.divide(b);

      expect(result).toBe(a);
      expect(a.x).toBe(5);
      expect(a.y).toBe(5);
    });

    it('multiply honours dest (writes to dest, leaves this unchanged)', () => {
      const a = new vec2(3, 5);
      const b = new vec2(2, 4);
      const dest = new vec2();

      a.multiply(b, dest);

      expect(dest.x).toBe(6);
      expect(dest.y).toBe(20);
      expect(a.x).toBe(3);
      expect(a.y).toBe(5);
    });

    it('multiply mutates this when dest is omitted', () => {
      const a = new vec2(3, 5);
      const b = new vec2(2, 4);

      a.multiply(b);

      expect(a.x).toBe(6);
      expect(a.y).toBe(20);
    });

    it('add honours dest', () => {
      const a = new vec2(1, 2);
      const b = new vec2(10, 20);
      const dest = new vec2();

      a.add(b, dest);

      expect(dest.x).toBe(11);
      expect(dest.y).toBe(22);
      expect(a.x).toBe(1);
      expect(a.y).toBe(2);
    });

    it('subtract honours dest', () => {
      const a = new vec2(10, 20);
      const b = new vec2(1, 2);
      const dest = new vec2();

      a.subtract(b, dest);

      expect(dest.x).toBe(9);
      expect(dest.y).toBe(18);
      expect(a.x).toBe(10);
      expect(a.y).toBe(20);
    });

    it('scale honours dest', () => {
      const a = new vec2(3, 4);
      const dest = new vec2();

      a.scale(2.5, dest);

      expect(dest.x).toBe(7.5);
      expect(dest.y).toBe(10);
      expect(a.x).toBe(3);
      expect(a.y).toBe(4);
    });

    it('copy honours dest (and allocates when dest omitted)', () => {
      const a = new vec2(7, 9);

      const dest = new vec2();
      a.copy(dest);
      expect(dest.x).toBe(7);
      expect(dest.y).toBe(9);
      expect(a.x).toBe(7); // copy never mutates this
      expect(a.y).toBe(9);

      const fresh = a.copy();
      expect(fresh).not.toBe(a);
      expect(fresh.x).toBe(7);
      expect(fresh.y).toBe(9);
    });
  });

  // ---------------------------------------------------------------------------
  // Algebraic invariants / property-style coverage.
  // ---------------------------------------------------------------------------

  describe('algebraic invariants', () => {
    it('multiply and divide are inverses', () => {
      const a = new vec2(7, 11);
      const factor = new vec2(3, 5);
      const scratch = new vec2();

      // a * factor / factor == a (use dest on each step)
      a.multiply(factor, scratch).divide(factor, scratch);

      expect(scratch.x).toBeCloseTo(7, 10);
      expect(scratch.y).toBeCloseTo(11, 10);
      // original untouched because dest was supplied throughout
      expect(a.x).toBe(7);
      expect(a.y).toBe(11);
    });

    it('add and subtract are inverses', () => {
      const a = new vec2(2, 3);
      const b = new vec2(50, 60);

      // Mutate-then-reverse: a + b - b == a
      a.add(b).subtract(b);

      expect(a.x).toBeCloseTo(2, 10);
      expect(a.y).toBeCloseTo(3, 10);
    });

    it('normalize yields a unit vector and is idempotent on non-zero input', () => {
      const v = new vec2(3, 4);

      v.normalize();

      expect(v.length()).toBeCloseTo(1, 10);

      // Idempotent: normalising an already-unit vector returns the same vector.
      const before = v.xy();
      v.normalize();
      expect(v.x).toBeCloseTo(before[0], 10);
      expect(v.y).toBeCloseTo(before[1], 10);
    });

    it('normalize on a zero vector yields zero (no NaN)', () => {
      const v = new vec2(0, 0);
      v.normalize();
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
      expect(Number.isNaN(v.x)).toBe(false);
      expect(Number.isNaN(v.y)).toBe(false);
    });

    it('length and squaredLength agree', () => {
      const v = new vec2(3, 4);
      expect(v.squaredLength()).toBe(25);
      expect(v.length()).toBeCloseTo(5, 10);
    });

    it('scale by 2 doubles the length', () => {
      const v = new vec2(3, 4);
      const before = v.length();
      v.scale(2);
      expect(v.length()).toBeCloseTo(before * 2, 10);
    });

    it('distanceTo and squaredDistanceTo agree with subtract', () => {
      const a = new vec2(0, 0);
      const b = new vec2(3, 4);
      expect(a.squaredDistanceTo(b)).toBe(25);
      expect(a.distanceTo(b)).toBeCloseTo(5, 10);
    });
  });

  // ---------------------------------------------------------------------------
  // Static factory methods — dest contract + algebraic correctness.
  // ---------------------------------------------------------------------------

  describe('static factories', () => {
    it('vec2.difference(a, b) returns a - b and honours dest', () => {
      const a = new vec2(10, 20);
      const b = new vec2(3, 5);
      const dest = new vec2();

      const result = vec2.difference(a, b, dest);

      expect(result).toBe(dest);
      expect(dest.x).toBe(7);
      expect(dest.y).toBe(15);
      expect(a.x).toBe(10);
      expect(a.y).toBe(20);
      expect(b.x).toBe(3);
      expect(b.y).toBe(5);
    });

    it('vec2.sum allocates when dest is omitted', () => {
      const a = new vec2(1, 2);
      const b = new vec2(3, 4);

      const result = vec2.sum(a, b);

      expect(result).not.toBe(a);
      expect(result).not.toBe(b);
      expect(result.x).toBe(4);
      expect(result.y).toBe(6);
    });

    it('vec2.product and vec2.quotient are inverses', () => {
      const a = new vec2(6, 12);
      const b = new vec2(2, 3);

      const product = vec2.product(a, b);
      const recovered = vec2.quotient(product, b);

      expect(recovered.x).toBeCloseTo(6, 10);
      expect(recovered.y).toBeCloseTo(12, 10);
    });

    it('vec2.direction returns a unit vector', () => {
      const a = new vec2(0, 0);
      const b = new vec2(3, 4);

      const dir = vec2.direction(a, b);

      // Points from a toward b (note: vec2.direction subtracts the second arg).
      expect(dir.length()).toBeCloseTo(1, 10);
    });

    it('vec2.dot and vec2.cross match their algebraic definitions', () => {
      const a = new vec2(1, 2);
      const b = new vec2(3, 4);

      expect(vec2.dot(a, b)).toBe(1 * 3 + 2 * 4);
      expect(vec2.cross(a, b)).toBe(1 * 4 - 2 * 3);
    });
  });

  // ---------------------------------------------------------------------------
  // QA-003 regression: shared static "constants" are frozen.
  // ---------------------------------------------------------------------------

  describe('QA-003: shared static constants are frozen', () => {
    it('vec2.zero/one/up/down/left/right have the expected values', () => {
      expect(vec2.zero.x).toBe(0);
      expect(vec2.zero.y).toBe(0);
      expect(vec2.one.x).toBe(1);
      expect(vec2.one.y).toBe(1);
      expect(vec2.up.x).toBe(0);
      expect(vec2.up.y).toBe(1);
      expect(vec2.down.y).toBe(-1);
      expect(vec2.left.x).toBe(-1);
      expect(vec2.right.x).toBe(1);
    });

    it('mutating vec2.zero throws (strict-mode freeze)', () => {
      expect(() => {
        vec2.zero.x = 42;
      }).toThrow(TypeError);
    });

    it('calling a mutating method on vec2.up without a dest throws', () => {
      // add() with no dest writes to `this` — `this` is the frozen vec2.up.
      expect(() => {
        vec2.up.add(new vec2(1, 1));
      }).toThrow(TypeError);
    });

    it('a frozen static used as a dest also throws (catches accidental reuse)', () => {
      const v = new vec2(5, 5);
      expect(() => {
        v.add(new vec2(1, 1), vec2.zero);
      }).toThrow(TypeError);
    });
  });
});
