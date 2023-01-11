import { AvoidBoundaryBehavior } from '../behaviours/avoid_boundary';
import { BoidBehavior } from '../behaviours/BoidBehavior';
import { CollisionBehavior } from '../behaviours/collision';
import { FlowBehavior } from '../behaviours/flow';
import { ForwardBehavior } from '../behaviours/forward';
import { BoidGrid } from '../grids/BoidGrid';
import { Cell, ICellIndexable } from '../grids/Cell';
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
}



let id = 0;

export class Boid implements IPositional, IDirectional, ICellIndexable, IProgressible, IDrawable, IGridQueryable {
  public id: number;
  public alive: boolean = true;
  public p: vec2;
  public v: vec2;
  public d: vec2;
  public a: vec2;
  public r: number;
  public r2: number;
  public speed: number = 0;
  public maxSpeed: number = 10;

  public behaviors: Map<string, BoidBehavior> = new Map<string, BoidBehavior>();
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
    this.layer = options.layer || this.options.world.addLayerName('boid');
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

    this.behaviors.set('ForwardBehavior', new ForwardBehavior(this, 1));
    this.behaviors.set('FlowBehavior', new FlowBehavior(this, 1, {
        flowGrid: this.options.world.flowGrid, normalize: false
      })
    );
    // this.behaviors.set('SeparateBehavior', new SeparateBehavior(b, 1, {margin: 32}));
    // this.behaviors.set('AlignBehavior', new AlignBehavior(b, 1.0, {margin: 100}));
    // this.behaviors.set('AttractionPointBehavior', new AttractionPointBehavior(b, 1, {target: {p: new vec2(this.options.world.widthD2, this.options.world.heightD2)}}));
    this.behaviors.set('AvoidBoundaryBehavior', new AvoidBoundaryBehavior(this, 500, {margin: this.options.world.boidCellSize * 3}));


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

  tick(gameTime: IGameTime): void {
    const grid = this.options.grid;
    if (!this.alive) {
      if (this.cellIndex !== -1) {
        grid.removeCelDataByIndex(this.cellIndex, this);
      }
      return;
    }
    for (const b of this.behaviors.values()) {
      b.tick(gameTime);
    }
    const p: Ivec2 = this.p;
    const v: Ivec2 = this.v;
    const r: number = this.r;
    const world = this.options.world;
    const t: vec2 = new vec2();

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
    const cell: Cell<IFlowValue> = flowGrid.getCell(p.x, p.y, true);
    const cv = cell.items[0];
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
  }

  draw(ctx: WebGL2RenderingContext): void {
    const p: Ivec2 = this.p;
    const v: Ivec2 = this.v;
    const buffers = this.options.world.boidGl;
    const i = this.id * 4;
    if (this.alive) {
      buffers.pos_vel[i] = p.x;
      buffers.pos_vel[i + 1] = p.y;
      buffers.pos_vel[i + 2] = v.x;
      buffers.pos_vel[i + 3] = v.y;
      buffers.color_rad[i] = this.color.r;
      buffers.color_rad[i + 1] = this.color.g;
      buffers.color_rad[i + 2] = this.color.b;
    }
    buffers.color_rad[i + 3] = this.alive ? this.r : 0;
  }
}
