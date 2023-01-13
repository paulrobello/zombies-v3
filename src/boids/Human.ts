import { scale } from 'chroma-js';
import { CollisionBehavior } from '../behaviours/CollisionBehavior';
import { FlowBehavior } from '../behaviours/FlowBehavior';
import { SteerLayerBehavior } from '../behaviours/SteerLayerBehavior';
import { IGameTime } from '../GameClock';
import { epsilon, vec2 } from '../math';
import { Boid, IBoidOptions } from './Boid';
import { Food } from './Food';
import { Zombie } from './Zombie';

export class Human extends Boid {
  hunger: number = 0;
  foodLayer: number;
  findFood: SteerLayerBehavior;
  foodFlow: FlowBehavior;
  hungerThreshold: number = 10;
  hungerSpeed: number = 1;
  hungerGradient = scale(['#0FF', '#0FF', '#FF0', '#A00'])
    .domain([0, this.hungerThreshold - 1, this.hungerThreshold, 100]);

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
    this.behaviors.set('HumanFlow', new FlowBehavior(this, 0.5, {
        flowGrid: this.World.flowGrid,
        layer: options.world.layerByName('human')
      })
    );
    this.foodFlow = new FlowBehavior(this, 1, {
      flowGrid: this.World.flowGrid,
      layer: options.world.layerByName('food'),
      enabled: false
    });
    this.behaviors.set('FoodFlow', this.foodFlow);

    this.findFood = new SteerLayerBehavior(this, 1, {
      layerName: 'food',
      enabled: false,
      // radius: Math.max(this.World.width, this.World.height),
      radius: this.World.boidCellSize * 5,
      nearest: true,
      breakingDistance: 100,
      breakingPower: 5
    });
    this.behaviors.set('FindFood', this.findFood);

    this.behaviors.set('AvoidZombie', new SteerLayerBehavior(this, -3, {
        layerName: 'zombie',
        radius:  this.options.grid.cellSize * 3,
        nearest: true,
        breakingDistance: 0,
        breakingPower: 5
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
    this.hunger += gameTime.deltaTime * this.hungerSpeed;
    if (this.hunger >= this.hungerThreshold) {
      this.findFood.enabled = true;
      this.findFood.scale = this.hunger / 100 * 2;
      this.foodFlow.enabled = true;
      this.foodFlow.scale = this.hunger / 100;

      const nearest = this.grid.getDataRadius(this.p.x, this.p.y, this.grid.cellSize * 2, true, this, true, this.foodLayer);
      if (nearest.length) {
        const food = nearest[0].data as Food;
        const r = food.r + this.r;
        if (food.r >= Food.MinSize && nearest[0].dist2 <= r * r) {
          // food.r -= gameTime.deltaTime * 0.1;
          // this.hunger = Math.max(0, this.hunger - gameTime.deltaTime * 10);
          food.r = Math.max(0, food.r - this.hunger * 0.01);
          this.hunger = 0;
        }
      }
    } else {
      this.findFood.enabled = false;
      this.foodFlow.enabled = false;
    }
    if (this.hunger > 100) {
      this.die();
      return;
    }
    this.color.rgba = this.hungerGradient(this.hunger).gl();
  }

  override die() {
    super.die();
    this.World.humans.delete(this);

    const o: IBoidOptions = {
      id: this.id,
      world: this.World,
      grid: this.Grid,
      p: this.p.copy(),
      v: new vec2().random(0, this.World.zombieMaxSpeed),
      r: this.r,
      maxSpeed: this.World.zombieMaxSpeed
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
