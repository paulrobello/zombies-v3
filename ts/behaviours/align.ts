import { Boid, BoidBehavior } from '../Boid';
import { IGameTime } from '../GameClock';

export class AlignBehavior extends BoidBehavior {
  public neighbor: Boid | undefined;

  constructor(boid: Boid, scale: number = 1) {
    super(boid, scale);
    this.name = 'AlignBehavior';
  }

  public tick(gameTime: IGameTime): void {
    const b = this.boid;
    const grid = b.grid;
    const nearest = grid.getDataRadius(b.p.x, b.p.y, grid.cellSize, true, b, true);
    this.neighbor = undefined;
    if (!nearest.length) return;
    const n = nearest[0].data;
    if (!n.speed) return;
    const bh = n.behaviors.get('AlignBehavior') as AlignBehavior;
    if (bh && bh.neighbor === b) return;
    this.neighbor = n;

    // if (Math.random()<0.0001) console.log(nearest[0].data)
    b.v.x += n.v.x / n.speed;
    b.v.y += n.v.y / n.speed;
  }
}
