import { BufferInfo, m4, ProgramInfo } from 'twgl.js';
import { SeparateBehavior, CollisionBehavior, AlignBehavior, FlowBehavior, AvoidWallsBehavior } from './behaviours';
import { Boid } from './Boid';
import { GameClock } from './GameClock';
import { BoidGrid, FlowGrid, HashGridOptions } from './HashGrid';
import { IFlowValue } from './interfaces';
import { vec2, map, Ivec2, epsilon } from './math';
import { makeNoise2D } from 'fast-simplex-noise';
import * as twgl from 'twgl.js';

const noise = makeNoise2D();

export interface IGLBuffers {
  offsets: Float32Array;
  angles: Float32Array;
  radiuses: Float32Array;
}
export class World {
  canvas: HTMLCanvasElement;
  ctx: WebGLRenderingContext;
  width: number;
  height: number;
  width_d2: number;
  height_d2: number;
  cellSize: number;
  boidCellSize: number;
  gridXW: number;
  gridYW: number;

  flowGrid: FlowGrid;
  boidGrid: BoidGrid;
  flowGridOptions: HashGridOptions;
  boidGridOptions: HashGridOptions;
  fieldScale: number;
  boids: Boid[] = [];
  drag = 1;
  maxSpeed = 100;
  maxTime = 10000;
  showField = true;
  numBoids = 10;
  wheelInc = 0.001;
  gameClock: GameClock;
  fieldRandomScale: number = Math.random() * 0.0001;
  ext: ANGLE_instanced_arrays;
  u_matrix: m4.Mat4 = m4.identity();
  boidProgramInfo: ProgramInfo;
  boidBufferInfo: BufferInfo;

  boidGlBuffers: IGLBuffers


