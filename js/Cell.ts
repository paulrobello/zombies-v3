import vec2, { Ivec2 } from './math/vec2';

export class Cell<T> {
  public items: T[] = [];
  public neighbors: Cell<T>[] = [];
  public p: Ivec2 = new vec2();

  constructor() {
  }

  clear() {
    this.items.length = 0;
  }
}
