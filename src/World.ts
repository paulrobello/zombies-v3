/**
 * World — the simulation orchestrator. After ARC-002 this is a THIN shell
 * around four collaborators; each used to be an inline responsibility of
 * `World` and is now its own module:
 *
 * - {@link Renderer} (`src/Renderer.ts`) — owns EVERY WebGL concern: the
 *   four GL program/buffer bundles (`boidGl` / `gridGl` / `flowGridGl` /
 *   `ringGl`), the `init*Gl` methods, the draw methods, uniform setup, and
 *   the context-loss restore. Also absorbs ARC-011 — the per-instance
 *   buffer writes that used to live on `Boid.draw` / `Ring.draw` are now
 *   `Renderer.writeBoidBuffers` / `Renderer.writeRingBuffers`, iterating
 *   the entity arrays and writing each entity's pure state.
 * - {@link Input} (`src/Input.ts`) — DOM/canvas input controller. Owns
 *   every keyboard / mouse / contextmenu / help-toggle listener and the
 *   `mouse` state object (`IMouse`). Sole writer of the shared
 *   `paintMode` / `paintSize` / `gridMode` fields below.
 * - {@link Spawner} (`src/Spawner.ts`) — entity factory and the per-World
 *   boid-id allocator (ARC-009).
 * - {@link FlowFieldGenerator} (`src/FlowFieldGenerator.ts`) — procedural
 *   noise field + the food-gradient solver, with the QA-022 dirty flag.
 *
 * What `World` KEPT (its actual orchestration job): the grids (`flowGrid`
 * /`boidGrid`), the entity collections (`boids` / `rings` / `humans` /
 * `zombies` / `food`), the `layers` map, dimensions, the `options`
 * (`IWorldOptions`), the tick/draw loop (delegating per-frame work to the
 * collaborators), `resize`, `dispose`, the agent-operability hooks
 * (`exitAfter` / `exitFrames` / `fixedStep` / `dumpState` / fixed size),
 * and the context-loss listener setup.
 *
 * Lifecycle:
 *
 * - Constructed exactly once from `src/index.ts`. The constructor returns
 *   early (and sets {@link disabled}) when WebGL2 is unavailable, leaving
 *   `ctx` undefined — `index.ts` checks `world.disabled` before starting
 *   the render loop.
 * - {@link dispose} cancels the RAF, clears timers, disposes each
 *   collaborator, and removes every window/canvas listener the constructor
 *   attached. Called from a `beforeunload` listener and safe to call
 *   multiple times.
 * - **Context-loss restore.** `webglcontextlost` cancels the RAF and calls
 *   `event.preventDefault()` so the canvas stays attached.
 *   `webglcontextrestored` sets `needsGlRestore`; the next `draw()` calls
 *   {@link Renderer.restoreGlContext} which re-runs the `init*Gl` methods.
 *   Simulation state (boids, grids, cache) is plain JS and survives — only
 *   the GPU resources were lost.
 *
 * @see docs/architecture/system-overview.md — full frame-loop and per-shader
 *      attribute-packing reference (the diagram and frame walk were written
 *      for the post-ARC-002 shape this file now matches).
 */
import { GameClock, GameClockDefaultOptions, IGameTime } from './GameClock';
import { Boid } from './boids/Boid';
import { Food } from './boids/Food';
import { Human } from './boids/Human';
import { Zombie } from './boids/Zombie';
import { BoidGrid } from './grids/BoidGrid';
import { FlowGrid } from './grids/FlowGrid';
import { HashGridOptions } from './grids/HashGrid';
import {
  GridDrawMode,
  IMouse,
  IWorld,
  PaintMode,
  QueryLayerByName
} from './interfaces';
import { getSeed } from './math/random';
import { FlowFieldGenerator } from './FlowFieldGenerator';
import { Input } from './Input';
import { Renderer } from './Renderer';
import { Ring } from './Ring';
import { Spawner } from './Spawner';
import * as twgl from 'twgl.js';

/**
 * Agent-operability options wired in from `src/util/params.ts` → `src/index.ts`.
 * All fields default to "off" so the live demo (no URL params) behaves
 * identically to today: random seed per load, real deltaTime, window-sized
 * canvas, never auto-exits, no `window.__zombies`.
 *
 * See `parseUrlParams` for the corresponding URL flags.
 */
