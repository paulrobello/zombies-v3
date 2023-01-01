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
  maxDeltaTime: 1
};

export class GameClock {
  startTime: number = 0;
  lastTime: number = 0;
  frameCount: number = 0;
  options: IGameClockOptions;
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
    setInterval(() => {
      if (gameTime.fps) {
        gameTime.fps = (gameTime.fps + this.frameCount) / 2;
      } else {
        gameTime.fps = this.frameCount;
      }
      this.frameCount = 0;
    }, 1000);
  }

  tick() {
    const t = performance.now();
    const gameTime = this.gameTime;
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
    // if (Math.random()<0.001) console.log(gameTime);
    gameTime.deltaTime = clamp(gameTime.deltaTime, this.options.minDeltaTime, this.options.maxDeltaTime);
    this.frameCount++;
  }
}
