import { ICellIndexable } from './Cell';
import { IGameTime } from './GameClock';
import { HashGrid } from './HashGrid';
import { IDrawable, IPositional, IProgressible } from './interfaces';
import { clamp, epsilon, TWO_PI } from './math';
import { vec2, Ivec2 } from './math';
import { World } from './World';


export interface IBoidOptions {
  world: World,
  grid: HashGrid<Boid>,
  p?: vec2,
  v?: vec2,
  r?: number
}

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

let id = 0;

export class Boid implements IPositional, ICellIndexable, IProgressible, IDrawable {
  public id: number;
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

  options: IBoidOptions;

  constructor(options: IBoidOptions) {
    this.options = options;
    this.id = id++;
    this.p = options.p || new vec2();
    this.v = options.v || new vec2();
    this.a = new vec2();
    this.r = options.r || 5;
    this.r2 = this.r * this.r;
  }

  // if (!p.isFinite()) {
  //   console.log(p);
  //   throw new Error('Boid position is not finite');
  // }
  // if (!v.isFinite()) {
  //   console.log(v);
  //   throw new Error('Boid has infinite velocity');
  // }

  tick(gameTime: IGameTime): void {
    for (const b of this.behaviors.values()) {
      b.tick(gameTime);
    }
    const p: Ivec2 = this.p;
    const v: Ivec2 = this.v;
    const world = this.options.world;
    const grid = this.options.grid;
    const maxSpeed = this.maxSpeed;
    let l: number = v.length();
    if (l > maxSpeed) {
      v.normalize().scale(maxSpeed);
      l = maxSpeed;
    }
    this.speed = l;

    p.x += v.x * gameTime.deltaTime;
    p.y += v.y * gameTime.deltaTime;
    p.x = clamp(p.x, 0, world.width - 1);
    p.y = clamp(p.y, 0, world.height - 1);
    v.scale(world.drag);
    const newCellIndex = grid.getCellIndex(p.x, p.y, true);
    if (newCellIndex === undefined) {
      throw new Error(`newCellIndex is undefined for ${p.x} and ${p.y}`);
    }
    if (this.cellIndex !== newCellIndex) {
      grid.removeCelDataByIndex(this.lastCellIndex, this);
      grid.addCelDataByIndex(newCellIndex, this);
    }
  }

  draw(ctx: WebGLRenderingContext): void {
    const p: Ivec2 = this.p;
    const v: Ivec2 = this.v;
    const buffers = this.options.world.boidGlBuffers;
    buffers.pos_vel[this.id * 4] = p.x;
    buffers.pos_vel[this.id * 4 + 1] = p.y;
    buffers.pos_vel[this.id * 4 + 2] = v.x;
    buffers.pos_vel[this.id * 4 + 3] = v.y;
    buffers.rad_color[this.id * 4] = 0;
    buffers.rad_color[this.id * 4 + 1] = 1;
    buffers.rad_color[this.id * 4 + 2] = 0;
    buffers.rad_color[this.id * 4 + 3] = this.r;
  }
}
