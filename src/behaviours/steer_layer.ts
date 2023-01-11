import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { vec2, epsilon, clamp } from '../math';
import { BoidBehavior } from './BoidBehavior';

export interface ISteerLayerBehaviorOptions {
  radius: number;
  layerName: string;
  nearest: boolean;
}

export class SteerLayerBehavior extends BoidBehavior {
  options: ISteerLayerBehaviorOptions;
  layerId: number;

  constructor(boid: Boid, scale: number = 1, options: ISteerLayerBehaviorOptions) {
    super(boid, scale);
    this.name = 'SteerLayerBehavior';
    this.options = options;
    this.layerId = boid.World.addLayerName(options.layerName);
  }

  public override tick(gameTime: IGameTime): void {
    if (!this.enabled) return;

    const b = this.boid;
    const p: vec2 = b.p;
    const v: vec2 = b.v;
    const grid = b.options.grid;
    const r = b.r * 2 + this.options.radius;
    const nearest = grid.getDataRadius(p.x, p.y, r, true, b, this.options.nearest, this.layerId);
    if (!nearest.length) return;

    const t = new vec2();
    for (const na of nearest) {
      const n = na.data;
      const d2 = na.dist2;
      let dist = clamp(Math.sqrt(d2), epsilon, 1000);
      const d = na.dv.scale(-1 / dist, t);//.rotateRight();
      dist = (r - dist) / r * gameTime.deltaTime * this.scale;
      v.x += d.x * dist;
      v.y += d.y * dist;
    }
  }
}
