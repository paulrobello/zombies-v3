import { IGameTime } from '../GameClock';
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
      this.World.computeFoodGradient();
    } else if (!this.flowEnabled && this.r >= this.grid.cellSize * 0.45) {
      this.flowEnabled = true;
      this.World.computeFoodGradient();
    }
  }

  override die() {
    super.die();
    this.World.food.delete(this);
    this.flowEnabled = false;
    this.World.computeFoodGradient();
  }
}
