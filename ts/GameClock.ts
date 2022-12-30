import { clamp } from './math';

export interface IGameClockOptions {
  minDeltaTime: number;
  maxDeltaTime: number;
}

export interface IGameTime {
  currentTime: number;
  deltaTime: number;
}

export const GameClockDefaultOptions: IGameClockOptions = {
  minDeltaTime: 0.1,
  maxDeltaTime: 1
};

export class GameClock {
  startTime: number = 0;
  lastTime: number = 0;
  frameCount: number = 0;
  fps: number = 0;
  options: IGameClockOptions;
  gameTime: IGameTime = {
    currentTime: 0,
    deltaTime: 0
  };

  constructor(options: IGameClockOptions = GameClockDefaultOptions) {
    this.options = options;

    this.startTime = performance.now();
    setInterval(() => {
      if (this.fps) {
        this.fps = (this.fps + this.frameCount) / 2;
      } else {
        this.fps = this.frameCount;
      }
      this.frameCount = 0;
    }, 1000);
  }

  tick() {
    const t = performance.now();
    const gameTime = this.gameTime;
    gameTime.currentTime = (t - this.startTime) / 1000;
    if (isNaN(gameTime.currentTime)) {
      gameTime.currentTime = 0;
    }
    if (this.lastTime) {
      gameTime.deltaTime = (gameTime.currentTime - this.lastTime);
    }
    this.lastTime = gameTime.currentTime;
    gameTime.deltaTime = clamp(gameTime.deltaTime, this.options.minDeltaTime, this.options.maxDeltaTime);
    this.frameCount++;
  }
}
