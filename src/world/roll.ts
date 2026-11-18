/**
 * 앞구르기 (루트 모션)
 *
 * 참고:
 *  - 체조 앞구르기: 쪼그려 손을 발 앞에 짚기 → 턱을 가슴으로(목 보호) → 어깨부터 닿기 →
 *    몸을 공처럼 말아 등으로 구르기 → 다리를 몸에 붙여 회전을 빠르게 → 발을 엉덩이 쪽으로 접어 디디기.
 *  - 파쿠르 롤: 손·팔이 먼저 충격을 받고 어깨 → 반대쪽 엉덩이로 사선 → 발을 접어 넣고 반동으로 일어나기.
 *  - 애니메이션 피드백(접촉 포즈): 짚은 손/발은 미끄러지면 안 되고, 골반이 접촉점보다 앞서 나가면 안 되며,
 *    일어설 때는 상체를 숙인 채 올라와야 뒤로 넘어질 것 같지 않다.
 *
 * 그래서 몸의 이동을 '동작'이 정한다 (루트 모션):
 *  밀어내기 = 뒷발 고정 / 손 짚기 = 두 손 고정 / 등 = 미끄러짐 없이 굴러감 / 디딤 = 발 고정.
 * 매 프레임 몸에서 가장 낮은 점을 바닥에 붙인다.
 */
import { drawFigure, defaultStyle, type Pose } from '../gfx/figure';

export const ROLL_T = 0.8;

interface RollKey {
  u: number;
  /** 상체의 실제 기울기 (도). 0 = 똑바로, 90 = 엎드림, 180 = 거꾸로, 270 = 등을 대고 누움, 360 = 다시 똑바로 */
  pitch: number;
  crouch: number;
  /** 턱 당김 (상체 기준, 라디안) */
  head: number;
  /**
   * 팔다리는 '세계 기준 방향'(도)으로 적는다: 0 = 아래, 90 = 앞, 180 = 위, -90 = 뒤.
   * [위팔/허벅지, 아래팔/정강이]. 몸이 뒤집혀도 손발이 땅의 어디를 짚는지 바로 읽힌다.
   */
  armN: [number, number];
  armF: [number, number];
  legN: [number, number];
  legF: [number, number];
}

// 오른쪽을 향한다고 가정
export const ROLL_KEYS: RollKey[] = [
  // 1. 달려오던 마지막 걸음
  { u: 0.0, pitch: 15, crouch: 0.04, head: 0.1, armN: [-25, 15], armF: [30, 85], legN: [35, -5], legF: [-25, -70] },
  // 2. 디딤발을 박고 깊게 웅크리며 두 팔을 앞 바닥으로 뻗는다
  { u: 0.12, pitch: 48, crouch: 0.2, head: 0.45, armN: [62, 48], armF: [55, 42], legN: [72, -12], legF: [30, -38] },
  // 3. 두 손으로 바닥을 짚는다. 뒷다리가 땅을 차며 쭉 펴지고, 머리는 두 팔 사이로 숙인다
  { u: 0.26, pitch: 100, crouch: 0.12, head: 1.25, armN: [12, 4], armF: [18, 8], legN: [38, -62], legF: [-42, -46] },
  // 4. 팔꿈치를 굽혀 받으며 뒤통수 대신 어깨가 닿는다. 엉덩이가 어깨 위로 넘어가고 발이 땅을 떠난다
  { u: 0.37, pitch: 150, crouch: 0.16, head: 1.9, armN: [100, 82], armF: [95, 76], legN: [-40, 20], legF: [-62, -8] },
  // 5. 등으로 구른다: 무릎을 가슴에 붙여 공처럼 말린다 (가장 빠른 회전)
  { u: 0.47, pitch: 215, crouch: 0.22, head: 2.0, armN: [140, 175], armF: [132, 168], legN: [-80, 125], legF: [-70, 135] },
  // 6. 엉덩이로 넘어오며 무릎은 위, 발뒤꿈치는 엉덩이 쪽으로 — 팔은 무릎 쪽으로 뻗는다
  { u: 0.58, pitch: 292, crouch: 0.24, head: 1.5, armN: [95, 120], armF: [85, 115], legN: [150, -15], legF: [140, -25] },
  // 7. 발이 엉덩이 바로 밑에 닿는다. 상체는 이미 앞으로 숙이고 팔을 앞으로 뻗어 무게를 앞으로
  { u: 0.7, pitch: 388, crouch: 0.26, head: 0.5, armN: [80, 95], armF: [70, 88], legN: [80, -25], legF: [70, -32] },
  // 8. 숙인 채 밀고 일어나며 첫 걸음
  { u: 0.85, pitch: 398, crouch: 0.12, head: 0.25, armN: [45, 80], armF: [-5, 40], legN: [55, -10], legF: [5, -40] },
  // 9. 다시 달린다
  { u: 1.0, pitch: 375, crouch: 0.04, head: 0.1, armN: [-25, 15], armF: [30, 85], legN: [35, -5], legF: [-25, -70] },
];

