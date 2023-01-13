import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { IPositional } from '../interfaces';
import { clamp, vec2 } from '../math';
import { BoidBehavior, IBehaviorOptions } from './BoidBehavior';

export interface IAttractionPointBehaviorOptions extends IBehaviorOptions {
  target: IPositional;
}

export const AttractionPointBehaviorDefaultOptions: IAttractionPointBehaviorOptions = {
  target: {p: new vec2(0, 0)}
};

export class AttractionPointBehavior<T extends Boid> extends BoidBehavior<T> {
  target: IPositional;

  constructor(boid: T, scale: number = 1, options: IAttractionPointBehaviorOptions = AttractionPointBehaviorDefaultOptions) {
    super(boid, scale, options);
    this.name = 'AttractionPointBehavior';
    this.target = options.target;
  }

  public override tick(gameTime: IGameTime): boolean {
    if (!this.enabled) return false;
    const b = this.boid;
    const p: vec2 = b.p;
    const v: vec2 = b.v;
    const d: vec2 = vec2.difference(this.target.p, p);
    const l: number = d.length();
    const m: number = Math.max(b.grid.width, b.grid.height);
    const ml: number = clamp(d.length(), m / 4, m);
    d.scale((1 / l) * (m - ml) / m * this.scale);
    v.add(d);
    return true;
  }
}
