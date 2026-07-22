/**
 * A single spatial-hash cell. Stores its grid coordinates (`p`), world-space
 * top-left (`wp`) and center (`wc`) positions, a tint colour for the debug
 * grid draw (`color`), the pre-computed neighbour list (`neighbors`, sorted
 * nearest-first by squared distance to `wc`), and the items currently
 * spatially assigned to this cell (`items`).
 *
 * `items` is overloaded by grid type: `HashGrid<Boid>` uses it as a dense
 * push-array of entities; `FlowGrid` overrides `addCelDataByIndex` so each
 * layer bitmask writes to its own `items[layer]` slot (sparse-by-layer
 * storage, see `FlowGrid.resize`).
 *
 * `markChanged` adds this cell to `HashGrid.changedCells` so the debug-draw
 * pass knows it needs a colour re-upload.
 */
import { IPositional } from '../interfaces';
import { vec2, Ivec2, vec4 } from '../math';
import { HashGrid, HashGridCellItem } from './HashGrid';

export interface ICellIndexable {
  lastCellIndex: number;
  cellIndex: number;
}

export class Cell<T extends HashGridCellItem> implements IPositional {
  /**
   * Cells hash id in grid cell array
   */
  id: number;
  /**
   * Grid this cell belongs to
   */
  grid: HashGrid<T>;
  public items: T[] = [];
  public neighbors: Cell<T>[] = [];
  /**
   * Grid position
   */
  public p: Ivec2 = new vec2();
  /**
   * World position top left corner
   */
  public wp: Ivec2 = new vec2();
  /**
   * World position center
   */
  public wc: Ivec2 = new vec2();
  /**
   * Cell background color
   */
  public color: vec4 = new vec4([0.1, 0.1, 0.1, 1.0]);

  constructor(grid: HashGrid<T>, id: number) {
    this.grid = grid;
    this.id = id;
  }

  /**
   * Remove all items from cell
   */
  clear() {
    this.items.length = 0;
    this.markChanged();
  }

  markChanged() {
    this.grid.changedCells.add(this);
  }
}
