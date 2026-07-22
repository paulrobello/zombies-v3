import { makeNoise2D } from 'fast-simplex-noise';
import * as twgl from 'twgl.js';
import { BufferInfo, m4, ProgramInfo } from 'twgl.js';
import { Boid } from './boids/Boid';
import { Food } from './boids/Food';
import { Human } from './boids/Human';
import { Zombie } from './boids/Zombie';
import { GameClock } from './GameClock';
import { BoidGrid } from './grids/BoidGrid';
import { FlowGrid, FlowTypeColor, FlowTypes, IFlowValue } from './grids/FlowGrid';
import { HashGridOptions } from './grids/HashGrid';
import { QueryLayerByName } from './interfaces';
import { clamp, epsilon, vec2, vec4 } from './math';
import { Ring } from './Ring';

import grid_vs_shader from './shaders/grid.vs';
import grid_fs_shader from './shaders/grid.fs';

import boid_vs_shader from './shaders/boid.vs';
import boid_fs_shader from './shaders/boid.fs';

import ring_vs_shader from './shaders/ring.vs';
import ring_fs_shader from './shaders/ring.fs';


const noise = makeNoise2D();
export type PaintMode = 'none' | 'wall' | 'stroke' | 'attract' | 'repel';
export const PaintModes: PaintMode[] = ['none', 'wall', 'stroke', 'attract', 'repel'];

export type GridDrawMode = 'none' | 'flow' | 'boid';
export const GridDrawModes: GridDrawMode[] = ['none', 'flow', 'boid'];

export interface IRingGl {
  pos_rad: Float32Array;
  color: Float32Array;
  programInfo: ProgramInfo;
  bufferInfo: BufferInfo;
}


export interface IBoidGl {
  pos_vel: Float32Array;
  color: Float32Array;
  rad_static: Float32Array;
  programInfo: ProgramInfo;
  bufferInfo: BufferInfo;
}

export interface IGridGl {
  color: Float32Array;
  programInfo: ProgramInfo;
  bufferInfo: BufferInfo;
}

export interface IFlowGridGl extends IGridGl {
  v: Float32Array;
}

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

export class World {
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
  fieldScale: number = this.flowCellSize * 0.005;
  boids: Boid[] = [];
  rings: Ring[] = [];
  boidSize: number = 8;
  drag = 1;
  humanMaxSpeed = 50;
  zombieMaxSpeed = 16;
  showField = true;
  numBoids = 100;
  gameClock!: GameClock;
  // QA-023: fieldRandomScale is set ONCE per World instance (class-field
  // initializer runs at construction, before resize()/genField() are called).
  // Previously genField() re-randomized it on every resize, making the flow
  // field "jump" when the window was resized.
  fieldRandomScale: number = Math.random() * 0.001;
  u_matrix: m4.Mat4 = m4.identity();
  boidGl!: IBoidGl;
  gridGl!: IGridGl;
  flowGridGl!: IFlowGridGl;
  ringGl!: IRingGl;

  // QA-009: when WebGL2 is unavailable, the constructor shows a user-facing
  // message and sets `disabled` so index.ts can skip starting the render loop.
  disabled: boolean = false;

  // QA-007/QA-013: lifecycle state for context-loss recovery and clean disposal.
  private contextLost: boolean = false;
  private needsGlRestore: boolean = false;
  private statsIntervalId: ReturnType<typeof setInterval> | null = null;
  private rafId: number | null = null;
  private resizeDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
  // QA-022: dirty flag for the food gradient. Food state changes mark dirty;
  // the tick loop recomputes at most once per frame (see draw()).
  private foodGradientDirty: boolean = false;
  // Tracked event listeners so dispose() can remove them.
  private boundContextLost: ((e: Event) => void) | null = null;
  private boundContextRestored: (() => void) | null = null;
  private boundResize: (() => void) | null = null;
  private boundBeforeUnload: (() => void) | null = null;

  mouse: IMouse = {
    p: new vec2(),
    op: new vec2(),
    d: new vec2(),
    glP: [0, 0, 0, 0],
    buttons: [false, false, false, false],
    clicked: [false, false, false, false],
    shift: false,
    control: false,
    alt: false
  };

