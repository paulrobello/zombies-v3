import { epsilon } from './constants';
import { mat3 } from './mat3';
import { quat } from './quat';

export interface Ivec3 {
  x: number;
  y: number;
  z: number;

  get_xy(): [number, number];

  get_xyz(): [number, number, number];

  set_xy(x: number, y: number): void;

  set_xyz(x: number, y: number, z: number): void;

  reset(): void;

  equals(vector: vec3, threshold): boolean;

  length(): number;

  squaredLength(): number;

  add(vector: vec3): Ivec3;

  subtract(vector: vec3): Ivec3;

  multiply(vector: vec3): Ivec3;

  divide(vector: vec3): Ivec3;

  distanceTo(v: vec3): number;

  squaredDistanceTo(v: vec3): number;
}

export class vec3 implements Ivec3 {

  x: number = 0;
  y: number = 0;
  z: number = 0;

  get_xy(): [number, number] {
    return [
      this.x,
      this.y
    ];
  }

  get_xyz(): [number, number, number] {
    return [
      this.x,
      this.y,
      this.z
    ];
  }

  set_xy(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  set_xyz(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  constructor(x?: number | vec3, y?: number, z?: number) {
    if (x instanceof vec3) {
      this.x = x.x;
      this.y = x.y;
      this.z = x.z;
    } else if (x) {
      this.x = x;
      if (y) {
        this.y = y;
      } else {
        this.y = x;
      }
      if (z) {
        this.z = z;
      } else {
        this.z = x;
      }
    }
  }


  static readonly zero = new vec3(0, 0, 0);
  static readonly one = new vec3(1, 1, 1);

  static readonly up = new vec3(0, 1, 0);
  static readonly down = new vec3(0, -1, 0);

  static readonly right = new vec3(1, 0, 0);
  static readonly left = new vec3(-1, 0, 0);

  static readonly forward = new vec3(0, 0, 1);
  static readonly backward = new vec3(0, 0, -1);

  reset(): void {
    this.x = 0;
    this.y = 0;
    this.z = 0;
  }

  copy(dest?: vec3): Ivec3 {
    if (!dest) {
      dest = new vec3();
    }

    dest.x = this.x;
    dest.y = this.y;
    dest.z = this.z;

    return dest;
  }

  negate(dest?: vec3): Ivec3 {
    if (!dest) {
      dest = this;
    }

    dest.x = -this.x;
    dest.y = -this.y;
    dest.z = -this.z;

    return dest;
  }

  equals(vector: Ivec3, threshold = epsilon): boolean {
    if (Math.abs(this.x - vector.x) > threshold) {
      return false;
    }

    if (Math.abs(this.y - vector.y) > threshold) {
      return false;
    }

    if (Math.abs(this.z - vector.z) > threshold) {
      return false;
    }

    return true;
  }

  length(): number {
    return Math.sqrt(this.squaredLength());
  }

  squaredLength(): number {
    const x = this.x;
    const y = this.y;
    const z = this.z;

    return (x * x + y * y + z * z);
  }

  add(vector: Ivec3): Ivec3 {
    this.x += vector.x;
    this.y += vector.y;
    this.z += vector.z;

    return this;
  }

  subtract(vector: Ivec3): Ivec3 {
    this.x -= vector.x;
    this.y -= vector.y;
    this.z -= vector.z;

    return this;
  }

  multiply(vector: Ivec3): Ivec3 {
    this.x *= vector.x;
    this.y *= vector.y;
    this.z *= vector.z;

    return this;
  }

  divide(vector: Ivec3): Ivec3 {
    this.x /= vector.x;
    this.y /= vector.y;
    this.z /= vector.z;

    return this;
  }

  scale(value: number, dest?: vec3): Ivec3 {
    if (!dest) {
      dest = this;
    }

    dest.x *= value;
    dest.y *= value;
    dest.z *= value;

    return dest;
  }

  normalize(dest?: vec3): Ivec3 {
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
      dest.z = 0;

      return dest;
    }

    length = 1.0 / length;

    dest.x *= length;
    dest.y *= length;
    dest.z *= length;

    return dest;
  }

  distanceTo(v: vec3): number {
    return vec3.distance(this, v);
  }

  squaredDistanceTo(v: vec3): number {
    return vec3.squaredDistance(this, v);
  }

  multiplyByMat3(matrix: mat3, dest?: vec3): Ivec3 {
    if (!dest) {
      dest = this;
    }

    return matrix.multiplyVec3(this, dest);
  }

  multiplyByQuat(quaternion: quat, dest?: vec3): Ivec3 {
    if (!dest) {
      dest = this;
    }

    return quaternion.multiplyVec3(this, dest);
  }

  toQuat(dest?: quat): quat {
    if (!dest) {
      dest = new quat();
    }

    const c = new vec3();
    const s = new vec3();

    c.x = Math.cos(this.x * 0.5);
    s.x = Math.sin(this.x * 0.5);

    c.y = Math.cos(this.y * 0.5);
    s.y = Math.sin(this.y * 0.5);

    c.z = Math.cos(this.z * 0.5);
    s.z = Math.sin(this.z * 0.5);

    dest.x = s.x * c.y * c.z - c.x * s.y * s.z;
    dest.y = c.x * s.y * c.z + s.x * c.y * s.z;
    dest.z = c.x * c.y * s.z - s.x * s.y * c.z;
    dest.w = c.x * c.y * c.z + s.x * s.y * s.z;

    return dest;
  }

  static cross(vector: Ivec3, vector2: Ivec3, dest?: vec3): vec3 {
    if (!dest) {
      dest = new vec3();
    }

    const x = vector.x;
    const y = vector.y;
    const z = vector.z;

    const x2 = vector2.x;
    const y2 = vector2.y;
    const z2 = vector2.z;

    dest.x = y * z2 - z * y2;
    dest.y = z * x2 - x * z2;
    dest.z = x * y2 - y * x2;

    return dest;
  }

  static dot(vector: Ivec3, vector2: Ivec3): number {
    const x = vector.x;
    const y = vector.y;
    const z = vector.z;

    const x2 = vector2.x;
    const y2 = vector2.y;
    const z2 = vector2.z;

    return (x * x2 + y * y2 + z * z2);
  }

  static distance(vector: vec3, vector2: vec3): number {
    const x = vector2.x - vector.x;
    const y = vector2.y - vector.y;
    const z = vector2.z - vector.z;

    return Math.sqrt(this.squaredDistance(vector, vector2));
  }

  static squaredDistance(vector: Ivec3, vector2: Ivec3): number {
    const x = vector2.x - vector.x;
    const y = vector2.y - vector.y;
    const z = vector2.z - vector.z;

    return (x * x + y * y + z * z);
  }

  static direction(vector: Ivec3, vector2: Ivec3, dest?: vec3): Ivec3 {
    if (!dest) {
      dest = new vec3();
    }

    const x = vector.x - vector2.x;
    const y = vector.y - vector2.y;
    const z = vector.z - vector2.z;

    let length = Math.sqrt(x * x + y * y + z * z);

    if (length === 0) {
      dest.x = 0;
      dest.y = 0;
      dest.z = 0;

      return dest;
    }

    length = 1 / length;

    dest.x = x * length;
    dest.y = y * length;
    dest.z = z * length;

    return dest;
  }

  static mix(vector: Ivec3, vector2: Ivec3, time: number, dest?: vec3): Ivec3 {
    if (!dest) {
      dest = new vec3();
    }

    dest.x = vector.x + time * (vector2.x - vector.x);
    dest.y = vector.y + time * (vector2.y - vector.y);
    dest.z = vector.z + time * (vector2.z - vector.z);

    return dest;
  }

  static sum(vector: Ivec3, vector2: Ivec3, dest?: vec3): Ivec3 {
    if (!dest) {
      dest = new vec3();
    }

    dest.x = vector.x + vector2.x;
    dest.y = vector.y + vector2.y;
    dest.z = vector.z + vector2.z;

    return dest;
  }

  static difference(vector: Ivec3, vector2: Ivec3, dest?: vec3): vec3 {
    if (!dest) {
      dest = new vec3();
    }

    dest.x = vector.x - vector2.x;
    dest.y = vector.y - vector2.y;
    dest.z = vector.z - vector2.z;

    return dest;
  }

  static product(vector: Ivec3, vector2: Ivec3, dest?: vec3): Ivec3 {
    if (!dest) {
      dest = new vec3();
    }

    dest.x = vector.x * vector2.x;
    dest.y = vector.y * vector2.y;
    dest.z = vector.z * vector2.z;

    return dest;
  }

  static quotient(vector: Ivec3, vector2: Ivec3, dest?: vec3): Ivec3 {
    if (!dest) {
      dest = new vec3();
    }

    dest.x = vector.x / vector2.x;
    dest.y = vector.y / vector2.y;
    dest.z = vector.z / vector2.z;

    return dest;
  }

  static angle2Vec(rad: number, z: number = 0): vec3 {
    if (!isFinite(rad)) {
      rad = 0;
    }
    return new vec3(Math.cos(rad), Math.sin(rad), z);
  }

}
