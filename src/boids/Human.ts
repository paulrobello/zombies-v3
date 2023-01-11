import { CollisionBehavior } from '../behaviours/collision';
import { SteerLayerBehavior } from '../behaviours/steer_layer';
import { Boid, IBoidOptions } from './Boid';

export class Human extends Boid {
  constructor(options: IBoidOptions) {
    super(options);
    this.maxSpeed=1;
    this.layer = this.options.world.addLayerName('boid') | this.options.world.addLayerName('human');
    this.color.rgb = [0, 1, 1];
    this.behaviors.set('CollisionBehavior', new CollisionBehavior(this, 1, {
      iterations:1,
      margin: 1,
      layerMask: this.World.addLayerName('human')
    }));

    this.behaviors.set('AvoidZombie', new SteerLayerBehavior(this, 100, {
        layerName: 'zombie',
        radius: Math.max(this.r * 100, this.options.grid.cellSize * 3),
        nearest: true
      })
    );
  }
}