export interface IWorldOptions {
  /** Lock `GameClock.deltaTime` to `1/60`s (`?fixedStep=1`). */
  fixedStep: boolean;
  /** Stop the RAF after this many ms of wall-clock time (`?exitAfter=MS`). */
  exitAfter: number | null;
  /** Stop the RAF after this many logical frames (`?exitFrames=N`); frame-count
   *  stop is independent of wall clock / display refresh, so it is the
   *  deterministic-capture mode for screenshot equivalence. */
  exitFrames: number | null;
  /** Force the canvas to a fixed pixel width (`?width=W`). */
  fixedWidth: number | null;
  /** Force the canvas to a fixed pixel height (`?height=H`). */
  fixedHeight: number | null;
  /** Expose `window.__zombies` with live state getters (`?dumpState=1`). */
  dumpState: boolean;
}

export const WorldDefaultOptions: IWorldOptions = {
  fixedStep: false,
  exitAfter: null,
  exitFrames: null,
  fixedWidth: null,
  fixedHeight: null,
  dumpState: false
};

/**
 * Live snapshot of simulation state exposed on `window.__zombies` when
 * `?dumpState=1` is set. Every field is a getter, so reads always reflect
 * the latest frame — no per-frame assignment needed.
 */
export interface ZombieStateSnapshot {
  readonly boidCount: number;
  readonly fps: number;
  readonly seed: number;
  readonly frame: number;
  readonly fixedStep: boolean;
}

declare global {
  interface Window {
    __zombies?: ZombieStateSnapshot;
  }
}

// ARC-008: `World` is the canonical implementation of the `IWorld` structural
// interface declared in `./interfaces`. Entity / grid / behaviour modules
// depend on `IWorld` (type-only) rather than the concrete `World`, so they no
// longer import this module — breaking the historical runtime cycle.
export class World implements IWorld {
  canvas: HTMLCanvasElement;
  // The QA-009 fallback can early-return from the constructor before ctx is
  // assigned; the definite-assignment assertion is safe because index.ts
  // checks `world.disabled` before touching GL state.
  ctx!: WebGL2RenderingContext;
  width: number = 0;
  height: number = 0;
  widthD2: number = 0;
  heightD2: number = 0;
  dimensions: [number, number] = [0, 0];
  flowCellSize: number = 32;
  boidCellSize: number = 32;
  gridXW: number = 0;
  gridYW: number = 0;
  flowGrid!: FlowGrid;
  boidGrid!: BoidGrid;
  flowGridOptions!: HashGridOptions;
  boidGridOptions!: HashGridOptions;
  boids: Boid[] = [];
  rings: Ring[] = [];
  boidSize: number = 8;
  drag = 1;
  humanMaxSpeed = 50;
  zombieMaxSpeed = 16;
  showField = true;
  numBoids = 100;
  gameClock!: GameClock;

  // QA-009: when WebGL2 is unavailable, the constructor shows a user-facing
  // message and sets `disabled` so index.ts can skip starting the render loop.
  disabled: boolean = false;

  /**
   * Shared input state — Input is the sole writer, FlowGrid.tick (paint
   * logic) and the Renderer (uniform values) read. The field is allocated
   * by {@link Input}'s constructor and exposed here via a getter so the
   * existing `world.mouse` read sites keep working without each having to
   * reach through `world.input`.
   */
  get mouse(): IMouse { return this.input.mouse; }
  /** Current paint mode (writer: Input click handler; readers: FlowGrid, Renderer uniforms). */
  paintMode: PaintMode = 'none';
  /** Current paint brush radius in pixels (writer: Input keypress 0-9). */
  paintSize: number = this.flowCellSize * 8;
  /** Current grid debug draw mode (writer: Input keypress G). */
  gridMode: GridDrawMode = 'flow';

  layers: QueryLayerByName = new Map<string, number>();
  /**
   * ARC-006/QA-017: parallel registry mapping each layer bitmask (the value
   * stored on items' `.layer` field and returned by {@link layerByName}) to a
   * dense storage slot in `[0, layerCount)`. Populated in lock-step with
   * {@link layers} inside {@link layerByName}. Exposed to FlowGrid via
   * {@link layerSlotForMask} so `cell.items` can be a small dense array
   * instead of a sparse 256-slot array indexed by bitmask.
   */
  private layerSlotsByMask: Map<number, number> = new Map<number, number>();
  statsEl!: HTMLDivElement;
  helpEl!: HTMLDivElement;
  helpToggleEl!: HTMLDivElement;
  humans: Set<Human> = new Set<Human>();
  zombies: Set<Zombie> = new Set<Zombie>();
  food: Set<Food> = new Set<Food>();
  endTime: number = 0;

