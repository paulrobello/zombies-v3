import chroma from 'chroma-js';
import { Boid } from '../boids/Boid';
import { HashGrid } from './HashGrid';

export class BoidGrid extends HashGrid<Boid> {
  gradient = chroma.scale(['#131313', '#002300', '#005b00', '#007700', '#8d3100', '#8d0000'])
    .domain([0, 1, 2, 3, 4, 5]);
  // private gradient = scale(['#131313', '#000931', '#001270', '#002277', '#8d3100', '#8d0000'])
  //   .domain([0, 1, 2, 3, 4, 5]);
  deadBoids: Set<Boid> = new Set<Boid>();

  override draw(ctx: WebGL2RenderingContext): void {
    const buffers = this.options.world.gridGl;
    let id: number;
    for (const cell of this.changedCells) {
      id = cell.id * 4;
      cell.color.rgba = this.gradient(cell.items.length).gl();
      buffers.color[id] = cell.color.r;
      buffers.color[id + 1] = cell.color.g;
      buffers.color[id + 2] = cell.color.b;
      buffers.color[id + 3] = cell.color.a;
      // if (cell.wp.x === 0) {
      //   buffers.color[id * 4] = 0.5;
      //   buffers.color[id * 4 + 1] = 0.5;
      //   buffers.color[id * 4 + 2] = 0;
      //   buffers.color[id * 4 + 3] = 1;
      // }
      // if (cell.wp.y === 0) {
      //   buffers.color[id * 4] = 0;
      //   buffers.color[id * 4 + 1] = 0.5;
      //   buffers.color[id * 4 + 2] = 0.5;
      //   buffers.color[id * 4 + 3] = 1;
      // }
    }
  }
}
