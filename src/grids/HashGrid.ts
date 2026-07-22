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
  getDataRadiusCache: Map<number, IDataCacheResult<T>> = new Map<number, IDataCacheResult<T>>();
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

  tick(_gameTime: IGameTime): void {
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
      // ARC-007a: radius is in world units (pixels). Convert to cell-count
      // before clamping against computeNeighborRadius (also cell-count).
      blockRadius = Math.min(~~(radius / cellSize), this.options.computeNeighborRadius);
    } else {
      // ARC-007a: radius is already in cell-count units. The previous code
      // multiplied by cellSize here and then compared the resulting world-
      // space value against computeNeighborRadius (cell-count), which always
      // clamped to the cap for any radius >= 1 — the bug was masked only
      // because callers wrapped the result in Math.min(9, …). Compare
      // cell-count to cell-count so the clamp is meaningful. For the only
      // current caller (FlowGrid wall-paint, radius=1) the observable
      // result is unchanged: 3x3 block -> 9, then the caller's Math.min(9,…)
      // still yields 9 on any grid with >= 9 neighbours.
      blockRadius = Math.min(radius, this.options.computeNeighborRadius);
    }

    blockRadius = blockRadius * 2 + 1;
    let numNeighbors = blockRadius * blockRadius;
    if (numNeighbors > cell.neighbors.length) {
      numNeighbors = cell.neighbors.length;
    }
    return numNeighbors;
  }

  /**
   * Bit-packed numeric cache key for getDataRadius results.
   *
   * Layout (bits, MSB→LSB): closest[48] | mask[40..47] | (selfId+1)[24..39] | cellId[0..23]
   * - cellId: 24 bits → supports up to ~16M cells (a 4096×4096 grid at cellSize=32 is ~16K).
   * - selfId+1: 16 bits → selfId -1 (no-self sentinel) maps to 0; real ids 0..65534 occupy 1..65535.
   * - mask: 8 bits → covers layer bitmasks up to 2^7=128 (current codebase tops out at 16).
   * - closest: 1 bit.
   *
   * Total < 2^49 ≈ 5.6e14, well within Number.MAX_SAFE_INTEGER (2^53-1), so equality
   * checks are exact. Replacing the old `${c.id}|${self?.id || 0}|${mask}|${closest}`
   * string key fixes the QA-006 id-0 collision (`|| 0` collapsed a real id-0 entity
   * onto the no-self queries) and the broader `|| 0` falsy-coalescing pattern.
   */
  private static cacheKey(cellId: number, selfId: number, mask: number, closest: boolean): number {
    return (closest ? 0x1000000000000 : 0)
      + ((mask & 0xFF) * 0x10000000000)
      + ((selfId + 1) * 0x1000000)
      + cellId;
  }

  getDataRadius(x: number, y: number, radius: number, worldSpace: boolean = false, self?: T, closest: boolean = false, mask: number = 0): IDataRadiusResults<T> {
    const c = this.getCell(x, y, worldSpace);
    if (!c) {
      return [];
    }

    if (this.options.maxQueryCacheFrames) {
      const cached = this.readQueryCache(c.id, self, mask, closest, radius);
      if (cached) {
        return cached;
      }
    }

    const data = this.queryNeighbors(c, x, y, radius, worldSpace, self, closest, mask);

    if (this.options.maxQueryCacheFrames) {
      this.writeQueryCache(c.id, self, mask, closest, radius, data);
    }
    return data;
  }

  private readQueryCache(cellId: number, self: T | undefined, mask: number, closest: boolean, radius: number): IDataRadiusResults<T> | undefined {
    const selfId = self?.id ?? -1;
    const key = HashGrid.cacheKey(cellId, selfId, mask, closest);
    let result = this.getDataRadiusCache.get(key);
    // Broaden: a closest=true miss may be servable from a closest=false cache entry
    // (the first item of a sorted all-neighbours result is the closest).
    if (!result && closest) {
      result = this.getDataRadiusCache.get(HashGrid.cacheKey(cellId, selfId, mask, false));
    }
    if (!result) {
      return undefined;
    }
    if (this.options.world.CurrentFrame - result.frame >= this.options.maxQueryCacheFrames) {
      this.getDataRadiusCache.delete(key);
      return undefined;
    }
    if (!result.data.length) {
      return result.data;
    }
    if (closest && !result.closest) {
      return [result.data[0]];
    }
    // Phase-2 filter fix (QA-002): a narrower-radius query must filter out
    // cached entries whose dist2 exceeds the new radius2. The result is
    // returned directly (NOT written back to the cache, so the wider cached
    // radius remains available for future queries).
    if (radius < result.radius) {
      const radius2 = radius * radius;
      return result.data.filter(i => i.dist2 <= radius2);
    }
    return result.data;
  }

  private writeQueryCache(cellId: number, self: T | undefined, mask: number, closest: boolean, radius: number, data: IDataRadiusResults<T>): void {
    const selfId = self?.id ?? -1;
    const key = HashGrid.cacheKey(cellId, selfId, mask, closest);
    this.getDataRadiusCache.set(key, {frame: this.options.world.CurrentFrame, closest, radius, data});
  }

  private queryNeighbors(c: Cell<T>, x: number, y: number, radius: number, worldSpace: boolean, self: T | undefined, closest: boolean, mask: number): IDataRadiusResults<T> {
    const cellSize = this.options.cellSize;
    const p = new vec2(x * (worldSpace ? 1 : cellSize), y * (worldSpace ? 1 : cellSize));
    const radius2 = radius * radius;
    const numNeighbors = this.numNeighbors(c, radius, true);
    if (closest) {
      return this.findClosest(c, p, radius2, numNeighbors, self, mask);
    }
    return this.findAll(c, p, radius2, numNeighbors, self, mask);
  }

  private findClosest(c: Cell<T>, p: vec2, radius2: number, numNeighbors: number, self: T | undefined, mask: number): IDataRadiusResults<T> {
    let nearest: number = Infinity;
    let nearestData: T | undefined;
    let nearestDv: vec2 | undefined;
    for (let ni = 0; ni < numNeighbors; ni++) {
      const n = c.neighbors[ni];
      for (const i of n.items) {
        if (i === self) continue;
        if (mask && !(i.layer & mask)) continue;
        const dv = vec2.difference(i.p, p);
        const dist2 = dv.squaredLength();
        if (dist2 <= radius2 && dist2 < nearest) {
          nearest = dist2;
          nearestData = i;
          nearestDv = dv;
        }
      }
    }
    // Preserves the original falsy-`nearest` check (a dist2 of 0 is treated as "no match");
    // see audit QA-018 — refactor must not change observable behaviour.
    if (!nearest || !nearestData || !nearestDv) {
      return [];
    }
    return [{data: nearestData, dist2: nearest, dv: nearestDv}];
  }

  private findAll(c: Cell<T>, p: vec2, radius2: number, numNeighbors: number, self: T | undefined, mask: number): IDataRadiusResults<T> {
    const data: IDataRadiusResults<T> = [];
    for (let ni = 0; ni < numNeighbors; ni++) {
      const n = c.neighbors[ni];
      for (const i of n.items) {
        if (i === self) continue;
        if (mask && !(i.layer & mask)) continue;
        const dv = vec2.difference(i.p, p);
        const dist2 = dv.squaredLength();
        if (dist2 <= radius2) {
          data.push({data: i, dv, dist2});
        }
      }
    }
    data.sort((a, b) => a.dist2 - b.dist2);
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
    // QA-021: mutation during a query loop (e.g. ConvertHumanBehavior kills a
    // human mid-iteration) must not serve a stale neighbour list to the next
    // caller in the same frame. Drop every cache entry keyed on this cell so
    // the next getDataRadius re-queries. Cache is disabled today
    // (maxQueryCacheFrames: 0); this is the safety net for when it is enabled.
    this.invalidateCellCache(cell.id);
    return true;
  }

  /**
   * Drop all getDataRadius cache entries whose key references `cellId`.
   * The key packs cellId into its low 24 bits (see {@link cacheKey}); the
   * masked comparison is exact for any cellId < 2^24 (~16M cells).
   */
  private invalidateCellCache(cellId: number): void {
    if (!this.getDataRadiusCache.size) return;
    for (const key of this.getDataRadiusCache.keys()) {
      if ((key & 0xFFFFFF) === cellId) {
        this.getDataRadiusCache.delete(key);
      }
    }
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
    }
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

