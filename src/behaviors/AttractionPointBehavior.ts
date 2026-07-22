/**
 * Steer toward a fixed `IPositional` target (typically a `vec2` point).
 * Force scales with distance — far targets pull harder. Currently commented
 * out in `Boid`'s constructor; kept as a reference behaviour for
 * goal-directed steering.
 */
import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { IPositional } from '../interfaces';
import { clamp, vec2 } from '../math';
import { BoidBehavior, IBehaviorOptions } from './BoidBehavior';

export interface IAttractionPointBehaviorOptions extends IBehaviorOptions {
  target: IPositional;
}

// QA-003 (shared-mutable-static hazard): the default target's `p` is frozen so
// any stray mutation (`opts.target.p.x = 5` or `vec2.zero.add(v)` without a
// `dest`) throws instead of corrupting every consumer of this shared default.
// Matches the `Object.freeze(...) as vec2` pattern used in `src/math/vec2.ts`.
export const AttractionPointBehaviorDefaultOptions: IAttractionPointBehaviorOptions = {
  target: {p: Object.freeze(new vec2(0, 0)) as vec2}
};

// QA-027: per-file tuning knobs. Only the non-obvious distance factor is
// surfaced; the `(m - ml) / m` falloff is self-evident geometry.
const TUNING = {
  // Lower clamp on the pull distance, as a fraction of the larger world
  // dimension. Below this distance the force stops growing (a boid sitting on
  // the target doesn't get an infinite impulse).
  minPullDistanceFactor: 4
};

export class AttractionPointBehavior<T extends Boid> extends BoidBehavior<T> {
  target: IPositional;

  constructor(boid: T, scale: number = 1, options: IAttractionPointBehaviorOptions = AttractionPointBehaviorDefaultOptions) {
    super(boid, 'AttractionPointBehavior', scale, options);
    this.target = options.target;
  }

  public override tick(_gameTime: IGameTime): void {
    if (!this.enabled) return;
    const b = this.boid;
    const p: vec2 = b.p;
    const v: vec2 = b.v;
    const d: vec2 = vec2.difference(this.target.p, p);
    const l: number = d.length();
    const m: number = Math.max(b.grid.width, b.grid.height);
    const ml: number = clamp(d.length(), m / TUNING.minPullDistanceFactor, m);
    d.scale((1 / l) * (m - ml) / m * this.scale);
    v.add(d);
  }
}
