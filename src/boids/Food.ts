import { IGameTime } from '../GameClock';
import { clamp, epsilon, vec2 } from '../math';
import { World } from '../World';
import { Boid, IBoidOptions } from './Boid';

export class Food extends Boid {
  static MinSize: number = 2;
  flowEnabled: boolean = true;

  constructor(options: IBoidOptions) {
    super(options);

    this.layer = this.options.world.layerByName('food');
    this.color.rgb = [1, 1, 0]; // food is yellow
    this.maxSpeed = 0;
    this.r = this.grid.cellSize * 0.5;
    this.static = true;
    this.World.food.add(this);
  }

  override tick(gameTime: IGameTime): void {
    super.tick(gameTime);
    if (!this.alive) {
      return;
    }

    this.r = Math.min(this.grid.cellSize * 0.5, this.r += gameTime.deltaTime * 0.5);
    if (this.flowEnabled && this.r < Food.MinSize) {
      this.flowEnabled = false;
      let i = 0;
      this.World.food.forEach(f => {
        if (!f.flowEnabled) return;
        i++;
        f.addFoodGradient(1 === i);
      });
    }
    if (!this.flowEnabled && this.r >= this.grid.cellSize * 0.45) {
      let i = 0;
      this.flowEnabled = true;
      this.World.food.forEach(f => {
        if (!f.flowEnabled) return;
        i++;
        f.addFoodGradient(1 === i);
      });
    }
  }

  addFoodGradient(replace: boolean = false): void {
    if (!this.flowEnabled) return;
    console.log('addFoodGradient', replace);
    const world: World = this.World;
    const flowGrid = world.flowGrid;
    const t = new vec2();
    const maxDist = Math.max(world.width, world.height) / 2;
    for (const cell of flowGrid.cells) {
      let cv = cell.items[this.layer];
      if (!cv) {
        cv = {
          id: 0,
          layer: this.layer,
          p: new vec2(),
          l: 0,
          lastCellIndex: -1,
          cellIndex: -1,
          static: true,
          solid: false
        };
        flowGrid.addCelData(cell.p.x, cell.p.y, false, cv);
      }
      const dv = vec2.difference(this.p, cell.wc, t);
      const l = clamp(dv.length(), epsilon, maxDist);
      // normalize direction, closer to cell has bigger influence, bigger supply has bigger influence
      dv.scale(1 / l * (1.1 - l / maxDist) * (this.r / (this.grid.cellSize / 2)));
      if (replace) {
        cv.p.set_xy(dv.x, dv.y).normalize();
      } else {
        cv.p.add(dv).normalize();
      }

      cv.l = 1;
      cv.static = true;
      flowGrid.changedCells.add(cell);
    }
  }

  override die() {
    super.die();
    this.World.food.delete(this);
    this.flowEnabled = false;
    let i = 0;
    this.World.food.forEach(f => {
      if (!f.flowEnabled) return;
      i++;
      f.addFoodGradient(1 === i);
    });
  }
}
