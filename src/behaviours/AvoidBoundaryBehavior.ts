import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { vec2 } from '../math';
import { BoidBehavior, IBehaviorOptions } from './BoidBehavior';

export interface IAvoidBoundaryBehaviorOptions extends IBehaviorOptions {
  margin: number;
}

export const AvoidBoundaryBehaviorDefaultOptions: IAvoidBoundaryBehaviorOptions = {
  margin: 32
};

export class AvoidBoundaryBehavior<T extends Boid> extends BoidBehavior<T> {
  margin: number;

  constructor(boid: T, scale: number = 1, options: IAvoidBoundaryBehaviorOptions = AvoidBoundaryBehaviorDefaultOptions) {
    super(boid, scale, options);
    this.name = 'AvoidBoundaryBehavior';
    this.margin = options.margin;
  }

  public override tick(gameTime: IGameTime): boolean {
    if (!this.enabled) return false;
    const b = this.boid;
    const p: vec2 = b.p;
    const v: vec2 = b.v;
    const r2 = b.r + this.margin;
    let d: number;
    if (p.x < r2) {
      v.x += (r2 - p.x) / r2 * gameTime.deltaTime * this.scale;
      // v.y -= 0.1 * this.scale;
    } else {
      d = b.options.world.width - p.x;
      if (d < r2) {
        v.x -= (r2 - d) / r2 * gameTime.deltaTime * this.scale;
        // v.y += 0.1 * this.scale;
      }
    }
    if (p.y < r2) {
      v.y += (r2 - p.y) / r2 * gameTime.deltaTime * this.scale;
      // v.x += 0.1 * this.scale;
    } else {
      d = b.options.world.height - p.y;
      if (d < r2) {
        v.y -= (r2 - d) / r2 * gameTime.deltaTime * this.scale;
        // v.x -= 0.1 * this.scale;
      }
    }
    return true;
  }
}
