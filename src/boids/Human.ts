import { SteerLayerBehavior } from '../behaviours/steer_layer';
import { Boid, IBoidOptions } from './Boid';

export class Human extends Boid {
  constructor(options: IBoidOptions) {
    super(options);

    this.layer = this.options.world.addLayerName('boid') | this.options.world.addLayerName('human');
    this.color.rgb = [0, 1, 1];

    this.behaviors.set('AvoidZombie', new SteerLayerBehavior(this, 100, {
        layerName: 'zombie',
        radius: Math.max(this.r * 10, this.options.grid.cellSize * 3),
        nearest: false
      })
    );
  }
}
