/**
 * Structural interfaces shared across the simulation: `IPositional` /
 * `IDirectional` (field shapes for entities), `IProgressible` (the tick
 * contract used by `World.draw`), the layer-name → bitmask lookup types used
 * by the spatial grids, the GL buffer-bundle shapes (`IBoidGl` / `IGridGl` /
 * `IFlowGridGl` / `IRingGl`) consumed by the {@link Renderer} and (via the
 * grid `draw(buffers)` seam) by `HashGrid` / `BoidGrid` / `FlowGrid`, plus
 * the shared mouse / paint-mode state written by {@link Input} and read by
 * the grids and the Renderer's uniforms.
 *
 * These live here, rather than on `World`, so no module has to import the
 * full `World` class (and its WebGL/twgl/DOM footprint) just for a type.
 *
 * @see src/Renderer.ts — owns the runtime buffer bundles matching these
 *      interfaces and is the only module that calls `twgl.setUniforms` /
 *      `drawArraysInstanced`.
 * @see src/grids/HashGrid.ts — `draw(buffers: IGridGl)` consumes the bundle.
 */
import type { BufferInfo, ProgramInfo } from 'twgl.js';
import { IGameTime } from './GameClock';
import { Ivec2, vec2 } from './math';

// ARC-008: type-only imports so this leaf module is never part of a runtime
// cycle with the concrete `World` / entity / grid modules. Each name is used
// only in the `IWorld` member signatures below and is erased at compile time.
import type { Boid } from './boids/Boid';
import type { FlowGrid } from './grids/FlowGrid';
import type { Food } from './boids/Food';
import type { Human } from './boids/Human';
import type { Ring } from './Ring';
import type { Zombie } from './boids/Zombie';

/**
 * Structural surface of {@link World} that entities, grids, and behaviours
 * depend on. Declared here (ARC-008) so the leaves (`boids/*`, `grids/*`,
 * `behaviors/*`) import this interface instead of the concrete `World`
 * class, breaking the historical `World ↔ grids ↔ boids` runtime cycle.
 *
 * `World` (in `src/World.ts`) is the canonical implementation:
 * `export class World implements IWorld`. The interface is intentionally
 * minimal — it exposes only the members the leaves actually read. Add to it
 * only when a leaf module gains a new dependency on `World`; do not blanket-
 * mirror `World`'s entire public surface.
 *
 * Members are grouped by the collaborator that owns them at runtime:
 * - Dimensions / tuning (World itself).
 * - Spatial grid (World constructs/owns `flowGrid`).
 * - Entity collections (entities add/remove themselves; `Human.die` pushes
 *   a replacement `Zombie` and iterates `rings`).
 * - Frame accounting (read by `HashGrid`'s query cache).
 * - Shared input state (writer: `Input`; readers: `FlowGrid`, Renderer).
 * - Layer bitmask lookup (entities + grids resolve their layer via this).
 * - Allocation / food-gradient dirty flag (delegated by `World` to
 *   `Spawner` / `FlowFieldGenerator` respectively, but kept on `World` as
 *   the entity-facing seam).
 */
export interface IWorld {
  // Dimensions — read by `Boid.tick` (edge clamp) and `AvoidBoundaryBehavior`.
  width: number;
  height: number;
  /** Per-frame velocity damping (`v *= drag`); read by `Boid.tick`. */
  drag: number;
  /** Read by `Human` (collision radius) and `Boid` (AvoidBoundary margin). */
  boidCellSize: number;
  /** Read by `Human.die` when constructing the replacement `Zombie`. */
  zombieMaxSpeed: number;

  /** Paintable multi-layer flow field; read by every flow-aware behaviour. */
  flowGrid: FlowGrid;

  /** Dense-by-id entity array (the Renderer iterates this in `drawBoids`). */
  boids: Boid[];
  /** Pre-allocated ring pool (`Spawner.initBoids`); `Human.die` activates one. */
  rings: Ring[];
  humans: Set<Human>;
  zombies: Set<Zombie>;
  food: Set<Food>;

  /** Monotonic frame counter; read by `HashGrid`'s query-cache TTL check. */
  CurrentFrame: number;

  // Shared input state (writer: Input; readers: FlowGrid.tick paint logic).
  mouse: IMouse;
  paintMode: PaintMode;
  paintSize: number;

  /**
   * Layer-bitmask registry. Returns `2^(n+1)` for the n-th distinct name,
   * registering on first call. Used by entities (their own layer) and by
   * `FlowGrid` (the currently-selected `drawFlowType` mask).
   */
  layerByName(name: string): number;

