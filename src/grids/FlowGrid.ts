/**
 * `HashGrid<IFlowValue>` — the paintable multi-layer flow field that every
 * boid reads to decide where to steer. Each cell stores one `IFlowValue` per
 * registered layer (`boid`, `human`, `zombie`, `food`) so behaviours can
 * layer independent flows without overwriting each other.
 *
 * ARC-006/QA-017: storage is indexed by **dense layer slot**
 * (`World.layerSlotForMask`), NOT by the layer bitmask. Each cell's
 * `items` array is sized to `World.layerCount` (one slot per registered
 * layer, registration-order), and the slot for a given layer is the dense
 * index returned by `World.layerSlot(name)` / `World.layerSlotForMask(mask)`.
 * The bitmask (`World.layerByName`) remains in use as the QUERY mask on
 * each item's `.layer` field — `HashGrid.getDataRadius` keeps filtering with
 * `(i.layer & mask) !== 0`. Decoupling the two means adding a 9th layer
 * (or any further layer) just grows `cell.items` by one slot instead of
 * silently overflowing a hard-coded 256-entry cap.
 *
 * Overrides the parent's storage: `addCelDataByIndex` writes to
 * `cell.items[slotOf(v.layer)]` (dense-by-layer) instead of pushing.
 *
 * Two responsibilities per `tick`:
 *
 * - **Fade.** Non-static flow cells decay toward zero strength over time
 *   (rate per layer via `flowMaskFade`).
 * - **Paint.** When the user is holding a mouse button, applies the current
 *   `World.paintMode` (`wall` / `stroke` / `attract` / `repel`) to the cells
 *   under the cursor, on the currently-selected flow layer
 *   (`World.flowGrid.drawFlowType`).
 *
 * Drawn when `World.gridMode === 'flow'` (see `World.drawFlowGrid`).
 *
 * @see World.computeFoodGradient — writes a synthetic per-cell flow that
 *      points every food-aware boid toward the nearest `Food`.
 */
import { Cell, ICellIndexable } from './Cell';
import { IGameTime } from '../GameClock';
import { IFlowGridGl, IMouse, IPositional, IWorld } from '../interfaces';
import { HashGrid, HashGridOptions, IGridQueryable } from './HashGrid';
import { clamp, epsilon, vec2, vec4 } from '../math';

export type FlowType = 'boid' | 'human' | 'zombie' | 'food';
export const FlowTypes: FlowType[] = ['boid', 'human', 'zombie', 'food'];
export const FlowTypeColor: Map<string, vec4> = new Map<string, vec4>([
  ['boid', new vec4([1, 1, 1, 1])],
  ['human', new vec4([0.1, 0.1, 1, 1])],
  ['zombie', new vec4([0, 1, 0, 1])],
  ['food', new vec4([1, 1, 0, 1])]
]);

export interface IFlowValue extends IPositional, ICellIndexable, IGridQueryable {
  l: number;
  static: boolean;
  solid: boolean;
}

export const EmptyFlowValue: IFlowValue = {
  id: 0,
  layer: 0,
  p: new vec2(),
  l: 0,
  lastCellIndex: -1,
  cellIndex: -1,
  static: false,
  solid: false
};

export class FlowGrid extends HashGrid<IFlowValue> {
  drawFlowType: FlowType = 'human';
  flowMaskFade: Map<number, number> = new Map<number, number>();

  constructor(options: HashGridOptions) {
    super(options);
    this.flowMaskFade.set(this.World.layerByName('boid'), 0);
    this.flowMaskFade.set(this.World.layerByName('human'), 0.05);
    this.flowMaskFade.set(this.World.layerByName('zombie'), 0.05);
    this.flowMaskFade.set(this.World.layerByName('food'), 0.05);
  }

  override resize(options: HashGridOptions, doReposition: boolean = false): void {
    super.resize(options, doReposition);
    // ARC-006/QA-017: size to the real registered layer count instead of a
    // hard-coded 256. The slot index for each layer is dense (registration
    // order), so cell.items only needs one slot per layer.
    const layerCount: number = this.World.layerCount;
    for (const cell of this.cells) {
      cell.items.length = layerCount;
    }
  }

  override addCelDataByIndex(cellIndex: number, v: IFlowValue): void {
    if (!isFinite(cellIndex) || cellIndex < 0 || cellIndex >= this.cells.length) {
      throw new Error(`Cell index out of bounds ${cellIndex}, ${this.cells.length}`);
    }
    const cell = this.cells[cellIndex];
    // ARC-006/QA-017: write by dense slot, not by bitmask. `v.layer` is still
    // the bitmask (preserved for HashGrid query masking and `flowMaskFade`);
    // `layerSlotForMask` translates it to the storage index.
    cell.items[this.World.layerSlotForMask(v.layer)] = v;
    this.allData.add(v);
    v.lastCellIndex = v.cellIndex;
    v.cellIndex = cellIndex;
    if (v.lastCellIndex < 0) {
      v.lastCellIndex = v.cellIndex;
    }
    this.changedCells.add(cell);
  }

