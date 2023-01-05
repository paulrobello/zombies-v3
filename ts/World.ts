import { makeNoise2D } from 'fast-simplex-noise';
import * as twgl from 'twgl.js';
import { BufferInfo, m4, ProgramInfo } from 'twgl.js';
import { AlignBehavior, AvoidWallsBehavior, CollisionBehavior, SeparateBehavior } from './behaviours';
import { Boid } from './Boid';
import { GameClock } from './GameClock';
import { BoidGrid, FlowGrid, HashGridOptions } from './HashGrid';
import { IFlowValue } from './interfaces';
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

export class World {
  canvas: HTMLCanvasElement;
  ctx: WebGL2RenderingContext;
  width: number;
  height: number;
  widthD2: number;
  heightD2: number;
  dimensions: [number, number] = [0, 0];
  flowCellSize: number = 32;
  boidCellSize: number = 16;
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
  maxTime = 10000;
  showField = true;
  numBoids = 1000;
  wheelInc = 0.001;
  gameClock: GameClock;
  fieldRandomScale: number = Math.random() * 0.0001;
  u_matrix: m4.Mat4 = m4.identity();
  boidGl: IBoidGl;
  gridGl: IGridGl;
  commonVs: string;


  constructor() {
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('webgl2');

    this.gameClock = new GameClock();

    this.canvas.addEventListener('click', (event: MouseEvent) => {
      this.randomizeBoids();
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
`;
    this.initBoidGl();
    this.initBoids();

    this.initGridGl();

  }

  initBoidGl() {
    console.log('initBoidGl');

    const vs = `
${this.commonVs}
attribute vec4 vert_pos;
attribute vec2 texcoord;
attribute vec4 pos_vel;
attribute vec4 color_rad;

varying vec2 v_texcoord;
varying vec4 v_color;
varying vec2 v_angle;
varying float v_speed;
varying float v_radius;

vec3 hsv2rgb(vec3 c) {
  c = vec3(c.x, clamp(c.yz, 0.0, 1.0));
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

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
  precision mediump float;
  varying vec2 v_texcoord;
  varying vec4 v_color;
  varying vec2 v_angle;
  varying float v_speed;
  varying float v_radius;

  void main() {
    vec2 dir = vec2(0.5, 0.5) - v_texcoord;
    float r2=dot(dir, dir);
    if (r2 >= 0.25) {
      discard;
    }
    vec4 color = mix(vec4(1.0,0.0,0.0,1.0), v_color, v_speed/100.0);
    if (dot(vec2(-v_angle.x,v_angle.y), dir)>0.0) {
      if (abs(dot(vec2(v_angle.y,v_angle.x), dir))<0.1) {
        gl_FragColor = vec4(1.0,0.0,0.0,1.0);
      }else{
        gl_FragColor = color;
      }
    }else{
      gl_FragColor = color;
    }
    // gl_FragColor = gl_FragColor * (0.95-r2);
  }`;

    // compile shaders, link program, look up locations
    const programInfo = twgl.createProgramInfo(this.ctx, [vs, fs]);

    this.boidGl = {
      pos_vel: new Float32Array(this.numBoids * 4),
      color_rad: new Float32Array(this.numBoids * 4),
      programInfo: programInfo,
      bufferInfo: undefined
    };
    // for (let i = 0; i < this.numBoids / 2; i += 2) {
    //   this.gl_locations[i] = Math.random() * this.canvas.width;
    //   this.gl_locations[i + 1] = Math.random() * this.canvas.height;
    // }
    // for (let i = 0; i < this.gl_angles.length; ++i) {
    //   this.gl_angles[i] = Math.PI*2;
    // }
    const x = 1;
    const y = x;

    const bufferInfo = twgl.createBufferInfoFromArrays(
      this.ctx,
      {
        vert_pos: {
          numComponents: 2,
          data: [
            -x, -y,
            x, -y,
            -x, y,
            -x, y,
            x, -y,
            x, y
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
    this.boidGl.bufferInfo = bufferInfo;
    // twgl.setBuffersAndAttributes(this.ctx, programInfo, bufferInfo);
  }

  initGridGl() {
    console.log('initGridGl');
    const vs = `
#version 300 es
precision mediump float;

${this.commonVs}

uniform float gridCellSize;
uniform int gridWidth;
uniform int gridHeight;

in vec2 vert_pos;
in vec2 texcoord;
in vec4 color;
out vec4 v_color;

void main() {
  vec2 ot = vec2(float(gl_InstanceID % gridWidth)*gridCellSize+(gridCellSize/2.0),
                 trunc(float(gl_InstanceID) / float(gridWidth))*gridCellSize+(gridCellSize/2.0));
  gl_Position = u_matrix * vec4(vert_pos * vec2(gridCellSize*0.5, gridCellSize*0.5) + ot, 0, 1);
  v_color = color;
  // v_color = vec4(1.0, 1.0, 1.0, 1.0);
}`;

    const fs = `
#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 FragColor;
void main() {
  FragColor = v_color;
}`;

    // compile shaders, link program, look up locations
    const programInfo = twgl.createProgramInfo(this.ctx, [vs, fs]);

    this.gridGl = {
      color: new Float32Array(this.boidGrid.cells.length * 4),
      programInfo: programInfo,
      bufferInfo: undefined
    };

    const x = 0.5;
    const y = x;

    const bufferInfo = twgl.createBufferInfoFromArrays(
      this.ctx,
      {
        vert_pos: {
          numComponents: 2,
          data: [
            -x, -y,
            x, -y,
            -x, y,
            -x, y,
            x, -y,
            x, y
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
    this.gridGl.bufferInfo = bufferInfo;
    // twgl.setBuffersAndAttributes(this.ctx, programInfo, bufferInfo);
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
      computeNeighborRadius: 0
    };
    this.boidGridOptions = {
      world: this,
      width: this.width,
      height: this.height,
      cellSize: this.boidCellSize,
      wrap: false,
      computeNeighborRadius: 1
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
      // b.behaviors.set('FlowBehavior', new FlowBehavior(b, {flowGrid: this.flowGrid, normalize: true, scale: 1}));
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

  public draw() {
    const gameClock = this.gameClock;

    gameClock.tick();

    const m4 = twgl.m4;
    const ctx = this.ctx;
    const boids = this.boids;
    ctx.viewport(0, 0, this.width, this.height);
    ctx.clear(ctx.COLOR_BUFFER_BIT);

    m4.ortho(0, ctx.canvas.width, ctx.canvas.height, 0, -1, 1, this.u_matrix);

    this.ctx.useProgram(this.gridGl.programInfo.program);

    twgl.setUniforms(this.gridGl.programInfo, {
      u_matrix: this.u_matrix,
      iDimensions: this.dimensions,   // viewport resolution (in pixels)
      iTime: gameClock.gameTime.currentTime,    // shader playback time (in seconds)
      iTimeDelta: gameClock.gameTime.deltaTime, // render time (in seconds)
      iFrameRate: gameClock.gameTime.fps,       // shader frame rate
      iFrame: gameClock.gameTime.currentFrame,   // shader playback frame
      gridCellSize: this.boidCellSize,
      gridWidth: this.boidGrid.options.width,
      gridHeight: this.boidGrid.options.height
    });
    this.boidGrid.draw(ctx);

    twgl.setAttribInfoBufferFromArray(ctx, this.gridGl.bufferInfo.attribs.color, this.gridGl.color);
    twgl.setBuffersAndAttributes(ctx, this.gridGl.programInfo, this.gridGl.bufferInfo);

    this.ctx.drawArraysInstanced(this.ctx.TRIANGLES, 0, 6, this.boidGrid.cells.length);


    for (const b of boids) {
      b.tick(gameClock.gameTime);
      b.draw(ctx);
    }

    // this.ctx.useProgram(this.boidGl.programInfo.program);
    //
    // twgl.setUniforms(this.boidGl.programInfo, {
    //   u_matrix: this.u_matrix,
    //   iDimensions: this.dimensions,   // viewport resolution (in pixels)
    //   iTime: gameClock.gameTime.currentTime,    // shader playback time (in seconds)
    //   iTimeDelta: gameClock.gameTime.deltaTime, // render time (in seconds)
    //   iFrameRate: gameClock.gameTime.fps,       // shader frame rate
    //   iFrame: gameClock.gameTime.currentFrame   // shader playback frame
    // });
    // twgl.setAttribInfoBufferFromArray(ctx, this.boidGl.bufferInfo.attribs.pos_vel, this.boidGl.pos_vel);
    // twgl.setAttribInfoBufferFromArray(ctx, this.boidGl.bufferInfo.attribs.color_rad, this.boidGl.color_rad);
    // twgl.setBuffersAndAttributes(ctx, this.boidGl.programInfo, this.boidGl.bufferInfo);
    // this.ctx.drawArraysInstanced(this.ctx.TRIANGLES, 0, 6, this.numBoids);
    // ctx.stroke();
    //
    // // draw fps on screen
    // ctx.textAlign = 'left';
    // ctx.textBaseline = 'top';
    // ctx.font = 'bold 36px serif';
    // ctx.fillStyle = '#FFFFFF';
    // ctx.fillText('' + gameClock.gameTime.fps.toFixed(0), 5, 5);


    document.title = gameClock.gameTime.fps.toFixed(0);
  }
}
