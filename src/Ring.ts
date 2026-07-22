/**
 * Expanding-ring visual effect emitted when a Human converts into a Zombie.
 * A fixed pool of `numBoids` rings is allocated by `Spawner.initBoids`; each
 * ring has a `duration` that ticks down and a `radius` that grows. A ring
 * with `duration <= 0` is "available" — `Human.die` finds the first
 * available ring in `World.rings`, sets its duration / position, and the
 * next frame the ring expands outward.
 *
 * ARC-011: `Ring` exposes PURE STATE (position, radius, duration, color,
 * thickness, speed). The {@link Renderer} iterates `world.rings` and writes
 * each ring's state into `Renderer.ringGl` at `id * 4` (see `IRingGl`). The
 * vertex shader degenerates the position outside clip volume when
 * `pos_rad.w` (duration) is `< EPSILON`, so inactive rings are culled
 * without buffer compaction.
 *
 * @see src/Renderer.ts — writes this ring's state into the GL buffers.
 * @see src/interfaces.ts IRingGl for the buffer packing layout.
 */
import { IGameTime } from './GameClock';
import { IProgressible } from './interfaces';
import { vec2, vec4 } from './math';

export interface IRingOptions {
  id: number;
  p: vec2;
  r: number;
  thickness: number;
  speed: number;
  duration: number;
  color: vec4;
}

export class Ring implements IProgressible {
  id: number;
  p: vec2;
  r: number;
  thickness: number;
  speed: number;
  duration: number;
  color: vec4;

  constructor(options: IRingOptions) {
    this.id = options.id;
    this.p = options.p;
    this.r = options.r;
    this.thickness = options.thickness;
    this.speed = options.speed;
    this.duration = options.duration;
    this.color = options.color;
  }

  tick(gameTime: IGameTime): void {
    if (this.duration <= 0) {
      return;
    }
    this.duration = Math.max(0, this.duration - gameTime.deltaTime);
    this.r += gameTime.deltaTime * this.speed;
    this.speed += gameTime.deltaTime * 50;
  }
}