// 관절이 한 바퀴 헛돌지 않도록: 상체 기준 각이 이전 키와 가장 가까운 쪽으로 세계 각을 맞춘다
(() => {
  const ch: ((k: RollKey) => [number, number])[] = [(k) => k.armN, (k) => k.armF, (k) => k.legN, (k) => k.legF];
  for (const f of ch)
    for (let j = 0; j < 2; j++)
      for (let i = 1; i < ROLL_KEYS.length; i++) {
        const prev = f(ROLL_KEYS[i - 1])[j] + ROLL_KEYS[i - 1].pitch;
        const v = f(ROLL_KEYS[i]);
        while (v[j] + ROLL_KEYS[i].pitch - prev > 180) v[j] -= 360;
        while (v[j] + ROLL_KEYS[i].pitch - prev < -180) v[j] += 360;
      }
})();

/** 어느 점이 땅에 고정되는가 */
type Anchor = 'free' | 'farFoot' | 'hands' | 'roll' | 'feet';
const PHASES: { u0: number; u1: number; a: Anchor }[] = [
  { u0: 0, u1: 0.1, a: 'free' },
  { u0: 0.1, u1: 0.25, a: 'farFoot' },
  { u0: 0.25, u1: 0.34, a: 'hands' },
  { u0: 0.34, u1: 0.68, a: 'roll' },
  { u0: 0.68, u1: 0.88, a: 'feet' },
  { u0: 0.88, u1: 1.01, a: 'free' },
];

