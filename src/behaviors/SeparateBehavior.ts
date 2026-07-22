/**
 * Classic boids "separation" — steer away from nearby neighbours to avoid
 * crowding. Force scales with proximity: closer neighbours contribute a
 * stronger perpendicular (rotate-right) impulse. Currently commented out
 * in `Boid`'s constructor; kept as a reference behaviour.
 */
import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { vec2, epsilon, clamp } from '../math';
import { BoidBehavior, IBehaviorOptions } from './BoidBehavior';

// QA-027: per-file tuning knobs. Only non-obvious force/distance multipliers
// are surfaced; self-evident geometric literals (`b.r * 2`, array indices)
// stay inline.
const TUNING = {
  // Cap on the distance used to normalise the separation-direction vector,
  // matching the clamp in CollisionBehavior / FlowBehavior.
  maxDistanceClamp: 1000
};

export interface ISeparateBehaviorOptions extends IBehaviorOptions {
  margin: number;
}

export const DefaultSeparateBehaviorOptions: ISeparateBehaviorOptions = {
  margin: 10
};

export class SeparateBehavior<T extends Boid> extends BoidBehavior<T> {
  margin: number;

  constructor(boid: T, scale: number = 1, options: ISeparateBehaviorOptions = DefaultSeparateBehaviorOptions) {
    super(boid, 'SeparateBehavior', scale, options);
    this.margin = options.margin;
  }

  public override tick(_gameTime: IGameTime): void {
    if (!this.enabled) return;

    const b = this.boid;
    const p: vec2 = b.p;
    const v: vec2 = b.v;
    const grid = b.options.grid;
    const r = b.r * 2 + this.margin;
    const nearest = grid.getDataRadius(p.x, p.y, r, true, b, false);
    if (!nearest.length) return;

    // QA-012: reuse the per-Boid scratch vec2 instead of allocating per tick.
    const tempD = b.scratch.dTemp;
    for (const na of nearest) {
      const n = na.data;
      const d2 = na.dist2;
      let dist = clamp(Math.sqrt(d2), epsilon, TUNING.maxDistanceClamp);
      const d = vec2.difference(n.p, p, tempD).scale(1 / dist).rotateRight();
      dist = (r - dist) / r;
      v.x += d.x * dist * this.scale;
      v.y += d.y * dist * this.scale;
    }
  }
}
