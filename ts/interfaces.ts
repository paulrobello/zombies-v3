import { Ivec2 } from './math/vec2';

export interface IPositional {
  p: Ivec2;
}

export interface IProgressible {
  tick: (time: number, deltaTime: number) => void;
}

export interface IDrawable {
  draw: (ctx: CanvasRenderingContext2D) => void;
}
