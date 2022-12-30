export class World {
  canvas: HTMLCanvasElement = document.getElementById('canvas') as HTMLCanvasElement;
  ctx: CanvasRenderingContext2D = this.canvas.getContext('2d');
  width: number = this.canvas.width = Math.floor(window.innerWidth);
  height: number = this.canvas.height = Math.floor(window.innerHeight);
  width_d2: number = Math.floor(this.width / 2);
  height_d2: number = Math.floor(this.height / 2);
  cellSize: number = 32;
  boidCellSize: number = 256;
  gridXW: number = Math.ceil(this.width / this.cellSize);
  gridYW: number = Math.ceil(this.height / this.cellSize);

  constructor() {
    this.ctx.globalAlpha = 1;
  }
}
