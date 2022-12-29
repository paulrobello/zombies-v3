import { Cell, ICellIndexable } from './Cell';
import { IPositional, wrap } from './math/index';
import vec2 from './math/vec2';


export interface HashGridOptions {
  width: number;
  height: number;
  cellSize: number;
  wrap: boolean;
  computeNeighborRadius: number;
}

export class HashGrid<T extends IPositional & ICellIndexable> {
  public options: HashGridOptions;
  private cells: Cell<T>[];
  private allData: Set<T> = new Set<T>();

  constructor(options: HashGridOptions) {
    options.width = Math.floor(options.width);
    options.height = Math.floor(options.height);
    options.cellSize = Math.floor(options.cellSize);
    this.resize(options);
  }

  get width(): number {
    return this.options.width || 0;
  }

  get height(): number {
    return this.options.height || 0;
  }

  get cellSize(): number {
    return this.options.cellSize || 0;
  }

  resize(options: HashGridOptions): void {
    let recompute = (!this.options || this.options.width !== options.width || this.options.height !== options.height || this.options.cellSize !== options.cellSize || this.options.computeNeighborRadius !== options.computeNeighborRadius);
    this.options = {...options};
    if (recompute) {
      this.cells = new Array(options.width * options.height);
      for (let i = 0; i < this.cells.length; i++) {
        this.cells[i] = new Cell<T>();
      }
      this.computeNeighbors(this.options.computeNeighborRadius);
      this.reposition();
    }
  }

  computeNeighbors(radius: number) {
    const cellSize = this.cellSize;
    const cellSizeD2 = cellSize / 2;
    const w = this.options.width;
    const h = this.options.height;
    for (let x = 0; x < this.options.width; x++) {
      for (let y = 0; y < this.options.height; y++) {
        let c = this.getCell(x, y);
        c.p.set_xy(x, y);
        c.wp.set_xy(x * cellSize, y * cellSize);
        c.wc.set_xy(x * cellSize + cellSizeD2, y * cellSize + cellSizeD2);
        c.neighbors.length = 0;
        for (let xc = -radius; xc <= radius; xc++) {
          for (let yc = -radius; yc <= radius; yc++) {
            if (xc === 0 && yc === 0) {
              c.neighbors.push(c);
              continue;
            }
            let nx = x + xc;
            if (nx < 0 || nx >= w) {
              continue;
            }
            let ny = y + yc;
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

  getDataRadius(x: number, y: number, radius: number, worldSpace: boolean = false, self?: T, closest?: boolean) {
    const data: { data: T, dist2: number }[] = [];
    const c = this.getCell(x, y, worldSpace);
    if (!c) return data;
    const cellSize = this.cellSize;
    const v = new vec2(x * (worldSpace ? 1 : cellSize), y * (worldSpace ? 1 : cellSize));
    let dist, nearest = Infinity, nearestData: T | undefined;
    let blockRadius;
    if (worldSpace) {
      blockRadius = Math.min(Math.floor(radius / cellSize), this.options.computeNeighborRadius);
    } else {
      radius = radius * cellSize;
      blockRadius = Math.min(radius, this.options.computeNeighborRadius);
    }
    blockRadius += 3;
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
        data.push({data: i, dist2: dist});
      }
    }
    if (closest) {
      return [{data: nearestData, dist2: nearest}];
    }

    const radius2 = radius * radius;
    return data
      .filter(i => i.dist2 <= radius2)
      .sort((a, b) => a.dist2 > b.dist2 ? 1 : -1);
  }

  getCellIndex(x: number, y: number, worldSpace: boolean = false): number | undefined {
    if (worldSpace) {
      x /= this.options.cellSize;
      y /= this.options.cellSize;
    }
    x = Math.floor(x);
    y = Math.floor(y);
    if (this.options.wrap) {
      x = wrap(x, this.options.width);
      y = wrap(y, this.options.height);
    } else {
      if (x < 0 || y < 0 || x >= this.options.width || y >= this.options.height) {
        return undefined;
      }
    }
    return y * this.options.width + x;
  }

  getCellValue(x: number, y: number, worldSpace: boolean = false): T | undefined {
    const c = this.getCell(x, y, worldSpace);
    if (!c.items.length) return undefined;
    return c.items[0];
  }

  getCellValues(x: number, y: number, worldSpace: boolean = false): T[] | undefined {
    const c = this.getCell(x, y, worldSpace);
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
    if (cellIndex >= this.cells.length) {
      throw new Error(`Cell index out of bounds ${cellIndex} >=, ${this.cells.length}`);
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
}
