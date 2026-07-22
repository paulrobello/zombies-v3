/**
 * Expanding-ring visual effect emitted when a Human converts into a Zombie.
 * A fixed pool of `numBoids` rings is allocated by `World.initBoids`; each
 * ring has a `duration` that ticks down and a `radius` that grows. A ring
 * with `duration <= 0` is "available" — `Human.die` finds the first
 * available ring, sets its duration / position, and the next frame the ring
 * expands outward.
 *
 * Per-instance data is written into `World.ringGl` at `id * 4` (see
 * `IRingGl`). The vertex shader degenerates the position outside clip
 * volume when `pos_rad.w` (duration) is `< EPSILON`, so inactive rings are
 * culled without buffer compaction.
 *
 * @see src/World.ts IRingGl for the buffer packing layout.
 */
import { IGameTime } from './GameClock';
import { IDrawable, IProgressible } from './interfaces';
import { vec2, vec4 } from './math';
import { World } from './World';

export interface IRingOptions {
  world: World;
  id: number;
  p: vec2;
  r: number;
  thickness: number;
  speed: number;
  duration: number;
  color: vec4;
}

export class Ring implements IProgressible, IDrawable {
  world: World;
  id: number;
  p: vec2;
  r: number;
  thickness: number;
  speed: number;
  duration: number;
  color: vec4;

  constructor(options: IRingOptions) {
    this.world = options.world;
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

  draw(_ctx: WebGL2RenderingContext): void {
    const buffers = this.world.ringGl;
    const i = this.id * 4;
    if (this.duration) {
      buffers.pos_rad[i] = this.p.x;
      buffers.pos_rad[i + 1] = this.p.y;
      buffers.pos_rad[i + 2] = this.r;
      buffers.color[i] = this.color.r;
      buffers.color[i + 1] = this.color.g;
      buffers.color[i + 2] = this.color.b;
      buffers.color[i + 3] = this.thickness;
    }
    buffers.pos_rad[i + 3] = this.duration;
  }
}
