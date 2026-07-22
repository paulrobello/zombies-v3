/**
 * Renderer — owns EVERY WebGL concern in the simulation. Extracted from
 * `World.ts` (ARC-002) and absorbs ARC-011 (the per-instance GL buffer
 * writes that used to live on `Boid.draw` / `Ring.draw`).
 *
 * Responsibilities (all previously on `World`):
 *
 * - The four GL program/buffer bundles: {@link boidGl}, {@link gridGl},
 *   {@link flowGridGl}, {@link ringGl}. Each bundle holds the `twgl`
 *   `ProgramInfo` + `BufferInfo` plus the per-instance typed arrays that
 *   the vertex/fragment shaders read.
 * - The four `init*Gl` methods that compile the programs and allocate the
 *   typed-array-backed attribute buffers (sized to `world.numBoids` for
 *   boid/ring, `world.boidGrid.cells.length` / `world.flowGrid.cells.length`
 *   for the grid programs).
 * - The draw methods (`drawBoids` / `drawBoidGrid` / `drawFlowGrid` /
 *   `drawRings`) that set uniforms, upload buffers, and issue the
 *   instanced draw calls in the same order the original `World.draw` did
 *   (boid/grid/flow/ring — see `World.draw` for ordering rationale).
 * - Uniform setup (`getBaseUniforms`) — `iTime` / `iFrame` / `iFrameRate` /
 *   `iDimensions` / `iMousePos` / `u_matrix` — sourced from the
 *   `GameClock`, viewport, and the Input-owned mouse state.
 * - **Context-loss restore** ({@link restoreGlContext}). On
 *   `webglcontextrestored`, `World.draw` calls this before resuming the
 *   RAF; it re-runs the `init*Gl` methods to re-create the lost GPU
 *   programs and buffers. Simulation state (boids, grids, cache) is plain
 *   JS and survives — only the GPU resources were lost.
 *
 * **ARC-011 — entity buffer writes.** The Renderer iterates the entity
 * arrays and writes each entity's pure state (position / velocity / color /
 * radius / static-flag / ring duration) into the per-instance typed arrays.
 * `Boid` and `Ring` no longer touch WebGL; they expose state, the Renderer
 * renders. Per-slot semantics are preserved exactly:
 *
 * - A dead boid writes `rad_static.x = 0` (vertex shader degenerates the
 *   position outside clip volume → fragment shader `discard`s), leaving
 *   `pos_vel` / `color` at their previous-frame values — same as the
 *   original `Boid.draw`. This matters for the Human→Zombie conversion:
 *   the appended Zombie with the reused id writes its slot LAST (it is
 *   appended after the dying Human in `world.boids`), so its live values
 *   overwrite the dead-Human zeroing.
 * - A ring's `pos_rad.w` (duration) is written UNCONDITIONALLY so the
 *   vertex shader's `< EPSILON` test reflects the ring's current lifecycle
 *   state; an inactive ring is culled without buffer compaction.
 *
 * Receives the GL context, the `World` it reads shared state from (mouse,
 * paint mode, entity arrays, dimensions), and exposes its buffer bundles
 * for the grids' `draw(buffers)` seam.
 */
import * as twgl from 'twgl.js';
import { m4 } from 'twgl.js';
import { FlowTypeColor } from './grids/FlowGrid';
import { IBoidGl, IFlowGridGl, IGridGl, IRingGl, PaintModes } from './interfaces';
import { World } from './World';

import grid_vs_shader from './shaders/grid.vs';
import grid_fs_shader from './shaders/grid.fs';

import boid_vs_shader from './shaders/boid.vs';
import boid_fs_shader from './shaders/boid.fs';

import ring_vs_shader from './shaders/ring.vs';
import ring_fs_shader from './shaders/ring.fs';

// Shared unit quad (two triangles) + texcoord that every program uploads as
// its non-instanced `vert_pos` / `texcoord` attributes. The instanced
// per-entity / per-cell attributes are uploaded separately with `divisor: 1`.
const DefaultBufferValues = {
  vert_pos: {
    numComponents: 2,
    data: [
      -0.5, -0.5,
      0.5, -0.5,
      -0.5, 0.5,
      -0.5, 0.5,
      0.5, -0.5,
      0.5, 0.5
    ]
  },
  texcoord: [
    0, 1,
    1, 1,
    0, 0,
    0, 0,
    1, 1,
    1, 0
  ]
};

export class Renderer {
  boidGl!: IBoidGl;
  gridGl!: IGridGl;
  flowGridGl!: IFlowGridGl;
  ringGl!: IRingGl;
  u_matrix: m4.Mat4 = m4.identity();