  // ARC-002: the four collaborators. Constructed in the constructor body
  // (after `ctx` is known to exist) and disposed in {@link dispose}.
  renderer!: Renderer;
  input!: Input;
  spawner!: Spawner;
  flowFieldGen!: FlowFieldGenerator;

  // QA-007/QA-013: lifecycle state for context-loss recovery and clean disposal.
  private contextLost: boolean = false;
  private needsGlRestore: boolean = false;
  private statsIntervalId: ReturnType<typeof setInterval> | null = null;
  private rafId: number | null = null;
  private resizeDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
  // Tracked event listeners so dispose() can remove them.
  private boundContextLost: ((e: Event) => void) | null = null;
  private boundContextRestored: (() => void) | null = null;
  private boundResize: (() => void) | null = null;
  private boundBeforeUnload: (() => void) | null = null;
  // Agent-operability: the wall-clock timestamp captured at construction,
  // used by `draw()` to honour `?exitAfter=MS`. Zero when exitAfter is null.
  private exitAfterStartMs: number = 0;

  constructor(private readonly options: IWorldOptions = WorldDefaultOptions) {
    // Agent-operability: anchor for `?exitAfter=MS`. Captured at construction
    // (the RAF loop is started synchronously from `index.ts` immediately
    // after, so the skew is sub-millisecond).
    this.exitAfterStartMs = performance.now();
    const canvas = document.getElementById('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('Canvas element #canvas not found or is not an HTMLCanvasElement');
    }
    this.canvas = canvas;
    const ctx = canvas.getContext('webgl2');
    if (!ctx) {
      // QA-009: graceful user-facing fallback instead of an opaque TypeError.
      // Show a message over the blank canvas and stop init cleanly so we do
      // not proceed to set up GL objects on a null context.
      this.disabled = true;
      this.showWebGL2UnsupportedMessage();
      return;
    }
    this.ctx = ctx;
    const statsEl = document.getElementById('stats');
    const helpEl = document.getElementById('help');
    const helpToggleEl = document.getElementById('helpToggle');
    if (!(statsEl instanceof HTMLDivElement) || !(helpEl instanceof HTMLDivElement) || !(helpToggleEl instanceof HTMLDivElement)) {
      throw new Error('Required DOM elements (stats/help/helpToggle) not found or are not HTMLDivElements');
    }
    this.statsEl = statsEl;
    this.helpEl = helpEl;
    this.helpToggleEl = helpToggleEl;

    this.layerByName('boid');
    this.layerByName('human');
    this.layerByName('zombie');
    this.layerByName('food');

    this.gameClock = new GameClock({ ...GameClockDefaultOptions, fixedStep: this.options.fixedStep });

    // ARC-002: construct the collaborators. Order matters — Spawner and
    // FlowFieldGenerator only store the World reference at construction
    // time and read world.X later, so they're safe to instantiate before
    // resize() populates the grids. Input.bind() attaches DOM listeners
    // whose handlers also read world.flowGrid, but those handlers fire
    // asynchronously (well after this constructor returns).
    this.renderer = new Renderer(this.ctx, this);
    this.input = new Input(this, this.canvas, this.helpEl, this.helpToggleEl);
    this.spawner = new Spawner(this);
    this.flowFieldGen = new FlowFieldGenerator(this);
    this.input.bind();

    // QA-008: the previous listener was `() => () => { /* this.resize(); */ }` —
    // a curried no-op whose inner arrow was never called. Debounce the real
    // call so a drag-resize doesn't thrash the grid.
    this.boundResize = () => {
      if (this.resizeDebounceTimeout !== null) {
        clearTimeout(this.resizeDebounceTimeout);
      }
      this.resizeDebounceTimeout = setTimeout(() => {
        this.resize();
        this.resizeDebounceTimeout = null;
      }, 150);
    };
    window.addEventListener('resize', this.boundResize);

    // QA-007: WebGL2 context-loss recovery. On `webglcontextlost` we cancel
    // the pending RAF and preventDefault so the canvas stays attached. On
    // `webglcontextrestored` we set the needsGlRestore flag; the draw loop
    // calls `renderer.restoreGlContext()` and resumes rendering on the next
    // frame. The simulation state (boids, grids, getDataRadius cache) is
    // plain JS and survives; only GL programs/buffers need re-creation
    // (handled by the Renderer).
    this.boundContextLost = (event: Event) => {
      event.preventDefault();
      this.contextLost = true;
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    };
    this.boundContextRestored = () => {
      this.contextLost = false;
      this.needsGlRestore = true;
    };
    this.canvas.addEventListener('webglcontextlost', this.boundContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.boundContextRestored);

    // QA-013: ensure timer/listener cleanup on page unload.
    this.boundBeforeUnload = () => this.dispose();
    window.addEventListener('beforeunload', this.boundBeforeUnload);

    this.renderer.initGlState();
    this.resize();

    this.renderer.initBoidGl();
    this.spawner.initBoids();
    this.renderer.initRingGl();
    this.renderer.initGridGl();

    this.statsIntervalId = setInterval(() => {
      if (this.humans.size) {
        this.endTime = this.CurrentTime;
      }
      this.statsEl.innerText = `Humans: ${this.humans.size} Zombies: ${this.zombies.size} Flow Draw Mode: ${this.flowGrid.drawFlowType} Flow Paint Mode: ${this.paintMode} FPS ${this.FPS.toFixed(0)} Humans lived for ${this.endTime.toFixed(0)} seconds`;
    }, 1000);

    // Agent-operability: expose live state on `window.__zombies` when
    // `?dumpState=1` is set. Each field is a getter so the snapshot reflects
    // the latest frame without per-frame assignment here.
    if (this.options.dumpState) {
      this.setupDumpState();
    }
  }

