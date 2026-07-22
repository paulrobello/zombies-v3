/**
 * Spawner — entity factory and per-World id allocator. Extracted from
 * `World.ts` (ARC-002) and owns the ARC-009 per-World boid-id counter that
 * was previously a module-level singleton in `Boid.ts`.
 *
 * Responsibilities (all previously on `World`):
 *
 * - **Per-World id allocator** (`boidIdCounter` / `nextBoidId`). Boids get
 *   dense ids in `[0, numBoids)` so the GL instanced buffers — sized to
 *   `numBoids` and indexed by `boid.id` — have a slot for every boid.
 *   `Human.die` passes an explicit `id: this.id` when spawning its
 *   replacement Zombie, bypassing the allocator to reuse the dying human's
 *   slot (the dense-id invariant holds across conversion). A second `World`
 *   or an HMR reload that constructs a fresh `Spawner` starts from 0
 *   independently.
 * - `initBoids()` — populates `world.boids` (and the species sets + the
 *   fixed-size `rings` pool) with the initial `numBoids` entities:
 *   first 3 are `Food`, the next quarter (minus food) are `Zombie`, and the
 *   remainder are `Human` (QA-010 species partition).
 * - `randomizeBoids()` — re-scatters existing boids across the world.
 *
 * Receives the `World` it decorates so it can reach `boidGrid`, the entity
 * arrays/sets, and `layerByName`. `World.nextBoidId` delegates here.
 */
import { Boid } from './boids/Boid';
import { Food } from './boids/Food';
import { Human } from './boids/Human';
import { Zombie } from './boids/Zombie';
import { clamp, vec2, vec4 } from './math';
import { rand } from './math/random';
import { Ring } from './Ring';
import { World } from './World';

export class Spawner {
  // ARC-009: per-World boid-id allocator. Replaces the module-level
  // `let id = 0` in Boid.ts so each World's boids get dense ids in
  // [0, numBoids) — required by the GL instanced buffers, which are sized
  // to numBoids and indexed by `boid.id`. A second World or an HMR reload
  // that constructs a fresh World starts from 0 independently.
  private boidIdCounter: number = 0;

  constructor(private readonly world: World) {}

  /**
   * ARC-009: allocate the next dense boid id for this World. Boid constructor
   * calls this when no explicit `id` is passed in options. Reset to 0 at the
   * start of {@link initBoids} so each World's boids are densely numbered
   * from 0 (matches the size of the GL instanced buffers allocated in
   * `Renderer.initBoidGl`).
   */
  nextBoidId(): number {
    return this.boidIdCounter++;
  }

  /**
   * Reset the id allocator (used by `World` on re-init) so the next
   * `initBoids` pass produces dense ids in `[0, numBoids)`.
   */
  resetIdAllocator(): void {
    this.boidIdCounter = 0;
  }

  initBoids(): void {
    const world = this.world;
    // ARC-009: reset the per-World id allocator so this World's boids get
    // dense ids in [0, numBoids), matching the GL buffer slot count.
    this.boidIdCounter = 0;
    for (let i = 0; i < world.numBoids; i++) {
      const o = {
        world,
        grid: world.boidGrid,
        p: new vec2(
          clamp(rand() * world.width, world.boidCellSize * 2, world.width - world.boidCellSize * 2),
          clamp(rand() * world.height, world.boidCellSize * 2, world.height - world.boidCellSize * 2)
        ),
        v: new vec2().random(10, world.humanMaxSpeed),
        r: world.boidSize,
        maxSpeed: world.humanMaxSpeed,
        static: false
      };

      let b: Boid;
      if (i < 3) {
        b = new Food(o);
      } else {
        if (i < Math.floor(world.numBoids / 4)) {
          o.maxSpeed = world.zombieMaxSpeed;
          o.v.random(10, o.maxSpeed);
          b = new Zombie(o);
        } else {
          o.v.random(10, o.maxSpeed);
          b = new Human(o);
        }
      }
      world.boids.push(b);
      world.rings.push(new Ring({
        id: i,
        p: new vec2(),
        thickness: 0.01,
        r: 0,
        duration: 0,
        speed: 50,
        color: new vec4([1, 0, 0, 1])
      }));
    }
    world.flowFieldGen.computeFoodGradient();
  }

  randomizeBoids(): void {
    const world = this.world;
    world.boids.forEach(b => {
      b.p.set_xy(rand() * world.width, rand() * world.height);
      b.v.random(world.humanMaxSpeed / 2, world.humanMaxSpeed);
    });
    world.boidGrid.reposition();
  }
}