  constructor(
    private readonly ctx: WebGL2RenderingContext,
    private readonly world: World
  ) {}

  /**
   * One-time GL state init that does not depend on entity/grid sizing.
   * Called from `World` after construction and re-run on context restore.
   */
  initGlState(): void {
    twgl.addExtensionsToContext(this.ctx);
    this.ctx.disable(this.ctx.DEPTH_TEST);
    this.ctx.clearColor(0, 0, 0, 1);
  }

  /**
   * Compile the boid program (`boid.vs` / `boid.fs`) and allocate the
   * `boidGl` buffer bundle sized to `numBoids` instances. The three
   * per-instance attributes (`pos_vel`, `color`, `rad_static`) all use
   * `divisor: 1`; the shared `vert_pos` / `texcoord` come from
   * {@link DefaultBufferValues}. Re-run on context restore.
   *
   * @see IBoidGl for the per-instance packing layout.
   */
  initBoidGl(): void {
    const programInfo = twgl.createProgramInfo(this.ctx, [boid_vs_shader, boid_fs_shader]);

    const pos_vel = new Float32Array(this.world.numBoids * 4);
    const color = new Float32Array(this.world.numBoids * 4);
    const rad_static = new Float32Array(this.world.numBoids * 4);
    const bufferInfo = twgl.createBufferInfoFromArrays(
      this.ctx,
      {
        ...DefaultBufferValues,
        pos_vel: {
          numComponents: 4,
          data: pos_vel,
          divisor: 1
        },
        color: {
          numComponents: 4,
          data: color,
          divisor: 1
        },
        rad_static: {
          numComponents: 4,
          data: rad_static,
          divisor: 1
        }
      }
    );
    this.boidGl = {
      pos_vel,
      color,
      rad_static,
      programInfo,
      bufferInfo
    };
  }

  /**
   * Compile the ring program and allocate the `ringGl` buffer bundle sized
   * to `numBoids` instances. Re-run on context restore (see
   * {@link restoreGlContext}) — buffer data is re-uploaded on the next
   * `draw()` by {@link writeRingBuffers}.
   */
  initRingGl(): void {
    const programInfo = twgl.createProgramInfo(this.ctx, [ring_vs_shader, ring_fs_shader]);

    const pos_rad = new Float32Array(this.world.numBoids * 4);
    const color = new Float32Array(this.world.numBoids * 4);
    const bufferInfo = twgl.createBufferInfoFromArrays(
      this.ctx,
      {
        ...DefaultBufferValues,
        pos_rad: {
          numComponents: 4,
          data: pos_rad,
          divisor: 1
        },
        color: {
          numComponents: 4,
          data: color,
          divisor: 1
        }
      }
    );

    this.ringGl = {
      pos_rad,
      color,
      programInfo,
      bufferInfo
    };
  }

  /**
   * Compile the grid program (`grid.vs` / `grid.fs`) and allocate two
   * buffer bundles: `gridGl` (sized to `boidGrid.cells.length`, used for
   * density debug draw) and `flowGridGl` (sized to `flowGrid.cells.length`,
   * carries both `color` and `vel_len`). Both use `divisor: 1` per-cell
   * attributes; the cell's world position is reconstructed from
   * `gl_InstanceID` in the vertex shader. Re-run on context restore.
   */
  initGridGl(): void {
    const programInfo = twgl.createProgramInfo(this.ctx, [grid_vs_shader, grid_fs_shader]);

    const gridColor = new Float32Array(this.world.boidGrid.cells.length * 4);
    const flowColor = new Float32Array(this.world.flowGrid.cells.length * 4);
    const flowV = new Float32Array(this.world.flowGrid.cells.length * 4);

    const gridBufferInfo = twgl.createBufferInfoFromArrays(
      this.ctx,
      {
        ...DefaultBufferValues,
        color: {
          numComponents: 4,
          data: gridColor,
          divisor: 1
        },
        vel_len: {
          numComponents: 4,
          data: new Float32Array(this.world.flowGrid.cells.length * 4),
          divisor: 1
        }
      });

    const flowBufferInfo = twgl.createBufferInfoFromArrays(
      this.ctx,
      {
        ...DefaultBufferValues,
        color: {
          numComponents: 4,
          data: flowColor,
          divisor: 1
        },
        vel_len: {
          numComponents: 4,
          data: flowV,
          divisor: 1
        }
      });

    this.gridGl = {
      color: gridColor,
      programInfo,
      bufferInfo: gridBufferInfo
    };
    this.flowGridGl = {
      color: flowColor,
      v: flowV,
      programInfo,
      bufferInfo: flowBufferInfo
    };
  }

