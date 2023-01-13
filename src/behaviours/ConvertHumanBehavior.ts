import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { vec2 } from '../math';
import { BoidBehavior, IBehaviorOptions } from './BoidBehavior';

export interface IConvertHumanBehaviorOptions extends IBehaviorOptions {
  margin: number;
  minAgeBeforeConvert: number;
}

export class ConvertHumanBehavior<T extends Boid> extends BoidBehavior<T> {
  layerId: number;
  margin: number;
  minAgeBeforeConvert: number;

  constructor(boid: T, scale: number, options: IConvertHumanBehaviorOptions) {
    super(boid, scale, options);

    this.name = 'ConvertHumanBehavior';
    this.layerId = boid.World.layerByName('human');
    this.margin = options.margin;
    this.minAgeBeforeConvert = options.minAgeBeforeConvert;
  }

  public override tick(gameTime: IGameTime): boolean {
    if (!this.enabled) return false;

    const b = this.boid;
    if (b.age < this.minAgeBeforeConvert) return false;

    const p: vec2 = b.p;
    const grid = b.options.grid;
    const nearest = grid.getDataRadius(p.x, p.y, b.r * 2 + this.margin, true, b, true, this.layerId);
    if (!nearest.length) return false;
    for (const na of nearest) {
      na.data.die();
    }
    return true;
  }
}
