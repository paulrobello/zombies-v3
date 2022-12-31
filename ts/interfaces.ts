import { ICellIndexable } from './Cell';
import { IGameTime } from './GameClock';
import { Ivec2 } from './math';

export interface IPositional {
  p: Ivec2;
}

export interface IProgressible {
  tick: (gameTime: IGameTime) => void;
}

export interface IDrawable {
  draw: (ctx: CanvasRenderingContext2D) => void;
}

export interface IFlowValue extends IPositional, ICellIndexable {
  l: number;
}
