import { IGameTime } from './GameClock';
import { Ivec2 } from './math';

export interface IPositional {
  p: Ivec2;
}

export interface IDirectional {
  d: Ivec2;
}


export interface IProgressible {
  tick: (gameTime: IGameTime) => void;
}

export interface IDrawable {
  draw: (ctx: WebGL2RenderingContext) => void;
}


export type QueryLayerByName = Map<string, number>;
export type QueryLayers = number;
