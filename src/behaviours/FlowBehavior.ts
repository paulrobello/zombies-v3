import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { FlowGrid, IFlowValue } from '../grids/FlowGrid';
import { HashGrid } from '../grids/HashGrid';
import { clamp, epsilon, Ivec2, vec2 } from '../math';
import { BoidBehavior, IBehaviorOptions } from './BoidBehavior';

export interface IFlowBehaviorOptions extends IBehaviorOptions {
  flowGrid: FlowGrid;
  layer: number;
}

export class FlowBehavior<T extends Boid> extends BoidBehavior<T> {
  flowGrid: FlowGrid;
  layer: number;

  constructor(boid: T, scale: number, options: IFlowBehaviorOptions) {
    super(boid, scale, options);
    this.name = 'FlowBehavior';
    this.flowGrid = options.flowGrid;
    this.layer = options.layer;
  }

  public override tick(gameTime: IGameTime): boolean {
    if (!this.enabled) return false;
    const b: Boid = this.boid;
    const p: Ivec2 = b.p;
    const v: Ivec2 = b.v;
    const cell = this.flowGrid.getCell(p.x, p.y, true);
    if (!cell || cell.items.length <= this.layer) return false;
    const d: IFlowValue | undefined = cell.items[this.layer];
    if (!d) {
      return false;
    }
    const scale = this.scale;
    if (d.solid) {
      const dv = vec2.difference(p, cell.wc);
      const l = clamp(dv.length(), epsilon, 1000);
      const d = dv.scale(1 / l);
      v.add(d.scale((b.speed + 10) * gameTime.deltaTime * 1000, new vec2()));
      return true;
    }
    if (!d.l) {
      return false;
    }
    // console.log(d)
    v.x += d.p.x * d.l * scale;
    v.y += d.p.y * d.l * scale;
    return true;
  }
}
