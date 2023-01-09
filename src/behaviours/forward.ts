import { Boid, BoidBehavior } from '../Boid';
import { IGameTime } from '../GameClock';
import { BoidGrid } from '../HashGrid';
import { epsilon } from '../math';

export class ForwardBehavior extends BoidBehavior {

  constructor(boid: Boid, scale: number = 1) {
    super(boid, scale);
    this.name = 'ForwardBehavior';
  }

  public override tick(gameTime: IGameTime): void {
    const b = this.boid;
    const v = b.v;

    b.v.x += (v.x / b.speed) * this.scale;
    b.v.y += (v.y / b.speed) * this.scale;
  }
}
