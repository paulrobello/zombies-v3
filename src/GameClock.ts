import { clamp } from './math';

export interface IGameClockOptions {
  minDeltaTime: number;
  maxDeltaTime: number;
}

export interface IGameTime {
  currentTime: number;
  deltaTime: number;
  currentFrame: number;
  fps: number;
}

export const GameClockDefaultOptions: IGameClockOptions = {
  minDeltaTime: 0.01,
  maxDeltaTime: 0.1
};

export class GameClock {
  startTime: number = 0;
  lastTime: number = 0;
  fpsFrameCount: number = 0;
  options: IGameClockOptions;
  private fpsIntervalId: ReturnType<typeof setInterval> | null = null;
  gameTime: IGameTime = {
    currentTime: 0,
    deltaTime: 0,
    currentFrame: 0,
    fps: 0
  };

  constructor(options: IGameClockOptions = GameClockDefaultOptions) {
    this.options = options;
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
    const t = performance.now();
    const gameTime: IGameTime = this.gameTime;
    gameTime.currentFrame++;
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
    this.fpsFrameCount++;
  }
}
