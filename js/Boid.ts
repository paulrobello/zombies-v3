import { ICellIndexable } from './Cell';
import { HashGrid } from './HashGrid';
import { IPositional, IProgressible } from './math/interfaces';
import vec2 from './math/vec2';


export class BoidBehavior implements IProgressible {
  public boid: Boid;

  constructor(boid: Boid) {
    this.boid = boid;
  }

  tick(time: number, deltaTime: number): void {

  }
}

export class Boid implements IPositional, ICellIndexable, IProgressible {
  public p: vec2;
  public v: vec2;
  public a: vec2;
  public r: number;
  public speed: number = 0;
  public maxSpeed: number = 1;

  public behaviors: BoidBehavior[] = [];
  public grid: HashGrid<Boid>;
  public lastCellIndex: number = -1;
  public cellIndex: number = -1;

  constructor(grid: HashGrid<Boid>, p?: vec2, v?: vec2, r?: number) {
    this.grid = grid;
    this.p = p || vec2.zero;
    this.v = v || vec2.zero;
    this.a = vec2.zero;
    this.r = r || 1;
  }

  tick(time: number, deltaTime: number): void {
    for (const b of this.behaviors) {
      b.tick(time, deltaTime);
    }
    const newCellIndex = this.grid.getCellIndex(this.p.x, this.p.y, true);
    if (this.cellIndex !== newCellIndex) {
      this.grid.removeCelDataByIndex(this.lastCellIndex, this);
      this.grid.addCelDataByIndex(newCellIndex, this);
    }
  }
}
