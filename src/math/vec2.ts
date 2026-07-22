import { epsilon } from './constants';


export interface Ivec2 {
  x: number;
  y: number;

  xy(): [number, number];

  set_xy(x: number, y: number): Ivec2;

  reset(): Ivec2;

  equals(vector: Ivec2, threshold: number): boolean;

  length(): number;

  squaredLength(): number;

  toAngle(): number;

  clamp(maxLen: number, dest?: vec2): Ivec2;

  add(vector: Ivec2): Ivec2;

  subtract(vector: Ivec2): Ivec2;

  multiply(vector: Ivec2): Ivec2;

  divide(vector: Ivec2): Ivec2;

  scale(value: number, dest?: vec2): Ivec2;

  normalize(dest?: vec2): Ivec2;

  distanceTo(target: Ivec2): number;

  squaredDistanceTo(target: Ivec2): number;

  copy(dest?: vec2): Ivec2;

  toString(): string;

  isFinite(): boolean;

  rotateRight(dest?: vec2): Ivec2;

  rotateLeft(dest?: vec2): Ivec2;
}

export class vec2 implements Ivec2 {

  x: number = 0;
  y: number = 0;

  constructor(x?: number | vec2, y?: number) {
    if (x instanceof vec2) {
      this.x = x.x;
      this.y = x.y;
    } else if (x) {
      this.x = x;
      if (y) {
        this.y = y;
      } else {
        this.y = x;
      }
    }
  }

  xy(): [number, number] {
    return [
      this.x,
      this.y
    ];
  }

  set_xy(x: number, y: number): vec2 {
    this.x = x;
    this.y = y;
    return this;
  }


  static readonly zero = new vec2(0, 0);
  static readonly one = new vec2(1, 1);
  static readonly up = new vec2(0, 1);
  static readonly down = new vec2(0, -1);
  static readonly left = new vec2(-1, 0);
  static readonly right = new vec2(1, 0);

  static readonly rand = (min: number, max: number) => (new vec2()).random(min, max);

  reset(): vec2 {
    this.x = 0;
    this.y = 0;
    return this;
  }

  copy(dest?: vec2): vec2 {
    if (!dest) {
      dest = new vec2();
    }

    dest.x = this.x;
    dest.y = this.y;

    return dest;
  }

  negate(dest?: vec2): vec2 {
    if (!dest) {
      dest = this;
    }

    dest.x = -this.x;
    dest.y = -this.y;

    return dest;
  }

  random(min: number = 0, max: number = 1, dest?: vec2): vec2 {
    if (!dest) {
      dest = this;
    }
    const r = Math.random() * Math.PI * 2;
    const range = max - min;
    dest.x = Math.cos(r) * range + min;
    dest.y = Math.sin(r) * range + min;
    return dest;
  }

  equals(vector: Ivec2, threshold: number = epsilon): boolean {
    if (Math.abs(this.x - vector.x) > threshold) {
      return false;
    }

    return Math.abs(this.y - vector.y) <= threshold;
  }

  length(): number {
    return Math.sqrt(this.squaredLength());
  }

  squaredLength(): number {
    const x = this.x;
    const y = this.y;

    return (x * x + y * y);
  }

  toAngle(): number {
    return Math.atan2(this.y, this.x);
  }

  clamp(maxLen: number, dest?: vec2): vec2 {
    if (!dest) {
      dest = this;
    }
    const maxLen2 = maxLen * maxLen;
    const l = dest.squaredLength();
    if (l > maxLen2) {
      dest.scale(1 / Math.sqrt(l) * maxLen);
    }
    return dest;
  }

  add(vector: Ivec2, dest?: vec2): vec2 {
    if (!dest) {
      dest = this;
    }
    dest.x = this.x + vector.x;
    dest.y = this.y + vector.y;

    return dest;
  }

  subtract(vector: Ivec2, dest?: vec2): vec2 {
    if (!dest) {
      dest = this;
    }
    dest.x = this.x - vector.x;
    dest.y = this.y - vector.y;

    return dest;
  }

  multiply(vector: Ivec2, dest?: vec2): vec2 {
    if (!dest) {
      dest = this;
    }
    dest.x = this.x * vector.x;
    dest.y = this.y * vector.y;

    return dest;
  }

