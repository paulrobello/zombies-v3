import { scale } from 'chroma-js';
import { Boid } from './Boid';
import { Cell, ICellIndexable } from './Cell';
import { IDrawable, IFlowValue, IPositional } from './interfaces';
import { vec2, wrap } from './math';
import { World } from './World';

export interface IDataRadiusResult<T> {
  data: T;
  dist2: number;
}

export type IDataRadiusResults<T> = IDataRadiusResult<T>[];

export interface IDataCacheResult<T> {
  frame: number;
  data: IDataRadiusResults<T>;
}

export interface HashGridOptions {
  world: World,
  width: number;
  height: number;
  cellSize: number;
  wrap: boolean;
  computeNeighborRadius: number;
}

export class HashGrid<T extends IPositional & ICellIndexable> implements IDrawable {
  options: HashGridOptions;
  cells: Cell<T>[];
  allData: Set<T> = new Set<T>();
  gridXW: number;
  gridYW: number;
  cellSizeD2: number;
  getDataRadiusCache: Map<string, IDataCacheResult<T>> = new Map<string, IDataCacheResult<T>>();

  constructor(options: HashGridOptions) {
    options.width = Math.floor(options.width);
    options.height = Math.floor(options.height);
    options.cellSize = Math.floor(options.cellSize);
    this.cellSizeD2 = Math.floor(this.cellSize / 2);
    this.gridXW = Math.ceil(options.width / options.cellSize);
    this.gridYW = Math.ceil(options.height / options.cellSize);
    this.resize(options);
  }

  get width(): number {
    return this.options?.width || 0;
  }

  get height(): number {
    return this.options?.height || 0;
  }

  get cellSize(): number {
    return this.options?.cellSize || 0;
  }

  resize(options: HashGridOptions, doReposition: boolean = false): void {
    let recompute = (!this.options ||
      this.options.width !== options.width ||
      this.options.height !== options.height ||
      this.options.cellSize !== options.cellSize ||
      this.options.computeNeighborRadius !== options.computeNeighborRadius
    );
    this.options = {...options};
    if (recompute) {
      this.gridXW = Math.ceil(options.width / options.cellSize);
      this.gridYW = Math.ceil(options.height / options.cellSize);
      this.cellSizeD2 = Math.floor(options.cellSize / 2);

      this.cells = new Array(this.gridXW * this.gridYW);
      for (let i = 0; i < this.cells.length; i++) {
        this.cells[i] = new Cell<T>(i);
      }
      this.computeNeighbors(this.options.computeNeighborRadius);
      if (doReposition) {
        this.reposition();
      }
    }
  }

  computeNeighbors(radius: number) {
    const cellSize = this.cellSize;
    const cellSizeD2 = cellSize / 2;
    const w = this.gridXW;
    const h = this.gridYW;
    let x, y, xc, yc, nx, ny;
    for (x = 0; x < w; x++) {
      for (y = 0; y < h; y++) {
        let c = this.getCell(x, y);
        c.p.set_xy(x, y);
        c.wp.set_xy(x * cellSize, y * cellSize);
        c.wc.set_xy(x * cellSize + cellSizeD2, y * cellSize + cellSizeD2);
        c.neighbors.length = 0;

        for (xc = -radius; xc <= radius; xc++) {
          for (yc = -radius; yc <= radius; yc++) {
            if (xc === 0 && yc === 0) {
              c.neighbors.push(c);
              continue;
            }
            nx = x + xc;
            if (nx < 0 || nx >= w) {
              continue;
            }
            ny = y + yc;
            if (ny < 0 || ny >= h) {
              continue;
            }
            c.neighbors.push(this.getCell(nx, ny));
          }
        }
        c.neighbors.sort((a, b) => c.p.squaredDistanceTo(a.p) > c.p.squaredDistanceTo(b.p) ? 1 : -1);
      }
    }
  }

