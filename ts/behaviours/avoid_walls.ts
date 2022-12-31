import { Boid, BoidBehavior } from '../Boid';
import { IGameTime } from '../GameClock';
import { vec2, epsilon } from '../math';

export interface IAvoidWallsBehaviorOptions {
  margin: number;
}

export const AvoidWallsBehaviorDefaultOptions: IAvoidWallsBehaviorOptions = {
  margin: 50
};

export class AvoidWallsBehavior extends BoidBehavior {
  options: IAvoidWallsBehaviorOptions;

  constructor(boid: Boid, scale: number = 1, options: IAvoidWallsBehaviorOptions = AvoidWallsBehaviorDefaultOptions) {
    super(boid, scale);
    this.name = 'AvoidWallsBehavior';
    this.options = options;
  }

  public tick(gameTime: IGameTime): void {
    const b = this.boid;
    const p: vec2 = b.p;
    const v: vec2 = b.v;
    const r2 = b.r * 2 + this.options.margin;
    let d: number;
    if (p.x < r2) {
      v.x += (r2 - p.x) / r2 * this.scale;
    } else {
      d = b.world.width - p.x;
      if (d < r2) {
        v.x -= (r2 - d) / r2 * this.scale;
      }
    }
    if (p.y < r2) {
      v.y += (r2 - p.y) / r2 * this.scale;
    } else {
      d = b.world.height - p.y;
      if (d < r2) {
        v.y -= (r2 - d) / r2 * this.scale;
      }
    }
  }
}
