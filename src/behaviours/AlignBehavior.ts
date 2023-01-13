import { BoidGrid } from '../grids/BoidGrid';
import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { epsilon } from '../math';
import { BoidBehavior, IBehaviorOptions } from './BoidBehavior';

export interface IAlignBehaviorOptions extends IBehaviorOptions{
  margin: number;
}

export const AlignBehaviorOptionsDefault: IAlignBehaviorOptions = {
  margin: 10
};

export class AlignBehavior extends BoidBehavior {
  margin: number;

  constructor(boid: Boid, scale: number = 1, options: IAlignBehaviorOptions = AlignBehaviorOptionsDefault) {
    super(boid, scale, options);
    this.name = 'AlignBehavior';
    this.margin = options.margin;
  }

  public override tick(gameTime: IGameTime): void {
    if (!this.enabled) return;
    const b = this.boid;
    const grid: BoidGrid = b.options.grid;
    const r = b.r * 2 + this.margin;
    const nearest = grid.getDataRadius(b.p.x, b.p.y, r, true, b, true);
    if (!nearest.length) return;
    const n = nearest[0].data;
    if (n.speed < epsilon) return;

    // if (Math.random()<0.0001) console.log(nearest[0].data)
    // normalize direction of neighbor and scale then add it to ours
    b.v.x += (n.v.x / n.speed) * this.scale;
    b.v.y += (n.v.y / n.speed) * this.scale;
  }
}
