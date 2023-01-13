import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { BoidGrid } from '../grids/BoidGrid';
import { IDataRadiusResults } from '../grids/HashGrid';
import { vec2, epsilon, clamp } from '../math';
import { BoidBehavior, IBehaviorOptions } from './BoidBehavior';

export interface ISteerLayerBehaviorOptions extends IBehaviorOptions {
  radius: number;
  layerName: string;
  nearest: boolean;
  breakingDistance: number;
  breakingPower: number;
}

export class SteerLayerBehavior<T extends Boid> extends BoidBehavior<T> {
  layerId: number;
  radius: number;
  layerName: string;
  nearest: boolean;
  lastResults: IDataRadiusResults<Boid> = [];
  breakingDistance: number;
  breakingPower: number;

  constructor(boid: T, scale: number, options: ISteerLayerBehaviorOptions) {
    super(boid, scale, options);
    this.name = 'SteerLayerBehavior';
    this.radius = options.radius;
    this.layerName = options.layerName;
    this.nearest = options.nearest;
    this.layerId = boid.World.layerByName(options.layerName);
    this.breakingDistance = options.breakingDistance;
    this.breakingPower = options.breakingPower;
  }

  public override tick(gameTime: IGameTime): boolean {
    if (!this.enabled) return false;

    const b: Boid = this.boid;
    const p: vec2 = b.p;
    const v: vec2 = b.v;
    const grid: BoidGrid = b.options.grid;
    const r: number = b.r * 2 + this.radius;
    const nearest: IDataRadiusResults<Boid> = grid.getDataRadius(p.x, p.y, r, true, b, this.nearest, this.layerId);
    this.lastResults = nearest;
    if (!nearest.length) return false;

    const t = new vec2();
    for (const na of nearest) {
      const d2 = na.dist2;
      const dist = clamp(Math.sqrt(d2), epsilon, r);
      let l = dist;
      const d = na.dv.scale(1 / l, t);
      l = l * gameTime.deltaTime * this.scale;
      // l *= ((r + 1) - dist) / r;
      if (dist < this.breakingDistance && b.speed > b.maxSpeed / 2) {
        v.scale(1 - gameTime.deltaTime * this.breakingPower);
      }
      v.x += d.x * l;
      v.y += d.y * l;
    }
    return true;
  }
}
