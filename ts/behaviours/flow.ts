import { Boid, BoidBehavior } from '../Boid';
import { IGameTime } from '../GameClock';
import { HashGrid } from '../HashGrid';
import { IFlowValue } from '../interfaces';
import { Ivec2 } from '../math';

export interface IFlowBehaviorOptions {
  flowGrid: HashGrid<IFlowValue>;
}

export class FlowBehavior extends BoidBehavior {
  public flowGrid: HashGrid<IFlowValue>;

  constructor(options: IFlowBehaviorOptions, boid: Boid) {
    super(boid);
    this.flowGrid = options.flowGrid;
  }

  public tick(gameTime: IGameTime): void {
    const b: Boid = this.boid;
    const p: Ivec2 = b.p;
    const v: Ivec2 = b.v;
    const d: IFlowValue = this.flowGrid.getCellValue(p.x, p.y, true);
    if (!d) {
      console.warn('no flow cell at', p.x, p.y);
      return;
    }
    // console.log(d)
    if (!d.l) {
      v.x += d.p.x;
      v.y += d.p.y;
    } else {
      v.x += d.p.x / d.l;
      v.y += d.p.y / d.l;
    }
  }
}
