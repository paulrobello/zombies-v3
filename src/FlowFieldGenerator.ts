/**
 * FlowFieldGenerator — owns the procedural flow field and the food-gradient
 * solver. Extracted from `World.ts` (ARC-002).
 *
 * Responsibilities (all previously on `World`):
 *
 * - The seeded `noise` function (`fast-simplex-noise`'s `makeNoise2D` seeded
 *   from `rand` so the flow field is reproducible under `?seed=N`).
 * - `fieldScale` / `fieldRandomScale` — frequency coefficients for the noise
 *   lookup. `fieldRandomScale` is set ONCE per FlowFieldGenerator instance
 *   (QA-023: previously re-randomized on every resize, making the flow field
 *   "jump" when the window was resized).
 * - `genField()` — populates `flowGrid` with the static border cells (walls),
 *   each cell carrying an `IFlowValue` whose direction comes from `noise`.
 * - `getFlowFieldValue(x, y, s)` — single-cell noise lookup.
 * - `computeFoodGradient()` — writes a synthetic per-cell flow that points
 *   every food-aware boid toward the nearest `Food`. QA-022: the result is
 *   recomputed at most once per frame via the dirty flag set by
 *   {@link markFoodGradientDirty} (called from `Food.tick` / `Food.die`).
 *
 * Receives the `World` it decorates so it can reach `flowGrid`, `food`,
 * dimensions, and `layerByName`. World's {@link World.markFoodGradientDirty}
 * delegates here.
 */
import { makeNoise2D } from 'fast-simplex-noise';
import { IFlowValue } from './grids/FlowGrid';
import { clamp, epsilon, vec2 } from './math';
import { rand } from './math/random';
import { World } from './World';

// Seeded from `rand()` so the flow field is reproducible under `?seed=N`
// (deterministic screenshot equivalence), not `makeNoise2D`'s default RNG.
const noise = makeNoise2D(rand);

export class FlowFieldGenerator {
  // QA-023: fieldRandomScale is set ONCE per FlowFieldGenerator instance
  // (initialised at construction, before resize/genField run). Previously
  // genField re-randomized it on every resize, making the flow field "jump"
  // when the window was resized.
  fieldRandomScale: number;
  fieldScale: number;
  private foodGradientDirty: boolean = false;

  constructor(private readonly world: World) {
    this.fieldRandomScale = rand() * 0.001;
    this.fieldScale = world.flowCellSize * 0.005;
  }

  /**
   * QA-022: Food state changes (size thresholds, death) call this instead of
   * recomputing the gradient inline. The tick loop checks the flag once per
   * frame and recomputes if dirty — collapses O(foods × cells)/frame to one
   * pass per frame.
   */
  markFoodGradientDirty(): void {
    this.foodGradientDirty = true;
  }

  /**
   * Consume the dirty flag, recomputing the gradient if it was set. Returns
   * the new dirty state (always false after this call). Called once at the
   * top of `World.draw` BEFORE any boid reads the flow field, so all boids
   * see a consistent gradient within the same frame.
   */
  applyFoodGradientIfDirty(): boolean {
    if (this.foodGradientDirty) {
      this.computeFoodGradient();
      this.foodGradientDirty = false;
      return true;
    }
    return false;
  }

  /**
   * Populate `flowGrid` with the static border cells (the simulation's walls).
   * Each border cell carries an `IFlowValue` whose direction comes from
   * `noise(x, y)`; the interior is left empty so boid flow contributions
   * accumulate there as they move.
   */
  genField(): void {
    const flowGrid = this.world.flowGrid;
    flowGrid.clear();
    const gridXW = this.world.gridXW;
    const gridYW = this.world.gridYW;
    for (let y = 0; y < gridYW; y++) {
      for (let x = 0; x < gridXW; x++) {
        const s = x === 0 || y === 0 || x === gridXW - 1 || y === gridYW - 1;
        if (!s) continue;
        flowGrid.addCelData(x, y, false, this.getFlowFieldValue(x, y, s));
      }
    }
  }

  getFlowFieldValue(x: number, y: number, s: boolean): IFlowValue {
    const scale = this.fieldScale + this.fieldRandomScale;
    const nx = (x - this.world.widthD2) * scale;
    const ny = (y - this.world.heightD2) * scale;
    const rad = noise(nx, ny);
    const p = vec2.angle2Vec(rad * Math.PI);
    return {
      id: 0,
      layer: this.world.layerByName('boid'),
      p,
      l: 1.0,
      lastCellIndex: -1,
      cellIndex: -1,
      static: s,
      solid: s
    };
  }

  computeFoodGradient(): void {
    const food = Array.from(this.world.food.values()).filter(f => f.flowEnabled);
    const flowGrid = this.world.flowGrid;
    const t = new vec2();
    const maxDist = Math.max(this.world.width, this.world.height) / 4;
    // ARC-006/QA-017: keep `layer` as the bitmask (the IFlowValue written
    // below still carries it on `.layer` for HashGrid queries and fade lookup),
    // and resolve the dense storage slot once for the `cell.items` read.
    const layer = this.world.layerByName('food');
    const slot = this.world.layerSlotForMask(layer);
    for (const cell of flowGrid.cells) {
      let cv = cell.items[slot];
      if (!cv) {
        cv = {
          id: 0,
          layer: layer,
          p: new vec2(),
          l: 0,
          lastCellIndex: -1,
          cellIndex: -1,
          static: true,
          solid: false
        };
        flowGrid.addCelData(cell.p.x, cell.p.y, false, cv);
      }
      if (!food.length) {
        cv.p.reset();
        cv.l = 0;
      } else {
        t.reset();
        for (const f of food) {
          const dv = vec2.difference(f.p, cell.wc);
          const l = clamp(dv.length(), epsilon, maxDist);
          t.add(dv.scale((1 / l) * (1.1 - (l / maxDist))));
        }
        cv.l = 1;
        t.normalize();
        cv.p.set_xy(t.x, t.y);
      }
    }
  }
}
