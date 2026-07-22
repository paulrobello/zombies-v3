import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { FlowGrid, IFlowValue } from '../grids/FlowGrid';
import { clamp, epsilon, Ivec2, vec2 } from '../math';
import { BoidBehavior, IBehaviorOptions } from './BoidBehavior';

// QA-027: per-file tuning knobs. Exhaustive extraction of every numeric
// literal is intentionally backlog — only the non-obvious force/scale
// multipliers are surfaced here.
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
  layer: number;

  constructor(boid: T, scale: number, options: IFlowBehaviorOptions) {
    super(boid, scale, options);
    this.name = 'FlowBehavior';
    this.flowGrid = options.flowGrid;
    this.layer = options.layer;
  }

  public override tick(gameTime: IGameTime): void {
    if (!this.enabled) return;
    const b: Boid = this.boid;
    const p: Ivec2 = b.p;
    const v: Ivec2 = b.v;
    const cell = this.flowGrid.getCell(p.x, p.y, true);
    if (!cell || cell.items.length <= this.layer) return;
    // QA-019: outer `flow` was previously shadowed by an inner `const d: vec2`
    // in the solid branch — renamed here so the IFlowValue binding stays
    // readable in both branches.
    const flow: IFlowValue | undefined = cell.items[this.layer];
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
