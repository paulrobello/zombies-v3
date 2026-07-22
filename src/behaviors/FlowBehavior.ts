/**
 * Sample the `FlowGrid` and apply a steering force along the cell's flow
 * vector. Two branches based on the sampled `IFlowValue`:
 *
 * - **Solid.** A wall the boid is overlapping or about to enter: pushes the
 *   boid away from the cell's world center with a strong impulse
 *   (`TUNING.pushForceScale`). Virtual base-speed boost
 *   (`TUNING.baseSpeedBoost`) ensures even stationary boids get pushed.
 * - **Flow.** Adds `flow.p · flow.l · scale` to the boid's velocity. Flow
 *   strength `flow.l` ranges 0..1 — a freshly-painted cell has `l = 1` and
 *   fades via `FlowGrid.fadeCells` unless refreshed or marked `static`.
 *
 * Per-entity `layer` selects which slot of the cell's `items` array to
 * read. `Human`, for example, runs three FlowBehaviours against `boid`,
 * `human`, and `food` layers simultaneously; `Food` flow is hunger-gated
 * via `enabled`.
 *
 * ARC-006/QA-017: the constructor accepts the layer as a bitmask (the value
 * of `World.layerByName(name)`, as today) and immediately resolves it to a
 * dense storage slot via `World.layerSlotForMask`. The slot is what `tick`
 * uses to index `cell.items`, so adding layers beyond the 8th no longer
 * overflows.
 */
import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { FlowGrid, IFlowValue } from '../grids/FlowGrid';
import { clamp, epsilon, Ivec2, vec2 } from '../math';
import { BoidBehavior, IBehaviorOptions } from './BoidBehavior';

// QA-027: per-file tuning knobs. Only non-obvious force/scale multipliers
// are surfaced; self-evident flow-magnitude math (`flow.p * flow.l`) stays
// inline.
const TUNING = {
  // Clamp on the away-from-solid distance — keeps the inverse within sane bounds.
  maxDistanceClamp: 1000,
  // Virtual minimum speed used when computing the solid-avoidance impulse,
  // so a stationary boid still gets pushed away.
  baseSpeedBoost: 10,
  // Amplifies the solid-avoidance impulse (the simulation's drag is small,
  // so without this boids tunnel into walls before responding).
  pushForceScale: 1000
};

export interface IFlowBehaviorOptions extends IBehaviorOptions {
  flowGrid: FlowGrid;
  layer: number;
}

export class FlowBehavior<T extends Boid> extends BoidBehavior<T> {
  flowGrid: FlowGrid;
  /**
   * Dense FlowGrid storage slot (ARC-006/QA-017). Resolved once from the
   * layer bitmask at construction; `tick` indexes `cell.items` by this.
   */
  slot: number;

  constructor(boid: T, scale: number, options: IFlowBehaviorOptions) {
    super(boid, 'FlowBehavior', scale, options);
    this.flowGrid = options.flowGrid;
    this.slot = boid.World.layerSlotForMask(options.layer);
  }

  public override tick(gameTime: IGameTime): void {
    if (!this.enabled) return;
    const b: Boid = this.boid;
    const p: Ivec2 = b.p;
    const v: Ivec2 = b.v;
    const cell = this.flowGrid.getCell(p.x, p.y, true);
    if (!cell || cell.items.length <= this.slot) return;
    // QA-019: outer `flow` was previously shadowed by an inner `const d: vec2`
    // in the solid branch — renamed here so the IFlowValue binding stays
    // readable in both branches.
    const flow: IFlowValue | undefined = cell.items[this.slot];
    if (!flow) {
      return;
    }
    const scale = this.scale;
    if (flow.solid) {
      const dv = vec2.difference(p, cell.wc, b.scratch.dTemp);
      const l = clamp(dv.length(), epsilon, TUNING.maxDistanceClamp);
      const push = dv.scale(1 / l);
      // QA-012: reuse b.scratch.t instead of allocating a new vec2 per frame.
      v.add(push.scale((b.speed + TUNING.baseSpeedBoost) * gameTime.deltaTime * TUNING.pushForceScale, b.scratch.t));
      return;
    }
    if (!flow.l) {
      return;
    }
    v.x += flow.p.x * flow.l * scale;
    v.y += flow.p.y * flow.l * scale;
  }
}
