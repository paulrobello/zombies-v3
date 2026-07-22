import { IGameTime } from './GameClock';
import { Ivec2 } from './math';

export interface IPositional {
  p: Ivec2;
}

export interface IDirectional {
  d: Ivec2;
}


export interface IProgressible {
  // ARC-010: the boolean return value every implementor previously declared
  // was universally ignored at call sites (World.draw, Boid.applyBehaviors).
  // The only real consumers were the `if (!super.tick(gameTime)) return false;`
  // patterns inside Human/Zombie/Food, which actually meant "did Boid bail
  // because dead?" — those now check `this.alive` directly after the super
  // call, so the interface can honestly be `void`.
  tick: (gameTime: IGameTime) => void;
}

export interface IDrawable {
  draw: (ctx: WebGL2RenderingContext) => void;
}


export type QueryLayerByName = Map<string, number>;
export type QueryLayers = number;
