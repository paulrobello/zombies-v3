import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { IProgressible } from '../interfaces';

export class BoidBehavior implements IProgressible {
  public name: string;
  public enabled: boolean = true;
  public boid: Boid;
  public scale: number;

  constructor(boid: Boid, scale: number = 1) {
    this.boid = boid;
    this.scale = scale;
  }

  tick(gameTime: IGameTime): void {
  }
}
