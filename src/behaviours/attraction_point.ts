import { Boid, BoidBehavior } from '../Boid';
import { IGameTime } from '../GameClock';
import { IPositional } from '../interfaces';
import { clamp, epsilon, Ivec2, vec2 } from '../math';

export interface IAttractionPointBehaviorOptions {
  target: IPositional;
}

export const AttractionPointBehaviorDefaultOptions: IAttractionPointBehaviorOptions = {
  target: {p: new vec2(0, 0)}
};

export class AttractionPointBehavior extends BoidBehavior {
  options: IAttractionPointBehaviorOptions;

  constructor(boid: Boid, scale: number = 1, options: IAttractionPointBehaviorOptions = AttractionPointBehaviorDefaultOptions) {
    super(boid, scale);
    this.name = 'AttractionPointBehavior';
    this.options = options;
  }

  public override tick(gameTime: IGameTime): void {
    if (!this.enabled) return;
    const b = this.boid;
    const p: vec2 = b.p;
    const v: vec2 = b.v;
    const d: vec2 = vec2.difference(this.options.target.p, p);
    const l: number = d.length();
    const m: number = Math.max(b.grid.width, b.grid.height);
    const ml: number = clamp(d.length(), m/4, m);
    d.scale((1 / l) * (m - ml) / m * this.scale);
    v.add(d);
  }
}
