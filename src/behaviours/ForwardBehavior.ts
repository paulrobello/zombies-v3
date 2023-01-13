import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { BoidBehavior, IBehaviorOptions } from './BoidBehavior';

export class ForwardBehavior extends BoidBehavior {

  constructor(boid: Boid, scale: number = 1, options: IBehaviorOptions) {
    super(boid, scale, options);
    this.name = 'ForwardBehavior';
  }

  public override tick(gameTime: IGameTime): void {
    if (!this.enabled) return;
    const b = this.boid;
    b.v.x += b.d.x * gameTime.deltaTime * this.scale;
    b.v.y += b.d.y * gameTime.deltaTime * this.scale;
  }
}
