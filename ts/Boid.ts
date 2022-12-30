import { ICellIndexable } from './Cell';
import { IGameTime } from './GameClock';
import { HashGrid } from './HashGrid';
import { IDrawable, IPositional, IProgressible } from './interfaces';
import vec2, { Ivec2 } from './math/vec2';


export class BoidBehavior implements IProgressible {
  public boid: Boid;

  constructor(boid: Boid) {
    this.boid = boid;
  }

  tick(gameTime: IGameTime): void {
  }
}

export class Boid implements IPositional, ICellIndexable, IProgressible, IDrawable {
  public p: vec2;
  public v: vec2;
  public a: vec2;
  public r: number;
  public speed: number = 0;
  public maxSpeed: number = 1;

  public behaviors: BoidBehavior[] = [];
  public grid: HashGrid<Boid>;
  public lastCellIndex: number = -1;
  public cellIndex: number = -1;

  constructor(grid: HashGrid<Boid>, p?: vec2, v?: vec2, r?: number) {
    this.grid = grid;
    this.p = p || vec2.zero;
    this.v = v || vec2.zero;
    this.a = vec2.zero;
    this.r = r || 1;
  }

  tick(gameTime: IGameTime): void {
    for (const b of this.behaviors) {
      b.tick(gameTime);
    }
    const newCellIndex = this.grid.getCellIndex(this.p.x, this.p.y, true);
    if (this.cellIndex !== newCellIndex) {
      this.grid.removeCelDataByIndex(this.lastCellIndex, this);
      this.grid.addCelDataByIndex(newCellIndex, this);
    }
    const v = this.v;
    let l = v.length();
    if (l > this.maxSpeed) {
      v.normalize().scale(this.maxSpeed);
      l = this.maxSpeed;
    }
    this.speed = l;
    this.p.x += v.x * gameTime.deltaTime;
    this.p.y += v.y * gameTime.deltaTime;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const p: Ivec2 = this.p;
    const v: Ivec2 = this.v;
    let s: number = this.speed;
    ctx.moveTo(p.x, p.y);
    if (s < 1) {
      s = 1;
    }
    ctx.lineTo(p.x - (v.x / s * 10), p.y - (v.y / s * 10));
  }
}
