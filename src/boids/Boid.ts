/**
 * Base entity for the simulation. Owns position / velocity / direction /
 * radius, a behaviour set (`behaviors: Map<string, BoidBehavior<Boid>>`,
 * Strategy pattern), and a per-instance scratch `vec2` pool reused by the
 * hot loop.
 *
 * Two invariants matter beyond the field declarations:
 *
 * - **`id` is the GL buffer slot.** `Boid.draw` writes its per-instance data
 *   at `this.id * 4` in the `pos_vel` / `color` / `rad_static` typed arrays
 *   on `World.boidGl`, so `id` must be dense in `[0, numBoids)` to match the
 *   buffer size. `World.nextBoidId` allocates ids per-World (ARC-009);
 *   `Human.die` passes an explicit `id` when spawning its replacement
 *   Zombie so the dying human's slot is reused without resizing the buffers.
 * - **Scratch pool aliasing.** {@link Boid.scratch} holds four `vec2` slots
 *   (`t`, `fp1`, `fp2`, `dTemp`) allocated once. Each slot is the `dest` of
 *   at most one call per expression (see `src/math/vec2.ts`'s `dest?`
 *   convention). Behaviours reach into this pool rather than allocating
 *   fresh temporaries every tick.
 *
 * Subclasses: {@link Human}, {@link Zombie}, {@link Food} in this directory.
 *
 * @see src/behaviors/BoidBehavior.ts — Strategy contract for `behaviors`.
 * @see docs/architecture/system-overview.md — full frame-loop and buffer
 *      layout reference.
 */
import { AvoidBoundaryBehavior } from '../behaviors/AvoidBoundaryBehavior';
import { BoidBehavior } from '../behaviors/BoidBehavior';
import { ForwardBehavior } from '../behaviors/ForwardBehavior';
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
  maxSpeed?: number;
  layer?: number;
  static?: boolean;
}


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

  /**
   * Strategy-pattern behaviour set. Iterated in **insertion order** every
   * tick by {@link applyBehaviors}; subclasses populate this in their
   * constructor (see `Human` / `Zombie`). The map key is a stable name
   * shared with the behaviour's own `this.name` so behaviours can look each
   * other up by name (used by `CollisionBehavior` to mark neighbours as
   * processed for the frame).
   *
   * Run-order is the insertion order: base `Boid` adds `ForwardBehavior`
   * then `AvoidBoundaryBehavior`; subclasses append their own (collision,
   * flow, steer, convert). `BoidBehavior.scale` is a per-behaviour
   * multiplier on its output force, `enabled` gates it on/off without
   * removing it (e.g. `Human` toggles `findFood.enabled` based on hunger).
   */
  public behaviors: Map<string, BoidBehavior<Boid>> = new Map<string, BoidBehavior<Boid>>();
  public grid: HashGrid<Boid>;
  public lastCellIndex: number = -1;
  public cellIndex: number = -1;
  public layer: number = 0;
  public color: vec4 = new vec4([0, 1, 0, 1]);

  // QA-012: per-Boid scratch vec2 pool, allocated once. Reused by tick() and
  // by this boid's behaviors (CollisionBehavior / SteerLayerBehavior / etc.)
  // via `this.boid.scratch.X` so the hot loop stops allocating short-lived
  // vec2 temporaries every frame. Aliasing rule: each named slot is only
  // passed as `dest` to a single call at a time — never two writes in
  // sequence to the same slot from the same expression.
  public readonly scratch: {
    t: vec2;     // generic temporary (force/velocity scratch)
    fp1: vec2;   // future-position: this boid
    fp2: vec2;   // future-position: neighbour
    dTemp: vec2; // direction scratch
  } = {
    t: new vec2(),
    fp1: new vec2(),
    fp2: new vec2(),
    dTemp: new vec2()
  };

  options: IBoidOptions;

  get World(): World {
    return this.options.world;
  }

  get Grid(): BoidGrid {
    return this.options.grid;
  }

  constructor(options: IBoidOptions) {
    this.options = options;
    // ARC-009: ID allocation moved off the module-level singleton onto the
    // owning World. A second World instance (or an HMR reload that constructs
    // a fresh World) gets its own counter starting at 0, so its boids get
    // dense ids in [0, numBoids) — which is what the GL instanced buffers
    // (sized to numBoids and indexed by id) require. Human.die still passes
    // an explicit `id: this.id` when spawning a Zombie, bypassing the
    // allocator to reuse the dying human's slot, so the dense-id invariant
    // holds across conversion.
    this.id = options.id === undefined ? options.world.nextBoidId() : options.id;
    this.grid = options.grid;
    this.layer = options.layer || this.options.world.layerByName('boid');
    this.static = options.static || false;
    this.p = options.p || new vec2();
    this.v = options.v || new vec2();
    this.a = options.a || new vec2();
    this.d = new vec2();
    // QA-016: `||` would default a legitimate `maxSpeed: 0` (Food) to 10.
    // `??` only applies the default when the option is null/undefined.
    this.maxSpeed = options.maxSpeed ?? 10;
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

  /**
   * Per-frame update. Runs behaviours, clamps speed, integrates position
   * (`p += v · dt`), clamps to the world bounds, applies drag, and re-indexes
   * the boid in the `BoidGrid` if it crossed a cell boundary. Then writes a
   * flow-field contribution into the `FlowGrid` cell the boid now occupies.
   *
   * Three contracts worth knowing:
   *
   * - **Cell re-index.** If the new position falls in a different cell,
   *   `removeCelDataByIndex(this.cellIndex, this)` followed by
   *   `addCelDataByIndex(newCellIndex, this)` moves the boid. `cellIndex`
   *   is the authoritative location, not `p`.
   * - **Flow-guard.** A boid clamped to the world edge can be off the flow
   *   grid (`flowGrid.getCell` returns `undefined` outside the field).
   *   `tick` returns early *after* the position clamp and grid re-index but
   *   *before* the flow contribution — the rest of the frame's work is
   *   unaffected (QA-011).
   * - **Dead boids bail.** `if (!this.alive) return;` — subclasses check
   *   `this.alive` after `super.tick(gameTime)` rather than relying on a
   *   return value (ARC-010).
   */
  tick(gameTime: IGameTime): void {
    if (!this.alive) {
      return;
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
    const t: vec2 = this.scratch.t;

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
      grid.removeCelDataByIndex(this.cellIndex, this);
      grid.addCelDataByIndex(newCellIndex, this);
    }
    const flowGrid = this.options.world.flowGrid;
    const cell = flowGrid.getCell(p.x, p.y, true);
    // QA-011: a boid clamped to the world edge can legitimately be off-grid
    // (getCell returns undefined outside the flow field). Throwing would crash
    // a valid edge case; instead, skip the flow-field update for this tick —
    // the rest of tick() has already run (position clamp, grid re-insert),
    // and the only remaining work is the flow contribution we skip here.
    if (!cell) {
      return;
    }
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
        // Aliasing-safe: this.d.scale(_, t) writes to t, then cv.p.add(t)
        // reads t and mutates cv.p in place. t != cv.p (t is this.scratch.t),
        // so the scale result survives until add() reads it.
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
