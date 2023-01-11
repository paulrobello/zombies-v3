import { IPositional } from '../interfaces';
import { vec2, Ivec2, vec4 } from '../math';

export interface ICellIndexable {
  lastCellIndex: number;
  cellIndex: number;
}

export class Cell<T> implements IPositional {
  id: number;
  public items: T[] = [];
  public neighbors: Cell<T>[] = [];
  public p: Ivec2 = new vec2();
  public wp: Ivec2 = new vec2();
  public wc: Ivec2 = new vec2();
  public color: vec4 = new vec4([0.1, 0.1, 0.1, 1.0]);

  constructor(id: number) {
    this.id = id;
  }

  clear() {
    this.items.length = 0;
  }
}
