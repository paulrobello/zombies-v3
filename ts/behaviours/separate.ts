import { Boid, BoidBehavior } from '../Boid';
import { IGameTime } from '../GameClock';
import { vec2, epsilon } from '../math';

export class SeparateBehavior extends BoidBehavior {
  constructor(boid: Boid, scale: number = 1) {
    super(boid, scale);
    this.name = 'SeparateBehavior';
  }

  public tick(gameTime: IGameTime): void {
    const b = this.boid;
    const grid = b.grid;
    const nearest = grid.getDataRadius(b.p.x, b.p.y, grid.options.cellSize, true, b, false);
    if (!nearest.length) return;

    const tempD = new vec2();
    for (const na of nearest) {
      const n = na.data;
      const d2 = na.dist2;
      let dist = Math.sqrt(d2);
      if (dist < epsilon) dist = epsilon;
      const d = vec2.difference(n.p, b.p, tempD).scale(1 / dist);
      dist = (grid.cellSize - dist) / grid.options.cellSize;
      b.v.x += d.y * dist * this.scale;
      b.v.y += -d.x * dist * this.scale;
    }
  }
}