  getDataRadius(x: number, y: number, radius: number, worldSpace: boolean = false, self?: T, closest?: boolean): IDataRadiusResults<T> {
    let data: IDataRadiusResults<T> = [];
    const c = this.getCell(x, y, worldSpace);
    if (!c) {
      console.warn('getDataRadius no cell found at', x, y, radius, worldSpace);
      return data;
    }
    const hashKey = `${c.id}|${(self?.id || 0)}|${closest ? 1 : 0}`;
    // const hashKey = `${c.id}|${closest ? 1 : 0}`;
    const getDataRadiusCacheResult = this.getDataRadiusCache.get(hashKey);
    if (getDataRadiusCacheResult) {
      if (this.options.world.gameClock.frameCount - getDataRadiusCacheResult.frame < 2) {
        return getDataRadiusCacheResult.data;
      }
      this.getDataRadiusCache.delete(hashKey);
    }

    const cellSize = this.options.cellSize;
    const v = new vec2(x * (worldSpace ? 1 : cellSize), y * (worldSpace ? 1 : cellSize));
    let dist, nearest = Infinity, nearestData: T | undefined;
    let blockRadius;
    if (worldSpace) {
      blockRadius = Math.min(~~(radius / cellSize), this.options.computeNeighborRadius);
    } else {
      radius = radius * cellSize;
      blockRadius = Math.min(radius, this.options.computeNeighborRadius);
    }
    blockRadius = blockRadius * 2 + 1;
    let numNeighbors = blockRadius * blockRadius;
    if (numNeighbors > c.neighbors.length) {
      numNeighbors = c.neighbors.length;
    }
    for (let ni = 0; ni < numNeighbors; ni++) {
      const n = c.neighbors[ni];
      for (const i of n.items) {
        if (i === self) continue;
        dist = i.p.squaredDistanceTo(v);
        if (dist < nearest) {
          nearest = dist;
          nearestData = i;
        }
        if (!closest) {
          data.push({data: i, dist2: dist});
        }
      }
    }
    if (closest) {
      if (!nearest || !nearestData) {
        data = [];
        this.getDataRadiusCache.set(hashKey, {frame: this.options.world.gameClock.frameCount, data});
        return data;
      }
      data = [{data: nearestData, dist2: nearest}];
      this.getDataRadiusCache.set(hashKey, {frame: this.options.world.gameClock.frameCount, data});
      return data;
    }

    const radius2 = radius * radius;
    data = data
      .filter(i => i.dist2 <= radius2)
      .sort((a, b) => a.dist2 > b.dist2 ? 1 : -1);
    this.getDataRadiusCache.set(hashKey, {frame: this.options.world.gameClock.frameCount, data});
    return data;
  }

  getCellIndex(x: number, y: number, worldSpace: boolean = false): number | undefined {
    const width = this.gridXW;
    const height = this.gridYW;
    if (worldSpace) {
      x /= this.options.cellSize;
      y /= this.options.cellSize;
    }
    x = ~~x;
    y = ~~y;

    if (this.options.wrap) {
      x = wrap(x, width);
      y = wrap(y, height);
    } else {
      if (x < 0 || y < 0 || x >= width || y >= height) {
        return undefined;
      }
    }
    return y * width + x;
  }

  getCellValue(x: number, y: number, worldSpace: boolean = false): T | undefined {
    const c = this.getCell(x, y, worldSpace);
    if (!c?.items.length) return undefined;
    return c.items[0];
  }

  getCellValues(x: number, y: number, worldSpace: boolean = false): T[] | undefined {
    const c = this.getCell(x, y, worldSpace);
    if (!c) return undefined;
    return c.items;
  }

  getCell(x: number, y: number, worldSpace: boolean = false): Cell<T> | undefined {
    const cellIndex = this.getCellIndex(x, y, worldSpace);
    if (cellIndex === undefined) {
      return undefined;
    }
    return this.cells[cellIndex];
  }

  addCelData(x: number, y: number, worldSpace: boolean, v: T): void {
    const cellIndex = this.getCellIndex(x, y, worldSpace);
    if (cellIndex === undefined) {
      return;
    }
    this.addCelDataByIndex(cellIndex, v);
  }

  addCelDataByIndex(cellIndex: number, v: T): void {
    if (!isFinite(cellIndex) || cellIndex < 0 || cellIndex >= this.cells.length) {
      // debugger;
      throw new Error(`Cell index out of bounds ${cellIndex}, ${this.cells.length}`);
    }
    this.cells[cellIndex].items.push(v);
    this.allData.add(v);
    v.lastCellIndex = v.cellIndex;
    v.cellIndex = cellIndex;
    if (v.lastCellIndex < 0) {
      v.lastCellIndex = v.cellIndex;
    }
  }

  removeCelData(x: number, y: number, worldSpace: boolean, v: T): boolean {
    const cellIndex = this.getCellIndex(x, y, worldSpace);
    if (cellIndex === undefined) {
      return false;
    }
    return this.removeCelDataByIndex(cellIndex, v);
  }

  removeCelDataByIndex(cellIndex: number, v: T): boolean {
    if (cellIndex < 0 || cellIndex >= this.cells.length) {
      return false;
    }
    const items = this.cells[cellIndex].items;
    const i = items.indexOf(v);
    if (i === -1) {
      return false;

    }
    items.splice(i, 1);
    this.allData.delete(v);
    v.cellIndex = -1;
    return true;
  }

  clearCelData(x: number, y: number, worldSpace: boolean): void {
    const cellIndex = this.getCellIndex(x, y, worldSpace);
    if (cellIndex === undefined) {
      return;
    }
    for (const d of this.cells[cellIndex].items) {
      this.allData.delete(d);
    }
    return this.cells[cellIndex].clear();
  }

  public clear() {
    for (const c of this.cells) {
      c.clear();
    }
    this.allData.clear();
  }

