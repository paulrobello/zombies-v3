/**
 * Strategy pattern base for per-frame boid behaviours. Each `Boid` holds a
 * `Map<string, BoidBehavior<Boid>>` and iterates it in insertion order
 * inside `Boid.applyBehaviors` — see {@link Boid.behaviors}.
 *
 * Two knobs drive every subclass:
 *
 * - **`enabled`** (default `true`). Gates whether `tick` does anything.
 *   Subclasses start their `tick` with `if (!this.enabled) return;`. Toggled
 *   at runtime by the owning entity — `Human`, for example, switches
 *   `findFood.enabled` and `foodFlow.enabled` based on its hunger threshold.
 * - **`scale`**. Per-behaviour multiplier on the output force. Negative
 *   scales invert the force direction (e.g. `SteerLayerBehavior` with
 *   `scale = -2` for "avoid this layer" — see `Human`'s `AvoidZombie`).
 *
 * `name` is set by each subclass's constructor and doubles as the
 * `behaviors` map key. It is also read across behaviours: `CollisionBehavior`
 * looks up the neighbour's same-named behaviour to short-circuit duplicate
 * processing in the same frame (`checkedFrame`).
 *
 * The {@link tick} base implementation is a no-op; subclasses override it
 * and call `super.tick` only for the gating check.
 */
import { Boid } from '../boids/Boid';
import { IGameTime } from '../GameClock';
import { IProgressible } from '../interfaces';


export interface IBehaviorOptions {
  enabled?: boolean;
}

export class BoidBehavior<T extends Boid> implements IProgressible {
  public name!: string;
  public enabled: boolean;
  public boid: T;
  public scale: number;

  constructor(boid: T, scale: number = 1, options: IBehaviorOptions) {
    this.boid = boid;
    this.scale = scale;
    this.enabled = options.enabled !== undefined ? options.enabled : true;
  }

  tick(_gameTime: IGameTime): void {
  }
}
