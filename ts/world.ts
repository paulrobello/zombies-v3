import { AlignBehavior, FlowBehavior } from './behaviours';
import { CollisionBehavior } from './behaviours/collision';
import { SeparateBehavior } from './behaviours/separate';
import { Boid } from './Boid';
import { GameClock } from './GameClock';
import { BoidGrid, FlowGrid, HashGridOptions } from './HashGrid';
import { IFlowValue } from './interfaces';
import { vec2, map } from './math';
import { makeNoise2D } from 'fast-simplex-noise';

const noise = makeNoise2D();

export class World {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
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
  numBoids = 100;
  wheelInc = 0.001;
  gameClock: GameClock;
  private fieldRandomScale: number = Math.random() * 0.0001;

  constructor() {
    this.cellSize = 32;
    this.boidCellSize = 128;

    this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.globalAlpha = 1;

    this.gameClock = new GameClock();

    this.canvas.addEventListener('click', (event: MouseEvent) => {
      this.randomizeBoids();
    });
    window.addEventListener('resize', (event: UIEvent) => () => {
      // this.resize();
    });

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
  }

  genField() {
    for (let y = 0; y < this.gridYW; y += 1) {
      for (let x = 0; x < this.gridXW; x += 1) {
        this.flowGrid.addCelData(x, y, false, this.getFlowFieldValue(x, y));
      }
    }
  }

  getFlowFieldValue(x: number, y: number): IFlowValue {
    const scale = this.fieldScale + this.fieldRandomScale;
    x = (x - this.width_d2) * scale;
    y = (y - this.height_d2) * scale;
    const rad = noise(x, y);
    const p = vec2.angle2Vec(rad * Math.PI).scale(map(rad, -1, 1, 0.01, 1));
    const l = p.length();
    return {
      p,
      l,
      lastCellIndex: -1,
      cellIndex: -1
    };
  }

  initBoids() {
    for (let i = 0; i < this.numBoids; i++) {
      let b = new Boid(
        this,
        this.boidGrid,
        new vec2(Math.random() * this.width, Math.random() * this.height),
        new vec2().random(10, 100),
        10
      );
      b.maxSpeed = this.maxSpeed;
      // b.behaviors.push(new FlowBehavior({flowGrid: this.flowGrid, normalize: true, scale: 10}, b));
      b.behaviors.set('AlignBehavior', new AlignBehavior(b, 10));
      b.behaviors.set('SeparateBehavior', new SeparateBehavior(b, 20));
      b.behaviors.set('CollisionBehavior', new CollisionBehavior(b, 100));
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
    const ctx = this.ctx;
    const boids = this.boids;
    gameClock.tick();
    ctx.clearRect(0, 0, this.width, this.height);
    // this.flowGrid.draw(ctx);
    this.boidGrid.draw(ctx);
    ctx.beginPath();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#FFFFFF';
    for (const b of boids) {
      b.tick(gameClock.gameTime);
      b.draw(ctx);
    }
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 36px serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(gameClock.fps.toFixed(0), 5, 5);
  }
}
