import { Boid } from './Boid';
import { ICellIndexable } from './Cell';
import { HashGrid, HashGridOptions } from './HashGrid';
import { IPositional } from './interfaces';

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

  flowGrid: HashGrid<IPositional & ICellIndexable>;
  boidGrid: HashGrid<Boid>;
  flowGridOptions: HashGridOptions;
  boidGridOptions: HashGridOptions;

  constructor() {
    this.cellSize = 32;
    this.boidCellSize = 256;

    this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.globalAlpha = 1;

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
    this.flowGrid = new HashGrid<IPositional & ICellIndexable>(this.flowGridOptions);
    this.boidGrid = new HashGrid<Boid>(this.boidGridOptions);

  }

  resize() {
    this.width = this.canvas.width = Math.floor(window.innerWidth);
    this.height = this.canvas.height = Math.floor(window.innerHeight);
    this.width_d2 = Math.floor(this.width / 2);
    this.height_d2 = Math.floor(this.height / 2);
    this.gridXW = Math.ceil(this.width / this.cellSize);
    this.gridYW = Math.ceil(this.height / this.cellSize);


    this.flowGridOptions.width = this.width;
    this.flowGridOptions.height = this.height;
    this.flowGrid.resize(this.flowGridOptions, false);

    this.boidGridOptions.width = this.width;
    this.boidGridOptions.height = this.height;
    this.boidGrid.resize(this.boidGridOptions, true);

    genField();
  }
}
