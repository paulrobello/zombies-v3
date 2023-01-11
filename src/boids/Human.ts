import { CollisionBehavior } from '../behaviours/collision';
import { FlowBehavior } from '../behaviours/flow';
import { SteerLayerBehavior } from '../behaviours/steer_layer';
import { Boid, IBoidOptions } from './Boid';

export class Human extends Boid {
  constructor(options: IBoidOptions) {
    super(options);
    // this.maxSpeed = 1;
    this.layer = this.options.world.layerByName('human');
    this.color.rgb = [0, 1, 1];
    this.behaviors.set('CollisionBehavior', new CollisionBehavior(this, 1, {
      iterations: 1,
      margin: 1,
      layerMask: this.World.layerByName('human')
    }));
    this.behaviors.set('FlowBehavior', new FlowBehavior(this, 1, {
        flowGrid: this.World.flowGrid,
        layer: this.World.layerByName('boid') // | options.world.layerByName('human')
      })
    );

    this.behaviors.set('AvoidZombie', new SteerLayerBehavior(this, 100, {
        layerName: 'zombie',
        radius: Math.max(this.r * 100, this.options.grid.cellSize * 5),
        nearest: true
      })
    );
    this.World.humans.add(this);
  }

  override die() {
    super.die();
    this.World.humans.delete(this);
  }
}
