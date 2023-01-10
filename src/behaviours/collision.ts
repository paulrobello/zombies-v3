import { Boid, BoidBehavior } from '../Boid';
import { IGameTime } from '../GameClock';
import { clamp, epsilon, vec2 } from '../math';

export interface ICollisionBehaviorOptions {
  margin: number;
  iterations: number;
}

export const collisionBehaviorDefaultOptions: ICollisionBehaviorOptions = {
  margin: 2,
  iterations: 1
};

export class CollisionBehavior extends BoidBehavior {
  options: ICollisionBehaviorOptions;
  checkedFrame: number = -1;

  constructor(boid: Boid, scale: number = 1, options: ICollisionBehaviorOptions = collisionBehaviorDefaultOptions) {
    super(boid, scale);
    this.name = 'CollisionBehavior';
    this.options = options;
  }

  public override tick(gameTime: IGameTime): void {
    if (!this.enabled) return;
    if (this.checkedFrame === gameTime.currentFrame) return;
    this.checkedFrame = gameTime.currentFrame;

    const b = this.boid;
    const p: vec2 = b.p;
    const v: vec2 = b.v;
    const grid = b.options.grid;
    // grab all neighbors within 4 times our radius
    let md = b.r * 4; // max distance
    const nearest = grid.getDataRadius(p.x, p.y, md, true, b, false);
    if (!nearest.length) return;
    md += 10;

    const t = new vec2(); // temp var
    const dTemp = new vec2(); // temp var
    const fp1 = p.add(v.scale(gameTime.deltaTime, t), new vec2()); // current boid future position
    const fp2 = new vec2(); // neighbor boid future position
    let d: vec2;
    let anyHit: boolean = false;
    let l: number;
    for (let i = 0; i < this.options.iterations; i++) { // currently only 1 iteration
      for (const na of nearest) { // loop over neighbors in range
        const n = na.data; // current neighbor
        // get neighbors behavior and marked it checked, so we can skip it this frame if we have not already processed it
        const nbh: CollisionBehavior | undefined = (n.behaviors.get(this.name) as CollisionBehavior);
        if (nbh) nbh.checkedFrame = gameTime.currentFrame;
        // store neighbors future position
        n.p.add(n.v.scale(gameTime.deltaTime, t), fp2);
        // get vector pointing from neighbor to us
        d = vec2.difference(fp1, fp2, dTemp);
        // get distance to neighbor so we can normalize direction
        l = clamp(d.length(), epsilon, md);

        // normalize direction vector and scale force up as boids get closer
        d.scale(1 / l * ((md - l) / md) * gameTime.deltaTime * (10 + b.speed) * this.scale);
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

        // actual collision
        let r = b.r + n.r + this.options.margin;
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

          // break;
        }

      }
      if (!anyHit) break;
    }
  }
}
