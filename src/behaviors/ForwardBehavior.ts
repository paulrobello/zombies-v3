/**
 * The simplest behaviour — applies a constant forward thrust along the
 * boid's current heading direction (`boid.d`). Default-installed by
 * `Boid`'s constructor (first entry in the `behaviors` map, so it runs
 * before any other behaviour). Without this, a boid with no other active
 * steering would slow to a stop under drag.
 */
import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { BoidBehavior, IBehaviorOptions } from './BoidBehavior';

export class ForwardBehavior<T extends Boid> extends BoidBehavior<T> {

  constructor(boid: T, scale: number = 1, options: IBehaviorOptions) {
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