  public reposition() {
    for (const c of this.cells) {
      c.clear();
    }
    for (const d of this.allData) {
      this.addCelData(d.p.x, d.p.y, true, d);
      d.lastCellIndex = d.cellIndex;
    }
  }

  draw(ctx: WebGL2RenderingContext): void {
    // return;
    const cellSize = this.options.cellSize;
    const world = this.options.world;
    const buffers = world.gridGl;
    let cell: Cell<T>;
    let id: number;
    for (let i = 0; i < this.cells.length; ++i) {
      cell = this.cells[i];
      id = cell.id;
      // buffers.pos_dim[id * 4] = cell.wc.x;
      // buffers.pos_dim[id * 4 + 1] = cell.wc.y;
      // buffers.pos_dim[id * 4 + 2] = this.options.cellSize/4;
      // buffers.pos_dim[id * 4 + 3] = this.options.cellSize/4;
      if (cell.items.length) {
        buffers.color[id * 4] = 0.5;
        buffers.color[id * 4 + 1] = 0;
        buffers.color[id * 4 + 2] = 0;
        buffers.color[id * 4 + 3] = 1;
      } else {
        buffers.color[id * 4] = 0;
        buffers.color[id * 4 + 1] = 0.5;
        buffers.color[id * 4 + 2] = 0;
        buffers.color[id * 4 + 3] = 1;
      }
      if (cell.wp.x === 0) {
        buffers.color[id * 4] = 0.5;
        buffers.color[id * 4 + 1] = 0.5;
        buffers.color[id * 4 + 2] = 0;
        buffers.color[id * 4 + 3] = 1;
      }
      if (cell.wp.y === 0) {
        buffers.color[id * 4] = 0;
        buffers.color[id * 4 + 1] = 0.5;
        buffers.color[id * 4 + 2] = 0.5;
        buffers.color[id * 4 + 3] = 1;
      }

    }
    // ctx.beginPath();
    // ctx.strokeStyle = '#FFF';
    // ctx.lineWidth = 1;
    // for (let x = 0; x < this.gridXW; x++) {
    //   for (let y = 0; y < this.gridYW; y++) {
    //     let cx = ~~(x * cellSize);
    //     let cy = ~~(y * cellSize);
    //     ctx.rect(cx, cy, cellSize, cellSize);
    //   }
    // }
    // ctx.stroke();
  }
}

export class FlowGrid extends HashGrid<IFlowValue> {
  gradient = scale(['#000000', '#00FF00', '#0000FF', '#FFFF00', '#FF8700', '#FF0000'])
    .domain([0, 0.2, 0.5, 0.6, 0.75, 1.0]);

  override draw(ctx: WebGL2RenderingContext): void {
    // super.draw(ctx);
    const cellSize = this.options.cellSize;
    // ctx.beginPath();
    // ctx.fillStyle = '#009900';
    // ctx.strokeStyle = '#FFF';
    // ctx.lineWidth = 1;
    // let x, y, cx, cy, tx, ty;
    // for (x = 0; x < this.gridXW; x++) {
    //   for (y = 0; y < this.gridYW; y++) {
    //     let d: IPositional = this.getCellValue(x, y);
    //     if (!d) continue;
    //     cx = x * cellSize;
    //     cy = y * cellSize;
    //     // context.beginPath();
    //     // context.rect(cx, cy, flowGrid.celSize,flowGrid.celSize);
    //     // context.stroke();
    //     cx = ~~(cx + this.cellSizeD2);
    //     cy = ~~(cy + this.cellSizeD2);
    //
    //     // ctx.beginPath();
    //
    //     // let l = d.p.length();
    //     let p = d.p.copy().normalize().scale(this.cellSizeD2);
    //
    //     tx = ~~p.x;
    //     ty = ~~p.y;
    //     ctx.moveTo(cx, cy);
    //     ctx.lineTo(cx + tx, cy + ty);
    //     ctx.fillRect(cx - 2, cy - 2, 4, 4);
    //   } // for y
    // } // for x
    // ctx.stroke();
  }
}

export class BoidGrid extends HashGrid<Boid> {
  override draw(ctx: WebGL2RenderingContext): void {
    super.draw(ctx);
    // const cellSize = this.options.cellSize;
    // ctx.beginPath();
    // ctx.textAlign = 'center';
    // ctx.textBaseline = 'middle';
    // ctx.font = 'bold 24px serif';
    // ctx.fillStyle = '#A00';
    // ctx.strokeStyle = '#FFF';
    // ctx.lineWidth = 1;
    //
    // for (let x = 0; x < this.gridXW; x++) {
    //   for (let y = 0; y < this.gridYW; y++) {
    //     const boids = this.getCellValues(x, y, false);
    //     const nb = boids.length;
    //     let cx = ~~(x * cellSize);
    //     let cy = ~~(y * cellSize);
    //     ctx.fillText('' + nb, cx + cellSize / 2, cy + cellSize / 2);
    //   }
    // }
  }
}
