import { Cell } from './Cell';
import { Ivec2, Ivec3, wrap } from './math/index';
import vec2 from './math/vec2';


export interface HashGridOptions {
  width: number;
  height: number;
  celSize: number;
  wrap: boolean;
}

export class HashGrid<T extends Ivec2> {
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

  get celSize(): number {
    return this.options.celSize || 0;
  }

  resize(options: HashGridOptions) {
    this.options = {...options};
    this.cells = new Array(options.width * options.height);
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = new Cell<T>();
    }
    this.computeNeighbors();
  }

  computeNeighbors() {
    for (let x = 0; x < this.options.width; x++) {
      for (let y = 0; y < this.options.height; y++) {
        let c = this.getCell(x, y);
        c.p.set_xy(x, y);
        for (let xc = -1; xc < -2; xc++) {
          for (let yc = -1; yc < -2; yc++) {
            if (xc === 0 && yc === 0) {
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
      }
    }
  }

  getDataRadius(x: number, y: number, radius: number, worldSpace: boolean = false) {
    const data: { data: T, dist: number }[] = [];
    const c = this.getCell(x, y, worldSpace);
    if (!c) return data;
    const v = new vec2(x * (worldSpace ? 1 : this.options.celSize), y * (worldSpace ? 1 : this.options.celSize));
    let dist, nearest = Infinity;
    for (const i of c.items) {
      dist = i.squaredDistanceTo(v);
      if (dist < nearest) nearest = dist;
      data.push({data: i, dist});
    }
    for (const n of c.neighbors) {
      for (const i of c.items) {
        dist = i.squaredDistanceTo(v);
        if (dist < nearest) nearest = dist;
        data.push({data: i, dist});
      }
    }
    radius *= radius;
    return data
      .filter(i => i.dist <= radius)
      .sort((a, b) => a.dist > b.dist ? 1 : -1);
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
