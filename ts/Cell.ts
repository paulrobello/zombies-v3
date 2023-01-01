import { IPositional } from './interfaces';
import { vec2, Ivec2 } from './math';

export interface ICellIndexable {
  lastCellIndex: number;
  cellIndex: number;
}

export class Cell<T> implements IPositional {
  public items: T[] = [];
  public neighbors: Cell<T>[] = [];
  public p: Ivec2 = new vec2();
  public wp: Ivec2 = new vec2();
  public wc: Ivec2 = new vec2();

  constructor() {
  }

  clear() {
    this.items.length = 0;
  }
}
