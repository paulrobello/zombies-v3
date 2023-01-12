import { CollisionBehavior } from '../behaviours/collision';
import { ConvertHumanBehavior } from '../behaviours/convert_human';
import { FlowBehavior } from '../behaviours/flow';
import { SteerLayerBehavior } from '../behaviours/steer_layer';
import { IGameTime } from '../GameClock';
import { Boid, IBoidOptions } from './Boid';

export class Zombie extends Boid {
  constructor(options: IBoidOptions) {
    super(options);

    this.layer = this.options.world.layerByName('zombie');
    this.color.rgb = [0, 1, 0]; // zed are green
    this.maxSpeed *= 0.25; // zed are slower than humans
    this.behaviors.set('CollisionBehavior', new CollisionBehavior(this, 1, {
      iterations: 1,
      margin: 2,
      layerMask: this.World.layerByName('zombie'),
      predictive: true
    }));
    this.behaviors.set('ChaseHumans', new SteerLayerBehavior(this, -100, {
        layerName: 'human',
        radius: Math.max(this.r * 8, this.options.grid.cellSize * 3),
        nearest: true
      })
    );
    this.behaviors.set('BoidFlow', new FlowBehavior(this, 1, {
        flowGrid: this.World.flowGrid,
        layer: this.World.layerByName('boid') // | options.world.layerByName('human')
      })
    );
    this.behaviors.set('HumanFlow', new FlowBehavior(this, 1, {
        flowGrid: this.options.world.flowGrid, layer: options.world.layerByName('human')
      })
    );

    this.behaviors.set('ZombieFlow', new FlowBehavior(this, 2, {
        flowGrid: this.options.world.flowGrid, layer: options.world.layerByName('zombie')
      })
    );

    this.behaviors.set('ConvertHumanBehavior', new ConvertHumanBehavior(this, 1, {margin: 1, minAgeBeforeConvert: 3}));
    this.World.zombies.add(this);
  }

  override tick(gameTime: IGameTime): void {
    if (this.age < 3) {
      this.age += gameTime.deltaTime;
      return;
    }
    super.tick(gameTime);
  }

  override die() {
    super.die();
    this.World.zombies.delete(this);
  }
}
