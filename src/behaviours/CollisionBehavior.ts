import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { clamp, epsilon, vec2 } from '../math';
import { BoidBehavior, IBehaviorOptions } from './BoidBehavior';

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

  public override tick(gameTime: IGameTime): boolean {
    if (!this.enabled) return false;
    if (this.checkedFrame === gameTime.currentFrame) return false;
    this.checkedFrame = gameTime.currentFrame;

    const b = this.boid;
    const p: vec2 = b.p;
    const v: vec2 = b.v;
    const grid = b.options.grid;
    // grab all neighbors within 4 times our radius
    let md = b.r * (this.predictive ? 4 : 2); // max distance
    const nearest = grid.getDataRadius(p.x, p.y, md, true, b, false, this.layerMask);
    if (!nearest.length) return false;

    const t = new vec2(); // temp var
    const dTemp = new vec2(); // temp var
    const fp1 = new vec2(); // current boid future position
    const fp2 = new vec2(); // neighbor boid future position
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
          // d.scale(1 / l * ((md - clamp(l - (b.r + n.r), 0, md) / md)) * gameTime.deltaTime * (1 + b.speed) * this.scale);
          d.scale(1 / l * ((md - clamp(l - (b.r + n.r), 0, md) / md)) * gameTime.deltaTime * this.scale);
          // apply breaking force
          v.add(d);
          // apply opposite breaking force to neighbor
          n.v.add(d.scale(-1, t));
          // rotate right 90 deg
          d.rotateRight();
          // turn to the right
          v.add(d.scale(2));
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
            l = clamp(Math.sqrt(l2), epsilon, 1000);
            d.scale(1 / l * gameTime.deltaTime * 5);
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
    return true;
  } // tick
}
