import { scale } from 'chroma-js';
import { Boid } from './Boid';
import { Cell, ICellIndexable } from './Cell';
import { IGameTime } from './GameClock';
import { IDrawable, IFlowValue, IPositional, IProgressible } from './interfaces';
import { clamp, epsilon, vec2, wrap } from './math';
import { IMouse, World } from './World';

export interface IGridQueryable {
  layer: number;
  id: number;
}

export interface IDataRadiusResult<T> {
  data: T;
  dist2: number;
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

export class HashGrid<T extends IPositional & ICellIndexable & IGridQueryable> implements IDrawable, IProgressible {
  options: HashGridOptions;
  cells: Cell<T>[];
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

  tick(gameTime: IGameTime): void {

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
      const cellSize = options.cellSize;
      this.gridXW = Math.ceil(options.width / cellSize);
      this.gridYW = Math.ceil(options.height / cellSize);
      this.cellSizeD2 = Math.floor(options.cellSize / 2);

      this.cells = new Array(this.gridXW * this.gridYW);
      for (let i = 0; i < this.cells.length; i++) {
        this.cells[i] = new Cell<T>(i);
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
    const cellSize = this.cellSize;
    const cellSizeD2 = cellSize / 2;
    const w = this.gridXW;
    const h = this.gridYW;
    let x, y, xc, yc, nx, ny;
    for (x = 0; x < w; x++) {
      for (y = 0; y < h; y++) {
        let c = this.getCell(x, y, false);
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

  getDataRadius(x: number, y: number, radius: number, worldSpace: boolean = false, self?: T, closest?: boolean): IDataRadiusResults<T> {
    let data: IDataRadiusResults<T> = [];
    const c = this.getCell(x, y, worldSpace);
    if (!c) {
      console.warn('getDataRadius no cell found at', x, y, radius, worldSpace);
      return data;
    }
    const radius2 = radius * radius;
    let hashKey = `${c.id}|${(self?.id || 0)}|${closest ? 1 : 0}`;
    if (this.options.maxQueryCacheFrames) {
      let getDataRadiusCacheResult = this.getDataRadiusCache.get(hashKey);
      // if we look for cache hit with closest, but don't find it, broaden key to query that includes more
      if (!getDataRadiusCacheResult && closest) {
        getDataRadiusCacheResult = this.getDataRadiusCache.get(`${c.id}|${(self?.id || 0)}|0`);
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
            getDataRadiusCacheResult.data.filter(i => i.dist2 <= radius2);
          }
          return getDataRadiusCacheResult.data;
        } else {
          // cache expired remove it
          this.getDataRadiusCache.delete(hashKey);
        }
      }
    }

    const cellSize = this.options.cellSize;
    const v = new vec2(x * (worldSpace ? 1 : cellSize), y * (worldSpace ? 1 : cellSize));
    let dist, nearest = Infinity, nearestData: T | undefined;
    const numNeighbors = this.numNeighbors(c, radius, true);
    for (let ni = 0; ni < numNeighbors; ni++) {
      const n = c.neighbors[ni];
      for (const i of n.items) {
        if (i === self) continue;
        dist = i.p.squaredDistanceTo(v);
        if (dist <= radius2 && dist < nearest) {
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
        if (this.options.maxQueryCacheFrames) {
          this.getDataRadiusCache.set(hashKey, {frame: this.options.world.CurrentFrame, closest, radius, data});
        }
        return data;
      }
      data = [{data: nearestData, dist2: nearest}];
      if (this.options.maxQueryCacheFrames) {
        this.getDataRadiusCache.set(hashKey, {frame: this.options.world.CurrentFrame, closest, radius, data});
      }
      return data;
    }

    data = data
      .filter(i => i.dist2 <= radius2)
      .sort((a, b) => a.dist2 > b.dist2 ? 1 : -1);
    if (this.options.maxQueryCacheFrames) {
      this.getDataRadiusCache.set(hashKey, {frame: this.options.world.CurrentFrame, closest, radius, data});
    }
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

  draw(ctx: WebGL2RenderingContext): void {
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

export class FlowGrid extends HashGrid<IFlowValue> {
  flowGradient = scale(['#000000', '#00FF00', '#0000FF', '#FFFF00', '#FF8700', '#FF0000'])
    .domain([0, 0.2, 0.5, 0.6, 0.75, 1.0]);

  override draw(ctx: WebGL2RenderingContext): void {
    const buffers = this.options.world.flowGridGl;

    let id: number;
    for (const cell of this.changedCells) {
      const cv = cell.items[0];
      id = cell.id * 4;
      // const c = this.flowGradient(cv.l).gl();

      buffers.color[id] = cell.color.r;
      buffers.color[id + 1] = cell.color.g;
      buffers.color[id + 2] = cell.color.b;
      buffers.color[id + 3] = 1;

      buffers.v[id] = cv.p.x;
      buffers.v[id + 1] = cv.p.y;
      buffers.v[id + 2] = cv.l;
      buffers.v[id + 3] = 0;
    }
  }

  override tick(gameTime: IGameTime): void {
    const mouse: IMouse = this.options.world.mouse;
    const pm = this.options.world.paintMode;
    if (pm === 'none') {
      return;
    }
    const ps = this.options.world.paintSize;

    const t = new vec2();
    for (const cell of this.cells) {
      cell.items[0].p.scale(1-gameTime.deltaTime);
    //   cell.color.rgba = [0.1, 0.1, 0.1, 1.0];
      this.changedCells.add(cell);
    }
    const cell: Cell<IFlowValue> = this.getCell(mouse.p.x, mouse.p.y, true);
    let l: number;

    const numNeighbors = this.numNeighbors(cell, ps, true);
    for (let i = 0; i < numNeighbors; i++) {
      const n: Cell<IFlowValue> = cell.neighbors[i];
      // if (pm === 'attract') {
      //   n.color.rgba = [0.3, 0.5, 0.3, 1.0];
      // } else if (pm === 'repel') {
      //   n.color.rgba = [0.5, 0.3, 0.3, 1.0];
      // } else {
      //   n.color.rgba = [0.3, 0.3, 0.5, 1.0];
      // }
      const cv = n.items[0];
      const v = cv.p;
      if (mouse.buttons[0]) {
        if (pm === 'stroke') {
          mouse.d.scale((i === 0 ? 1 : gameTime.deltaTime * 2), t);
        } else {
          vec2.difference(mouse.p, n.wc, t);
          if (pm === 'repel') {
            t.scale(-1);
          }
        }
        const ml = ps;
        l = clamp(t.length(), epsilon, ml);
        t.scale(1 / l * (ml - l) * gameTime.deltaTime);
        v.add(t);
      }

      l = v.length();
      if (l > 1) {
        v.scale(1 / l);
      }
      cv.l = l;

      this.changedCells.add(n);
    }
  }
}

export class BoidGrid extends HashGrid<Boid> {
  gradient = scale(['#131313', '#002300', '#005b00', '#007700', '#8d3100', '#8d0000'])
    .domain([0, 1, 2, 3, 4, 5]);
  // private gradient = scale(['#131313', '#000931', '#001270', '#002277', '#8d3100', '#8d0000'])
  //   .domain([0, 1, 2, 3, 4, 5]);
  deadBoids: Set<Boid> = new Set<Boid>();

  override draw(ctx: WebGL2RenderingContext): void {
    const buffers = this.options.world.gridGl;
    let id: number;
    for (const cell of this.changedCells) {
      id = cell.id * 4;
      cell.color.rgba = this.gradient(cell.items.length).gl();
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
  }
}
