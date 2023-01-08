import { makeNoise2D } from 'fast-simplex-noise';
import * as twgl from 'twgl.js';
import { BufferInfo, m4, ProgramInfo } from 'twgl.js';
import { AlignBehavior, AvoidWallsBehavior, CollisionBehavior, FlowBehavior, SeparateBehavior } from './behaviours';
import { Boid } from './Boid';
import { GameClock } from './GameClock';
import { BoidGrid, FlowGrid, HashGridOptions } from './HashGrid';
import { IFlowValue, QueryLayerByName } from './interfaces';
import { epsilon, Ivec2, map, vec2 } from './math';

const noise = makeNoise2D();

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
export interface IFlowGridGl extends IGridGl{
  v: Float32Array;
}
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
  boidSize: number = 8;
  drag = 1;
  maxSpeed = 100;
  showField = true;
  numBoids = 500;
  wheelInc = 0.001;
  gameClock: GameClock;
  fieldRandomScale: number = Math.random() * 0.0001;
  u_matrix: m4.Mat4 = m4.identity();
  boidGl: IBoidGl;
  gridGl: IGridGl;
  flowGridGl: IFlowGridGl;
  commonVs: string;
  mousePos: vec2 = new vec2();
  glMousePos: [number, number] = [0, 0];
  layers: QueryLayerByName = new Map<string, number>();

  constructor() {
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('webgl2');

    this.gameClock = new GameClock();

    this.canvas.addEventListener('click', (event: MouseEvent) => {
      this.randomizeBoids();
    });
    this.canvas.addEventListener('mousemove', (event: MouseEvent) => {
      this.mousePos.x = event.x;
      this.mousePos.y = event.y;
      this.glMousePos[0] = event.x;
      this.glMousePos[1] = event.y;
    });
    window.addEventListener('resize', (event: UIEvent) => () => {
      // this.resize();
    });
    // window.addEventListener('wheel', (event: WheelEvent) => {
//   fieldScale += event.deltaY > 0 ? wheelInc : -wheelInc;
//   fieldScale = Math.max(Math.min(fieldScale, 1), wheelInc);
//   genField();
//   console.log(fieldScale + a);
//     });
    twgl.addExtensionsToContext(this.ctx);
    this.ctx.disable(this.ctx.DEPTH_TEST);
    this.ctx.clearColor(0, 0, 0, 1);
    this.resize();

    this.commonVs = `
#define PI2         6.28318530718
#define PI          3.14159265358

uniform mat4   u_matrix;
uniform vec2   iDimensions;  // viewport dimensions
uniform float  iTime;        // shader playback time (in seconds)
uniform float  iTimeDelta;   // render time (in seconds)
uniform float  iFrameRate;   // shader frame rate
uniform int    iFrame;       // shader playback frame
uniform vec2   iMousePos;    // mouse position in world coordinates
`;
    this.initBoidGl();
    this.initBoids();

    this.initGridGl();
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

  addLayerName(name: string): number {
    let id: number | undefined = this.layers.get(name);
    if (id) return id;
    id = Math.pow(2, this.layers.size);
    this.layers.set(name, id);
    return id;
  }

  initBoidGl() {
    console.log('initBoidGl');

    const vs = `
#version 300 es
precision mediump float;

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
  gl_Position = u_matrix * (vert_pos * vec4(color_rad.w,color_rad.w,1.0,1.0) + vec4(pos_vel.xy, 0, 0));
  v_texcoord = texcoord;
  v_color = vec4(color_rad.xyz, 1);
  float l = length(pos_vel.zw);
  v_speed = l;
  v_angle = pos_vel.zw / l;
  v_radius = color_rad.w;
}`;

    const fs = `
#version 300 es
precision mediump float;

${this.commonVs}

  in vec2 v_texcoord;
  in vec4 v_color;
  in vec2 v_angle;
  in float v_speed;
  in float v_radius;

  out vec4 FragColor;

  void main() {
    vec2 dir = vec2(0.5, 0.5) - v_texcoord;
    float r2=dot(dir, dir);
    if (r2 >= 0.25) {
      discard;
    }
    vec4 color = mix(vec4(1.0,0.0,0.0,1.0), v_color, v_speed/100.0);
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
    const x = 1;

    this.boidGl.bufferInfo = twgl.createBufferInfoFromArrays(
      this.ctx,
      {
        vert_pos: {
          numComponents: 2,
          data: [
            -x, -x,
            x, -x,
            -x, x,
            -x, x,
            x, -x,
            x, x
          ]
        },
        texcoord: [
          0, 1,
          1, 1,
          0, 0,
          0, 0,
          1, 1,
          1, 0
        ],
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
#version 300 es
precision mediump float;

${this.commonVs}

uniform float gridCellSize;
uniform float gridWidth;
uniform float gridHeight;
uniform int gridMode;

in vec2 vert_pos;
in vec2 texcoord;
in vec4 color;
in vec4 vel_len;

out vec4 v_color;
out vec2 v_angle;
out float v_speed;
out vec2 v_texcoord;

void main() {
  vec2 ot = vec2(
    float(gl_InstanceID % int(gridWidth)) * gridCellSize + (gridCellSize * 0.5),
    trunc(float(gl_InstanceID) / gridWidth) * gridCellSize + (gridCellSize * 0.5)
  );
  vec2 p = vert_pos * vec2(gridCellSize * 0.85, gridCellSize * 0.85) + ot;
  gl_Position = u_matrix * vec4(p, 0, 1);
  v_color = color;
  v_angle = vel_len.xy;
  v_speed = vel_len.z;
  v_texcoord = texcoord;
}`;

    const fs = `
#version 300 es
precision mediump float;
${this.commonVs}
uniform float gridCellSize;
uniform int gridMode;
in vec2 v_angle;
in vec4 v_color;
in float v_speed;
in vec2 v_texcoord;

out vec4 FragColor;
void main() {
  switch (gridMode) {
  case 1 : {
    FragColor = v_color;
    break;}
  case 2 : {
    vec2 dir = vec2(0.5, 0.5) - v_texcoord;
    if (dot(vec2(-v_angle.x,v_angle.y), dir)>0.0) {
      if (abs(dot(vec2(v_angle.y,v_angle.x), dir))<0.05) {
        FragColor = v_color;
      }else{
        FragColor = vec4(0.1,0.1,0.1,1.0);
      }
    }else{
      FragColor = vec4(0.1,0.1,0.1,1.0);
    }
    break;}
   }
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
    const x = 0.5;

    this.gridGl.bufferInfo = twgl.createBufferInfoFromArrays(
      this.ctx,
      {
        vert_pos: {
          numComponents: 2,
          data: [
            -x, -x,
            x, -x,
            -x, x,
            -x, x,
            x, -x,
            x, x
          ]
        },
        texcoord: [
          0, 1,
          1, 1,
          0, 0,
          0, 0,
          1, 1,
          1, 0
        ],
        color: {
          numComponents: 4,
          data: this.gridGl.color,
          divisor: 1
        }
      });

    this.flowGridGl.bufferInfo = twgl.createBufferInfoFromArrays(
      this.ctx,
      {
        vert_pos: {
          numComponents: 2,
          data: [
            -x, -x,
            x, -x,
            -x, x,
            -x, x,
            x, -x,
            x, x
          ]
        },
        texcoord: [
          0, 1,
          1, 1,
          0, 0,
          0, 0,
          1, 1,
          1, 0
        ],
        color: {
          numComponents: 4,
          data: this.flowGridGl.color,
          divisor: 1
        },
        vel_len: {
          numComponents: 4,
          data: this.flowGridGl.v,
          divisor: 1
        },
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
      computeNeighborRadius: 0,
      maxQueryCacheFrames: 0
    };
    this.boidGridOptions = {
      world: this,
      width: this.width,
      height: this.height,
      cellSize: this.boidCellSize,
      wrap: false,
      computeNeighborRadius: 3,
      maxQueryCacheFrames: 2
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
    for (let y = 0; y < this.gridYW; y += 1) {
      for (let x = 0; x < this.gridXW; x += 1) {
        this.flowGrid.addCelData(x, y, false, this.getFlowFieldValue(x, y));
      }
    }
  }

  getFlowFieldValue(x: number, y: number): IFlowValue {
    let p: Ivec2 = new vec2();
    let border = false;
    if (x === 0) {
      p.x = 1;
      border = true;
    } else if (x === this.gridXW - 1) {
      p.x = -1;
      border = true;
    }
    if (y === 0) {
      p.y = 1;
      border = true;
    } else if (y === this.gridYW - 1) {
      p.y = -1;
      border = true;
    }
    const scale = this.fieldScale + this.fieldRandomScale;
    x = (x - this.widthD2) * scale;
    y = (y - this.heightD2) * scale;
    const rad = noise(x, y);
    if (border) {
      p.add(vec2.rand(0.1, 0.5));
    } else {
      p = vec2.angle2Vec(rad * Math.PI).scale(map(rad, -1, 1, 0.01, 1));
    }
    const l = p.length() + epsilon;
    return {
      id: 0,
      layer: 0,
      p: p.scale(1 / l),
      l,
      lastCellIndex: -1,
      cellIndex: -1
    };
  }

  initBoids() {
    for (let i = 0; i < this.numBoids; i++) {
      let b = new Boid({
        world: this,
        grid: this.boidGrid,
        p: new vec2(Math.random() * this.width, Math.random() * this.height),
        v: new vec2().random(10, 100),
        r: this.boidSize
      });
      b.maxSpeed = this.maxSpeed;
      b.behaviors.set('FlowBehavior', new FlowBehavior(b, {flowGrid: this.flowGrid, normalize: true, scale: 1}));
      b.behaviors.set('AlignBehavior', new AlignBehavior(b, 50));
      b.behaviors.set('SeparateBehavior', new SeparateBehavior(b, 20));
      b.behaviors.set('CollisionBehavior', new CollisionBehavior(b, 20));
      b.behaviors.set('AvoidWallsBehavior', new AvoidWallsBehavior(b, 20));
      this.boids.push(b);
    }
  }

  randomizeBoids() {
    this.boids.forEach(b => {
      b.p.set_xy(Math.random() * this.width, Math.random() * this.height);
      b.v.random(this.maxSpeed / 2, this.maxSpeed);
    });
    this.boidGrid.reposition();
  }

  drawBoidGrid(){
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
      iMousePos: this.glMousePos,
      gridCellSize: this.boidCellSize,
      gridWidth: this.boidGrid.gridXW,
      gridHeight: this.boidGrid.gridYW,
      gridMode: 1
    });
    this.boidGrid.draw(ctx);
    twgl.setAttribInfoBufferFromArray(ctx, this.gridGl.bufferInfo.attribs.color, this.gridGl.color);
    twgl.setBuffersAndAttributes(ctx, this.gridGl.programInfo, this.gridGl.bufferInfo);

    this.ctx.drawArraysInstanced(this.ctx.TRIANGLES, 0, 6, this.boidGrid.cells.length);
  }

  drawFlowGrid(){
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
      iMousePos: this.glMousePos,
      gridCellSize: this.flowCellSize,
      gridWidth: this.flowGrid.gridXW,
      gridHeight: this.flowGrid.gridYW,
      gridMode: 2
    });
    this.flowGrid.draw(ctx);
    twgl.setAttribInfoBufferFromArray(ctx, this.flowGridGl.bufferInfo.attribs.color, this.flowGridGl.color);
    twgl.setAttribInfoBufferFromArray(ctx, this.flowGridGl.bufferInfo.attribs.vel_len, this.flowGridGl.v);

    twgl.setBuffersAndAttributes(ctx, this.flowGridGl.programInfo, this.flowGridGl.bufferInfo);

    this.ctx.drawArraysInstanced(this.ctx.TRIANGLES, 0, 6, this.flowGrid.cells.length);
  }

  drawBoids(){
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
      iMousePos: this.glMousePos
    });
    twgl.setAttribInfoBufferFromArray(ctx, this.boidGl.bufferInfo.attribs.pos_vel, this.boidGl.pos_vel);
    twgl.setAttribInfoBufferFromArray(ctx, this.boidGl.bufferInfo.attribs.color_rad, this.boidGl.color_rad);
    twgl.setBuffersAndAttributes(ctx, this.boidGl.programInfo, this.boidGl.bufferInfo);
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
    // this.drawBoidGrid();
    this.drawFlowGrid();

    for (const b of boids) {
      b.tick(gameClock.gameTime);
      b.draw(ctx);
    }

   this.drawBoids()

    // // draw fps on screen
    // ctx.textAlign = 'left';
    // ctx.textBaseline = 'top';
    // ctx.font = 'bold 36px serif';
    // ctx.fillStyle = '#FFFFFF';
    // ctx.fillText('' + gameClock.gameTime.fps.toFixed(0), 5, 5);


    document.title = this.FPS.toFixed(0);
    requestAnimationFrame(() => {
      this.draw();
    });
  }
}
