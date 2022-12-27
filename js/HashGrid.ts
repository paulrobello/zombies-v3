import { Cell } from './Cell';
import { IPositional, wrap } from './math/index';
import vec2 from './math/vec2';


export interface HashGridOptions {
  width: number;
  height: number;
  celSize: number;
  wrap: boolean;
  computeNeighborRadius: number;
}

export class HashGrid<T extends IPositional> {
  public options: HashGridOptions;
  private cells: Cell<T>[];

  constructor(options: HashGridOptions) {
    options.width = Math.floor(options.width);
    options.height = Math.floor(options.height);
    options.celSize = Math.floor(options.celSize);
    this.resize(options);
  }

  get width(): number {
    return this.options.width || 0;
  }

  get height(): number {
    return this.options.height || 0;
  }

  get cellSize(): number {
    return this.options.celSize || 0;
  }

  resize(options: HashGridOptions): void {
    this.options = {...options};
    this.cells = new Array(options.width * options.height);
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = new Cell<T>();
    }
    this.computeNeighbors(this.options.computeNeighborRadius);
  }

  computeNeighbors(radius: number) {
    for (let x = 0; x < this.options.width; x++) {
      for (let y = 0; y < this.options.height; y++) {
        let c = this.getCell(x, y);
        c.p.set_xy(x, y);
        c.neighbors.length = 0;
        for (let xc = -radius; xc <= radius; xc++) {
          for (let yc = -radius; yc <= radius; yc++) {
            if (xc === 0 && yc === 0) {
              c.neighbors.push(c);
              continue;
            }
            let nx = x + xc;
            if (nx < 0 || nx >= this.options.width) {
              continue;
            }
            let ny = y + yc;
            if (ny < 0 || ny >= this.options.height) {
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
    const v = new vec2(x * (worldSpace ? 1 : this.options.celSize), y * (worldSpace ? 1 : this.options.celSize));
    let dist, nearest = Infinity, nearestData: T | undefined;
    let blockRadius;
    if (worldSpace) {
      blockRadius = Math.min(Math.floor(radius / this.options.celSize), this.options.computeNeighborRadius);
    } else {
      radius = radius * this.options.celSize;
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
      x /= this.options.celSize;
      y /= this.options.celSize;
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
    this.cells[cellIndex].items.push(v);
  }

  removeCelData(x: number, y: number, worldSpace: boolean, v: T): boolean {
    const cellIndex = this.getCellIndex(x, y, worldSpace);
    if (cellIndex === undefined) {
      return false;
    }
    const items = this.cells[cellIndex].items;
    const i = items.indexOf(v);
    if (i === -1) {
      return false;

    }
    items.splice(i, 1);
    return true;
  }

  clearCelData(x: number, y: number, worldSpace: boolean): void {
    const cellIndex = this.getCellIndex(x, y, worldSpace);
    if (cellIndex === undefined) {
      return;
    }
    return this.cells[cellIndex].clear();
  }
}
