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
import { drawFigure, defaultStyle, rigidPose, type Pose } from '../gfx/figure';

export const ROLL_T = 0.8;

interface RollKey {
  u: number;
  /** 상체의 실제 기울기 (도). 0 = 똑바로, 90 = 엎드림, 180 = 거꾸로, 270 = 등을 대고 누움, 360 = 다시 똑바로 */
  pitch: number;
  crouch: number;
  /** 턱 당김 (상체 기준, 라디안) */
  head: number;
  /**
   * 팔다리는 '몸 기준 관절각'(도)으로 적는다 — 실제 사람이 낼 수 있는 범위 안에서만.
   * [어깨/엉덩이 a: 0 = 몸통 따라 아래, + 앞(가슴 쪽), 180 = 머리 위],
   * [팔꿈치/무릎 b: 0 = 쭉 폄, + 접힘 (팔꿈치는 앞으로, 무릎은 뒤로만 접힌다)]
   */
  armN: [number, number];
  armF: [number, number];
  legN: [number, number];
  legF: [number, number];
}

/** 관절 가동 범위 (도) */
const LIM = { armA: [-50, 185], armB: [0, 150], legA: [-40, 140], legB: [0, 152] } as const;

// 오른쪽을 향한다고 가정
export const ROLL_KEYS: RollKey[] = [
  // 1. 달려오던 마지막 걸음
  { u: 0.0, pitch: 15, crouch: 0.04, head: 0.1, armN: [-10, 40], armF: [45, 55], legN: [50, 40], legF: [-10, 45] },
  // 2. 디딤발을 박고 깊게 웅크리며 두 팔을 앞 바닥으로 뻗는다
  { u: 0.12, pitch: 48, crouch: 0.2, head: 0.45, armN: [110, 10], armF: [104, 12], legN: [122, 85], legF: [79, 67] },
  // 3. 두 손으로 바닥을 짚는다. 뒷다리가 땅을 차며 쭉 펴지고, 머리는 두 팔 사이로 숙인다
  { u: 0.26, pitch: 100, crouch: 0.12, head: 1.25, armN: [110, 6], armF: [116, 8], legN: [134, 100], legF: [58, 8] },
  // 4. 몸이 짚은 손 위로 넘어가며 팔꿈치를 굽혀 받고, 턱을 당긴 채 어깨가 닿는다. 발이 땅을 떠나 무릎이 접힌다
  { u: 0.37, pitch: 150, crouch: 0.16, head: 1.9, armN: [80, 14], armF: [72, 16], legN: [104, 95], legF: [72, 50] },
  // 5. 등으로 구른다: 무릎을 가슴에 붙이고 팔로 정강이를 감싸 공처럼 (가장 빠른 회전)
  { u: 0.47, pitch: 215, crouch: 0.22, head: 2.0, armN: [62, 62], armF: [56, 66], legN: [130, 148], legF: [124, 145] },
  // 6. 엉덩이로 넘어오며 무릎은 위, 발은 바닥을 찾아 내려간다 — 팔은 무릎 쪽으로 뻗는다
  { u: 0.58, pitch: 292, crouch: 0.24, head: 1.5, armN: [72, 26], armF: [64, 28], legN: [118, 140], legF: [108, 138] },
  // 7. 발이 엉덩이 바로 밑에 닿는다. 상체는 이미 앞으로 숙이고 팔을 앞으로 뻗어 무게를 앞으로
  { u: 0.7, pitch: 388, crouch: 0.26, head: 0.5, armN: [106, 16], armF: [96, 18], legN: [108, 105], legF: [98, 102] },
  // 8. 숙인 채 밀고 일어나며 첫 걸음
  { u: 0.85, pitch: 398, crouch: 0.12, head: 0.25, armN: [83, 35], armF: [33, 45], legN: [93, 65], legF: [43, 45] },
  // 9. 다시 달린다
  { u: 1.0, pitch: 375, crouch: 0.04, head: 0.1, armN: [-10, 40], armF: [45, 55], legN: [50, 40], legF: [-10, 45] },
];

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

/** u 의 자세를 P 에 쓰고 몸 전체 회전(라디안, 앞으로 +)을 돌려준다 */
export function sampleRoll(P: Pose, u: number, facing: number): number {
  const nI = facing > 0 ? 0 : 1;
  const fI = 1 - nI;
  P.turn = facing;
  P.crouch = sample(u, (k) => k.crouch);
  P.lean = 0; // 기울기는 몸 전체 회전이 맡는다
  P.headTilt = sample(u, (k) => k.head);
  const D = Math.PI / 180;
  const cl = (v: number, r: readonly [number, number]) => Math.min(r[1], Math.max(r[0], v)) * D;
  const arm = (i: number, f: (k: RollKey) => [number, number]) => {
    P.arms[i].a = cl(sample(u, (k) => f(k)[0]), LIM.armA);
    P.arms[i].b = cl(sample(u, (k) => f(k)[1]), LIM.armB);
  };
  const leg = (i: number, f: (k: RollKey) => [number, number]) => {
    P.legs[i].a = cl(sample(u, (k) => f(k)[0]), LIM.legA);
    P.legs[i].b = cl(sample(u, (k) => f(k)[1]), LIM.legB);
  };
  arm(nI, (k) => k.armN);
  arm(fI, (k) => k.armF);
  leg(nI, (k) => k.legN);
  leg(fI, (k) => k.legF);
  return sample(u, (k) => k.pitch) * D;
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
  /** 지금 땅에 닿은 점 (관절 번호, 세계 x) */
  lowI: number;
  lowX: number;
}

