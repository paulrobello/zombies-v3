/**
 * Human entity — wanders, grows hungry, seeks food, flees zombies, and on
 * death converts into a `Zombie`. Behaviour set (in run-order): collision,
 * boid-flow, human-flow, food-flow (hunger-gated), find-food steer
 * (hunger-gated), avoid-zombie steer.
 *
 * On `die()`, spawns a `Zombie` that **reuses the dying human's `id`** so
 * the GL instanced buffer slot is recycled (see {@link Boid}'s id invariant)
 * — `World.boids.push(boid)` rather than indexed assignment, because the
 * `Renderer.writeBoidBuffers` pass visits the appended Zombie AFTER the
 * dead Human, so the Zombie's live values overwrite the dead Human's
 * zeroed slot (see QA-026).
 *
 * Colour: cyan by default, shifting through the precomputed
 * `HUNGER_GRADIENT_LUT` (ARC-004) as hunger rises. The LUT replaces a
 * per-frame `chroma.scale()(.gl())` call that allocated a fresh rgba array
 * for every living human every tick.
 *
 * @see Boid for the base class and behaviour-composition contract.
 */
import chroma from 'chroma-js';
import { CollisionBehavior } from '../behaviors/CollisionBehavior';
import { FlowBehavior } from '../behaviors/FlowBehavior';
import { SteerLayerBehavior } from '../behaviors/SteerLayerBehavior';
import { IGameTime } from '../GameClock';
import { vec2, vec4 } from '../math';
import { Boid, IBoidOptions } from './Boid';
import { Food } from './Food';
import { Zombie } from './Zombie';

// ARC-004: hunger gradient is precomputed once as a fixed vec4 LUT indexed by
// Math.floor(hunger), instead of re-running a chroma scale + .gl() (which
// allocates a fresh rgba array) every frame per living human. Domain mirrors
// the original chroma scale: cyan below threshold, yellow at threshold, red
// at hunger=100.
const HUNGER_THRESHOLD_DEFAULT = 10;
const HUNGER_MAX = 100;

export class Human extends Boid {
  private static readonly HUNGER_GRADIENT_LUT: readonly vec4[] = Human.buildHungerLUT();

  private static buildHungerLUT(): vec4[] {
    const scale = chroma
      .scale(['#0FF', '#0FF', '#FF0', '#A00'])
      .domain([0, HUNGER_THRESHOLD_DEFAULT - 1, HUNGER_THRESHOLD_DEFAULT, HUNGER_MAX]);
    const lut: vec4[] = [];
    for (let i = 0; i <= HUNGER_MAX; i++) {
      const [r, g, b, a] = scale(i).gl();
      lut.push(new vec4([r, g, b, a]));
    }
    return lut;
  }

  hunger: number = 0;
  foodLayer: number;
  findFood: SteerLayerBehavior<Human>;
  foodFlow: FlowBehavior<Human>;
  hungerThreshold: number = HUNGER_THRESHOLD_DEFAULT;
  hungerSpeed: number = 1;

  constructor(options: IBoidOptions) {
    super(options);
    // this.maxSpeed = 1;
    this.layer = this.options.world.layerByName('human');
    this.color.rgb = [0, 1, 1];
    if (this.id === 0) {
      this.color.rgb = [1, 1, 0];
    }
    this.behaviors.set('CollisionBehavior', new CollisionBehavior(this, 0.5, {
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
    this.behaviors.set('HumanFlow', new FlowBehavior<Human>(this, 0.25, {
        flowGrid: this.World.flowGrid,
        layer: options.world.layerByName('human')
      })
    );
    this.foodFlow = new FlowBehavior<Human>(this, 1, {
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

    this.behaviors.set('AvoidZombie', new SteerLayerBehavior(this, -2, {
        layerName: 'zombie',
        radius: this.options.grid.cellSize * 3,
        nearest: false,
        breakingDistance: 0,
        breakingPower: 5
      })
    );
    this.World.humans.add(this);
    this.foodLayer = this.World.layerByName('food');
  }

  override tick(gameTime: IGameTime): void {
    super.tick(gameTime);
    // ARC-010: previously `if (!super.tick(gameTime)) return false;` consumed
    // Boid.tick's boolean return. Now that IProgressible.tick is void, check
    // this.alive directly — Boid.tick bails early when dead, leaving the
    // fields Human.tick reads (hunger, position) untouched.
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
        // ARC-004: the food layer is typed HashGrid<Boid>, so the lookup is
        // Boid, not Food. Guard with instanceof before touching Food members;
        // a non-Food in the food layer would otherwise silently run Food
        // methods on the wrong class.
        const food = nearest[0].data;
        if (food instanceof Food) {
          const r = food.r + this.r;
          if (food.r >= Food.MinSize && nearest[0].dist2 <= r * r) {
            food.r = Math.max(0, food.r - this.hunger * 0.01);
            this.hunger = 0;
          }
        }
      }
    } else {
      this.findFood.enabled = false;
      this.foodFlow.enabled = false;
    }
    if (this.hunger > HUNGER_MAX) {
      this.die();
      return;
    }
    // ARC-004: LUT lookup replaces per-frame chroma.scale()(.gl()) allocation.
    // Component-wise copy avoids even the rgba-array allocation of `c.rgba`.
    const hungerIdx = this.hunger <= 0
      ? 0
      : this.hunger >= HUNGER_MAX ? HUNGER_MAX : Math.floor(this.hunger);
    const c = Human.HUNGER_GRADIENT_LUT[hungerIdx];
    this.color.r = c.r;
    this.color.g = c.g;
    this.color.b = c.b;
    this.color.a = c.a;
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
    // QA-026: use the array's canonical add API rather than the legacy
    // dense-id assumption (`boids[boid.id] = boid` worked only because ids
    // are assigned densely from 0). The Zombie keeps the dying Human's id,
    // which is what the GL buffer slot index is — `Renderer.writeBoidBuffers`
    // iterates `world.boids` in insertion order, so the dead Human (earlier
    // in the array) writes `rad_static.x = 0` first and the appended Zombie
    // (same id) overwrites that slot with its live values.
    this.World.boids.push(boid);
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
