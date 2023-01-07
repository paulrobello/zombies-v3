import { Boid, BoidBehavior } from '../Boid';
import { IGameTime } from '../GameClock';
import { epsilon, vec2 } from '../math';

export interface ICollisionBehaviorOptions {
  margin: number;
  iterations: number;
}

export const collisionBehaviorDefaultOptions: ICollisionBehaviorOptions = {
  margin: 0,
  iterations: 1
};

export class CollisionBehavior extends BoidBehavior {
  options: ICollisionBehaviorOptions;

  constructor(boid: Boid, scale: number = 1, options: ICollisionBehaviorOptions = collisionBehaviorDefaultOptions) {
    super(boid, scale);
    this.name = 'CollisionBehavior';
    this.options = options;
  }

  public override tick(gameTime: IGameTime): void {
    const b = this.boid;
    const p: vec2 = b.p;
    const grid = b.options.grid;
    const nearest = grid.getDataRadius(p.x, p.y, grid.options.cellSize, true, b, false);
    if (!nearest.length) return;

    const dTemp = new vec2();
    let anyHit = false;
    for (let i = 0; i < this.options.iterations; i++) {
      for (const na of nearest) {
        const n = na.data;
        const d = vec2.difference(b.p, n.p, dTemp);
        const l2 = d.squaredLength();
        const r = b.r + n.r + this.options.margin;
        if (l2 < r * r) {
          anyHit = true;
          let l = Math.sqrt(l2) + epsilon;
          d.scale(1 / l);

          const pd = r - l;
          p.x += d.x * pd * gameTime.deltaTime * this.scale;
          p.y += d.y * pd * gameTime.deltaTime * this.scale;
          break;
        }
      }
      if (!anyHit) break;
    }
  }
}
