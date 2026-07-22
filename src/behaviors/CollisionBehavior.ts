/**
 * Collision detection and response. Two modes selected by the `predictive`
 * option:
 *
 * - **Predictive.** Projects both boids forward by `deltaTime` before
 *   testing overlap, so the avoidance impulse fires before contact. Used by
 *   both `Human` and `Zombie`.
 * - **Reactive (the implicit `else` branch, currently commented off in the
 *   source).** Tests current overlap only.
 *
 * The response combines a separating impulse along the contact normal and a
 * tangential "turn right" impulse so boids slide past each other rather
 * than stacking. Runs at most `iterations` passes per tick; the per-boid
 * `checkedFrame` field is stamped on each neighbour's same-named behaviour
 * so a neighbour processed later in the same frame skips duplicate work.
 *
 * Allocates no vec2s: uses the per-Boid scratch pool (`b.scratch.{t, fp1,
 * fp2, dTemp}`) via the `dest?` convention (QA-012).
 *
 * @see docs/architecture/system-overview.md#srcmath-conventions
 */
import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { clamp, epsilon, vec2 } from '../math';
import { BoidBehavior, IBehaviorOptions } from './BoidBehavior';

// QA-027: per-file tuning knobs for collision response. Exhaustive
// extraction of every numeric literal is backlog; only the non-obvious
// force/radius multipliers are surfaced here.
const TUNING = {
  // Neighbour search radius = b.r * N. Predictive uses a wider shell so the
  // avoidance impulse fires before the overlap actually happens.
  predictiveRadiusFactor: 4,
  nonPredictiveRadiusFactor: 2,
  // Cap on the distance used to normalise the collision-direction vector.
  maxDistanceClamp: 1000,
  // Reactive-collision response force (penetration depth correction impulse).
  collisionResponseForce: 5,
  // Tangential impulse multiplier — boids turn right to slide past each other.
  rotationImpulseScale: 2
};

export interface ICollisionBehaviorOptions  extends IBehaviorOptions{
  margin: number;
  iterations: number;
  layerMask: number;
  predictive: boolean;
}

export class CollisionBehavior<T extends Boid> extends BoidBehavior<T> {
  checkedFrame: number = -1;
  margin: number;
  iterations: number;
  layerMask: number;
  predictive: boolean;

  constructor(boid: T, scale: number, options: ICollisionBehaviorOptions) {
    super(boid, scale, options);

    this.name = 'CollisionBehavior';
    this.margin = options.margin;
    this.iterations = options.iterations;
    this.layerMask = options.layerMask;
    this.predictive = options.predictive;
  }

  public override tick(gameTime: IGameTime): void {
    if (!this.enabled) return;
    if (this.checkedFrame === gameTime.currentFrame) return;
    this.checkedFrame = gameTime.currentFrame;

    const b = this.boid;
    const p: vec2 = b.p;
    const v: vec2 = b.v;
    const grid = b.options.grid;
    // grab all neighbors within N times our radius
    let md = b.r * (this.predictive ? TUNING.predictiveRadiusFactor : TUNING.nonPredictiveRadiusFactor); // max distance
    const nearest = grid.getDataRadius(p.x, p.y, md, true, b, false, this.layerMask);
    if (!nearest.length) return;

    // QA-012: reuse the per-Boid scratch pool instead of allocating four
    // vec2 temporaries every tick. Each named slot is used as a `dest`
    // for at most one call per inner-loop iteration.
    const t = b.scratch.t;
    const dTemp = b.scratch.dTemp;
    const fp1 = b.scratch.fp1;
    const fp2 = b.scratch.fp2;
    if (this.predictive) {
      p.add(v.scale(gameTime.deltaTime, t), fp1);
    }
    let d: vec2;
    let anyHit: boolean = false;
    let l: number;
    for (let i = 0; i < this.iterations; i++) { // currently only 1 iteration
      for (const na of nearest) { // loop over neighbors in range
        const n = na.data; // current neighbor
        // get neighbors behavior and marked it checked, so we can skip it this frame if we have not already processed it
        const nbh: CollisionBehavior<T> | undefined = (n.behaviors.get(this.name) as CollisionBehavior<T>);
        if (nbh) nbh.checkedFrame = gameTime.currentFrame;
        if (this.predictive) {
          // store neighbors future position
          n.p.add(n.v.scale(gameTime.deltaTime, t), fp2);
          // get vector pointing from neighbor to us
          d = vec2.difference(fp1, fp2, dTemp);
          // get distance to neighbor so we can normalize direction
          l = clamp(d.length(), epsilon, md);

          // normalize direction vector and scale force up as boids get closer
          d.scale(1 / l * ((md - clamp(l - (b.r + n.r), 0, md) / md)) * gameTime.deltaTime * this.scale);
          // apply breaking force
          v.add(d);
          // apply opposite breaking force to neighbor
          n.v.add(d.scale(-1, t));
          // rotate right 90 deg
          d.rotateRight();
          // turn to the right
          v.add(d.scale(TUNING.rotationImpulseScale));
          // neighbor turns to the left
          n.v.add(d.scale(-1));
        }
        // else {
          // actual collision
          let r = b.r + n.r + this.margin;
          // vector from neighbor to us
          d = vec2.difference(p, n.p, dTemp);
          let l2 = d.squaredLength();
          if (l2 < r * r) {
            anyHit = true;
            l = clamp(Math.sqrt(l2), epsilon, TUNING.maxDistanceClamp);
            d.scale(1 / l * gameTime.deltaTime * TUNING.collisionResponseForce);
            // compute half penetration depth
            const pd = (r - l) / 2;
            // back us up
            p.x += d.x * pd;
            p.y += d.y * pd;
            // back neighbor up
            n.p.x += d.x * -pd;
            n.p.y += d.y * -pd;

            v.add(d.scale(b.speed, t));
            n.v.add(d.scale(-n.speed));
          } // if overlap
        // }
      } // for na of nearest
      if (!anyHit) break;
    } // iterations
  } // tick
}