  divide(vector: Ivec2, dest?: vec2): vec2 {
    if (!dest) {
      dest = this;
    }
    dest.x = this.x / vector.x;
    dest.y = this.y / vector.y;

    return dest;
  }

  scale(value: number, dest?: vec2): vec2 {
    if (!dest) {
      dest = this;
    }

    dest.x = this.x * value;
    dest.y = this.y * value;

    return dest;
  }

  normalize(dest?: vec2): vec2 {
    if (!dest) {
      dest = this;
    }

    let length = this.length();

    if (length === 1) {
      return this;
    }

    if (length === 0) {
      dest.x = 0;
      dest.y = 0;

      return dest;
    }

    length = 1.0 / length;

    dest.x *= length;
    dest.y *= length;

    return dest;
  }

  distanceTo(target: vec2): number {
    return vec2.distance(this, target);
  }

  squaredDistanceTo(target: vec2): number {
    return vec2.squaredDistance(this, target);
  }

  directionTo(vector: vec2, dest?: vec2): vec2 {
    return vec2.direction(this, vector, dest);
  }

  rotateRight(dest?: vec2): vec2 {
    if (!dest) {
      dest = this;
    }
    const y = this.y;
    dest.y = -this.x;
    dest.x = y;
    return dest;
  }

  rotateLeft(dest?: vec2): vec2 {
    if (!dest) {
      dest = this;
    }
    const y = this.y;
    dest.y = this.x;
    dest.x = -y;
    return dest;
  }

  isFinite(): boolean {
    return isFinite(this.x) && isFinite(this.y);
  }

  toString(): string {
    return `{x:${this.x}, y: ${this.y}}`;
  }

  static cross(vector: Ivec2, vector2: Ivec2): number {
    return vector.x * vector2.y - vector.y * vector2.x;
  }

  static dot(vector: Ivec2, vector2: Ivec2): number {
    return (vector.x * vector2.x + vector.y * vector2.y);
  }

  static distance(vector: vec2, vector2: vec2): number {
    return Math.sqrt(this.squaredDistance(vector, vector2));
  }

  static squaredDistance(vector: Ivec2, vector2: Ivec2): number {
    const x = vector2.x - vector.x;
    const y = vector2.y - vector.y;

    return (x * x + y * y);
  }

  static direction(vector: Ivec2, vector2: Ivec2, dest?: vec2): vec2 {
    if (!dest) {
      dest = new vec2();
    }

    const x = vector.x - vector2.x;
    const y = vector.y - vector2.y;

    let length = Math.sqrt(x * x + y * y);

    if (length === 0) {
      dest.x = 0;
      dest.y = 0;

      return dest;
    }

    length = 1 / length;

    dest.x = x * length;
    dest.y = y * length;

    return dest;
  }

  static mix(vector: Ivec2, vector2: Ivec2, time: number, dest?: vec2): vec2 {
    if (!dest) {
      dest = new vec2();
    }

    const x = vector.x;
    const y = vector.y;

    const x2 = vector2.x;
    const y2 = vector2.y;

    dest.x = x + time * (x2 - x);
    dest.y = y + time * (y2 - y);

    return dest;
  }

  static sum(vector: Ivec2, vector2: Ivec2, dest?: vec2): vec2 {
    if (!dest) {
      dest = new vec2();
    }

    dest.x = vector.x + vector2.x;
    dest.y = vector.y + vector2.y;

    return dest;
  }

  static difference(vector: Ivec2, vector2: Ivec2, dest?: vec2): vec2 {
    if (!dest) {
      dest = new vec2();
    }

    dest.x = vector.x - vector2.x;
    dest.y = vector.y - vector2.y;

    return dest;
  }

  static product(vector: Ivec2, vector2: Ivec2, dest?: vec2): vec2 {
    if (!dest) {
      dest = new vec2();
    }

    dest.x = vector.x * vector2.x;
    dest.y = vector.y * vector2.y;

    return dest;
  }

  static quotient(vector: Ivec2, vector2: Ivec2, dest?: vec2): vec2 {
    if (!dest) {
      dest = new vec2();
    }

    dest.x = vector.x / vector2.x;
    dest.y = vector.y / vector2.y;

    return dest;
  }

  static angle2Vec(rad: number): vec2 {
    if (!isFinite(rad)) {
      rad = 0;
    }
    return new vec2(Math.cos(rad), Math.sin(rad));
  }

}
