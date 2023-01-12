import { makeNoise2D } from 'fast-simplex-noise';
import { throttle } from 'underscore';
import * as twgl from 'twgl.js';
import { BufferInfo, m4, ProgramInfo } from 'twgl.js';
import { Boid } from './boids/Boid';
import { Human } from './boids/Human';
import { Zombie } from './boids/Zombie';
import { GameClock } from './GameClock';
import { BoidGrid } from './grids/BoidGrid';
import { FlowGrid, FlowTypeColor, FlowTypes, IFlowValue } from './grids/FlowGrid';
import { HashGridOptions } from './grids/HashGrid';
import { QueryLayerByName } from './interfaces';
import { clamp, vec2, vec4 } from './math';
import { Ring } from './Ring';

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
  color_rad: Float32Array;
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
  maxSpeed = 50;
  showField = true;
  numBoids = 100;
  wheelInc = this.flowCellSize;
  gameClock: GameClock;
  fieldRandomScale: number = 0.001;
  u_matrix: m4.Mat4 = m4.identity();
  boidGl: IBoidGl;
  gridGl: IGridGl;
  flowGridGl: IFlowGridGl;
  ringGl: IRingGl;
  commonVs: string;
  mouse: IMouse = {
    p: new vec2(),
    op: new vec2(),
    d: new vec2(),
    glP: [0, 0, 0, 0],
    buttons: [false, false, false, false],
    clicked: [false, false, false, false]
  };

  layers: QueryLayerByName = new Map<string, number>();
  public paintMode: PaintMode = 'none';
  public paintSize: number = this.flowCellSize * 8;
  statsEl: HTMLDivElement;
  helpEl: HTMLDivElement;
  helpToggleEl: HTMLDivElement;
  humans: Set<Human> = new Set<Human>();
  zombies: Set<Zombie> = new Set<Zombie>();
  gridMode: GridDrawMode = 'flow';


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

    this.canvas.addEventListener('mouseleave', (event: MouseEvent) => {
      this.mouse.buttons.fill(false);
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
      vec2.direction(this.mouse.p, this.mouse.op, this.mouse.d);
    });
    this.canvas.addEventListener('mouseup', (event: MouseEvent) => {
      this.mouse.buttons[event.button] = false;
    });
    this.canvas.addEventListener('mousedown', (event: MouseEvent) => {
      this.mouse.buttons[event.button] = true;
    });
    window.addEventListener('resize', (event: UIEvent) => () => {
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

    this.commonVs = `#version 300 es
precision mediump float;

#define PI2         6.28318530718
#define PI          3.14159265358
#define EPSILON     0.00001
uniform mat4   u_matrix;
uniform vec2   iDimensions;  // viewport dimensions
uniform float  iTime;        // shader playback time (in seconds)
uniform float  iTimeDelta;   // render time (in seconds)
uniform float  iFrameRate;   // shader frame rate
uniform int    iFrame;       // shader playback frame
uniform vec4   iMousePos;    // mouse position in world coordinates
`;
    this.initBoidGl();
    this.initBoids();
    this.initRingGl();
    this.initGridGl();

    setInterval(() => {
      this.statsEl.innerText = `Humans: ${this.humans.size} Zombies: ${this.zombies.size} Flow Draw Mode: ${this.flowGrid.drawFlowType} Flow Paint Mode: ${this.paintMode} FPS ${this.gameClock.gameTime.fps.toFixed(0)}`;
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

    const vs = `
${this.commonVs}

in vec4 vert_pos;
in vec2 texcoord;
in vec4 pos_rad;
in vec4 color;

out vec2 v_texcoord;
out vec4 v_color;
out float v_radius;
flat out float v_duration;
flat out float v_thickness;
void main() {
  if (pos_rad.w < EPSILON){
    gl_Position = vec4(0,0,0,1);
  } else {
    gl_Position = u_matrix * (vert_pos * vec4(pos_rad.z * 2.0,pos_rad.z * 2.0,1.0,1.0) + vec4(pos_rad.xy, 0, 0));
  }
  v_texcoord = texcoord;
  v_color = vec4(color.xyz, 1);
  v_radius = pos_rad.z * 2.0;
  v_duration = pos_rad.w;
  v_thickness = color.w;
}`;

    const fs = `
${this.commonVs}

  in vec2 v_texcoord;
  in vec4 v_color;
  in float v_radius;
  flat in float v_duration;
  flat in float v_thickness;

  out vec4 FragColor;

  void main() {
    if (v_duration < EPSILON){
      discard;
    }
    vec2 dir = vec2(0.5, 0.5) - v_texcoord;
    float r2=dot(dir, dir);
    if (r2 >= 0.25) {
      discard;
    }
    if (r2<0.25-v_thickness){
      discard;
    }
    FragColor = v_color;
  }`;

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

    const vs = `
${this.commonVs}

in vec4 vert_pos;
in vec2 texcoord;
in vec4 pos_vel;
in vec4 color_rad;

out vec2 v_texcoord;
out vec4 v_color;
out vec2 v_angle;
out float v_speed;
out float v_radius;

void main() {
  if (color_rad.w<EPSILON){
    gl_Position = vec4(0,0,0,1);
  } else {
    gl_Position = u_matrix * (vert_pos * vec4(color_rad.w*2.0,color_rad.w*2.0,1.0,1.0) + vec4(pos_vel.xy, 0, 0));
  }
  v_texcoord = texcoord;
  v_color = vec4(color_rad.xyz, 1);
  float l = length(pos_vel.zw);
  v_speed = l;
  v_angle = pos_vel.zw / l;
  v_radius = color_rad.w*2.0;
}`;

    const fs = `
${this.commonVs}

  in vec2 v_texcoord;
  in vec4 v_color;
  in vec2 v_angle;
  in float v_speed;
  in float v_radius;

  out vec4 FragColor;

  void main() {
    if (v_radius < EPSILON){
      discard;
    }
    vec2 dir = vec2(0.5, 0.5) - v_texcoord;
    float r2=dot(dir, dir);
    if (r2 >= 0.25) {
      discard;
    }
    // vec4 color = mix(vec4(1.0,0.0,0.0,1.0), v_color, v_speed/100.0);
    vec4 color = v_color;
    if (dot(vec2(-v_angle.x,v_angle.y), dir)>0.0) {
      if (abs(dot(vec2(v_angle.y,v_angle.x), dir))<0.1) {
        FragColor = vec4(1.0,0.0,0.0,1.0);
      }else{
        FragColor = color;
      }
    }else{
      FragColor = color;
    }
    // FragColor = gl_FragColor * (0.95-r2);
  }`;

    const programInfo = twgl.createProgramInfo(this.ctx, [vs, fs]);

    this.boidGl = {
      pos_vel: new Float32Array(this.numBoids * 4),
      color_rad: new Float32Array(this.numBoids * 4),
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
        color_rad: {
          numComponents: 4,
          data: this.boidGl.color_rad,
          divisor: 1
        }
      }
    );
  }


  initGridGl() {
    console.log('initGridGl');
    const vs = `
${this.commonVs}

uniform float gridCellSize;
uniform float gridWidth;
uniform float gridHeight;
uniform int gridMode;
uniform int paintMode;
uniform float paintSize;
uniform vec4 lineColor;

in vec2 vert_pos;
in vec2 texcoord;
in vec4 color;
in vec4 vel_len;

out vec4 v_color;
out vec4 v_line_color;
out vec2 v_angle;
out float v_speed;
out vec2 v_texcoord;
flat out int v_gridMode;
flat out int v_paintMode;
flat out float v_paintSize;
flat out float v_solid;

void main() {
  vec2 ot = vec2(
    float(gl_InstanceID % int(gridWidth)) * gridCellSize + (gridCellSize * 0.5),
    trunc(float(gl_InstanceID) / gridWidth) * gridCellSize + (gridCellSize * 0.5)
  );
  vec2 p = vert_pos * vec2(gridCellSize * 0.95, gridCellSize * 0.95) + ot;
  gl_Position = u_matrix * vec4(p, 0, 1);
  v_texcoord = texcoord;
  v_color = color;
  float ps = paintSize+(gridCellSize);
  if (paintMode == 1){
    ps = gridCellSize / 2.0;
  }
  if (paintMode > 0) {
    if (length(ot - iMousePos.xy)<=ps){
      switch (paintMode) {
        case 1 : {
          v_color = vec4(0.5,0.5,0.5,1);
          break;}
        case 2 : {
          v_color = vec4(0,0,0.5,1);
          break;}
        case 3 : {
          v_color = vec4(0,0.5,0,1);
          break;}
        case 4 : {
          v_color = vec4(0.5,0,0,1);
          break;}
      } // switch
      if (vel_len.w > EPSILON){
        v_color = v_color * vec4(1.5,1.5,1.5,1.0);
      }
    } // if len
  } // if paintMode
  v_speed = length(vel_len.z);
  v_angle = normalize(vel_len.xy);
  v_solid = vel_len.w;
  v_gridMode = gridMode;
  v_paintMode = paintMode;
  v_paintSize = paintSize;
  v_line_color = lineColor;
}`;

    const fs = `
${this.commonVs}
uniform float gridCellSize;
flat in int v_gridMode;
flat in int v_paintMode;
flat in float v_paintSize;
flat in float v_solid;
in vec2 v_angle;
in vec4 v_color;
in vec4 v_line_color;
in float v_speed;
in vec2 v_texcoord;

out vec4 FragColor;
void main() {
  FragColor = v_color;
  switch (v_gridMode) {
  case 1 : {
    break;}
  case 2 : {
    if (v_solid < EPSILON){
      vec2 dir = vec2(0.5, 0.5) - v_texcoord;
      if (v_speed > EPSILON && dot(vec2(-v_angle.x, v_angle.y), dir) > 0.0) { // forward half
        if (abs(dot(vec2(v_angle.y, v_angle.x), dir)) < 0.05) { // dir line
          FragColor = v_line_color * clamp(v_speed, 0.0, 1.0);
        }
      }
    }
    break;}
   }
   FragColor.a=1.0;
}`;

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
      computeNeighborRadius: 8,
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
        this.flowGrid.addCelData(x, y, false, this.getFlowFieldValue(x, y, x === 0 || y === 0 || x === this.gridXW - 1 || y === this.gridYW - 1));
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

  initBoids() {
    for (let i = 0; i < this.numBoids; i++) {
      const o = {
        world: this,
        grid: this.boidGrid,
        p: new vec2(
          clamp(Math.random() * this.width, this.boidCellSize, this.width - this.boidCellSize),
          clamp(Math.random() * this.height, this.boidCellSize, this.height - this.boidCellSize)
        ),
        v: new vec2().random(10, 100),
        r: this.boidSize,
        maxSpeed: this.maxSpeed
      };
      const b: Boid = i < this.numBoids / 4 ? new Zombie(o) : new Human(o);
      // const b: Boid = new Human(o);
      this.boids.push(b);
      this.rings.push(new Ring({
        world: this,
        id: i,
        p: new vec2(),
        r: 0,
        thickness: 0.01,
        duration: 0,
        speed: 50,
        color: new vec4([1, 0, 0, 1])
      }));
    }
  }

  randomizeBoids() {
    this.boids.forEach(b => {
      b.p.set_xy(Math.random() * this.width, Math.random() * this.height);
      b.v.random(this.maxSpeed / 2, this.maxSpeed);
    });
    this.boidGrid.reposition();
  }

  drawBoidGrid() {
    const gameClock = this.gameClock;
    const ctx = this.ctx;

    this.ctx.useProgram(this.gridGl.programInfo.program);

    twgl.setUniforms(this.gridGl.programInfo, {
      u_matrix: this.u_matrix,
      iDimensions: this.dimensions,   // viewport resolution (in pixels)
      iTime: gameClock.gameTime.currentTime,    // shader playback time (in seconds)
      iTimeDelta: gameClock.gameTime.deltaTime, // render time (in seconds)
      iFrameRate: gameClock.gameTime.fps,       // shader frame rate
      iFrame: gameClock.gameTime.currentFrame,   // shader playback frame
      iMousePos: this.mouse.glP,
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
    const gameClock = this.gameClock;
    const ctx = this.ctx;

    this.ctx.useProgram(this.flowGridGl.programInfo.program);

    twgl.setUniforms(this.flowGridGl.programInfo, {
      u_matrix: this.u_matrix,
      iDimensions: this.dimensions,   // viewport resolution (in pixels)
      iTime: gameClock.gameTime.currentTime,    // shader playback time (in seconds)
      iTimeDelta: gameClock.gameTime.deltaTime, // render time (in seconds)
      iFrameRate: gameClock.gameTime.fps,       // shader frame rate
      iFrame: gameClock.gameTime.currentFrame,   // shader playback frame
      iMousePos: this.mouse.glP,
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
    const gameClock = this.gameClock;
    const ctx = this.ctx;

    this.ctx.useProgram(this.boidGl.programInfo.program);

    twgl.setUniforms(this.boidGl.programInfo, {
      u_matrix: this.u_matrix,
      iDimensions: this.dimensions,   // viewport resolution (in pixels)
      iTime: gameClock.gameTime.currentTime,    // shader playback time (in seconds)
      iTimeDelta: gameClock.gameTime.deltaTime, // render time (in seconds)
      iFrameRate: gameClock.gameTime.fps,       // shader frame rate
      iFrame: gameClock.gameTime.currentFrame,   // shader playback frame
      iMousePos: this.mouse.glP
    });
    twgl.setAttribInfoBufferFromArray(ctx, this.boidGl.bufferInfo.attribs.pos_vel, this.boidGl.pos_vel);
    twgl.setAttribInfoBufferFromArray(ctx, this.boidGl.bufferInfo.attribs.color_rad, this.boidGl.color_rad);
    twgl.setBuffersAndAttributes(ctx, this.boidGl.programInfo, this.boidGl.bufferInfo);
    this.ctx.drawArraysInstanced(this.ctx.TRIANGLES, 0, 6, this.numBoids);
  }

  drawRings() {
    const gameClock = this.gameClock;
    const ctx = this.ctx;

    this.ctx.useProgram(this.ringGl.programInfo.program);

    twgl.setUniforms(this.ringGl.programInfo, {
      u_matrix: this.u_matrix,
      iDimensions: this.dimensions,   // viewport resolution (in pixels)
      iTime: gameClock.gameTime.currentTime,    // shader playback time (in seconds)
      iTimeDelta: gameClock.gameTime.deltaTime, // render time (in seconds)
      iFrameRate: gameClock.gameTime.fps,       // shader frame rate
      iFrame: gameClock.gameTime.currentFrame,   // shader playback frame
      iMousePos: this.mouse.glP
    });
    twgl.setAttribInfoBufferFromArray(ctx, this.ringGl.bufferInfo.attribs.pos_rad, this.ringGl.pos_rad);
    twgl.setAttribInfoBufferFromArray(ctx, this.ringGl.bufferInfo.attribs.color, this.ringGl.color);
    twgl.setBuffersAndAttributes(ctx, this.ringGl.programInfo, this.ringGl.bufferInfo);
    this.ctx.drawArraysInstanced(this.ctx.TRIANGLES, 0, 6, this.numBoids);
  }

  public draw() {
    const gameClock = this.gameClock;

    gameClock.tick();

    const m4 = twgl.m4;
    const ctx = this.ctx;
    const boids = this.boids;
    ctx.clear(ctx.COLOR_BUFFER_BIT);

    m4.ortho(0, ctx.canvas.width, ctx.canvas.height, 0, -1, 1, this.u_matrix);
    this.flowGrid.tick(gameClock.gameTime);
    this.boidGrid.tick(gameClock.gameTime);

    if (this.gridMode === 'boid') {
      this.drawBoidGrid();
    } else if (this.gridMode === 'flow') {
      this.drawFlowGrid();
    }

    for (const b of boids) {
      b.tick(gameClock.gameTime);
      b.draw(ctx);
    }
    for (const r of this.rings) {
      r.tick(gameClock.gameTime);
      r.draw(ctx);
    }
    this.drawRings();
    this.drawBoids();
    this.mouse.clicked.fill(false);
    document.title = this.FPS.toFixed(0);
    requestAnimationFrame(() => {
      this.draw();
    });
  }
}