  /**
   * Install the live `window.__zombies` snapshot used by screenshot/agent
   * drivers. Getters read through to the current frame, so an external
   * script can poll `window.__zombies.boidCount` etc. without touching the DOM.
   */
  private setupDumpState(): void {
    const worldRef: World = this;
    window.__zombies = {
      get boidCount(): number { return worldRef.boids.length; },
      get fps(): number { return worldRef.FPS; },
      get seed(): number { return getSeed(); },
      get frame(): number { return worldRef.CurrentFrame; },
      get fixedStep(): boolean { return worldRef.gameClock.fixedStep; }
    };
  }

  /**
   * QA-009: Renders a fullscreen message over the canvas when WebGL2 is
   * unavailable. Kept as a DOM overlay rather than crashing so the user sees
   * a clear, supportable message instead of a white screen.
   */
  private showWebGL2UnsupportedMessage(): void {
    const el = document.createElement('div');
    el.textContent = 'WebGL2 is required to run this simulation. Please use a WebGL2-capable browser.';
    el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#111;color:#eee;font-family:sans-serif;padding:1rem;text-align:center;z-index:10;';
    document.body.appendChild(el);
  }

  /**
   * QA-022: delegates to {@link FlowFieldGenerator.markFoodGradientDirty}.
   * Kept on `World` because `Food.tick` / `Food.die` reach through
   * `this.World.markFoodGradientDirty()` — the delegation lets the existing
   * entity code keep its shape while the dirty flag lives next to the
   * solver that consumes it.
   */
  markFoodGradientDirty(): void {
    this.flowFieldGen.markFoodGradientDirty();
  }

  /**
   * ARC-009: delegates to {@link Spawner.nextBoidId}. Kept on `World`
   * because `Boid`'s constructor reaches through `options.world.nextBoidId()`.
   */
  nextBoidId(): number {
    return this.spawner.nextBoidId();
  }

