import { scale } from 'chroma-js';
import { Cell, ICellIndexable } from '../Cell';
import { IGameTime } from '../GameClock';
import { HashGrid, IGridQueryable } from './HashGrid';
import { IPositional } from '../interfaces';
import { clamp, epsilon, vec2 } from '../math';
import { IMouse } from '../World';

export interface IFlowValue extends IPositional, ICellIndexable, IGridQueryable {
  l: number;
  static: boolean;
  solid: boolean;
}

export class FlowGrid extends HashGrid<IFlowValue> {
  flowGradient = scale(['#000000', '#00FF00', '#0000FF', '#FFFF00', '#FF8700', '#FF0000'])
    .domain([0, 0.2, 0.5, 0.6, 0.75, 1.0]);

  override draw(ctx: WebGL2RenderingContext): void {
    const buffers = this.options.world.flowGridGl;

    let id: number;
    for (const cell of this.changedCells) {
      const cv = cell.items[0];
      id = cell.id * 4;
      // const c = this.flowGradient(cv.l).gl();
      if (cv.solid) {
        buffers.color[id] = 0.8;
        buffers.color[id + 1] = 0.8;
        buffers.color[id + 2] = 0.8;
        buffers.color[id + 3] = 1;
      } else {
        buffers.color[id] = cell.color.r;
        buffers.color[id + 1] = cell.color.g;
        buffers.color[id + 2] = cell.color.b;
        buffers.color[id + 3] = 1;
      }

      buffers.v[id] = cv.p.x;
      buffers.v[id + 1] = cv.p.y;
      buffers.v[id + 2] = cv.l;
      buffers.v[id + 3] = cv.solid ? 1 : 0;
    }
  }

  fadeCells(gameTime: IGameTime, speed: number) {
    for (const cell of this.cells) {
      const cv = cell.items[0];
      if (cv.l) {
        this.changedCells.add(cell);
        cv.l *= 1 - gameTime.deltaTime * speed;
        if (cv.l < epsilon) cv.l = 0;
      }
    }
  }

  override tick(gameTime: IGameTime): void {
    this.fadeCells(gameTime, 0.1);
    const pm = this.options.world.paintMode;
    const mouse: IMouse = this.options.world.mouse;

    if (pm === 'none' || (!mouse.buttons[0] && !mouse.buttons[2])) {
      return;
    }
    const ps = this.options.world.paintSize;
    const t = new vec2();

    const cell: Cell<IFlowValue> = this.getCell(mouse.p.x, mouse.p.y, true);
    if (pm === 'wall') {
      if (mouse.buttons[0]) {
        cell.items[0].solid = true;
      }
      if (mouse.buttons[2]) {
        cell.items[0].solid = false;
      }
      this.changedCells.add(cell);
      return;
    }
    let l: number;

    const numNeighbors = this.numNeighbors(cell, ps, true);
    for (let i = 0; i < numNeighbors; i++) {
      const n: Cell<IFlowValue> = cell.neighbors[i];
      // if (pm === 'attract') {
      //   n.color.rgba = [0.3, 0.5, 0.3, 1.0];
      // } else if (pm === 'repel') {
      //   n.color.rgba = [0.5, 0.3, 0.3, 1.0];
      // } else {
      //   n.color.rgba = [0.3, 0.3, 0.5, 1.0];
      // }
      const cv = n.items[0];
      if (cv.static) {
        continue;
      }
      const v = cv.p;
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

      this.changedCells.add(n);
    }
  }
}
