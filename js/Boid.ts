import vec2 from './math/vec2';
import vec3 from './math/vec3';

export class Boid {
  public p: vec2;
  public v: vec2;
  public a: vec2;
  public r: number;

  constructor(p?: vec2, v?: vec2, r?: number) {
    this.p = p || vec2.zero;
    this.v = v || vec2.zero;
    this.a = vec2.zero;
    this.r = r || 1;
  }
}

export class BoidTail extends Boid {
  public h: vec3[] = [];

  constructor(p?: vec2, v?: vec2, r?: number) {
    super(p, v, r);
  }
}