  /** Per-World boid-id allocator (ARC-009); called by the `Boid` constructor. */
  nextBoidId(): number;

  /** QA-022 dirty flag; set by `Food` on add/grow/die. */
  markFoodGradientDirty(): void;
}

export interface IPositional {
  p: Ivec2;
}

export interface IDirectional {
  d: Ivec2;
}


export interface IProgressible {
  // ARC-010: the boolean return value every implementor previously declared
  // was universally ignored at call sites (World.draw, Boid.applyBehaviors).
  // The only real consumers were the `if (!super.tick(gameTime)) return false;`
  // patterns inside Human/Zombie/Food, which actually meant "did Boid bail
  // because dead?" — those now check `this.alive` directly after the super
  // call, so the interface can honestly be `void`.
  tick: (gameTime: IGameTime) => void;
}


export type QueryLayerByName = Map<string, number>;
export type QueryLayers = number;

/**
 * Boid program buffer bundle (`boid.vs` / `boid.fs`). Per-instance data is
 * packed at `id * 4` (three `vec4`s per boid, divisor 1):
 * - `pos_vel.xy`  = world position
 * - `pos_vel.zw`  = velocity vector (px/s)
 * - `color`       = RGBA tint
 * - `rad_static.x` = radius. When `< EPSILON` (dead boid) the vertex shader
 *   emits a degenerate position outside the clip volume and the fragment
 *   shader `discard`s — see `src/shaders/boid.vs` / `boid.fs`.
 * - `rad_static.y` = static flag (1 = static, 0 = dynamic)
 * - `rad_static.zw` = unused (kept `vec4`-aligned)
 *
 * Owned and written by {@link Renderer}; the per-instance values come from
 * each `Boid`'s pure state (position, velocity, color, radius, static-flag)
 * — see ARC-011. Re-uploaded every frame via `twgl.setAttribInfoBufferFromArray`.
 *
 * @see src/shaders/boid.vs
 * @see src/shaders/boid.fs
 */
export interface IBoidGl {
  pos_vel: Float32Array;
  color: Float32Array;
  rad_static: Float32Array;
  programInfo: ProgramInfo;
  bufferInfo: BufferInfo;
}

/**
 * Grid program buffer bundle (`grid.vs` / `grid.fs`). One `color` `vec4`
 * per cell (divisor 1); `gl.InstanceID` reconstructs the cell's world center
 * in the vertex shader so no per-cell position attribute is needed. Shared
 * by `BoidGrid` (debug density draw) and `FlowGrid` (debug flow draw);
 * `gridMode` uniform selects the fragment branch.
 *
 * @see src/shaders/grid.vs
 */
export interface IGridGl {
  color: Float32Array;
  programInfo: ProgramInfo;
  bufferInfo: BufferInfo;
}

/**
 * Flow grid buffer bundle — extends {@link IGridGl} with the per-cell
 * `vel_len` `vec4` (divisor 1):
 * - `vel_len.xy` = flow direction (normalized on the write side)
 * - `vel_len.z`  = flow strength `cv.l`
 * - `vel_len.w`  = solid flag (0/1)
 */
export interface IFlowGridGl extends IGridGl {
  v: Float32Array;
}

/**
 * Ring program buffer bundle (`ring.vs` / `ring.fs`). Per-instance data is
 * packed at `id * 4` (one `vec4` per ring, divisor 1):
 * - `pos_rad.xy` = world position
 * - `pos_rad.z`  = radius
 * - `pos_rad.w`  = remaining duration (seconds). When `< EPSILON` the vertex
 *   shader degenerates the position outside the clip volume, so finished
 *   rings are culled without buffer compaction.
 * - `color.xyz`  = ring tint
 * - `color.w`    = stripe thickness
 *
 * @see src/shaders/ring.vs
 */
export interface IRingGl {
  pos_rad: Float32Array;
  color: Float32Array;
  programInfo: ProgramInfo;
  bufferInfo: BufferInfo;
}

export type PaintMode = 'none' | 'wall' | 'stroke' | 'attract' | 'repel';
export const PaintModes: PaintMode[] = ['none', 'wall', 'stroke', 'attract', 'repel'];

export type GridDrawMode = 'none' | 'flow' | 'boid';
export const GridDrawModes: GridDrawMode[] = ['none', 'flow', 'boid'];

export interface IMouse {
  p: vec2;
  op: vec2;
  d: vec2;
  glP: [number, number, number, number];
  buttons: [boolean, boolean, boolean, boolean];
  clicked: [boolean, boolean, boolean, boolean];
  shift: boolean;
  control: boolean;
  alt: boolean;
}