  getBaseUniforms() {
    const gameTime = this.world.gameClock.gameTime;
    return {
      u_matrix: this.u_matrix,
      iDimensions: this.world.dimensions,
      iTime: gameTime.currentTime,
      iTimeDelta: gameTime.deltaTime,
      iFrameRate: gameTime.fps,
      iFrame: gameTime.currentFrame,
      iMousePos: this.world.input.mouse.glP
    };
  }

  /**
   * ARC-011 — write every boid's pure state into its `id`-indexed slot in
   * the `boidGl` per-instance arrays. Replaces the per-entity `Boid.draw`
   * that used to be invoked from `World.draw`'s per-boid loop. Behaviour is
   * preserved bit-for-bit:
   *
   * - Living boids write `pos_vel` (position + velocity) and `color`.
   * - Dead boids SKIP those writes (so the previous frame's stale values
   *   remain — same as `Boid.draw`'s `if (this.alive) {…}` guard).
   * - `rad_static.x` is the boid radius when alive, 0 when dead. The dead
   *   zero makes the vertex shader emit a degenerate position outside clip
   *   volume so the fragment shader discards — see `boid.vs` / `boid.fs`.
   * - `rad_static.y` is the static flag (1 for `Food`, 0 for everything else).
   * - Iteration order is `world.boids` insertion order; a Zombie that
   *   `Human.die` appends (with the dying human's reused id) is later in
   *   the array and writes its slot last, overwriting the dead Human's
   *   zeroing. This is the QA-026 invariant.
   */
  writeBoidBuffers(): void {
    const buffers = this.boidGl;
    const boids = this.world.boids;
    for (let i = 0; i < boids.length; i++) {
      const b = boids[i];
      const idx = b.id * 4;
      if (b.alive) {
        buffers.pos_vel[idx] = b.p.x;
        buffers.pos_vel[idx + 1] = b.p.y;
        buffers.pos_vel[idx + 2] = b.v.x;
        buffers.pos_vel[idx + 3] = b.v.y;
        buffers.color[idx] = b.color.r;
        buffers.color[idx + 1] = b.color.g;
        buffers.color[idx + 2] = b.color.b;
        buffers.color[idx + 3] = b.color.a;
      }
      buffers.rad_static[idx] = b.alive ? b.r : 0;
      buffers.rad_static[idx + 1] = b.static ? 1 : 0;
    }
  }

