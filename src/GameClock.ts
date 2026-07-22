/**
 * Game clock — the single source of `IGameTime` (`currentTime`, `deltaTime`,
 * `currentFrame`, `fps`) consumed by every `tick` method. Clamps `deltaTime`
 * to `[minDeltaTime, maxDeltaTime]` (default `[0.01, 0.1]`) so a tab
 * backgrounded for minutes doesn't produce a single multi-second step that
 * tunnels boids through walls.
 *
 * FPS is sampled by a 1Hz `setInterval` that halves the running average
 * with the per-frame count. The interval id is tracked so `dispose()` can
 * clear it (QA-013); `World.dispose` calls `gameClock.dispose()`.
 */
import { clamp } from './math';

export interface IGameClockOptions {
  minDeltaTime: number;
  maxDeltaTime: number;
  /** Lock `deltaTime` to {@link FIXED_DELTA_TIME} every frame for deterministic runs. */
  fixedStep: boolean;
}

export interface IGameTime {
  currentTime: number;
  deltaTime: number;
  currentFrame: number;
  fps: number;
}

export const GameClockDefaultOptions: IGameClockOptions = {
  minDeltaTime: 0.01,
  maxDeltaTime: 0.1,
  fixedStep: false
};

/**
 * Fixed delta time (seconds per frame) used when `fixedStep` is on. 1/60
 * matches a 60Hz display's expected frame rate; choosing a constant — rather
 * than measuring real elapsed time — makes the simulation deterministic so a
 * screenshot taken at `?exitAfter=500` is byte-equivalent across runs.
 */
export const FIXED_DELTA_TIME: number = 1 / 60;

export class GameClock {
  startTime: number = 0;
  lastTime: number = 0;
  fpsFrameCount: number = 0;
  options: IGameClockOptions;
  /** True iff the clock is in deterministic fixed-step mode (`?fixedStep=1`). */
  fixedStep: boolean;
  private fpsIntervalId: ReturnType<typeof setInterval> | null = null;
  gameTime: IGameTime = {
    currentTime: 0,
    deltaTime: 0,
    currentFrame: 0,
    fps: 0
  };

  constructor(options: IGameClockOptions = GameClockDefaultOptions) {
    this.options = options;
    this.fixedStep = options.fixedStep;
    const gameTime = this.gameTime;
    this.startTime = performance.now();
    this.fpsIntervalId = setInterval(() => {
      if (gameTime.fps) {
        gameTime.fps = (gameTime.fps + this.fpsFrameCount) / 2;
      } else {
        gameTime.fps = this.fpsFrameCount;
      }
      this.fpsFrameCount = 0;
    }, 1000);
  }

  dispose(): void {
    if (this.fpsIntervalId !== null) {
      clearInterval(this.fpsIntervalId);
      this.fpsIntervalId = null;
    }
  }

  tick() {
    const gameTime: IGameTime = this.gameTime;
    gameTime.currentFrame++;

    if (this.fixedStep) {
      // Deterministic mode: ignore wall clock and advance by FIXED_DELTA_TIME.
      // `currentTime` advances by the same dt so shader iTime is reproducible
      // too; `deltaTime` skips the clamp since FIXED_DELTA_TIME (~0.0167) is
      // already inside [minDeltaTime, maxDeltaTime]. `lastTime` is left alone
      // — it is only used to derive deltaTime from currentTime in real mode.
      gameTime.currentTime += FIXED_DELTA_TIME;
      gameTime.deltaTime = FIXED_DELTA_TIME;
    } else {
      const t = performance.now();
      gameTime.currentTime = (t - this.startTime) / 1000;
      if (isNaN(gameTime.currentTime)) {
        gameTime.currentTime = 0;
      }
      if (this.lastTime) {
        gameTime.deltaTime = (gameTime.currentTime - this.lastTime);
      }
      if (isNaN(gameTime.deltaTime)) {
        gameTime.deltaTime = 0;
      }
      this.lastTime = gameTime.currentTime;
      gameTime.deltaTime = clamp(gameTime.deltaTime, this.options.minDeltaTime, this.options.maxDeltaTime);
    }

    this.fpsFrameCount++;
  }
}