  /**
   * ARC-011 / ARC-002: write each changed cell's flow visualization
   * (colour + vel_len) into the supplied {@link IFlowGridGl} bundle. The
   * `Renderer` (which owns the bundle) calls this and then uploads the
   * typed arrays.
   *
   * The solid-tint vs. cell-colour branch, and the `mask` lookup against
   * the currently selected `drawFlowType`, are preserved exactly from the
   * pre-refactor `draw(ctx)`.
   */
  override draw(buffers: IFlowGridGl): void {
    const world: IWorld = this.World;
    // ARC-006/QA-017: translate the query bitmask to its dense storage slot
    // before indexing `cell.items`.
    const slot: number = world.layerSlotForMask(world.layerByName(this.drawFlowType));

    let id: number;
    for (const cell of this.changedCells) {
      let cv: IFlowValue | undefined = cell.items[slot];
      if (!cv) {
        cv = EmptyFlowValue;
      }
      id = cell.id * 4;
      if (cv.solid) {
        buffers.color[id] = 0.8;
        buffers.color[id + 1] = 0.8;
        buffers.color[id + 2] = 0.8;
        buffers.color[id + 3] = 1;
      } else {
        buffers.color[id] = cell.color.r;
        buffers.color[id + 1] = cell.color.g;
        buffers.color[id + 2] = cell.color.b;
        buffers.color[id + 3] = cell.color.a;
      }

      buffers.v[id] = cv.p.x;
      buffers.v[id + 1] = cv.p.y;
      buffers.v[id + 2] = cv.l;
      buffers.v[id + 3] = cv.solid ? 1 : 0;
    }
  }

  fadeCells(gameTime: IGameTime) {
    for (const cell of this.cells) {
      for (const cv of cell.items) {
        if (!cv || cv.static || !cv.l) continue;
        const speed = this.flowMaskFade.get(cv.layer) || 0;
        if (!speed) continue;
        cv.l *= 1 - (gameTime.deltaTime * speed);
        if (cv.l <= epsilon) cv.l = 0;
        this.changedCells.add(cell);
      }
    }
  }

  override tick(gameTime: IGameTime): void {
    this.fadeCells(gameTime);
    const pm = this.options.world.paintMode;
    const mouse: IMouse = this.options.world.mouse;

    if (pm === 'none' || (!mouse.buttons[0] && !mouse.buttons[2])) {
      return;
    }
    const ps = this.options.world.paintSize;
    const t = new vec2();
    // ARC-006/QA-017: keep `mask` as the IFlowValue.layer bitmask (so the
    // constructed flow values carry the same layer field as everywhere else,
    // and so HashGrid queries against this layer still work), but resolve the
    // dense storage slot once here for all `cell.items[...]` reads/writes.
    const mask: number = this.World.layerByName(this.drawFlowType) || 0;
    const slot: number = mask ? this.World.layerSlotForMask(mask) : -1;
    let numNeighbors: number;
    const cell = this.getCell(mouse.p.x, mouse.p.y, true);
    if (!cell) return;
    if (pm === 'wall') {
      let cv: IFlowValue | undefined = cell.items[slot];
      if (!cv) {
        cv = {
          id: 0,
          layer: mask,
          p: new vec2(),
          l: 0,
          lastCellIndex: -1,
          cellIndex: -1,
          static: false,
          solid: false
        };
        this.addCelData(mouse.p.x, mouse.p.y, true, cv);
      }
      if (mouse.buttons[0]) {
        cv.solid = true;
        this.changedCells.add(cell);
        numNeighbors = Math.min(9, this.numNeighbors(cell, 1, false));
        for (let ni = 1; ni < numNeighbors; ni++) {
          const n: Cell<IFlowValue> = cell.neighbors[ni];
          let nv = n.items[slot];
          if (!nv) {
            nv = {
              id: 0,
              layer: mask,
              p: new vec2(),
              l: 0,
              lastCellIndex: -1,
              cellIndex: -1,
              static: false,
              solid: false
            };
            this.addCelData(n.p.x, n.p.y, false, nv);
          }
          nv.p.add(vec2.direction(n.wp, cell.wp)).normalize();
          nv.l = 1;
          nv.static = true;
        }
      } else if (mouse.buttons[2]) {
        cv.solid = false;
        this.changedCells.add(cell);
      }
      return;
    }
    let l: number;

    numNeighbors = this.numNeighbors(cell, ps, true);
    for (let i = 0; i < numNeighbors; i++) {
      const n: Cell<IFlowValue> = cell.neighbors[i];
      let cv: IFlowValue | undefined = n.items[slot];
      if (!cv) {
        cv = {
          id: 0,
          layer: mask,
          p: new vec2(),
          l: 0,
          lastCellIndex: -1,
          cellIndex: -1,
          static: false,
          solid: false
        };
        this.addCelData(n.wp.x, n.wp.y, true, cv);
      }
      if (cv.static && !mouse.shift) {
        continue;
      }
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


        l = v.length();
        if (l > 1) {
          v.scale(1 / l);
        }
        cv.l = l;
        if (mouse.shift) {
          cv.static = true;
        }
      } else if (mouse.buttons[2]) {
        cv.l = 0;
        cv.p.reset();
      }

      this.changedCells.add(n);
    } // for let i neighbors
  } // tick
}
