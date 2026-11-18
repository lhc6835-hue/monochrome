export const TAU = Math.PI * 2;
export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp((v - a) / (b - a));
export const remap = (v: number, a: number, b: number, c: number, d: number) => lerp(c, d, invLerp(a, b, v));
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
export const sign = (v: number) => (v < 0 ? -1 : 1);

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutQuart: (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outSine: (t: number) => Math.sin((t * Math.PI) / 2),
  inSine: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  outExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  inOutExpo: (t: number) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outBack: (t: number, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  inBack: (t: number, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
  outElastic: (t: number) =>
    t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
};
export type EaseFn = (t: number) => number;

/** 프레임레이트 독립적인 지수 감쇠 보간 */
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));

/**
 * 임계 감쇠 스프링으로 따라가기 (속도까지 이어져서 출발·정지가 툭 끊기지 않는다).
 * v 는 [속도] 한 칸짜리 배열로 넘겨 프레임마다 유지한다. smooth = 대략 도달 시간(초).
 */
export function smoothDamp(cur: number, target: number, v: [number], smooth: number, dt: number, maxSpeed = Infinity) {
  smooth = Math.max(0.0001, smooth);
  const om = 2 / smooth;
  const x = om * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let ch = cur - target;
  const maxCh = maxSpeed * smooth;
  ch = Math.max(-maxCh, Math.min(maxCh, ch));
  const t = cur - ch;
  const tmp = (v[0] + om * ch) * dt;
  v[0] = (v[0] - om * tmp) * e;
  let out = t + (ch + tmp) * e;
  if (target - cur > 0 === out > target) {
    out = target;
    v[0] = (out - target) / dt;
  }
  return out;
}

/** 감쇠 스프링 (overshoot 가능) */
export class Spring {
  vel = 0;
  constructor(public value = 0, public target = 0, public stiffness = 120, public damping = 14) {}
  update(dt: number) {
    const f = (this.target - this.value) * this.stiffness - this.vel * this.damping;
    this.vel += f * dt;
    this.value += this.vel * dt;
    return this.value;
  }
  snap(v: number) {
    this.value = this.target = v;
    this.vel = 0;
  }
}

/** 결정적 의사난수 */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash1(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/** 1D value noise, 결과 -1..1 */
export function noise1(x: number) {
  const i = Math.floor(x);
  const f = x - i;
  const u = smooth(f);
  return lerp(hash1(i), hash1(i + 1), u) * 2 - 1;
}

export function fbm1(x: number, oct = 3) {
  let v = 0,
    a = 0.5,
    f = 1;
  for (let i = 0; i < oct; i++) {
    v += a * noise1(x * f + i * 17.3);
    f *= 2;
    a *= 0.5;
  }
  return v;
}

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const pick = <T>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const pointIn = (px: number, py: number, r: Rect) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

/** 선분-사각형 교차 (Liang–Barsky) */
export function segHitsRect(x0: number, y0: number, x1: number, y1: number, r: Rect) {
  let t0 = 0,
    t1 = 1;
  const dx = x1 - x0,
    dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - r.x, r.x + r.w - x0, y0 - r.y, r.y + r.h - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

/** 각도 차이 정규화 */
export const angDiff = (a: number, b: number) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
