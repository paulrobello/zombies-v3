import { makeNoise2D } from 'fast-simplex-noise';
import { throttle } from 'underscore';
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
  ctx: WebGL2RenderingContext;
  width: number;
  height: number;
  widthD2: number;
  heightD2: number;
  dimensions: [number, number] = [0, 0];
  flowCellSize: number = 32;
  boidCellSize: number = 32;
  gridXW: number;
  gridYW: number;
  flowGrid: FlowGrid;
  boidGrid: BoidGrid;
  flowGridOptions: HashGridOptions;
  boidGridOptions: HashGridOptions;
  fieldScale: number = this.flowCellSize * 0.005;
  boids: Boid[] = [];
  rings: Ring[] = [];
  boidSize: number = 8;
  drag = 1;
  humanMaxSpeed = 50;
  zombieMaxSpeed = 16;
  showField = true;
  numBoids = 100;
  gameClock: GameClock;
  fieldRandomScale: number = 0.001;
  u_matrix: m4.Mat4 = m4.identity();
  boidGl: IBoidGl;
  gridGl: IGridGl;
  flowGridGl: IFlowGridGl;
  ringGl: IRingGl;

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
  statsEl: HTMLDivElement;
  helpEl: HTMLDivElement;
  helpToggleEl: HTMLDivElement;
  humans: Set<Human> = new Set<Human>();
  zombies: Set<Zombie> = new Set<Zombie>();
  food: Set<Food> = new Set<Food>();
  gridMode: GridDrawMode = 'flow';
  endTime: number = 0;


  constructor() {
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('webgl2');
    this.statsEl = document.getElementById('stats') as HTMLDivElement;
    this.helpEl = document.getElementById('help') as HTMLDivElement;
    this.helpToggleEl = document.getElementById('helpToggle') as HTMLDivElement;
    // setTimeout(() => {
    //   this.helpEl.classList.toggle('hidden');
    // }, 5000);

    this.layerByName('boid');
    this.layerByName('human');
    this.layerByName('zombie');
    this.layerByName('food');

    this.gameClock = new GameClock();

    this.helpToggleEl.addEventListener('click', () => {
      this.helpEl.classList.toggle('hidden');
    });
    window.addEventListener('keypress', (event: KeyboardEvent) => {
      console.log(event);
      if (event.key >= '0' && event.key <= '9') {
        this.paintSize = parseInt(event.key) * this.flowCellSize;
      }
      if (event.code === 'KeyG') {
        this.gridMode = GridDrawModes[(GridDrawModes.indexOf(this.gridMode) + 1) % GridDrawModes.length];
        console.log(this.gridMode);
      }
      if (event.code === 'KeyH') {
        this.helpEl.classList.toggle('hidden');
      }
    });

    document.addEventListener('contextmenu', event => event.preventDefault());
    const mouseClickHandler = (event: MouseEvent) => {
      console.log('button click ', event.button);
      this.mouse.clicked[event.button] = true;
      this.mouse.shift = event.shiftKey;
      this.mouse.alt = event.altKey;
      this.mouse.control = event.ctrlKey;

      if (event.button === 1) {
        console.log(event);
        if (event.shiftKey) {
          this.flowGrid.drawFlowType = FlowTypes[(FlowTypes.indexOf(this.flowGrid.drawFlowType) + 1) % FlowTypes.length];
          this.flowGrid.markAllCellsChanged();
          console.log(this.flowGrid.drawFlowType);
        } else {
          this.paintMode = PaintModes[(PaintModes.indexOf(this.paintMode) + 1) % PaintModes.length];
          console.log(this.paintMode);
        }
      }
      event.preventDefault();
      return false;
      // this.randomizeBoids();
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
    window.addEventListener('resize', () => () => {
      // this.resize();
    });
    // window.addEventListener('wheel', throttle((event: WheelEvent) => {
    //   this.paintSize = clamp(
    //     this.paintSize + (event.deltaY < 0 ? this.wheelInc : -this.wheelInc),
    //     0,
    //     this.flowGrid.options.computeNeighborRadius * this.flowGrid.options.cellSize
    //   );
    //   console.log(this.paintSize);
    // }, 2000, {leading: true, trailing: false}));
    twgl.addExtensionsToContext(this.ctx);
    this.ctx.disable(this.ctx.DEPTH_TEST);
    this.ctx.clearColor(0, 0, 0, 1);
    this.resize();

    this.initBoidGl();
    this.initBoids();
    this.initRingGl();
    this.initGridGl();


    setInterval(() => {
      if (this.humans.size) {
        this.endTime = this.CurrentTime;
      }
      this.statsEl.innerText = `Humans: ${this.humans.size} Zombies: ${this.zombies.size} Flow Draw Mode: ${this.flowGrid.drawFlowType} Flow Paint Mode: ${this.paintMode} FPS ${this.FPS.toFixed(0)} Humans lived for ${this.endTime.toFixed(0)} seconds`;
    }, 1000);
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
    console.log('initRingGl');

    const vs = ring_vs_shader;
    const fs = ring_fs_shader;

    const programInfo = twgl.createProgramInfo(this.ctx, [vs, fs]);

    this.ringGl = {
      pos_rad: new Float32Array(this.numBoids * 4),
      color: new Float32Array(this.numBoids * 4),
      programInfo: programInfo,
      bufferInfo: undefined
    };

    this.ringGl.bufferInfo = twgl.createBufferInfoFromArrays(
      this.ctx,
      {
        ...DefaultBufferValues,
        pos_rad: {
          numComponents: 4,
          data: this.ringGl.pos_rad,
          divisor: 1
        },
        color: {
          numComponents: 4,
          data: this.ringGl.color,
          divisor: 1
        }
      }
    );
  }

  initBoidGl() {
    console.log('initBoidGl');

    const vs = boid_vs_shader;
    const fs = boid_fs_shader;

    const programInfo = twgl.createProgramInfo(this.ctx, [vs, fs]);

    this.boidGl = {
      pos_vel: new Float32Array(this.numBoids * 4),
      color: new Float32Array(this.numBoids * 4),
      rad_static: new Float32Array(this.numBoids * 4),
      programInfo: programInfo,
      bufferInfo: undefined
    };
    this.boidGl.bufferInfo = twgl.createBufferInfoFromArrays(
      this.ctx,
      {
        ...DefaultBufferValues,
        pos_vel: {
          numComponents: 4,
          data: this.boidGl.pos_vel,
          divisor: 1
        },
        color: {
          numComponents: 4,
          data: this.boidGl.color,
          divisor: 1
        },
        rad_static: {
          numComponents: 4,
          data: this.boidGl.rad_static,
          divisor: 1
        }
      }
    );
  }


  initGridGl() {
    console.log('initGridGl');
    const vs = grid_vs_shader;
    const fs = grid_fs_shader;

    // compile shaders, link program, look up locations
    const programInfo = twgl.createProgramInfo(this.ctx, [vs, fs]);
    this.gridGl = {
      color: new Float32Array(this.boidGrid.cells.length * 4),
      programInfo: programInfo,
      bufferInfo: undefined
    };
    this.flowGridGl = {
      color: new Float32Array(this.flowGrid.cells.length * 4),
      v: new Float32Array(this.flowGrid.cells.length * 4),
      programInfo: programInfo,
      bufferInfo: undefined
    };
    this.gridGl.bufferInfo = twgl.createBufferInfoFromArrays(
      this.ctx,
      {
        ...DefaultBufferValues,
        color: {
          numComponents: 4,
          data: this.gridGl.color,
          divisor: 1
        },
        vel_len: {
          numComponents: 4,
          data: new Float32Array(this.flowGrid.cells.length * 4),
          divisor: 1
        }
      });

    this.flowGridGl.bufferInfo = twgl.createBufferInfoFromArrays(
      this.ctx,
      {
        ...DefaultBufferValues,
        color: {
          numComponents: 4,
          data: this.flowGridGl.color,
          divisor: 1
        },
        vel_len: {
          numComponents: 4,
          data: this.flowGridGl.v,
          divisor: 1
        }
      });

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
    console.log('genField');
    this.fieldRandomScale = Math.random() * 0.001;
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
        if (i < this.numBoids / 4) {
          o.maxSpeed = this.zombieMaxSpeed;
          o.v.random(10, o.maxSpeed);
          b = new Zombie(o);
        } else {
          o.v.random(10, o.maxSpeed);
          b = new Human(o);
        }
      }
      // const b: Boid = new Human(o);
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
    twgl.setAttribInfoBufferFromArray(ctx, this.gridGl.bufferInfo.attribs.color, this.gridGl.color);
    // twgl.setAttribInfoBufferFromArray(ctx, this.gridGl.bufferInfo.attribs.vel_len, []);

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
      lineColor: FlowTypeColor.get(this.flowGrid.drawFlowType).rgba
    });
    this.flowGrid.draw(ctx);
    this.flowGrid.cleanCache();
    twgl.setAttribInfoBufferFromArray(ctx, this.flowGridGl.bufferInfo.attribs.color, this.flowGridGl.color);
    twgl.setAttribInfoBufferFromArray(ctx, this.flowGridGl.bufferInfo.attribs.vel_len, this.flowGridGl.v);

    twgl.setBuffersAndAttributes(ctx, this.flowGridGl.programInfo, this.flowGridGl.bufferInfo);

    this.ctx.drawArraysInstanced(this.ctx.TRIANGLES, 0, 6, this.flowGrid.cells.length);
  }

  drawBoids() {
    const gameTime = this.gameClock.gameTime;
    const ctx = this.ctx;

    this.ctx.useProgram(this.boidGl.programInfo.program);

    twgl.setUniforms(this.boidGl.programInfo, this.getBaseUniforms());
    twgl.setAttribInfoBufferFromArray(ctx, this.boidGl.bufferInfo.attribs.pos_vel, this.boidGl.pos_vel);
    twgl.setAttribInfoBufferFromArray(ctx, this.boidGl.bufferInfo.attribs.color, this.boidGl.color);
    twgl.setAttribInfoBufferFromArray(ctx, this.boidGl.bufferInfo.attribs.rad_static, this.boidGl.rad_static);
    twgl.setBuffersAndAttributes(ctx, this.boidGl.programInfo, this.boidGl.bufferInfo);
    this.ctx.drawArraysInstanced(this.ctx.TRIANGLES, 0, 6, this.numBoids);
  }

  drawRings() {
    const gameTime = this.gameClock.gameTime;
    const ctx = this.ctx;

    this.ctx.useProgram(this.ringGl.programInfo.program);

    twgl.setUniforms(this.ringGl.programInfo, this.getBaseUniforms());
    twgl.setAttribInfoBufferFromArray(ctx, this.ringGl.bufferInfo.attribs.pos_rad, this.ringGl.pos_rad);
    twgl.setAttribInfoBufferFromArray(ctx, this.ringGl.bufferInfo.attribs.color, this.ringGl.color);
    twgl.setBuffersAndAttributes(ctx, this.ringGl.programInfo, this.ringGl.bufferInfo);
    this.ctx.drawArraysInstanced(this.ctx.TRIANGLES, 0, 6, this.numBoids);
  }

  public draw() {
    const gameTime = this.gameClock.gameTime;

    this.gameClock.tick();

    const m4 = twgl.m4;
    const ctx = this.ctx;
    const boids = this.boids;
    ctx.clear(ctx.COLOR_BUFFER_BIT);

    m4.ortho(0, ctx.canvas.width, ctx.canvas.height, 0, -1, 1, this.u_matrix);
    this.flowGrid.tick(gameTime);
    this.boidGrid.tick(gameTime);

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
    requestAnimationFrame(() => {
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
          const dv = vec2.difference(f.p, cell.wc); //.scale(f.r / (this.boidCellSize / 2));
          const l = clamp(dv.length(), epsilon, maxDist);
          t.add(dv.scale((1 / l) * (1.1 - (l / maxDist)))); //.normalize();
        }
        cv.l = 1;
        // cv.l = t.length();
        t.normalize();
        cv.p.set_xy(t.x, t.y);

      }
    }
  }
}
