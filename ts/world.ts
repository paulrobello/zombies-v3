import { FlowBehavior } from './behaviours';
import { Boid } from './Boid';
import { GameClock } from './GameClock';
import { HashGrid, HashGridOptions } from './HashGrid';
import { IFlowValue } from './interfaces';
import { map, wrap } from './math';
import vec2 from './math/vec2';
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

  flowGrid: HashGrid<IFlowValue>;
  boidGrid: HashGrid<Boid>;
  flowGridOptions: HashGridOptions;
  boidGridOptions: HashGridOptions;
  fieldScale: number;
  boids: Boid[] = [];
  drag = 0.95;
  maxSpeed = 10000;
  maxTime = 10000;
  showField = true;
  numBoids = 1000;
  wheelInc = 0.001;
  gameClock: GameClock;
  private fieldRandomScale: number = Math.random() * 0.0001;

  constructor() {
    this.cellSize = 32;
    this.boidCellSize = 256;

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
      wrap: true,
      computeNeighborRadius: 0
    };
    this.boidGridOptions = {
      width: this.width,
      height: this.height,
      cellSize: this.boidCellSize,
      wrap: true,
      computeNeighborRadius: 1
    };
    if (!this.flowGrid) {
      this.flowGrid = new HashGrid<IFlowValue>(this.flowGridOptions);
    } else {
      this.flowGrid.resize(this.flowGridOptions, false);
    }
    if (!this.boidGrid) {
      this.boidGrid = new HashGrid<Boid>(this.boidGridOptions);
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
        this.boidGrid,
        new vec2(Math.random() * this.width, Math.random() * this.height),
        vec2.zero,
        1
      );
      b.maxSpeed = this.maxSpeed;
      b.behaviors.push(new FlowBehavior({flowGrid: this.flowGrid}, b));
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
    this.flowGrid.draw(ctx);
    ctx.beginPath();
    ctx.lineWidth = 1;
    for (const b of boids) {
      // get each point and do what we did before with a single point
      b.tick(gameClock.gameTime);
      const p = b.p;
      const v = b.v;

      // const d: IPositional = flowGrid.getCellValue(p.x, p.y, true);
      // if (!d) continue;
      // // console.log(d)
      // v.add(d.p.copy().normalize().scale(1));
      //
      // // p.v.add(vec2.rand.scale(0.1));
      // // apply some friction so point doesn't speed up too much
      // v.scale(drag);
      // // add velocity to position and line to new position
      // let l = v.length();
      // if (l > maxSpeed) {
      //   v.normalize().scale(maxSpeed);
      //   l = maxSpeed;
      // }
      // if (!isFinite(l)) {
      //   l = 0;
      // }
      // currentMaxSpeed = Math.max(currentMaxSpeed, l);
      // p.add(v);
      //
      // // wrap around edges of screen
      // p.v.add(vec2.rand.scale(0.1));
      // apply some friction so point doesn't speed up too much
      v.scale(this.drag);

      p.x = wrap(p.x, this.width);
      p.y = wrap(p.y, this.height);

      // context.beginPath();
      b.draw(ctx);
    }
    ctx.stroke();

    // boidGrid.reposition();
    ctx.font = 'bold 36px serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(gameClock.fps.toFixed(0), 5, 30);
  }
}