function cr(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t,
    t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function sample(u: number, f: (k: RollKey) => number) {
  const K = ROLL_KEYS;
  u = Math.max(0, Math.min(1, u));
  let i = 0;
  while (i < K.length - 2 && u > K[i + 1].u) i++;
  const k1 = K[i],
    k2 = K[i + 1];
  const k0 = K[Math.max(0, i - 1)],
    k3 = K[Math.min(K.length - 1, i + 2)];
  return cr(f(k0), f(k1), f(k2), f(k3), (u - k1.u) / (k2.u - k1.u));
}

/** -π..π 로 (다른 자세와 섞일 때 팔이 한 바퀴 휘돌지 않게) */
const wrap = (x: number) => x - Math.PI * 2 * Math.round(x / (Math.PI * 2));

/** u 의 자세를 P 에 쓰고 몸 전체 회전(라디안, 앞으로 +)을 돌려준다 */
export function sampleRoll(P: Pose, u: number, facing: number): number {
  const nI = facing > 0 ? 0 : 1;
  const fI = 1 - nI;
  P.turn = facing;
  P.crouch = sample(u, (k) => k.crouch);
  P.lean = 0; // 기울기는 몸 전체 회전이 맡는다
  P.headTilt = sample(u, (k) => k.head);
  const D = Math.PI / 180;
  const rot = sample(u, (k) => k.pitch) * D;
  // 세계 방향 → 상체 기준 관절각 (위팔/허벅지 a = 방향 + 회전, 팔꿈치 b = 아래팔 - 위팔, 무릎 b = 허벅지 - 정강이)
  const arm = (i: number, f: (k: RollKey) => [number, number]) => {
    const U = sample(u, (k) => f(k)[0]) * D,
      F = sample(u, (k) => f(k)[1]) * D;
    P.arms[i].a = wrap(U + rot);
    P.arms[i].b = wrap(F - U);
  };
  const leg = (i: number, f: (k: RollKey) => [number, number]) => {
    const T = sample(u, (k) => f(k)[0]) * D,
      S = sample(u, (k) => f(k)[1]) * D;
    P.legs[i].a = wrap(T + rot);
    P.legs[i].b = wrap(T - S);
  };
  arm(nI, (k) => k.armN);
  arm(fI, (k) => k.armF);
  leg(nI, (k) => k.legN);
  leg(fI, (k) => k.legF);
  return rot;
}

/** 소리가 나는 순간: 손 짚기, 어깨/등, 발 디딤 */
export const ROLL_CONTACTS = [0.25, 0.4, 0.69];

export interface RollGeo {
  /** 회전 각 (부호 포함) */
  ra: number;
  /** 회전 중심 (엉덩이) */
  cx: number;
  cy: number;
  /** 바닥에 붙이기 위한 세로 이동 */
  dy: number;
  /** 세계 좌표의 손/발 (가까운 쪽, 먼 쪽) */
  handN: [number, number];
  handF: [number, number];
  footN: [number, number];
  footF: [number, number];
  /** 엉덩이 높이 (바닥에서) */
  hipH: number;
}

/** 자세 P(이미 샘플된)와 회전으로, 바닥에 붙인 몸의 기하를 계산 */
export function rollGeometry(mctx: CanvasRenderingContext2D, P: Pose, rot: number, facing: number, bx: number, by: number, scale: number): RollGeo {
  const ra = facing * rot;
  const m = drawFigure(mctx, P, bx, by, scale, defaultStyle());
  const [cx, cy] = m.hip;
  const cs = Math.cos(ra),
    sn = Math.sin(ra);
  const R = (x: number, y: number): [number, number] => [cx + (x - cx) * cs - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * cs];
  let low = -1e9;
  for (const [px, py, r] of m.pts) {
    const ry = R(px, py)[1] + r;
    if (ry > low) low = ry;
  }
  const dy = by - low;
  const nI = facing > 0 ? 0 : 1;
  const fI = 1 - nI;
  const W = (i: number): [number, number] => {
    const p = R(m.pts[i][0], m.pts[i][1]);
    return [p[0], p[1] + dy];
  };
  return { ra, cx, cy, dy, handN: W(nI), handF: W(fI), footN: W(6 + nI), footF: W(6 + fI), hipH: by - (cy + dy) };
}

/** 루트 모션: 고정된 접촉점이 미끄러지지 않도록 몸을 얼마나 옮길지 */
export class RollMotion {
  private phase: Anchor | null = null;
  private anchorX = 0;
  private prevRot = 0;
  reset() {
    this.phase = null;
    this.prevRot = 0;
  }
  /** 이번 프레임 몸의 x 이동량 */
  step(geo: RollGeo, u: number, rot: number, facing: number, dt: number, freeSpeed: number) {
    const ph = (PHASES.find((p) => u >= p.u0 && u < p.u1) ?? PHASES[PHASES.length - 1]).a;
    const pointX = () =>
      ph === 'farFoot' ? geo.footF[0] : ph === 'hands' ? (geo.handN[0] + geo.handF[0]) / 2 : (geo.footN[0] + geo.footF[0]) / 2;
    let dx = 0;
    if (ph === 'free') dx = facing * freeSpeed * dt;
    else if (ph === 'roll') dx = facing * Math.max(0, geo.hipH) * Math.abs(rot - this.prevRot);
    else {
      const x = pointX();
      if (ph !== this.phase) this.anchorX = x;
      dx = this.anchorX - x;
      if (dx * facing < 0) dx = 0; // 뒤로는 가지 않는다
    }
    this.phase = ph;
    this.prevRot = rot;
    return dx;
  }
}
