import { Boid, BoidBehavior } from '../boids/Boid';
import { Cell } from '../grids/Cell';
import { IGameTime } from '../GameClock';
import { IFlowValue } from '../grids/FlowGrid';
import { HashGrid } from '../grids/HashGrid';
import { clamp, epsilon, Ivec2, vec2 } from '../math';

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
    const cell: Cell<IFlowValue> = this.options.flowGrid.getCell(p.x , p.y, true);
    if (!cell || !cell.items.length) return;
    const d: IFlowValue = cell.items[0];
    if (!d) {
      console.warn('no flow cell at', p.x, p.y);
      return;
    }
    const scale = this.scale;
    if (d.solid) {
      const dv = vec2.difference(p, cell.wc);
      const l = clamp(dv.length(), epsilon, 1000);
      const d = dv.scale(1 / l);
      v.add(d.scale((b.speed+10) * this.scale*gameTime.deltaTime*200, new vec2()));
      return;
    }
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
