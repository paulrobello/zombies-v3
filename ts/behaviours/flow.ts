import { Boid, BoidBehavior } from '../Boid';
import { ICellIndexable } from '../Cell';
import { IGameTime } from '../GameClock';
import { HashGrid } from '../HashGrid';
import { IPositional } from '../interfaces';

export class FlowBehavior extends BoidBehavior {
  public flowGrid: HashGrid<IPositional & ICellIndexable>;

  constructor(boid: Boid, flowGrid: HashGrid<IPositional & ICellIndexable>) {
    super(boid);
    this.flowGrid = flowGrid;
  }

  public tick(gameTime: IGameTime): void {
    const b = this.boid;
    const p = b.p;
    const v = b.v;
    const d: IPositional = this.flowGrid.getCellValue(p.x, p.y, true);
    if (!d) return;
    // console.log(d)
    v.add(d.p.copy().normalize().scale(1));
  }
}
