import { Boid, BoidBehavior } from '../Boid';
import { IGameTime } from '../GameClock';
import { BoidGrid } from '../HashGrid';
import { epsilon } from '../math';

export class AlignBehavior extends BoidBehavior {

  constructor(boid: Boid, scale: number = 1) {
    super(boid, scale);
    this.name = 'AlignBehavior';
  }

  public override tick(gameTime: IGameTime): void {
    const b = this.boid;
    const grid: BoidGrid = b.options.grid;
    const r = b.r * 3;
    const nearest = grid.getDataRadius(b.p.x, b.p.y, r, true, b, true);
    if (!nearest.length) return;
    const n = nearest[0].data;
    if (n.speed < epsilon) return;

    // if (Math.random()<0.0001) console.log(nearest[0].data)
    // normalize direction of neighbor and scale then add it to ours
    b.v.x += (n.v.x / n.speed) * this.scale;
    b.v.y += (n.v.y / n.speed) * this.scale;
  }
}
