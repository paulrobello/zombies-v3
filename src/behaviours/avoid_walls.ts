import { Boid, BoidBehavior } from '../Boid';
import { IGameTime } from '../GameClock';
import { vec2 } from '../math';

export interface IAvoidBoundaryBehaviorOptions {
  margin: number;
}

export const AvoidBoundaryBehaviorDefaultOptions: IAvoidBoundaryBehaviorOptions = {
  margin: 20
};

export class AvoidBoundaryBehavior extends BoidBehavior {
  options: IAvoidBoundaryBehaviorOptions;

  constructor(boid: Boid, scale: number = 1, options: IAvoidBoundaryBehaviorOptions = AvoidBoundaryBehaviorDefaultOptions) {
    super(boid, scale);
    this.name = 'AvoidBoundaryBehavior';
    this.options = options;
  }

  public override tick(gameTime: IGameTime): void {
    const b = this.boid;
    const p: vec2 = b.p;
    const v: vec2 = b.v;
    const r2 = b.r * 2 + this.options.margin;
    let d: number;
    if (p.x < r2) {
      v.x += (r2 - p.x) / r2 * this.scale;
    } else {
      d = b.options.world.width - p.x;
      if (d < r2) {
        v.x -= (r2 - d) / r2 * this.scale;
      }
    }
    if (p.y < r2) {
      v.y += (r2 - p.y) / r2 * this.scale;
    } else {
      d = b.options.world.height - p.y;
      if (d < r2) {
        v.y -= (r2 - d) / r2 * this.scale;
      }
    }
  }
}
