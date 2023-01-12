import { Boid, IBoidOptions } from '../boids/Boid';
import { Zombie } from '../boids/Zombie';
import { IGameTime } from '../GameClock';
import { vec2 } from '../math';
import { BoidBehavior } from './BoidBehavior';

export interface IConvertHumanBehaviorOptions {
  margin: number;
}

export class ConvertHumanBehavior extends BoidBehavior {
  layerId: number;
  margin: number;

  constructor(boid: Boid, scale: number, options: IConvertHumanBehaviorOptions) {
    super(boid, scale);
    this.name = 'ConvertHumanBehavior';
    this.layerId = boid.World.layerByName('human');
    this.margin = options.margin;
  }

  public override tick(gameTime: IGameTime): void {
    if (!this.enabled) return;

    const b = this.boid;
    const p: vec2 = b.p;
    const grid = b.options.grid;
    const nearest = grid.getDataRadius(p.x, p.y, b.r * 2 + this.margin, true, b, true, this.layerId);
    if (!nearest.length) return;

    for (const na of nearest) {
      const n = na.data;
      n.die();
      n.tick(gameTime);
      const o: IBoidOptions = {
        id: n.id,
        world: b.World,
        grid: b.Grid,
        p: n.p.copy(),
        v: new vec2().random(0, b.maxSpeed),
        r: b.r,
        maxSpeed: b.maxSpeed
      };
      const boid = new Zombie(o);
      b.options.world.boids[boid.id] = boid;
      for (const r of b.World.rings) {
        if (r.duration) continue;
        r.duration = 2;
        r.r = 0;
        r.speed = 1;
        r.p.set_xy(b.p.x, b.p.y);
        break;
      }
    }
  }
}
