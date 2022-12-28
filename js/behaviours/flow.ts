import { Boid, BoidBehavior } from '../Boid';
import { HashGrid } from '../HashGrid';
import { IPositional } from '../math';

export class FlowBehavior extends BoidBehavior {
  public flowGrid: HashGrid<IPositional>;

  constructor(boid: Boid, flowGrid: HashGrid<IPositional>) {
    super(boid);
    this.flowGrid = flowGrid;
  }

  public tick(time: number, deltaTime: number): void {
    const b = this.boid;
    const p = b.p;
    const v = b.v;
    const d: IPositional = this.flowGrid.getCellValue(p.x, p.y, true);
    if (!d) return;
    // console.log(d)
    v.add(d.p.copy().normalize().scale(1));

    // add velocity to position and line to new position
    let l = v.length();
    if (l > b.maxSpeed) {
      v.normalize().scale(b.maxSpeed);
      l = b.maxSpeed;
    }
    b.speed = l;
    p.add(v);
  }
}
