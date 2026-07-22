/**
 * Steer toward (or away from, with negative `scale`) the nearest entity on
 * a given layer. Used by `Human` to seek food (`scale > 0`, `nearest = true`)
 * and avoid zombies (`scale = -2`, `nearest = false` — average over all
 * zombies in range), and by `Zombie` to chase humans.
 *
 * `breakingDistance` + `breakingPower` apply a decelerating impulse when
 * the boid is close enough to its target and moving above
 * `TUNING.breakingSpeedFraction` of `maxSpeed`, so a seeking boid slows on
 * approach rather than overshooting.
 *
 * `lastResults` caches the most recent `getDataRadius` return for inspection
 * (debug draw); it is not used to short-circuit the next tick.
 */
import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { BoidGrid } from '../grids/BoidGrid';
import { IDataRadiusResults } from '../grids/HashGrid';
import { vec2, epsilon, clamp } from '../math';
import { BoidBehavior, IBehaviorOptions } from './BoidBehavior';

// QA-027: per-file tuning knob. Only the non-obvious speed-fraction
// threshold is surfaced; self-evident geometric literals (`b.r * 2`,
// the `(r + 1) - dist` falloff) stay inline.
const TUNING = {
  // When within breakingDistance and moving above this fraction of maxSpeed,
  // the boid applies a decelerating impulse. 0.5 = "half speed or faster".
  breakingSpeedFraction: 0.5
};

export interface ISteerLayerBehaviorOptions extends IBehaviorOptions {
  radius: number;
  layerName: string;
  nearest: boolean;
  breakingDistance: number;
  breakingPower: number;
}

export class SteerLayerBehavior<T extends Boid> extends BoidBehavior<T> {
  layerId: number;
  radius: number;
  layerName: string;
  nearest: boolean;
  lastResults: IDataRadiusResults<Boid> = [];
  breakingDistance: number;
  breakingPower: number;

  constructor(boid: T, scale: number, options: ISteerLayerBehaviorOptions) {
    super(boid, 'SteerLayerBehavior', scale, options);
    this.radius = options.radius;
    this.layerName = options.layerName;
    this.nearest = options.nearest;
    this.layerId = boid.World.layerByName(options.layerName);
    this.breakingDistance = options.breakingDistance;
    this.breakingPower = options.breakingPower;
  }

  public override tick(gameTime: IGameTime): void {
    if (!this.enabled) return;

    const b: Boid = this.boid;
    const p: vec2 = b.p;
    const v: vec2 = b.v;
    const grid: BoidGrid = b.options.grid;
    const r: number = b.r * 2 + this.radius;
    const nearest: IDataRadiusResults<Boid> = grid.getDataRadius(p.x, p.y, r, true, b, this.nearest, this.layerId);
    this.lastResults = nearest;
    if (!nearest.length) return;

    // QA-012: reuse the per-Boid scratch vec2 instead of allocating per tick.
    const t = b.scratch.t;
    for (const na of nearest) {
      const d2 = na.dist2;
      const dist = clamp(Math.sqrt(d2), epsilon, r);
      let l = dist;
      const d = na.dv.scale(1 / l, t);
      l = l * gameTime.deltaTime * this.scale;
      // l *= ((r + 1) - dist) / r;
      if (dist < this.breakingDistance && b.speed > b.maxSpeed * TUNING.breakingSpeedFraction) {
        v.scale(1 - gameTime.deltaTime * this.breakingPower);
      }
      v.x += d.x * l;
      v.y += d.y * l;
    }
  }
}
