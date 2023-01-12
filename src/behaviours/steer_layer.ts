import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { BoidGrid } from '../grids/BoidGrid';
import { IDataRadiusResults } from '../grids/HashGrid';
import { vec2, epsilon, clamp } from '../math';
import { BoidBehavior } from './BoidBehavior';

export interface ISteerLayerBehaviorOptions {
  radius: number;
  layerName: string;
  nearest: boolean;
}

export class SteerLayerBehavior extends BoidBehavior {
  layerId: number;
  radius: number;
  layerName: string;
  nearest: boolean;

  constructor(boid: Boid, scale: number, options: ISteerLayerBehaviorOptions) {
    super(boid, scale);
    this.name = 'SteerLayerBehavior';
    this.radius = options.radius;
    this.layerName = options.layerName;
    this.nearest = options.nearest;
    this.layerId = boid.World.layerByName(options.layerName);
  }

  public override tick(gameTime: IGameTime): void {
    if (!this.enabled) return;

    const b: Boid = this.boid;
    const p: vec2 = b.p;
    const v: vec2 = b.v;
    const grid: BoidGrid = b.options.grid;
    const r: number = b.r * 2 + this.radius;
    const nearest:IDataRadiusResults<Boid> = grid.getDataRadius(p.x, p.y, r, true, b, this.nearest, this.layerId);
    if (!nearest.length) return;

    const t = new vec2();
    for (const na of nearest) {
      const d2 = na.dist2;
      let dist = clamp(Math.sqrt(d2), epsilon, 1000);
      const d = na.dv.scale(1 / dist, t);//.rotateRight();
      dist = (r - dist) / r * gameTime.deltaTime * this.scale;
      v.x += d.x * dist;
      v.y += d.y * dist;
    }
  }
}
