import { ICellIndexable } from './Cell';
import { IGameTime } from './GameClock';
import { HashGrid } from './HashGrid';
import { IDrawable, IPositional, IProgressible } from './interfaces';
import { clamp, epsilon, TWO_PI } from './math';
import { vec2, Ivec2 } from './math';
import { World } from './World';


export class BoidBehavior implements IProgressible {
  public name: string;
  public boid: Boid;
  public scale: number;

  constructor(boid: Boid, scale: number = 1) {
    this.boid = boid;
    this.scale = scale;
  }

  tick(gameTime: IGameTime): void {
  }
}

export class Boid implements IPositional, ICellIndexable, IProgressible, IDrawable {
  public p: vec2;
  public v: vec2;
  public a: vec2;
  public r: number;
  public r2: number;
  public speed: number = 0;
  public maxSpeed: number = 1;

  public behaviors: Map<string, BoidBehavior> = new Map<string, BoidBehavior>();
  public grid: HashGrid<Boid>;
  public lastCellIndex: number = -1;
  public cellIndex: number = -1;
  public type: number = 1;
  public world: World;

  constructor(world: World, grid: HashGrid<Boid>, p?: vec2, v?: vec2, r?: number) {
    this.world = world;
    this.grid = grid;

    this.p = p || new vec2();
    this.v = v || new vec2();
    this.a = new vec2();
    this.r = r || 5;
    this.r2 = this.r * this.r;
  }

  tick(gameTime: IGameTime): void {
    for (const b of this.behaviors.values()) {
      b.tick(gameTime);
    }
    const p: Ivec2 = this.p;
    const v: Ivec2 = this.v;
    if (!p.isFinite()){
      console.log(p);
      throw new Error("Boid position is not finite");
    }
    if (!v.isFinite()) {
      console.log(v);
      throw new Error("Boid has infinite velocity");
    }
    const maxSpeed = this.maxSpeed;
    let l: number = v.length();
    if (l > maxSpeed) {
      v.normalize().scale(maxSpeed);
      l = maxSpeed;
    }
    this.speed = l;

    p.x += v.x * gameTime.deltaTime;
    p.y += v.y * gameTime.deltaTime;
    p.x = clamp(p.x, 0, this.world.width - 1);
    p.y = clamp(p.y, 0, this.world.height - 1);
    v.scale(this.world.drag);
    const newCellIndex = this.grid.getCellIndex(p.x, p.y, true);
    if (newCellIndex === undefined) {
      throw new Error(`newCellIndex is undefined for ${p.x} and ${p.y}`);
    }
    if (this.cellIndex !== newCellIndex) {
      this.grid.removeCelDataByIndex(this.lastCellIndex, this);
      this.grid.addCelDataByIndex(newCellIndex, this);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const p: Ivec2 = this.p;
    const v: Ivec2 = this.v;
    let s: number = this.speed;
    ctx.moveTo(p.x + this.r, p.y);
    ctx.arc(p.x, p.y, this.r, 0, TWO_PI);
    if (s < epsilon) return;
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + (v.x / s * this.r), p.y + (v.y / s * this.r));
  }
}
