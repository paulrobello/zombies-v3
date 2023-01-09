import { ICellIndexable } from './Cell';
import { IGameTime } from './GameClock';
import { BoidGrid, HashGrid, IGridQueryable } from './HashGrid';
import { IDirectional, IDrawable, IPositional, IProgressible } from './interfaces';
import { clamp, epsilon } from './math';
import { vec2, Ivec2 } from './math';
import { World } from './World';


export interface IBoidOptions {
  world: World,
  grid: BoidGrid,
  p?: vec2,
  v?: vec2,
  d?: vec2,
  a?: vec2,
  r?: number,
  layer?: number;
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

export class Boid implements IPositional, IDirectional, ICellIndexable, IProgressible, IDrawable, IGridQueryable {
  public id: number;
  public p: vec2;
  public v: vec2;
  public d: vec2;
  public a: vec2;
  public r: number;
  public r2: number;
  public speed: number = 0;
  public maxSpeed: number = 1;

  public behaviors: Map<string, BoidBehavior> = new Map<string, BoidBehavior>();
  public grid: HashGrid<Boid>;
  public lastCellIndex: number = -1;
  public cellIndex: number = -1;
  public layer: number = 0;

  options: IBoidOptions;

  get World(): World {
    return this.options.world;
  }

  get Grid(): HashGrid<Boid> {
    return this.options.grid;
  }

  constructor(options: IBoidOptions) {
    this.options = options;
    this.id = id++;
    this.grid = options.grid;
    this.layer = options.layer || 0;
    this.p = options.p || new vec2();
    this.v = options.v || new vec2();
    this.a = options.a || new vec2();
    if (this.v.squaredLength()) {
      this.d = this.v.normalize();
    } else {
      this.d = new vec2();
    }
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
    const r: number = this.r;
    const world = this.options.world;
    const grid = this.options.grid;
    const maxSpeed = this.maxSpeed;
    let l: number = v.length();
    if (l > maxSpeed) {
      v.normalize().scale(maxSpeed);
      l = maxSpeed;
    }
    this.speed = l;
    if (l > epsilon) {
      this.d.set_xy(this.v.x / l, this.v.y / l);
    }

    p.x += v.x * gameTime.deltaTime;
    p.y += v.y * gameTime.deltaTime;
    // keep on screen
    p.x = clamp(p.x, r, world.width - r);
    p.y = clamp(p.y, r, world.height - r);

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

  draw(ctx: WebGL2RenderingContext): void {
    const p: Ivec2 = this.p;
    const v: Ivec2 = this.v;
    const buffers = this.options.world.boidGl;
    const i = this.id * 4;
    buffers.pos_vel[i] = p.x;
    buffers.pos_vel[i + 1] = p.y;
    buffers.pos_vel[i + 2] = v.x;
    buffers.pos_vel[i + 3] = v.y;
    buffers.color_rad[i] = 0;
    buffers.color_rad[i + 1] = 1;
    buffers.color_rad[i + 2] = 0;
    buffers.color_rad[i + 3] = this.r;
  }
}
