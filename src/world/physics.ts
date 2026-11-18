import type { Rect } from '../core/math';

export interface Solid extends Rect {
  oneway?: boolean;
  /** 아이(작은 주민)가 기어서 통과할 수 있음 */
  kidPass?: boolean;
  /** 이 고체를 소유한 엔티티 (상자 등) */
  owner?: unknown;
  look?: string;
}

/** 발 중심 (x, y=바닥) 기준 AABB 몸체 */
export class Body {
  vx = 0;
  vy = 0;
  onGround = false;
  groundSolid: Solid | null = null;
  hitL = false;
  hitR = false;
  hitTop = false;
  constructor(
    public x: number,
    public y: number,
    public w: number,
    public h: number,
  ) {}
  get left() {
    return this.x - this.w / 2;
  }
  get right() {
    return this.x + this.w / 2;
  }
  get top() {
    return this.y - this.h;
  }
  rect(): Rect {
    return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
  }
}

const EPS = 0.001;
const STEP = 5;

/**
 * 축 분리 이동. solids 는 매 호출마다 넘긴다.
 * opts.kid = true 면 kidPass 고체를 무시.
 */
export function moveBody(b: Body, dx: number, dy: number, solids: Solid[], opts: { kid?: boolean; ignore?: unknown } = {}) {
  b.hitL = b.hitR = b.hitTop = false;
  // X
  if (dx !== 0) {
    let nx = b.x + dx;
    const top = b.y - b.h + EPS,
      bot = b.y - EPS;
    for (const s of solids) {
      if (s.oneway || (opts.kid && s.kidPass) || (opts.ignore !== undefined && s.owner === opts.ignore) || (s.owner && s.owner === b)) continue;
      // 발밑 STEP 픽셀 이내의 윗면은 벽이 아니라 딛고 선 바닥으로 본다 (출렁이는 발판 대응)
      if (bot <= s.y + STEP || top >= s.y + s.h) continue;
      const l = nx - b.w / 2,
        r = nx + b.w / 2;
      if (r <= s.x || l >= s.x + s.w) continue;
      if (dx > 0) {
        nx = s.x - b.w / 2;
        b.hitR = true;
      } else {
        nx = s.x + s.w + b.w / 2;
        b.hitL = true;
      }
    }
    b.x = nx;
  }
  // Y
  const wasBottom = b.y;
  b.onGround = false;
  b.groundSolid = null;
  if (dy !== 0 || true) {
    let ny = b.y + dy;
    const l = b.x - b.w / 2 + EPS,
      r = b.x + b.w / 2 - EPS;
    for (const s of solids) {
      if ((opts.kid && s.kidPass) || (opts.ignore !== undefined && s.owner === opts.ignore) || (s.owner && s.owner === b)) continue;
      if (r <= s.x || l >= s.x + s.w) continue;
      if (dy >= 0) {
        // 아래로: 위면에 착지
        if (wasBottom <= s.y + STEP && ny >= s.y) {
          ny = s.y;
          b.onGround = true;
          b.groundSolid = s;
        }
      } else if (!s.oneway) {
        const t = ny - b.h;
        if (t < s.y + s.h && wasBottom - b.h >= s.y + s.h - EPS) {
          ny = s.y + s.h + b.h;
          b.hitTop = true;
        }
      }
    }
    b.y = ny;
  }
  return b;
}

/** 해당 영역이 비어 있는지 */
export function areaFree(r: Rect, solids: Solid[], ignore?: unknown) {
  for (const s of solids) {
    if (s.oneway || (ignore !== undefined && s.owner === ignore)) continue;
    if (r.x < s.x + s.w && r.x + r.w > s.x && r.y < s.y + s.h && r.y + r.h > s.y) return false;
  }
  return true;
}
