import { Boid, BoidBehavior } from '../Boid';
import { IGameTime } from '../GameClock';
import { vec2 } from '../math';

export class CollisionBehavior extends BoidBehavior {
  public neighbor: Boid | undefined;

  constructor(boid: Boid, scale: number = 1) {
    super(boid, scale);
    this.name = 'CollisionBehavior';
  }

  public tick(gameTime: IGameTime): void {
    const b = this.boid;
    const grid = b.grid;
    const nearest = grid.getDataRadius(b.p.x, b.p.y, grid.cellSize, true, b, true);
    this.neighbor = undefined;
    if (!nearest.length) return;

    const dTemp = new vec2();
    for (const na of nearest) {
      const n = na.data;
      const bh = n.behaviors.get('CollisionBehavior') as CollisionBehavior;
      if (bh && bh.neighbor === b) continue;
      const d2 = na.dist2;
      const r2 = b.r2 + n.r2;
      if (d2 < r2) {
        this.neighbor = n;
        const d = vec2.direction(b.p, n.p, dTemp);
        const dist = b.r + n.r;
        b.p.x = n.p.x + d.x * dist;
        b.p.y = n.p.y + d.y * dist;
        b.v.x += d.y * this.scale;
        b.v.y += -d.x * this.scale;
        break;
      }
    }
  }
}
