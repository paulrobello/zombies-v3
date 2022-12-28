import { Ivec2 } from './vec2';

export interface IPositional {
  p: Ivec2
}

export interface IProgressible {
  tick: (time: number, deltaTime: number) => void;
}