  /**
   * QA-007/QA-013: clear timers, cancel RAF, dispose each collaborator,
   * and remove all window/canvas listeners that the constructor attached.
   * Safe to call multiple times.
   */
  dispose(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.statsIntervalId !== null) {
      clearInterval(this.statsIntervalId);
      this.statsIntervalId = null;
    }
    if (this.resizeDebounceTimeout !== null) {
      clearTimeout(this.resizeDebounceTimeout);
      this.resizeDebounceTimeout = null;
    }
    this.gameClock.dispose();
    this.input?.dispose();
    if (this.boundResize) {
      window.removeEventListener('resize', this.boundResize);
      this.boundResize = null;
    }
    if (this.boundContextLost) {
      this.canvas.removeEventListener('webglcontextlost', this.boundContextLost);
      this.boundContextLost = null;
    }
    if (this.boundContextRestored) {
      this.canvas.removeEventListener('webglcontextrestored', this.boundContextRestored);
      this.boundContextRestored = null;
    }
    if (this.boundBeforeUnload) {
      window.removeEventListener('beforeunload', this.boundBeforeUnload);
      this.boundBeforeUnload = null;
    }
  }

  get CurrentFrame(): number {
    return this.gameClock.gameTime.currentFrame;
  }

  get CurrentTime(): number {
    return this.gameClock.gameTime.currentTime;
  }

  get DeltaTme(): number {
    return this.gameClock.gameTime.deltaTime;
  }

  get FPS(): number {
    return this.gameClock.gameTime.fps;
  }

  layerByName(name: string): number {
    let id: number | undefined = this.layers.get(name);
    if (id) return id;
    id = Math.pow(2, this.layers.size + 1);
    this.layers.set(name, id);
    // ARC-006/QA-017: assign a dense storage slot alongside the bitmask. The
    // bitmask is the query mask (HashGrid); the slot is the FlowGrid
    // `cell.items` storage index. Decoupling them means adding layers beyond
    // the 8th no longer overflows a hard-coded 256-slot array.
    this.layerSlotsByMask.set(id, this.layerSlotsByMask.size);
    return id;
  }

  /**
   * ARC-006/QA-017: dense storage slot for a layer name. Returns the same
   * registration-order index regardless of how many layers exist (no 2^n
   * spacing), so `FlowGrid.cell.items` can be sized to {@link layerCount}.
   */
  layerSlot(name: string): number {
    const mask: number = this.layerByName(name); // ensures registration
    return this.layerSlotForMask(mask);
  }

  /**
   * ARC-006/QA-017: dense storage slot for a layer bitmask (the value
   * returned by {@link layerByName} and stored on each item's `.layer`
   * field). Used by FlowGrid write sites that have an item with `.layer`
   * already set and need the storage index.
   */
  layerSlotForMask(mask: number): number {
    const slot: number | undefined = this.layerSlotsByMask.get(mask);
    if (slot === undefined) {
      throw new Error(`Unknown layer bitmask ${mask}; register via layerByName first`);
    }
    return slot;
  }

  /** ARC-006/QA-017: number of registered layers; sizes FlowGrid.cell.items. */
  get layerCount(): number {
    return this.layerSlotsByMask.size;
  }

  resize() {
    // Agent-operability: `?width=W&height=H` forces fixed canvas dimensions
    // so screenshots are a stable size; the resize listener reuses the same
    // values rather than re-reading the window.
    const fixedW: number | null = this.options.fixedWidth;
    const fixedH: number | null = this.options.fixedHeight;
    this.width = this.canvas.width = fixedW !== null ? fixedW : Math.floor(window.innerWidth);
    this.height = this.canvas.height = fixedH !== null ? fixedH : Math.floor(window.innerHeight);
    this.dimensions[0] = this.width;
    this.dimensions[1] = this.height;
    this.widthD2 = Math.floor(this.width / 2);
    this.heightD2 = Math.floor(this.height / 2);
    this.gridXW = Math.ceil(this.width / this.flowCellSize);
    this.gridYW = Math.ceil(this.height / this.flowCellSize);

    this.flowGridOptions = {
      world: this,
      width: this.width,
      height: this.height,
      cellSize: this.flowCellSize,
      wrap: false,
      computeNeighborRadius: 8,
      maxQueryCacheFrames: 0
    };
    this.boidGridOptions = {
      world: this,
      width: this.width,
      height: this.height,
      cellSize: this.boidCellSize,
      wrap: false,
      computeNeighborRadius: 10,
      maxQueryCacheFrames: 0
    };
    if (!this.flowGrid) {
      this.flowGrid = new FlowGrid(this.flowGridOptions);
    } else {
      this.flowGrid.resize(this.flowGridOptions, false);
    }
    if (!this.boidGrid) {
      this.boidGrid = new BoidGrid(this.boidGridOptions);
    } else {
      this.boidGrid.resize(this.boidGridOptions, true);
    }

    this.flowFieldGen.genField();

    this.renderer.resize();
  }

  /**
   * Frame entry point (called via requestAnimationFrame). Order:
   * 1. Context-loss gate — keep the RAF alive but skip GL work while lost.
   * 2. Context-restore gate — delegate to `renderer.restoreGlContext()`
   *    on the first frame after restore.
   * 3. Advance the `GameClock` (single source of `IGameTime`).
   * 4. Clear, set ortho projection (Renderer-owned `u_matrix`).
   * 5. Tick `flowGrid` and `boidGrid` (paint + fade; boidGrid is a no-op).
   * 6. Apply the food-gradient dirty flag once if set (before any boid
   *    reads the flow field, so all boids see a consistent gradient).
   * 7. Optional grid debug draw (`gridMode === 'boid' | 'flow'`).
   * 8. Tick every boid / ring. Entities expose pure state — no GL writes.
   * 9. `renderer.drawRings()` + `renderer.drawBoids()` write the
   *    per-instance buffers from entity state and issue the instanced draws.
   * 10. Reset `mouse.clicked`, re-arm RAF (subject to agent-operability
   *     exit conditions).
   */
  public draw(): void {
    // QA-007: while the GL context is lost, GL calls would throw or no-op,
    // so skip the render block but keep the RAF loop alive so we recover
    // automatically when `webglcontextrestored` fires.
    if (this.contextLost) {
      this.rafId = requestAnimationFrame(() => this.draw());
      return;
    }
    // QA-007: on the first frame after restore, re-create programs/buffers.
    if (this.needsGlRestore) {
      this.renderer.restoreGlContext();
      this.needsGlRestore = false;
    }

    const gameTime: IGameTime = this.gameClock.gameTime;

    this.gameClock.tick();

    const ctx = this.ctx;
    ctx.clear(ctx.COLOR_BUFFER_BIT);

    // Recompute the ortho projection each frame in case the canvas was
    // resized (canvas.width / height are the source of truth post-resize).
    twgl.m4.ortho(0, ctx.canvas.width, ctx.canvas.height, 0, -1, 1, this.renderer.u_matrix);

    this.flowGrid.tick(gameTime);
    this.boidGrid.tick(gameTime);

    // QA-022: apply the food-gradient dirty flag once per frame, BEFORE any
    // boid reads the flow field, so all boids see a consistent gradient.
    this.flowFieldGen.applyFoodGradientIfDirty();

    if (this.gridMode === 'boid') {
      this.renderer.drawBoidGrid();
    } else if (this.gridMode === 'flow') {
      this.renderer.drawFlowGrid();
    }

    // ARC-011: entities are ticked for state only — no per-entity GL writes.
    // A Human→Zombie conversion inside b.tick() appends a Zombie to this.boids
    // with the dying human's reused id; the Zombie is therefore visited
    // later in this same loop, and the Renderer's subsequent
    // writeBoidBuffers() pass writes its slot last (the QA-026 invariant).
    const boids = this.boids;
    for (let i = 0; i < boids.length; i++) {
      boids[i].tick(gameTime);
    }
    const rings = this.rings;
    for (let i = 0; i < rings.length; i++) {
      rings[i].tick(gameTime);
    }

    this.renderer.drawRings();
    this.renderer.drawBoids();
    this.input.endFrame();

    // Agent-operability: `?exitAfter=MS` — once MS wall-clock ms have elapsed
    // since construction, do NOT re-arm the RAF. The framebuffer holds the
    // last fully-rendered frame, which is the deterministic screenshot point.
    if (this.options.exitAfter !== null) {
      const elapsed: number = performance.now() - this.exitAfterStartMs;
      if (elapsed >= this.options.exitAfter) {
        this.rafId = null;
        return;
      }
    }
    // Agent-operability: `?exitFrames=N` — stop after N logical frames. This is
    // the deterministic-capture mode (independent of wall clock and display
    // refresh), used for screenshot equivalence testing.
    if (this.options.exitFrames !== null && gameTime.currentFrame >= this.options.exitFrames) {
      this.rafId = null;
      return;
    }
    // QA-013: track the RAF id so dispose() can cancel it.
    this.rafId = requestAnimationFrame(() => {
      this.draw();
    });
  }
}
