import { HashGrid } from './HashGrid';
import { IPositional, IProgressible } from './math/interfaces';
import vec2 from './math/vec2';


export class BoidBehavior implements IProgressible {
  public boid: Boid;

  constructor(boid: Boid) {
    this.boid = boid;
  }

  tick(time: number, deltaTime: number): void {

  }
}

export class Boid implements IPositional, IProgressible {
  public p: vec2;
  public v: vec2;
  public a: vec2;
  public r: number;
  public speed: number = 0;
  public maxSpeed: number = 1;

  public behaviors: BoidBehavior[] = [];
  public grid: HashGrid<Boid>;

  constructor(grid: HashGrid<Boid>, p?: vec2, v?: vec2, r?: number) {
    this.grid = grid;
    this.p = p || vec2.zero;
    this.v = v || vec2.zero;
    this.a = vec2.zero;
    this.r = r || 1;
  }

  tick(time: number, deltaTime: number): void {
    for (const b of this.behaviors) {
      b.tick(time, deltaTime);
    }
  }
}