  constructor() {
    this.cellSize = 32;
    this.boidCellSize = 32;

    this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('webgl');

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
    this.ext = this.ctx.getExtension('ANGLE_instanced_arrays');
    if (!this.ext) {
      throw new Error('need ANGLE_instanced_arrays');
    }
    twgl.addExtensionsToContext(this.ctx);
    twgl.resizeCanvasToDisplaySize(this.canvas);
    const boidVs = `
  uniform float time;
  uniform mat4 u_matrix;

  attribute float id;
  attribute vec4 position;
  attribute vec2 offset;
  attribute vec2 texcoord;
  attribute vec2 angle;
  attribute float radius;

  varying vec2 v_texcoord;
  varying vec4 v_color;
  varying vec2 v_angle;

  void main() {
    gl_Position = u_matrix * (position*vec4(radius,radius,1.0,1.0) + vec4(offset, 0, 0));
    v_texcoord = texcoord;
    v_color = vec4(1, 1, 1, 1);
    v_angle = normalize(angle);
  }`;

    const BoidFs = `
  precision mediump float;
  varying vec2 v_texcoord;
  varying vec4 v_color;
  varying vec2 v_angle;
  void main() {
    vec2 dir = vec2(0.5, 0.5)-v_texcoord;
    if (dot(dir, dir) > 0.25) {
      discard;
    }
    if (dot(vec2(-v_angle.x,v_angle.y), dir)>0.0) {
      if (abs(dot(vec2(v_angle.y,v_angle.x), dir))<0.1) {
        gl_FragColor = vec4(1.0,0.0,0.0,1.0);
      }else{
        gl_FragColor = v_color;
      }
    }else{
      gl_FragColor = v_color;
    }
  }`;

    // compile shaders, link program, look up locations
    this.boidProgramInfo = twgl.createProgramInfo(this.ctx, [boidVs, BoidFs]);

    this.boidGlBuffers={
      offsets: new Float32Array(this.numBoids * 2),
      angles: new Float32Array(this.numBoids*2),
      radiuses: new Float32Array(this.numBoids),
    };
    // for (let i = 0; i < this.numBoids / 2; i += 2) {
    //   this.gl_locations[i] = Math.random() * this.canvas.width;
    //   this.gl_locations[i + 1] = Math.random() * this.canvas.height;
    // }
    // for (let i = 0; i < this.gl_angles.length; ++i) {
    //   this.gl_angles[i] = Math.PI*2;
    // }
    const x = 0.5;
    const y = 0.5;

    this.boidBufferInfo = twgl.createBufferInfoFromArrays(this.ctx, {
      position: {
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
      offset: {
        numComponents: 2,
        data:this.boidGlBuffers.offsets,
        divisor: 1
      },
      angle: {
        numComponents: 2,
        data: this.boidGlBuffers.angles,
        divisor: 1
      },
      radius: {
        numComponents: 1,
        data: this.boidGlBuffers.radiuses,
        divisor: 1
      }
    });
    twgl.setBuffersAndAttributes(this.ctx, this.boidProgramInfo, this.boidBufferInfo);
    this.ctx.disable(this.ctx.DEPTH_TEST);
    this.ctx.clearColor(0, 0, 0, 1);
    this.resize();
    this.initBoids();
  }

  resize() {
    this.width = this.canvas.width = Math.floor(window.innerWidth);
    this.height = this.canvas.height = Math.floor(window.innerHeight);
    this.width_d2 = Math.floor(this.width / 2);
    this.height_d2 = Math.floor(this.height / 2);
    this.gridXW = Math.ceil(this.width / this.cellSize);
    this.gridYW = Math.ceil(this.height / this.cellSize);
    this.fieldScale = this.cellSize * 0.005;

    this.flowGridOptions = {
      width: this.width,
      height: this.height,
      cellSize: this.cellSize,
      wrap: false,
      computeNeighborRadius: 0
    };
    this.boidGridOptions = {
      width: this.width,
      height: this.height,
      cellSize: this.boidCellSize,
      wrap: false,
      computeNeighborRadius: 0
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
    x = (x - this.width_d2) * scale;
    y = (y - this.height_d2) * scale;
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
        r: 32
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
    const m4 = twgl.m4;
    const gameClock = this.gameClock;
    const ctx = this.ctx;
    const boids = this.boids;
    ctx.viewport(0, 0, this.width, this.height);
    ctx.clear(ctx.COLOR_BUFFER_BIT);

    m4.ortho(0, ctx.canvas.width, ctx.canvas.height,0, -1, 1, this.u_matrix);

    this.ctx.useProgram(this.boidProgramInfo.program);
    twgl.setUniforms(this.boidProgramInfo, {
      time: gameClock.gameTime.currentTime * 0.1,
      u_matrix: this.u_matrix
    });
    gameClock.tick();

    // draw grids
    // this.flowGrid.draw(ctx);
    // this.boidGrid.draw(ctx);
    //
    // draw boids
    // ctx.beginPath();
    // ctx.lineWidth = 1;
    // ctx.strokeStyle = '#FFFFFF';
    for (const b of boids) {
      b.tick(gameClock.gameTime);
    //   b.draw(ctx);
    }
    twgl.setAttribInfoBufferFromArray(ctx, this.boidBufferInfo.attribs.offset, this.boidGlBuffers.offsets);
    twgl.setAttribInfoBufferFromArray(ctx, this.boidBufferInfo.attribs.angle, this.boidGlBuffers.angles);
    twgl.setAttribInfoBufferFromArray(ctx, this.boidBufferInfo.attribs.radius, this.boidGlBuffers.radiuses);
    // ctx.stroke();
    //
    // // draw fps on screen
    // ctx.textAlign = 'left';
    // ctx.textBaseline = 'top';
    // ctx.font = 'bold 36px serif';
    // ctx.fillStyle = '#FFFFFF';
    // ctx.fillText('' + gameClock.gameTime.fps.toFixed(0), 5, 5);
    this.ext.drawArraysInstancedANGLE(this.ctx.TRIANGLES, 0, 6, this.numBoids);

    document.title = gameClock.gameTime.fps.toFixed(0);
  }
}
