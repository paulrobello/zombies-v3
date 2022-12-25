import { epsilon } from './constants';
import mat3 from './mat3';
import mat4 from './mat4';
import vec3, { Ivec3 } from './vec3';

export default class quat {

  public x: number = 0;
  public y: number = 0;
  public z: number = 0;
  public w: number = 0;

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

  get_xyzw(): [number, number, number, number] {
    return [
      this.x,
      this.y,
      this.z,
      this.w
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

  set_xyzw(x: number, y: number, z: number, w: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  constructor(x?: number, y?: number, z?: number, w?: number) {
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
    this.w = w || 0;
  }

  static readonly identity = new quat().setIdentity();

  reset(): void {
    const x = 0;
    const y = 0;
    const z = 0;
    const w = 0;
  }

  copy(dest?: quat): quat {
    if (!dest) {
      dest = new quat();
    }

    dest.x = this.x;
    dest.y = this.y;
    dest.z = this.z;
    dest.w = this.w;

    return dest;
  }

  roll(): number {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const w = this.w;

    return Math.atan2(2.0 * (x * y + w * z), w * w + x * x - y * y - z * z);
  }

  pitch(): number {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const w = this.w;

    return Math.atan2(2.0 * (y * z + w * x), w * w - x * x - y * y + z * z);
  }

  yaw(): number {
    return Math.asin(2.0 * (this.x * this.z - this.w * this.y));
  }

  equals(vector: quat, threshold = epsilon): boolean {
    if (Math.abs(this.x - vector.x) > threshold) {
      return false;
    }
    if (Math.abs(this.y - vector.y) > threshold) {
      return false;
    }
    if (Math.abs(this.z - vector.z) > threshold) {
      return false;
    }
    if (Math.abs(this.w - vector.w) > threshold) {
      return false;
    }
    return true;
  }

  setIdentity(): quat {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.w = 1;

    return this;
  }

  calculateW(): quat {
    const x = this.x;
    const y = this.y;
    const z = this.z;

    this.w = -(Math.sqrt(Math.abs(1.0 - x * x - y * y - z * z)));

    return this;
  }

  inverse(): quat {
    const dot = quat.dot(this, this);

    if (!dot) {
      this.reset();
      return this;
    }

    const invDot = dot ? 1.0 / dot : 0;

    this.x *= -invDot;
    this.y *= -invDot;
    this.z *= -invDot;
    this.w *= invDot;

    return this;
  }

  conjugate(): quat {
    this.x *= -1;
    this.y *= -1;
    this.z *= -1;

    return this;
  }

  length(): number {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const w = this.w;

    return Math.sqrt(x * x + y * y + z * z + w * w);
  }

  normalize(dest?: quat): quat {
    if (!dest) {
      dest = this;
    }

    const x = this.x;
    const y = this.y;
    const z = this.z;
    const w = this.w;

    let length = Math.sqrt(x * x + y * y + z * z + w * w);

    if (!length) {
      dest.x = 0;
      dest.y = 0;
      dest.z = 0;
      dest.w = 0;

      return dest;
    }

    length = 1 / length;

    dest.x = x * length;
    dest.y = y * length;
    dest.z = z * length;
    dest.w = w * length;

    return dest;
  }

  add(other: quat): quat {
    this.x += other.x;
    this.y += other.y;
    this.z += other.z;
    this.w += other.w;
    return this;
  }

  multiply(other: quat): quat {
    const q1x = this.x;
    const q1y = this.y;
    const q1z = this.z;
    const q1w = this.w;

    const q2x = other.x;
    const q2y = other.y;
    const q2z = other.z;
    const q2w = other.w;

    this.x = q1x * q2w + q1w * q2x + q1y * q2z - q1z * q2y;
    this.y = q1y * q2w + q1w * q2y + q1z * q2x - q1x * q2z;
    this.z = q1z * q2w + q1w * q2z + q1x * q2y - q1y * q2x;
    this.w = q1w * q2w - q1x * q2x - q1y * q2y - q1z * q2z;

    return this;
  }

  multiplyVec3(vector: Ivec3, dest?: vec3): Ivec3 {
    if (!dest) {
      dest = new vec3();
    }

    const x = vector.x;
    const y = vector.y;
    const z = vector.z;

    const qx = this.x;
    const qy = this.y;
    const qz = this.z;
    const qw = this.w;

    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;

    dest.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    dest.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    dest.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;

    return dest;
  }

  toMat3(dest?: mat3): mat3 {
    if (!dest) {
      dest = new mat3();
    }

    const x = this.x;
    const y = this.y;
    const z = this.z;
    const w = this.w;

    const x2 = x + x;
    const y2 = y + y;
    const z2 = z + z;

    const xx = x * x2;
    const xy = x * y2;
    const xz = x * z2;
    const yy = y * y2;
    const yz = y * z2;
    const zz = z * z2;
    const wx = w * x2;
    const wy = w * y2;
    const wz = w * z2;

    dest.init([
      1 - (yy + zz),
      xy + wz,
      xz - wy,

      xy - wz,
      1 - (xx + zz),
      yz + wx,

      xz + wy,
      yz - wx,
      1 - (xx + yy)
    ]);

    return dest;
  }

  toMat4(dest?: mat4): mat4 {
    if (!dest) {
      dest = new mat4();
    }

    const x = this.x;
    const y = this.y;
    const z = this.z;
    const w = this.w;

    const x2 = x + x;
    const y2 = y + y;
    const z2 = z + z;

    const xx = x * x2;
    const xy = x * y2;
    const xz = x * z2;
    const yy = y * y2;
    const yz = y * z2;
    const zz = z * z2;
    const wx = w * x2;
    const wy = w * y2;
    const wz = w * z2;

    dest.init([
      1 - (yy + zz),
      xy + wz,
      xz - wy,
      0,

      xy - wz,
      1 - (xx + zz),
      yz + wx,
      0,

      xz + wy,
      yz - wx,
      1 - (xx + yy),
      0,

      0,
      0,
      0,
      1
    ]);

    return dest;
  }

  static dot(q1: quat, q2: quat): number {
    return q1.x * q2.x + q1.y * q2.y + q1.z * q2.z + q1.w * q2.w;
  }

  static sum(q1: quat, q2: quat, dest?: quat): quat {
    if (!dest) {
      dest = new quat();
    }

    dest.x = q1.x + q2.x;
    dest.y = q1.y + q2.y;
    dest.z = q1.z + q2.z;
    dest.w = q1.w + q2.w;

    return dest;
  }

  static product(q1: quat, q2: quat, dest?: quat): quat {
    if (!dest) {
      dest = new quat();
    }

    const q1x = q1.x;
    const q1y = q1.y;
    const q1z = q1.z;
    const q1w = q1.w;

    const q2x = q2.x;
    const q2y = q2.y;
    const q2z = q2.z;
    const q2w = q2.w;

    dest.x = q1x * q2w + q1w * q2x + q1y * q2z - q1z * q2y;
    dest.y = q1y * q2w + q1w * q2y + q1z * q2x - q1x * q2z;
    dest.z = q1z * q2w + q1w * q2z + q1x * q2y - q1y * q2x;
    dest.w = q1w * q2w - q1x * q2x - q1y * q2y - q1z * q2z;

    return dest;
  }

  static cross(q1: quat, q2: quat, dest?: quat): quat {
    if (!dest) {
      dest = new quat();
    }

    const q1x = q1.x;
    const q1y = q1.y;
    const q1z = q1.z;
    const q1w = q1.w;

    const q2x = q2.x;
    const q2y = q2.y;
    const q2z = q2.z;
    const q2w = q2.w;

    dest.x = q1w * q2z + q1z * q2w + q1x * q2y - q1y * q2x;
    dest.y = q1w * q2w - q1x * q2x - q1y * q2y - q1z * q2z;
    dest.z = q1w * q2x + q1x * q2w + q1y * q2z - q1z * q2y;
    dest.w = q1w * q2y + q1y * q2w + q1z * q2x - q1x * q2z;

    return dest;
  }

  static shortMix(q1: quat, q2: quat, time: number, dest?: quat): quat {
    if (!dest) {
      dest = new quat();
    }

    if (time <= 0.0) {
      return q1.copy(dest);
    } else if (time >= 1.0) {
      return q2.copy(dest);
    }

    let cos = quat.dot(q1, q2);
    const q2a = q2.copy();

    if (cos < 0.0) {
      q2a.inverse();
      cos = -cos;
    }

    let k0: number;
    let k1: number;

    if (cos > 0.9999) {
      k0 = 1 - time;
      k1 = time;
    } else {
      const sin: number = Math.sqrt(1 - cos * cos);
      const angle: number = Math.atan2(sin, cos);

      const oneOverSin: number = 1 / sin;

      k0 = Math.sin((1 - time) * angle) * oneOverSin;
      k1 = Math.sin((time) * angle) * oneOverSin;
    }

    dest.x = k0 * q1.x + k1 * q2a.x;
    dest.y = k0 * q1.y + k1 * q2a.y;
    dest.z = k0 * q1.z + k1 * q2a.z;
    dest.w = k0 * q1.w + k1 * q2a.w;

    return dest;
  }

  static mix(q1: quat, q2: quat, time: number, dest?: quat): quat {
    if (!dest) {
      dest = new quat();
    }

    const cosHalfTheta = q1.x * q2.x + q1.y * q2.y + q1.z * q2.z + q1.w * q2.w;

    if (Math.abs(cosHalfTheta) >= 1.0) {
      q1.copy(dest);
      return dest;
    }

    const halfTheta = Math.acos(cosHalfTheta);
    const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);

    if (Math.abs(sinHalfTheta) < 0.001) {
      dest.x = q1.x * 0.5 + q2.x * 0.5;
      dest.y = q1.y * 0.5 + q2.y * 0.5;
      dest.z = q1.z * 0.5 + q2.z * 0.5;
      dest.w = q1.w * 0.5 + q2.w * 0.5;

      return dest;
    }

    const ratioA = Math.sin((1 - time) * halfTheta) / sinHalfTheta;
    const ratioB = Math.sin(time * halfTheta) / sinHalfTheta;

    dest.x = q1.x * ratioA + q2.x * ratioB;
    dest.y = q1.y * ratioA + q2.y * ratioB;
    dest.z = q1.z * ratioA + q2.z * ratioB;
    dest.w = q1.w * ratioA + q2.w * ratioB;

    return dest;
  }

  static fromAxisAngle(axis: Ivec3, angle: number, dest?: quat): quat {
    if (!dest) {
      dest = new quat();
    }

    angle *= 0.5;
    const sin = Math.sin(angle);

    dest.x = axis.x * sin;
    dest.y = axis.y * sin;
    dest.z = axis.z * sin;
    dest.w = Math.cos(angle);

    return dest;
  }

}
