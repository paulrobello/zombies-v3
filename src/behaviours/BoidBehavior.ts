import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { IProgressible } from '../interfaces';


export interface IBehaviorOptions {
  enabled?: boolean;
}

export class BoidBehavior<T extends Boid> implements IProgressible {
  public name: string;
  public enabled: boolean;
  public boid: T;
  public scale: number;

  constructor(boid: T, scale: number = 1, options: IBehaviorOptions) {
    this.boid = boid;
    this.scale = scale;
    this.enabled = options.enabled !== undefined ? options.enabled : true;
  }

  tick(gameTime: IGameTime): boolean {
    return true;
  }
}
