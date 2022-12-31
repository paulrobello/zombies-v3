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
    const p: vec2 = b.p;
    const v: vec2 = b.v;
    const grid = b.grid;
    const r = b.r * 2.5;
    const nearest = grid.getDataRadius(p.x, p.y, r, true, b, false);
    if (!nearest.length) return;

    const tempD = new vec2();
    for (const na of nearest) {
      const n = na.data;
      const d2 = na.dist2;
      let dist = Math.sqrt(d2) + epsilon;
      const d = vec2.difference(n.p, p, tempD).scale(1 / dist).rotate90();
      dist = (r - dist) / r;
      v.x += d.x * dist * this.scale;
      v.y += d.y * dist * this.scale;
    }
  }
}
