import { AvoidBoundaryBehavior } from '../behaviours/AvoidBoundaryBehavior';
import { BoidBehavior } from '../behaviours/BoidBehavior';
import { ForwardBehavior } from '../behaviours/ForwardBehavior';
import { BoidGrid } from '../grids/BoidGrid';
import { ICellIndexable } from '../grids/Cell';
import { IGameTime } from '../GameClock';
import { IFlowValue } from '../grids/FlowGrid';
import { HashGrid, IGridQueryable } from '../grids/HashGrid';
import { IDirectional, IDrawable, IPositional, IProgressible } from '../interfaces';
import { clamp, epsilon, vec4 } from '../math';
import { vec2, Ivec2 } from '../math';
import { World } from '../World';


export interface IBoidOptions {
  world: World,
  grid: BoidGrid,
  id?: number;
  p?: vec2,
  v?: vec2,
  d?: vec2,
  a?: vec2,
  r?: number,
  maxSpeed?: number,
  layer?: number;
  static?: boolean;
}


let id = 0;

export class Boid implements IPositional, IDirectional, ICellIndexable, IProgressible, IDrawable, IGridQueryable {
  public id: number;
  public age: number = 0;
  public alive: boolean = true;
  public static: boolean;
  public p: vec2;
  public v: vec2;
  public d: vec2;
  public a: vec2;
  public r: number;
  public r2: number;
  public speed: number = 0;
  public maxSpeed: number = 10;

  public behaviors: Map<string, BoidBehavior<Boid>> = new Map<string, BoidBehavior<Boid>>();
  public grid: HashGrid<Boid>;
  public lastCellIndex: number = -1;
  public cellIndex: number = -1;
  public layer: number = 0;
  public color: vec4 = new vec4([0, 1, 0, 1]);

  options: IBoidOptions;

  get World(): World {
    return this.options.world;
  }

  get Grid(): BoidGrid {
    return this.options.grid;
  }

  constructor(options: IBoidOptions) {
    this.options = options;
    this.id = options.id === undefined ? id++ : options.id;
    this.grid = options.grid;
    this.layer = options.layer || this.options.world.layerByName('boid');
    this.static = options.static || false;
    this.p = options.p || new vec2();
    this.v = options.v || new vec2();
    this.a = options.a || new vec2();
    this.d = new vec2();
    this.maxSpeed = options.maxSpeed || 10;
    if (this.v.squaredLength()) {
      this.v.normalize(this.d);
    }
    this.r = options.r || 5;
    this.r2 = this.r * this.r;

    this.behaviors.set('ForwardBehavior', new ForwardBehavior<Boid>(this, 1, {}));
    // this.behaviors.set('SeparateBehavior', new SeparateBehavior<Boid>(b, 1, {margin: 32}));
    // this.behaviors.set('AlignBehavior', new AlignBehavior<Boid>(b, 1.0, {margin: 100}));
    // this.behaviors.set('AttractionPointBehavior', new AttractionPointBehavior<Boid>(b, 1, {target: {p: new vec2(this.options.world.widthD2, this.options.world.heightD2)}}));
    this.behaviors.set('AvoidBoundaryBehavior', new AvoidBoundaryBehavior<Boid>(this, 200, {margin: this.options.world.boidCellSize * 3}));


    // if (this.id === 0) {
    //   this.color.rgb = [0, 0, 1];
    // }
  }

  // if (!p.isFinite()) {
  //   console.log(p);
  //   throw new Error('Boid position is not finite');
  // }
  // if (!v.isFinite()) {
  //   console.log(v);
  //   throw new Error('Boid has infinite velocity');
  // }
  die() {
    this.alive = false;
    if (this.cellIndex !== -1) {
      this.grid.removeCelDataByIndex(this.cellIndex, this);
    }
  }

  applyBehaviors(gameTime: IGameTime) {
    for (const b of this.behaviors.values()) {
      b.tick(gameTime);
    }
  }

  tick(gameTime: IGameTime): boolean {
    if (!this.alive) {
      return false;
    }
    this.age += gameTime.deltaTime;
    // if (this.r <= 0) {
    //   this.die();
    // }
    this.applyBehaviors(gameTime);
    const grid = this.options.grid;
    const p: Ivec2 = this.p;
    const v: Ivec2 = this.v;
    const r: number = this.r;
    const world = this.options.world;
    const t: vec2 = new vec2();

    if (!this.static) {
      const maxSpeed = this.maxSpeed;
      let l: number = v.length();
      if (l > maxSpeed) {
        v.normalize().scale(maxSpeed);
        l = maxSpeed;
      }
      this.speed = l;
      if (l > epsilon) {
        this.d.set_xy(v.x / l, v.y / l);
      }

      p.x += v.x * gameTime.deltaTime;
      p.y += v.y * gameTime.deltaTime;
    }
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
    const flowGrid = this.options.world.flowGrid;
    const cell = flowGrid.getCell(p.x, p.y, true)!;
    let cv: IFlowValue | undefined = cell.items[this.layer];
    if (!cv) {
      cv = {
        id: 0,
        layer: this.layer,
        p: new vec2(),
        l: 0,
        lastCellIndex: -1,
        cellIndex: -1,
        static: false,
        solid: false
      };
      flowGrid.addCelData(p.x, p.y, true, cv);
    }
    if (!cv.static) {
      if (cv.l < epsilon) {
        cv.p.set_xy(this.d.x, this.d.y);
      } else {
        cv.p.add(this.d.scale((1.5 - cv.l) * gameTime.deltaTime, t)).normalize();
      }
      cv.l = clamp(cv.l + this.speed * gameTime.deltaTime * 0.01, 0, 1);
      flowGrid.changedCells.add(cell);
    }
    // if (world.mouse.p.squaredDistanceTo(this.p) < 1000) {
    //   this.alive = false;
    // }
    // if (world.mouse.p.squaredDistanceTo(this.p) < 10000) {
    //   this.color.rgb = [1, 1, 1];
    // }else{
    //   this.color.rgb = [0, 1, 0];
    // }
    return true;
  }

  draw(_ctx: WebGL2RenderingContext): void {
    const p: Ivec2 = this.p;
    const v: Ivec2 = this.v;
    const buffers = this.options.world.boidGl;
    const i = this.id * 4;
    if (this.alive) {
      buffers.pos_vel[i] = p.x;
      buffers.pos_vel[i + 1] = p.y;
      buffers.pos_vel[i + 2] = v.x;
      buffers.pos_vel[i + 3] = v.y;
      buffers.color[i] = this.color.r;
      buffers.color[i + 1] = this.color.g;
      buffers.color[i + 2] = this.color.b;
      buffers.color[i + 3] = this.color.a;
    }
    buffers.rad_static[i] = this.alive ? this.r : 0;
    buffers.rad_static[i + 1] = this.static ? 1 : 0;
  }
}
