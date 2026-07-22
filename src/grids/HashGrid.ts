import { Cell, ICellIndexable } from './Cell';
import { IGameTime } from '../GameClock';
import { IDrawable, IPositional, IProgressible } from '../interfaces';
import { vec2, wrap } from '../math';
import { World } from '../World';

export interface IGridQueryable {
  layer: number;
  id: number;
}

export interface IDataRadiusResult<T> {
  data: T;
  dist2: number;
  dv: vec2;
}

export type IDataRadiusResults<T> = IDataRadiusResult<T>[];

export interface IDataCacheResult<T> {
  frame: number;
  radius: number;
  closest: boolean;
  data: IDataRadiusResults<T>;
}

export interface HashGridOptions {
  world: World,
  width: number;
  height: number;
  cellSize: number;
  wrap: boolean;
  computeNeighborRadius: number;
  maxQueryCacheFrames: number;
}
export type HashGridCellItem = IPositional & ICellIndexable & IGridQueryable;

export class HashGrid<T extends HashGridCellItem> implements IDrawable, IProgressible {
  options!: HashGridOptions;
  cells!: Cell<T>[];
  allData: Set<T> = new Set<T>();
  gridXW: number;
  gridYW: number;
  cellSizeD2: number;
  getDataRadiusCache: Map<string, IDataCacheResult<T>> = new Map<string, IDataCacheResult<T>>();
  changedCells: Set<Cell<T>> = new Set<Cell<T>>();
  drpc = '#8d3100';

  constructor(options: HashGridOptions) {
    options.width = Math.floor(options.width);
    options.height = Math.floor(options.height);
    options.cellSize = Math.floor(options.cellSize);
    this.cellSizeD2 = Math.floor(this.cellSize / 2);
    this.gridXW = Math.ceil(options.width / options.cellSize);
    this.gridYW = Math.ceil(options.height / options.cellSize);
    this.resize(options);
  }

  tick(_gameTime: IGameTime): boolean {
    return true;
  }

  get width(): number {
    return this.options?.width || 0;
  }

  get height(): number {
    return this.options?.height || 0;
  }

  get World(): World {
    return this.options.world;
  }

  get cellSize(): number {
    return this.options?.cellSize || 0;
  }

  resize(options: HashGridOptions, doReposition: boolean = false): void {
    console.log('HashGrid.resize');
    let recompute = (!this.options ||
      this.options.width !== options.width ||
      this.options.height !== options.height ||
      this.options.cellSize !== options.cellSize ||
      this.options.computeNeighborRadius !== options.computeNeighborRadius
    );
    this.options = {...options};
    if (recompute) {
      const cellSize = options.cellSize;
      this.gridXW = Math.ceil(options.width / cellSize);
      this.gridYW = Math.ceil(options.height / cellSize);
      this.cellSizeD2 = Math.floor(options.cellSize / 2);

      this.cells = new Array(this.gridXW * this.gridYW);
      for (let i = 0; i < this.cells.length; i++) {
        this.cells[i] = new Cell<T>(this, i);
        const c = this.cells[i];
        c.p.set_xy(i % this.gridXW, Math.floor(i / this.gridXW));
        c.wp.set_xy(c.p.x * cellSize, c.p.y * cellSize);
        c.wc.set_xy(c.p.x * cellSize + this.cellSizeD2, c.p.y * cellSize + this.cellSizeD2);
        this.changedCells.add(this.cells[i]);
      }
      this.computeNeighbors(this.options.computeNeighborRadius);
      if (doReposition) {
        this.reposition();
      }
    }
  }

