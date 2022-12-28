import { BoidBehavior } from '../Boid';
import vec2 from '../math/vec2';

export class AlignBehavior extends BoidBehavior {
  public tick(time: number, deltaTime: number): void {
    const b = this.boid;
    const grid = b.grid;
    const nearest = grid.getDataRadius(b.p.x, b.p.y, grid.cellSize, true, b, true);
    if (!nearest.length) return;
    const nv = vec2.zero;
    nearest[0].data.v.scale(1, nv);
    b.v.add(nv);
  }
}
