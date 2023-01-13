import { Cell, ICellIndexable } from './Cell';
import { IGameTime } from '../GameClock';
import { HashGrid, HashGridOptions, IGridQueryable } from './HashGrid';
import { IPositional } from '../interfaces';
import { clamp, epsilon, vec2, vec4 } from '../math';
import { IMouse, World } from '../World';

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
    console.log('FlowGrid.resize');
    for (const cell of this.cells) {
      cell.items.length = 256;
    }
  }

  override addCelDataByIndex(cellIndex: number, v: IFlowValue): void {
    if (!isFinite(cellIndex) || cellIndex < 0 || cellIndex >= this.cells.length) {
      // debugger;
      throw new Error(`Cell index out of bounds ${cellIndex}, ${this.cells.length}`);
    }
    const cell = this.cells[cellIndex];
    cell.items[v.layer] = v;
    this.allData.add(v);
    v.lastCellIndex = v.cellIndex;
    v.cellIndex = cellIndex;
    if (v.lastCellIndex < 0) {
      v.lastCellIndex = v.cellIndex;
    }
    this.changedCells.add(cell);
  }

  override draw(ctx: WebGL2RenderingContext): void {
    const world: World = this.World;
    const buffers = world.flowGridGl;
    const mask: number = world.layerByName(this.drawFlowType);

    let id: number;
    for (const cell of this.changedCells) {
      let cv: IFlowValue | undefined = cell.items[mask];
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

  override tick(gameTime: IGameTime): boolean {
    this.fadeCells(gameTime);
    const pm = this.options.world.paintMode;
    const mouse: IMouse = this.options.world.mouse;

    if (pm === 'none' || (!mouse.buttons[0] && !mouse.buttons[2])) {
      return false;
    }
    const ps = this.options.world.paintSize;
    const t = new vec2();
    const mask: number = this.World.layerByName(this.drawFlowType) || 0;
    let numNeighbors: number;
    const cell: Cell<IFlowValue> = this.getCell(mouse.p.x, mouse.p.y, true);
    if (pm === 'wall') {
      let cv: IFlowValue | undefined = cell.items[mask];
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
          let nv = n.items[mask];
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
      return true;
    }
    let l: number;

    numNeighbors = this.numNeighbors(cell, ps, true);
    for (let i = 0; i < numNeighbors; i++) {
      const n: Cell<IFlowValue> = cell.neighbors[i];
      // if (pm === 'attract') {
      //   n.color.rgba = [0.3, 0.5, 0.3, 1.0];
      // } else if (pm === 'repel') {
      //   n.color.rgba = [0.5, 0.3, 0.3, 1.0];
      // } else {
      //   n.color.rgba = [0.3, 0.3, 0.5, 1.0];
      // }
      let cv: IFlowValue | undefined = n.items[mask];
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
    return true;
  } // tick
}