/** 자세 P(이미 샘플된)와 회전으로, 바닥에 붙인 몸의 기하를 계산 */
export function rollGeometry(mctx: CanvasRenderingContext2D, P: Pose, rot: number, facing: number, bx: number, by: number, scale: number): RollGeo {
  const ra = facing * rot;
  const m = drawFigure(mctx, P, bx, by, scale, defaultStyle());
  const [cx, cy] = m.hip;
  const cs = Math.cos(ra),
    sn = Math.sin(ra);
  const R = (x: number, y: number): [number, number] => [cx + (x - cx) * cs - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * cs];
  let low = -1e9,
    lowI = 0;
  m.pts.forEach(([px, py, r], i) => {
    const ry = R(px, py)[1] + r;
    if (ry > low) {
      low = ry;
      lowI = i;
    }
  });
  const dy = by - low;
  const nI = facing > 0 ? 0 : 1;
  const fI = 1 - nI;
  const W = (i: number): [number, number] => {
    const p = R(m.pts[i][0], m.pts[i][1]);
    return [p[0], p[1] + dy];
  };
  return { ra, cx, cy, dy, handN: W(nI), handF: W(fI), footN: W(6 + nI), footF: W(6 + fI), hipH: by - (cy + dy), lowI, lowX: W(lowI)[0] };
}

/** 루트 모션: 고정된 접촉점이 미끄러지지 않도록 몸을 얼마나 옮길지 */
export class RollMotion {
  private phase: Anchor | null = null;
  private anchorX = 0;
  private lowI = -1;
  reset() {
    this.phase = null;
    this.lowI = -1;
  }
  /** 이번 프레임 몸의 x 이동량 */
  step(geo: RollGeo, u: number, rot: number, facing: number, dt: number, freeSpeed: number) {
    const ph = (PHASES.find((p) => u >= p.u0 && u < p.u1) ?? PHASES[PHASES.length - 1]).a;
    const pointX = () =>
      ph === 'farFoot' ? geo.footF[0] : ph === 'hands' ? (geo.handN[0] + geo.handF[0]) / 2 : (geo.footN[0] + geo.footF[0]) / 2;
    let dx = 0;
    if (ph === 'free') dx = facing * freeSpeed * dt;
    else {
      // 땅에 닿은 점은 미끄러지지 않는다. 구를 때는 닿는 점이 어깨 → 등 → 엉덩이로 옮겨 가며, 옮길 때마다 새로 고정
      const x = ph === 'roll' ? geo.lowX : pointX();
      if (ph !== this.phase || (ph === 'roll' && geo.lowI !== this.lowI)) this.anchorX = x;
      dx = this.anchorX - x;
      if (dx * facing < 0) {
        dx = 0; // 뒤로는 가지 않는다
        this.anchorX = x;
      }
    }
    this.phase = ph;
    this.lowI = geo.lowI;
    void rot;
    return dx;
  }
}

/**
 * 한 번 구를 때 몸이 지나갈 길 (u → 시작점에서의 x 거리).
 * 접촉점 고정으로 얻은 실제 이동을 구한 뒤 속도를 부드럽게 펴서, 멈칫·튀어나감 없이 흐르게 한다
 * (짚은 손이 몇 px 미끄러지는 건 눈에 띄지 않지만, 속도가 0 ↔ 700 으로 출렁이는 건 바로 보인다).
 */
export class RollPath {
  static N = 96;
  private xs: Float32Array;
  constructor(mctx: CanvasRenderingContext2D, speed: number, scale: number) {
    const N = RollPath.N;
    const dt = ROLL_T / N;
    const mo = new RollMotion();
    const P = rigidPose();
    const v = new Float32Array(N);
    let bx = 0;
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const rot = sampleRoll(P, u, 1);
      const geo = rollGeometry(mctx, P, rot, 1, bx, 0, scale);
      const d = mo.step(geo, u, rot, 1, dt, speed);
      v[i] = d;
      bx += d;
    }
    const total = bx;
    // 가우시안으로 속도를 편다 (양 끝은 달리던 속도로 이어 붙인다)
    const sig = 7;
    const sm = new Float32Array(N);
    const run = speed * dt;
    for (let i = 0; i < N; i++) {
      let s = 0,
        w = 0;
      for (let k = -3 * sig; k <= 3 * sig; k++) {
        const j = i + k;
        const val = j < 0 || j >= N ? run : v[j];
        const wt = Math.exp(-(k * k) / (2 * sig * sig));
        s += val * wt;
        w += wt;
      }
      sm[i] = Math.max(run * 0.3, s / w);
    }
    // 전체 거리는 그대로
    let st = 0;
    for (let i = 0; i < N; i++) st += sm[i];
    const k = total / st;
    this.xs = new Float32Array(N + 1);
    for (let i = 0; i < N; i++) this.xs[i + 1] = this.xs[i] + sm[i] * k;
  }
  /** u(0..1) 에서 시작점으로부터의 거리 */
  at(u: number) {
    const N = RollPath.N;
    const f = Math.max(0, Math.min(1, u)) * N;
    const i = Math.min(N - 1, Math.floor(f));
    return this.xs[i] + (this.xs[i + 1] - this.xs[i]) * (f - i);
  }
}
