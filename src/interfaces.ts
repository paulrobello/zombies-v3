import { ICellIndexable } from './Cell';
import { IGameTime } from './GameClock';
import { IGridQueryable } from './HashGrid';
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

export interface IFlowValue extends IPositional, ICellIndexable, IGridQueryable {
  l: number;
}

export type QueryLayerByName = Map<string, number>;
export type QueryLayers = number;
