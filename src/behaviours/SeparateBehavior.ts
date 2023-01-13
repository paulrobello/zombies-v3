import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { vec2, epsilon, clamp } from '../math';
import { BoidBehavior, IBehaviorOptions } from './BoidBehavior';

export interface ISeparateBehaviorOptions extends IBehaviorOptions {
  margin: number;
}

export const DefaultSeparateBehaviorOptions: ISeparateBehaviorOptions = {
  margin: 10
};

export class SeparateBehavior extends BoidBehavior {
  margin: number;

  constructor(boid: Boid, scale: number = 1, options: ISeparateBehaviorOptions = DefaultSeparateBehaviorOptions) {
    super(boid, scale, options);
    this.name = 'SeparateBehavior';
    this.margin = options.margin;
  }

  public override tick(gameTime: IGameTime): void {
    if (!this.enabled) return;

    const b = this.boid;
    const p: vec2 = b.p;
    const v: vec2 = b.v;
    const grid = b.options.grid;
    const r = b.r * 2 + this.margin;
    const nearest = grid.getDataRadius(p.x, p.y, r, true, b, false);
    if (!nearest.length) return;

    const tempD = new vec2();
    for (const na of nearest) {
      const n = na.data;
      const d2 = na.dist2;
      let dist = clamp(Math.sqrt(d2), epsilon, 1000);
      const d = vec2.difference(n.p, p, tempD).scale(1 / dist).rotateRight();
      dist = (r - dist) / r;
      v.x += d.x * dist * this.scale;
      v.y += d.y * dist * this.scale;
    }
  }
}