  layers: QueryLayerByName = new Map<string, number>();
  public paintMode: PaintMode = 'none';
  public paintSize: number = this.flowCellSize * 8;
  statsEl!: HTMLDivElement;
  helpEl!: HTMLDivElement;
  helpToggleEl!: HTMLDivElement;
  humans: Set<Human> = new Set<Human>();
  zombies: Set<Zombie> = new Set<Zombie>();
  food: Set<Food> = new Set<Food>();
  gridMode: GridDrawMode = 'flow';
  endTime: number = 0;


  constructor() {
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

    this.gameClock = new GameClock();

    this.helpToggleEl.addEventListener('click', () => {
      this.helpEl.classList.toggle('hidden');
    });
    window.addEventListener('keypress', (event: KeyboardEvent) => {
      if (event.key >= '0' && event.key <= '9') {
        this.paintSize = parseInt(event.key) * this.flowCellSize;
      }
      if (event.code === 'KeyG') {
        this.gridMode = GridDrawModes[(GridDrawModes.indexOf(this.gridMode) + 1) % GridDrawModes.length];
      }
      if (event.code === 'KeyH') {
        this.helpEl.classList.toggle('hidden');
      }
    });

    document.addEventListener('contextmenu', event => event.preventDefault());
    const mouseClickHandler = (event: MouseEvent) => {
      this.mouse.clicked[event.button] = true;
      this.mouse.shift = event.shiftKey;
      this.mouse.alt = event.altKey;
      this.mouse.control = event.ctrlKey;

      if (event.button === 1) {
        if (event.shiftKey) {
          this.flowGrid.drawFlowType = FlowTypes[(FlowTypes.indexOf(this.flowGrid.drawFlowType) + 1) % FlowTypes.length];
          this.flowGrid.markAllCellsChanged();
        } else {
          this.paintMode = PaintModes[(PaintModes.indexOf(this.paintMode) + 1) % PaintModes.length];
        }
      }
      event.preventDefault();
      return false;
    };
    this.canvas.addEventListener('click', mouseClickHandler);
    this.canvas.addEventListener('auxclick', mouseClickHandler);

    this.canvas.addEventListener('mouseleave', () => {
      this.mouse.clicked.fill(false);
      this.mouse.buttons.fill(false);
      this.mouse.shift = false;
      this.mouse.alt = false;
      this.mouse.control = false;
    });
    this.canvas.addEventListener('mousemove', (event: MouseEvent) => {
      this.mouse.op.x = this.mouse.p.x;
      this.mouse.op.y = this.mouse.p.y;
      this.mouse.p.x = event.x;
      this.mouse.p.y = event.y;
      this.mouse.glP[2] = this.mouse.glP[0];
      this.mouse.glP[3] = this.mouse.glP[1];
      this.mouse.glP[0] = this.mouse.p.x;
      this.mouse.glP[1] = this.mouse.p.y;
      this.mouse.shift = event.shiftKey;
      this.mouse.alt = event.altKey;
      this.mouse.control = event.ctrlKey;
      vec2.direction(this.mouse.p, this.mouse.op, this.mouse.d);
    });
    this.canvas.addEventListener('mouseup', (event: MouseEvent) => {
      this.mouse.buttons[event.button] = false;
    });
    this.canvas.addEventListener('mousedown', (event: MouseEvent) => {
      this.mouse.buttons[event.button] = true;
    });
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
    // re-runs the init*Gl methods and resumes rendering on the next frame.
    // The simulation state (boids, grids,getDataRadius cache) is plain JS and
    // survives; only GL programs/buffers need re-creation.
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

    twgl.addExtensionsToContext(this.ctx);
    this.ctx.disable(this.ctx.DEPTH_TEST);
    this.ctx.clearColor(0, 0, 0, 1);
    this.resize();

    this.initBoidGl();
    this.initBoids();
    this.initRingGl();
    this.initGridGl();

    this.statsIntervalId = setInterval(() => {
      if (this.humans.size) {
        this.endTime = this.CurrentTime;
      }
      this.statsEl.innerText = `Humans: ${this.humans.size} Zombies: ${this.zombies.size} Flow Draw Mode: ${this.flowGrid.drawFlowType} Flow Paint Mode: ${this.paintMode} FPS ${this.FPS.toFixed(0)} Humans lived for ${this.endTime.toFixed(0)} seconds`;
    }, 1000);
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
   * QA-022: Food state changes (size thresholds, death) call this instead of
   * recomputing the gradient inline. The tick loop checks the flag once per
   * frame and recomputes if dirty — collapses O(foods × cells)/frame to one
   * pass per frame.
   */
  markFoodGradientDirty(): void {
    this.foodGradientDirty = true;
  }

  /**
   * QA-007/QA-013: clear timers, cancel RAF, and remove all window/canvas
   * listeners that the constructor attached. Safe to call multiple times.
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

  /**
   * QA-007: re-create GL programs and buffers after a context-restore. The
   * simulation state is intact; only the GPU resources were lost.
   */
  private restoreGlContext(): void {
    twgl.addExtensionsToContext(this.ctx);
    this.ctx.disable(this.ctx.DEPTH_TEST);
    this.ctx.clearColor(0, 0, 0, 1);
    this.initBoidGl();
    this.initRingGl();
    this.initGridGl();
    // Buffer data (positions, colours) is re-uploaded on the next draw() by
    // each entity's draw() method, so no further work is needed here.
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
    return id;
  }

  initRingGl() {
    const vs = ring_vs_shader;
    const fs = ring_fs_shader;

    const programInfo = twgl.createProgramInfo(this.ctx, [vs, fs]);

    const pos_rad = new Float32Array(this.numBoids * 4);
    const color = new Float32Array(this.numBoids * 4);
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

  initBoidGl() {
    const vs = boid_vs_shader;
    const fs = boid_fs_shader;

    const programInfo = twgl.createProgramInfo(this.ctx, [vs, fs]);

    const pos_vel = new Float32Array(this.numBoids * 4);
    const color = new Float32Array(this.numBoids * 4);
    const rad_static = new Float32Array(this.numBoids * 4);
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


  initGridGl() {
    const vs = grid_vs_shader;
    const fs = grid_fs_shader;

    // compile shaders, link program, look up locations
    const programInfo = twgl.createProgramInfo(this.ctx, [vs, fs]);

    const gridColor = new Float32Array(this.boidGrid.cells.length * 4);
    const flowColor = new Float32Array(this.flowGrid.cells.length * 4);
    const flowV = new Float32Array(this.flowGrid.cells.length * 4);

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
          data: new Float32Array(this.flowGrid.cells.length * 4),
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

  resize() {
    this.width = this.canvas.width = Math.floor(window.innerWidth);
    this.height = this.canvas.height = Math.floor(window.innerHeight);
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

    this.genField();

    twgl.resizeCanvasToDisplaySize(this.canvas);
    this.ctx.viewport(0, 0, this.width, this.height);
  }

  genField() {
    this.flowGrid.clear();
    for (let y = 0; y < this.gridYW; y++) {
      for (let x = 0; x < this.gridXW; x++) {
        const s = x === 0 || y === 0 || x === this.gridXW - 1 || y === this.gridYW - 1;
        if (!s) continue;
        this.flowGrid.addCelData(
          x, y, false,
          this.getFlowFieldValue(x, y, s)
        );
      }
    }
  }

  getFlowFieldValue(x: number, y: number, s: boolean): IFlowValue {
    const scale = this.fieldScale + this.fieldRandomScale;
    const nx = (x - this.widthD2) * scale;
    const ny = (y - this.heightD2) * scale;
    const rad = noise(nx, ny);
    const p = vec2.angle2Vec(rad * Math.PI);
    return {
      id: 0,
      layer: this.layerByName('boid'),
      p,
      l: 1.0,
      lastCellIndex: -1,
      cellIndex: -1,
      static: s,
      solid: s
    };
  }

  getBaseUniforms() {
    const gameTime = this.gameClock.gameTime;
    return {
      u_matrix: this.u_matrix,
      iDimensions: this.dimensions,   // viewport resolution (in pixels)
      iTime: gameTime.currentTime,    // shader playback time (in seconds)
      iTimeDelta: gameTime.deltaTime, // render time (in seconds)
      iFrameRate: gameTime.fps,       // shader frame rate
      iFrame: gameTime.currentFrame,   // shader playback frame
      iMousePos: this.mouse.glP
    };
  }

  initBoids() {
    for (let i = 0; i < this.numBoids; i++) {
      const o = {
        world: this,
        grid: this.boidGrid,
        p: new vec2(
          clamp(Math.random() * this.width, this.boidCellSize * 2, this.width - this.boidCellSize * 2),
          clamp(Math.random() * this.height, this.boidCellSize * 2, this.height - this.boidCellSize * 2)
        ),
        v: new vec2().random(10, this.humanMaxSpeed),
        r: this.boidSize,
        maxSpeed: this.humanMaxSpeed,
        static: false
      };

      let b: Boid;
      if (i < 3) {
        b = new Food(o);
      } else {
        if (i < Math.floor(this.numBoids / 4)) {
          o.maxSpeed = this.zombieMaxSpeed;
          o.v.random(10, o.maxSpeed);
          b = new Zombie(o);
        } else {
          o.v.random(10, o.maxSpeed);
          b = new Human(o);
        }
      }
      this.boids.push(b);
      this.rings.push(new Ring({
        world: this,
        id: i,
        p: new vec2(),
        thickness: 0.01,
        r: 0,
        duration: 0,
        speed: 50,
        color: new vec4([1, 0, 0, 1])
      }));
    }
    this.computeFoodGradient();
  }

  randomizeBoids() {
    this.boids.forEach(b => {
      b.p.set_xy(Math.random() * this.width, Math.random() * this.height);
      b.v.random(this.humanMaxSpeed / 2, this.humanMaxSpeed);
    });
    this.boidGrid.reposition();
  }

  drawBoidGrid() {
    const ctx = this.ctx;

    this.ctx.useProgram(this.gridGl.programInfo.program);

    twgl.setUniforms(this.gridGl.programInfo, {
      ...this.getBaseUniforms(),
      gridCellSize: this.boidCellSize,
      gridWidth: this.boidGrid.gridXW,
      gridHeight: this.boidGrid.gridYW,
      gridMode: 1,
      paintMode: PaintModes.indexOf(this.paintMode),
      paintSize: this.paintSize
    });
    this.boidGrid.draw(ctx);
    this.boidGrid.cleanCache();
    twgl.setAttribInfoBufferFromArray(ctx, this.gridGl.bufferInfo.attribs!.color, this.gridGl.color);

    twgl.setBuffersAndAttributes(ctx, this.gridGl.programInfo, this.gridGl.bufferInfo);

    this.ctx.drawArraysInstanced(this.ctx.TRIANGLES, 0, 6, this.boidGrid.cells.length);
  }

  drawFlowGrid() {
    const ctx = this.ctx;

    this.ctx.useProgram(this.flowGridGl.programInfo.program);

    twgl.setUniforms(this.flowGridGl.programInfo, {
      ...this.getBaseUniforms(),
      gridCellSize: this.flowCellSize,
      gridWidth: this.flowGrid.gridXW,
      gridHeight: this.flowGrid.gridYW,
      gridMode: 2,
      paintMode: PaintModes.indexOf(this.paintMode),
      paintSize: this.paintSize,
      lineColor: FlowTypeColor.get(this.flowGrid.drawFlowType)!.rgba
    });
    this.flowGrid.draw(ctx);
    this.flowGrid.cleanCache();
    twgl.setAttribInfoBufferFromArray(ctx, this.flowGridGl.bufferInfo.attribs!.color, this.flowGridGl.color);
    twgl.setAttribInfoBufferFromArray(ctx, this.flowGridGl.bufferInfo.attribs!.vel_len, this.flowGridGl.v);

    twgl.setBuffersAndAttributes(ctx, this.flowGridGl.programInfo, this.flowGridGl.bufferInfo);

    this.ctx.drawArraysInstanced(this.ctx.TRIANGLES, 0, 6, this.flowGrid.cells.length);
  }

  drawBoids() {
    const ctx = this.ctx;

    this.ctx.useProgram(this.boidGl.programInfo.program);

    twgl.setUniforms(this.boidGl.programInfo, this.getBaseUniforms());
    twgl.setAttribInfoBufferFromArray(ctx, this.boidGl.bufferInfo.attribs!.pos_vel, this.boidGl.pos_vel);
    twgl.setAttribInfoBufferFromArray(ctx, this.boidGl.bufferInfo.attribs!.color, this.boidGl.color);
    twgl.setAttribInfoBufferFromArray(ctx, this.boidGl.bufferInfo.attribs!.rad_static, this.boidGl.rad_static);
    twgl.setBuffersAndAttributes(ctx, this.boidGl.programInfo, this.boidGl.bufferInfo);
    this.ctx.drawArraysInstanced(this.ctx.TRIANGLES, 0, 6, this.numBoids);
  }

  drawRings() {
    const ctx = this.ctx;

    this.ctx.useProgram(this.ringGl.programInfo.program);

    twgl.setUniforms(this.ringGl.programInfo, this.getBaseUniforms());
    twgl.setAttribInfoBufferFromArray(ctx, this.ringGl.bufferInfo.attribs!.pos_rad, this.ringGl.pos_rad);
    twgl.setAttribInfoBufferFromArray(ctx, this.ringGl.bufferInfo.attribs!.color, this.ringGl.color);
    twgl.setBuffersAndAttributes(ctx, this.ringGl.programInfo, this.ringGl.bufferInfo);
    this.ctx.drawArraysInstanced(this.ctx.TRIANGLES, 0, 6, this.numBoids);
  }

  public draw() {
    // QA-007: while the GL context is lost, GL calls would throw or no-op,
    // so skip the render block but keep the RAF loop alive so we recover
    // automatically when `webglcontextrestored` fires.
    if (this.contextLost) {
      this.rafId = requestAnimationFrame(() => this.draw());
      return;
    }
    // QA-007: on the first frame after restore, re-create programs/buffers.
    if (this.needsGlRestore) {
      this.restoreGlContext();
      this.needsGlRestore = false;
    }

    const gameTime = this.gameClock.gameTime;

    this.gameClock.tick();

    const m4 = twgl.m4;
    const ctx = this.ctx;
    const boids = this.boids;
    ctx.clear(ctx.COLOR_BUFFER_BIT);

    m4.ortho(0, ctx.canvas.width, ctx.canvas.height, 0, -1, 1, this.u_matrix);
    this.flowGrid.tick(gameTime);
    this.boidGrid.tick(gameTime);

    // QA-022: apply the food-gradient dirty flag once per frame, BEFORE any
    // boid reads the flow field, so all boids see a consistent gradient.
    if (this.foodGradientDirty) {
      this.computeFoodGradient();
      this.foodGradientDirty = false;
    }

    if (this.gridMode === 'boid') {
      this.drawBoidGrid();
    } else if (this.gridMode === 'flow') {
      this.drawFlowGrid();
    }

    for (const b of boids) {
      b.tick(gameTime);
      b.draw(ctx);
    }
    for (const r of this.rings) {
      r.tick(gameTime);
      r.draw(ctx);
    }
    this.drawRings();
    this.drawBoids();
    this.mouse.clicked.fill(false);
    // QA-013: track the RAF id so dispose() can cancel it.
    this.rafId = requestAnimationFrame(() => {
      this.draw();
    });
  }

  computeFoodGradient(): void {
    const food: Food[] = Array.from(this.food.values()).filter(f => f.flowEnabled);
    const flowGrid = this.flowGrid;
    const t = new vec2();
    const maxDist = Math.max(this.width, this.height) / 4;
    const layer = this.layerByName('food');
    for (const cell of flowGrid.cells) {
      let cv = cell.items[layer];
      if (!cv) {
        cv = {
          id: 0,
          layer: layer,
          p: new vec2(),
          l: 0,
          lastCellIndex: -1,
          cellIndex: -1,
          static: true,
          solid: false
        };
        flowGrid.addCelData(cell.p.x, cell.p.y, false, cv);
      }
      if (!food.length) {
        cv.p.reset();
        cv.l = 0;
      } else {
        t.reset();
        for (const f of food) {
          const dv = vec2.difference(f.p, cell.wc);
          const l = clamp(dv.length(), epsilon, maxDist);
          t.add(dv.scale((1 / l) * (1.1 - (l / maxDist))));
        }
        cv.l = 1;
        t.normalize();
        cv.p.set_xy(t.x, t.y);
      }
    }
  }
}
