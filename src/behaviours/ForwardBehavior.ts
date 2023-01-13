import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { BoidBehavior, IBehaviorOptions } from './BoidBehavior';

export class ForwardBehavior<T extends Boid> extends BoidBehavior<T> {

  constructor(boid: T, scale: number = 1, options: IBehaviorOptions) {
    super(boid, scale, options);
    this.name = 'ForwardBehavior';
  }

  public override tick(gameTime: IGameTime): boolean {
    if (!this.enabled) return false;
    const b = this.boid;
    b.v.x += b.d.x * gameTime.deltaTime * this.scale;
    b.v.y += b.d.y * gameTime.deltaTime * this.scale;
    return true;
  }
}
