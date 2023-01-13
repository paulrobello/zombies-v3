import { IGameTime } from './GameClock';
import { Ivec2 } from './math';

export interface IPositional {
  p: Ivec2;
}

export interface IDirectional {
  d: Ivec2;
}


export interface IProgressible {
  tick: (gameTime: IGameTime) => boolean;
}

export interface IDrawable {
  draw: (ctx: WebGL2RenderingContext) => void;
}


export type QueryLayerByName = Map<string, number>;
export type QueryLayers = number;
