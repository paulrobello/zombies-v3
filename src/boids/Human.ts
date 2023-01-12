import { scale } from 'chroma-js';
import { CollisionBehavior } from '../behaviours/collision';
import { FlowBehavior } from '../behaviours/flow';
import { SteerLayerBehavior } from '../behaviours/steer_layer';
import { IGameTime } from '../GameClock';
import { epsilon, vec2 } from '../math';
import { Boid, IBoidOptions } from './Boid';
import { Food } from './Food';
import { Zombie } from './Zombie';

export class Human extends Boid {
  hunger: number = 0;
  hungerGradient = scale(['#0FF', '#A00'])
    .domain([0, 100]);
  foodLayer: number;

  constructor(options: IBoidOptions) {
    super(options);
    // this.maxSpeed = 1;
    this.layer = this.options.world.layerByName('human');
    this.color.rgb = [0, 1, 1];
    if (this.id === 0) {
      this.color.rgb = [1, 1, 0];
    }
    this.behaviors.set('CollisionBehavior', new CollisionBehavior(this, 1, {
      iterations: 1,
      margin: 2,
      layerMask: this.World.layerByName('human'),
      predictive: true
    }));
    this.behaviors.set('BoidFlow', new FlowBehavior(this, 0.1, {
        flowGrid: this.World.flowGrid,
        layer: this.World.layerByName('boid') // | options.world.layerByName('human')
      })
    );
    this.behaviors.set('HumanFlow', new FlowBehavior(this, 1, {
        flowGrid: this.World.flowGrid,
        layer: options.world.layerByName('human')
      })
    );
    this.behaviors.set('FoodFlow', new FlowBehavior(this, 1, {
        flowGrid: this.World.flowGrid,
        layer: options.world.layerByName('food')
      })
    );

    this.behaviors.set('AvoidZombie', new SteerLayerBehavior(this, 100, {
        layerName: 'zombie',
        radius: Math.max(this.r * 100, this.options.grid.cellSize * 5),
        nearest: true
      })
    );
    this.behaviors.set('FindFood', new SteerLayerBehavior(this, 2, {
        layerName: 'food',
        radius: Math.max(this.World.width, this.World.height),
        nearest: true
      })
    );
    this.World.humans.add(this);
    this.foodLayer = this.World.layerByName('food');
  }

  override tick(gameTime: IGameTime): void {
    super.tick(gameTime);
    if (!this.alive) {
      return;
    }
    // const grid = this.options.grid;
    this.hunger += gameTime.deltaTime;
    if (this.hunger > 10) {
      const nearest = this.grid.getDataRadius(this.p.x, this.p.y, this.grid.cellSize, true, this, true, this.foodLayer);
      if (nearest.length) {
        const food = nearest[0].data as Food;
        const r = food.r + this.r;
        if (food.r >= 2 && nearest[0].dist2 <= r * r) {
          // food.r -= gameTime.deltaTime * 0.1;
          // this.hunger = Math.max(0, this.hunger - gameTime.deltaTime * 10);
          food.r = Math.max(0, food.r - this.hunger * 0.01);
          this.hunger = 0;
          if (food.r < 2) {
            this.World.food.forEach(f => f.addFoodGradient());
          }
        }
      }
    }
    if (this.hunger >= 100) {
      this.die();
      return;
    }
    this.color.rgba = this.hungerGradient(this.hunger).gl();
    let bh: SteerLayerBehavior = this.behaviors.get('FindFood') as SteerLayerBehavior;
    bh.scale = this.hunger / 100;
    bh = this.behaviors.get('FoodFlow') as SteerLayerBehavior;
    bh.scale = this.hunger / 100;

  }

  override die() {
    super.die();
    this.World.humans.delete(this);

    const o: IBoidOptions = {
      id: this.id,
      world: this.World,
      grid: this.Grid,
      p: this.p.copy(),
      v: new vec2().random(0, this.maxSpeed),
      r: this.r,
      maxSpeed: this.maxSpeed
    };
    const boid = new Zombie(o);
    this.World.boids[boid.id] = boid;
    for (const r of this.World.rings) {
      if (r.duration) continue;
      r.duration = 2;
      r.r = 0;
      r.speed = 1;
      r.p.set_xy(this.p.x, this.p.y);
      break;
    }
  }
}