  computeNeighbors(radius: number) {
    const w = this.gridXW;
    const h = this.gridYW;
    let x, y, xc, yc, nx, ny;
    for (x = 0; x < w; x++) {
      for (y = 0; y < h; y++) {
        let c = this.getCell(x, y, false)!;
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
            c.neighbors.push(this.getCell(nx, ny)!);
          } // yc
        } // xc
        c.neighbors.sort((a, b) => c.wc.squaredDistanceTo(a.wc) - c.wc.squaredDistanceTo(b.wc));
      } // y
    } // x
  }

  numNeighbors(cell: Cell<T>, radius: number, worldSpace: boolean): number {
    const cellSize = this.options.cellSize;
    let blockRadius;
    if (worldSpace) {
      blockRadius = Math.min(~~(radius / cellSize), this.options.computeNeighborRadius);
    } else {
      radius = radius * cellSize;
      blockRadius = Math.min(radius, this.options.computeNeighborRadius);
    }

    blockRadius = blockRadius * 2 + 1;
    let numNeighbors = blockRadius * blockRadius;
    if (numNeighbors > cell.neighbors.length) {
      numNeighbors = cell.neighbors.length;
    }
    return numNeighbors;
  }

  getDataRadius(x: number, y: number, radius: number, worldSpace: boolean = false, self?: T, closest: boolean = false, mask: number = 0): IDataRadiusResults<T> {
    let data: IDataRadiusResults<T> = [];
    const c = this.getCell(x, y, worldSpace);
    if (!c) {
      console.warn('getDataRadius no cell found at', x, y, radius, worldSpace);
      return data;
    }
    const radius2 = radius * radius;
    let hashKey = `${c.id}|${(self?.id || 0)}|${mask}|${closest ? 1 : 0}`;
    if (this.options.maxQueryCacheFrames) {
      let getDataRadiusCacheResult = this.getDataRadiusCache.get(hashKey);
      // if we look for cache hit with closest, but don't find it, broaden key to query that includes more
      if (!getDataRadiusCacheResult && closest) {
        getDataRadiusCacheResult = this.getDataRadiusCache.get(`${c.id}|${(self?.id || 0)}|${mask}|0`);
      }

      // check if we have cache hit
      if (getDataRadiusCacheResult) {
        // ensure the cache has not expired
        if (this.options.world.CurrentFrame - getDataRadiusCacheResult.frame < this.options.maxQueryCacheFrames) {
          // cache query did not have any results just return the empty array
          if (!getDataRadiusCacheResult.data.length) {
            return getDataRadiusCacheResult.data;
          }
          // current query is for closest but results are not for closest then just return first result from cache
          if (closest && !getDataRadiusCacheResult.closest) {
            return [getDataRadiusCacheResult.data[0]];
          }
          if (radius < getDataRadiusCacheResult.radius) {
            getDataRadiusCacheResult.data = getDataRadiusCacheResult.data.filter(i => i.dist2 <= radius2);
          }
          return getDataRadiusCacheResult.data;
        } else {
          // cache expired remove it
          this.getDataRadiusCache.delete(hashKey);
        }
      }
    }

    const cellSize = this.options.cellSize;
    const p = new vec2(x * (worldSpace ? 1 : cellSize), y * (worldSpace ? 1 : cellSize));
    let dist2: number;
    let nearest: number = Infinity;
    let nearestData: T | undefined;
    let nearestDv: vec2 | undefined;
    const numNeighbors = this.numNeighbors(c, radius, true);
    for (let ni = 0; ni < numNeighbors; ni++) {
      const n = c.neighbors[ni];
      for (const i of n.items) {
        if (i === self) continue;
        if (mask && !(i.layer & mask)) {
          continue;
        }

        const dv = vec2.difference(i.p, p);
        dist2 = dv.squaredLength();
        if (dist2 <= radius2 && dist2 < nearest) {
          nearest = dist2;
          nearestData = i;
          nearestDv = dv;
        }
        if (!closest) {
          data.push({data: i, dv, dist2});
        }
      }
    }
    if (closest) {
      if (!nearest || !nearestData || !nearestDv) {
        data = [];
        if (this.options.maxQueryCacheFrames) {
          this.getDataRadiusCache.set(hashKey, {frame: this.options.world.CurrentFrame, closest, radius, data});
        }
        return data;
      }
      data = [{data: nearestData, dist2: nearest, dv: nearestDv}];
      if (this.options.maxQueryCacheFrames) {
        this.getDataRadiusCache.set(hashKey, {frame: this.options.world.CurrentFrame, closest, radius, data});
      }
      return data;
    }

    data = data
      .filter(i => i.dist2 <= radius2)
      .sort((a, b) => a.dist2 - b.dist2);
    if (this.options.maxQueryCacheFrames) {
      this.getDataRadiusCache.set(hashKey, {frame: this.options.world.CurrentFrame, closest, radius, data});
    }
    return data;
  }

  public markAllCellsChanged() {
    for (const cell of this.cells) {
      this.changedCells.add(cell);
    }
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
    const cell = this.cells[cellIndex];
    cell.items.push(v);
    this.allData.add(v);
    v.lastCellIndex = v.cellIndex;
    v.cellIndex = cellIndex;
    if (v.lastCellIndex < 0) {
      v.lastCellIndex = v.cellIndex;
    }
    this.changedCells.add(cell);
  }

  removeCelData(x: number, y: number, worldSpace: boolean, data: T): boolean {
    const cellIndex = this.getCellIndex(x, y, worldSpace);
    if (cellIndex === undefined) {
      return false;
    }
    return this.removeCelDataByIndex(cellIndex, data);
  }

  removeCelDataByIndex(cellIndex: number, data: T): boolean {
    if (cellIndex < 0 || cellIndex >= this.cells.length) {
      return false;
    }
    const cell = this.cells[cellIndex];
    const items = cell.items;
    const i = items.indexOf(data);
    if (i === -1) {
      return false;

    }
    items.splice(i, 1);
    this.allData.delete(data);
    data.cellIndex = -1;
    this.changedCells.add(cell);
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
    this.changedCells.add(this.cells[cellIndex]);
    return this.cells[cellIndex].clear();
  }

  public clear() {
    for (const c of this.cells) {
      c.clear();
      this.changedCells.add(c);
    }
    this.allData.clear();
  }

  public reposition() {
    for (const c of this.cells) {
      c.clear();
      this.changedCells.add(c);
    }
    for (const d of this.allData) {
      this.addCelData(d.p.x, d.p.y, true, d);
      d.lastCellIndex = d.cellIndex;
    }
  }

  draw(_ctx: WebGL2RenderingContext): void {
    const buffers = this.options.world.gridGl;
    let id: number;
    for (const cell of this.changedCells) {
      id = cell.id * 4;
      buffers.color[id] = cell.color.r;
      buffers.color[id + 1] = cell.color.g;
      buffers.color[id + 2] = cell.color.b;
      buffers.color[id + 3] = 1;
      // if (cell.wp.x === 0) {
      //   buffers.color[id * 4] = 0.5;
      //   buffers.color[id * 4 + 1] = 0.5;
      //   buffers.color[id * 4 + 2] = 0;
      //   buffers.color[id * 4 + 3] = 1;
      // }
      // if (cell.wp.y === 0) {
      //   buffers.color[id * 4] = 0;
      //   buffers.color[id * 4 + 1] = 0.5;
      //   buffers.color[id * 4 + 2] = 0.5;
      //   buffers.color[id * 4 + 3] = 1;
      // }
    }
    // if (Math.random() > 0.99) console.log('changed', this.getDataRadiusCache.size);
  }

  cleanCache() {
    const maxFrames = this.options.maxQueryCacheFrames;
    if (maxFrames) {
      const currFrame = this.options.world.CurrentFrame;
      for (const [key, value] of this.getDataRadiusCache.entries()) {
        if (currFrame - value.frame > maxFrames) {
          this.getDataRadiusCache.delete(key);
        }
      }
    }
    this.changedCells.clear();
  }
}

