import { Boid, BoidBehavior } from '../Boid';
import { IGameTime } from '../GameClock';
import { HashGrid } from '../HashGrid';
import { IFlowValue } from '../interfaces';
import { Ivec2 } from '../math';

export interface IFlowBehaviorOptions {
  flowGrid: HashGrid<IFlowValue>;
  normalize: boolean;
}

export class FlowBehavior extends BoidBehavior {
  options: IFlowBehaviorOptions;

  constructor(boid: Boid, scale: number, options: IFlowBehaviorOptions) {
    super(boid, scale);
    this.name = 'FlowBehavior';
    this.options = options;
  }

  public override tick(gameTime: IGameTime): void {
    if (!this.enabled) return;
    const b: Boid = this.boid;
    const p: Ivec2 = b.p;
    const v: Ivec2 = b.v;
    const d: IFlowValue = this.options.flowGrid.getCellValue(p.x, p.y, true);
    if (!d) {
      console.warn('no flow cell at', p.x, p.y);
      return;
    }
    const scale = this.scale;
    // console.log(d)
    if (!d.l || this.options.normalize) {
      v.x += d.p.x * scale;
      v.y += d.p.y * scale;
    } else {
      v.x += d.p.x * d.l * scale;
      v.y += d.p.y * d.l * scale;
    }
  }
}