  /**
   * ARC-011 — write every ring's pure state into its `id`-indexed slot in
   * the `ringGl` per-instance arrays. Replaces `Ring.draw`.
   *
   * `pos_rad.w` (duration) is written UNCONDITIONALLY so the ring vertex
   * shader's `< EPSILON` cull test (ring.vs:14) reflects each ring's
   * current lifecycle state. The ring pool is a fixed-size buffer indexed
   * by `id`; if a slot transitions active → inactive this frame and we
   * skipped this write, the shader would keep drawing a stale ring from
   * last frame's leftover `pos_rad.w`. Writing the actual duration (0 once
   * expired) lets the shader cull inactive rings via clip-space
   * degeneration without buffer compaction.
   */
  writeRingBuffers(): void {
    const buffers = this.ringGl;
    const rings = this.world.rings;
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      const idx = r.id * 4;
      if (r.duration) {
        buffers.pos_rad[idx] = r.p.x;
        buffers.pos_rad[idx + 1] = r.p.y;
        buffers.pos_rad[idx + 2] = r.r;
        buffers.color[idx] = r.color.r;
        buffers.color[idx + 1] = r.color.g;
        buffers.color[idx + 2] = r.color.b;
        buffers.color[idx + 3] = r.thickness;
      }
      buffers.pos_rad[idx + 3] = r.duration;
    }
  }

  drawBoidGrid(): void {
    const ctx = this.ctx;
    const world = this.world;

    ctx.useProgram(this.gridGl.programInfo.program);

    twgl.setUniforms(this.gridGl.programInfo, {
      ...this.getBaseUniforms(),
      gridCellSize: world.boidCellSize,
      gridWidth: world.boidGrid.gridXW,
      gridHeight: world.boidGrid.gridYW,
      gridMode: 1,
      paintMode: PaintModes.indexOf(world.paintMode),
      paintSize: world.paintSize
    });
    world.boidGrid.draw(this.gridGl);
    world.boidGrid.cleanCache();
    twgl.setAttribInfoBufferFromArray(ctx, this.gridGl.bufferInfo.attribs!.color, this.gridGl.color);

    twgl.setBuffersAndAttributes(ctx, this.gridGl.programInfo, this.gridGl.bufferInfo);

    ctx.drawArraysInstanced(ctx.TRIANGLES, 0, 6, world.boidGrid.cells.length);
  }

  drawFlowGrid(): void {
    const ctx = this.ctx;
    const world = this.world;

    ctx.useProgram(this.flowGridGl.programInfo.program);

    twgl.setUniforms(this.flowGridGl.programInfo, {
      ...this.getBaseUniforms(),
      gridCellSize: world.flowCellSize,
      gridWidth: world.flowGrid.gridXW,
      gridHeight: world.flowGrid.gridYW,
      gridMode: 2,
      paintMode: PaintModes.indexOf(world.paintMode),
      paintSize: world.paintSize,
      lineColor: FlowTypeColor.get(world.flowGrid.drawFlowType)!.rgba
    });
    world.flowGrid.draw(this.flowGridGl);
    world.flowGrid.cleanCache();
    twgl.setAttribInfoBufferFromArray(ctx, this.flowGridGl.bufferInfo.attribs!.color, this.flowGridGl.color);
    twgl.setAttribInfoBufferFromArray(ctx, this.flowGridGl.bufferInfo.attribs!.vel_len, this.flowGridGl.v);

    twgl.setBuffersAndAttributes(ctx, this.flowGridGl.programInfo, this.flowGridGl.bufferInfo);

    ctx.drawArraysInstanced(ctx.TRIANGLES, 0, 6, world.flowGrid.cells.length);
  }

  /**
   * Per-frame: write the per-instance boid buffers ({@link writeBoidBuffers}),
   * upload them, set uniforms, and issue the single instanced draw call for
   * the boid program. The slot-zeroing for dead boids happens in
   * {@link writeBoidBuffers} so the vertex shader culls them.
   */
  drawBoids(): void {
    const ctx = this.ctx;

    this.writeBoidBuffers();

    ctx.useProgram(this.boidGl.programInfo.program);

    twgl.setUniforms(this.boidGl.programInfo, this.getBaseUniforms());
    twgl.setAttribInfoBufferFromArray(ctx, this.boidGl.bufferInfo.attribs!.pos_vel, this.boidGl.pos_vel);
    twgl.setAttribInfoBufferFromArray(ctx, this.boidGl.bufferInfo.attribs!.color, this.boidGl.color);
    twgl.setAttribInfoBufferFromArray(ctx, this.boidGl.bufferInfo.attribs!.rad_static, this.boidGl.rad_static);
    twgl.setBuffersAndAttributes(ctx, this.boidGl.programInfo, this.boidGl.bufferInfo);
    ctx.drawArraysInstanced(ctx.TRIANGLES, 0, 6, this.world.numBoids);
  }

  drawRings(): void {
    const ctx = this.ctx;

    this.writeRingBuffers();

    ctx.useProgram(this.ringGl.programInfo.program);

    twgl.setUniforms(this.ringGl.programInfo, this.getBaseUniforms());
    twgl.setAttribInfoBufferFromArray(ctx, this.ringGl.bufferInfo.attribs!.pos_rad, this.ringGl.pos_rad);
    twgl.setAttribInfoBufferFromArray(ctx, this.ringGl.bufferInfo.attribs!.color, this.ringGl.color);
    twgl.setBuffersAndAttributes(ctx, this.ringGl.programInfo, this.ringGl.bufferInfo);
    ctx.drawArraysInstanced(ctx.TRIANGLES, 0, 6, this.world.numBoids);
  }

  /**
   * QA-007: re-create GL programs and buffers after a context-restore. The
   * simulation state is intact; only the GPU resources were lost. Called
   * from `World.draw` on the first frame after `webglcontextrestored`.
   */
  restoreGlContext(): void {
    this.initGlState();
    this.initBoidGl();
    this.initRingGl();
    this.initGridGl();
    // Per-instance data (positions, colours, durations) is re-uploaded on
    // the next draw() by writeBoidBuffers / writeRingBuffers, so no further
    // work is needed here.
  }

  /**
   * Recompute the ortho projection and resize the GL viewport. Called by
   * `World.resize` after the canvas dimensions are updated.
   */
  resize(): void {
    // In fixed-canvas mode (?width/?height) World.resize has already set the
    // drawing buffer to the requested dimensions — do NOT let twgl resize it
    // back to the CSS (window) display size.
    if (!this.world.fixedCanvasSize) {
      twgl.resizeCanvasToDisplaySize(this.world.canvas);
    }
    this.ctx.viewport(0, 0, this.world.width, this.world.height);
  }
}
