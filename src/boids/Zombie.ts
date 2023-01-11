import { CollisionBehavior } from '../behaviours/collision';
import { ConvertHumanBehavior } from '../behaviours/convert_human';
import { SteerLayerBehavior } from '../behaviours/steer_layer';
import { Boid, IBoidOptions } from './Boid';

export class Zombie extends Boid {
  constructor(options: IBoidOptions) {
    super(options);

    this.layer = this.options.world.addLayerName('boid') | this.options.world.addLayerName('zombie');
    this.color.rgb = [0, 1, 0];
    this.maxSpeed *= 0.75;
    this.behaviors.set('CollisionBehavior', new CollisionBehavior(this, 1, {
      iterations: 1,
      margin: 1,
      layerMask: this.World.addLayerName('zombie')
    }));
    this.behaviors.set('ChaseHumans', new SteerLayerBehavior(this, -100, {
        layerName: 'human',
        radius: Math.max(this.r * 8, this.options.grid.cellSize * 2),
        nearest: true
      })
    );
    this.behaviors.set('ConvertHumanBehavior', new ConvertHumanBehavior(this));
    this.World.zombies.add(this);
  }

  override die() {
    super.die();
    this.World.zombies.delete(this);
  }
}
