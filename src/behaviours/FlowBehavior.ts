import { Boid } from '../boids/Boid';
import { Cell } from '../grids/Cell';
import { IGameTime } from '../GameClock';
import { IFlowValue } from '../grids/FlowGrid';
import { HashGrid } from '../grids/HashGrid';
import { clamp, epsilon, Ivec2, vec2 } from '../math';
import { BoidBehavior, IBehaviorOptions } from './BoidBehavior';

export interface IFlowBehaviorOptions extends IBehaviorOptions {
  flowGrid: HashGrid<IFlowValue>;
  layer: number;
}

export class FlowBehavior extends BoidBehavior {
  flowGrid: HashGrid<IFlowValue>;
  layer: number;

  constructor(boid: Boid, scale: number, options: IFlowBehaviorOptions) {
    super(boid, scale, options);
    this.name = 'FlowBehavior';
    this.flowGrid = options.flowGrid;
    this.layer = options.layer;
  }

  public override tick(gameTime: IGameTime): void {
    if (!this.enabled) return;
    const b: Boid = this.boid;
    const p: Ivec2 = b.p;
    const v: Ivec2 = b.v;
    const cell: Cell<IFlowValue> = this.flowGrid.getCell(p.x, p.y, true);
    if (!cell || cell.items.length <= this.layer) return;
    const d: IFlowValue | undefined = cell.items[this.layer];
    if (!d || !d.l) {
      return;
    }
    const scale = this.scale;
    if (d.solid) {
      const dv = vec2.difference(p, cell.wc);
      const l = clamp(dv.length(), epsilon, 1000);
      const d = dv.scale(1 / l);
      v.add(d.scale((b.speed + 10) * gameTime.deltaTime * 1000, new vec2()));
      return;
    }
    // console.log(d)
    v.x += d.p.x * d.l * scale;
    v.y += d.p.y * d.l * scale;
  }
}
