/**
 * 픽토그램 주민 리그.
 * 기준 이미지(공공 픽토그램 사람 아이콘)의 비율을 그대로 측정해 단위 높이 H=1 로 정규화했다.
 *   머리 중심 0.906 / 반지름 0.094, 목 틈 0.019, 어깨 폭 0.41, 팔 굵기 0.079,
 *   다리 굵기 0.105, 가랑이 0.42, 팔 끝 0.345.
 * 관절을 움직이면서도 "흰 틈(knockout)"으로 팔/다리/몸통을 분리해 픽토그램 느낌을 유지한다.
 */
import { lerp, clamp } from '../core/math';

export interface Limb {
  /** 위쪽 마디 각도 (0 = 아래로 수직, + = 정면에선 바깥쪽 / 측면에선 앞쪽) */
  a: number;
  /** 아래 마디 굽힘 (팔: 앞으로, 다리: 뒤로) */
  b: number;
}

export interface Pose {
  /** -1 왼쪽 옆모습, 0 정면, 1 오른쪽 옆모습 */
  turn: number;
  /** 몸통 기울기 (라디안, + = 바라보는 방향으로) */
  lean: number;
  /** 엉덩이 낮춤 (H 단위) */
  crouch: number;
  headTilt: number;
  headX: number;
  headY: number;
  /** [0] = 정면 기준 화면 왼쪽, [1] = 화면 오른쪽 */
  arms: [Limb, Limb];
  legs: [Limb, Limb];
  /** 눈 존재 여부 (0 = 얼굴 없음, 1 = 눈 있음) */
  eyeShow: number;
  /** 눈 뜸 정도 0..1 */
  eye: number;
  lookX: number;
  lookY: number;
  pupil: number;
  /** 착지 찌그러짐 (1 = 기본) */
  squash: number;
  /** 몸 전체 x 오프셋 (H 단위) */
  bodyX: number;
}

export const rigidPose = (): Pose => ({
  turn: 0,
  lean: 0,
  crouch: 0,
  headTilt: 0,
  headX: 0,
  headY: 0,
  arms: [
    { a: 0, b: 0 },
    { a: 0, b: 0 },
  ],
  legs: [
    { a: 0, b: 0 },
    { a: 0, b: 0 },
  ],
  eyeShow: 0,
  eye: 0,
  lookX: 0,
  lookY: 0,
  pupil: 1,
  squash: 1,
  bodyX: 0,
});

export const clonePose = (p: Pose): Pose => ({
  ...p,
  arms: [{ ...p.arms[0] }, { ...p.arms[1] }],
  legs: [{ ...p.legs[0] }, { ...p.legs[1] }],
});

const NUM_KEYS = ['turn', 'lean', 'crouch', 'headTilt', 'headX', 'headY', 'eyeShow', 'eye', 'lookX', 'lookY', 'pupil', 'squash', 'bodyX'] as const;

export function lerpPose(a: Pose, b: Pose, t: number, out: Pose = rigidPose()): Pose {
  for (const k of NUM_KEYS) out[k] = lerp(a[k], b[k], t);
  for (let i = 0; i < 2; i++) {
    out.arms[i].a = lerp(a.arms[i].a, b.arms[i].a, t);
    out.arms[i].b = lerp(a.arms[i].b, b.arms[i].b, t);
    out.legs[i].a = lerp(a.legs[i].a, b.legs[i].a, t);
    out.legs[i].b = lerp(a.legs[i].b, b.legs[i].b, t);
  }
  return out;
}

export interface FigureStyle {
  color: string;
  farColor: string;
  headScale: number;
  /** 눈동자 테두리 색 (꽃잎 색) */
  iris: string | null;
  irisAmt: number;
  /** 몸 전체 불투명도 */
  alpha: number;
}

export const defaultStyle = (): FigureStyle => ({
  color: '#0e0e0e',
  farColor: '#3c3c3c',
  headScale: 1,
  iris: null,
  irisAmt: 0,
  alpha: 1,
});

export interface Joints {
  hand: [[number, number], [number, number]];
  handAngle: [number, number];
  head: [number, number];
  headR: number;
  eye: [number, number];
  near: number;
  top: number;
}

// 비율 상수
const HIP = 0.42;
const SHOULDER_Y = -0.305; // 엉덩이 기준
const UPPER_ARM = 0.17;
const LOWER_ARM = 0.17;
const ARM_W = 0.079;
const THIGH = 0.18;
const SHIN = 0.1875;
const LEG_W = 0.105;
const HEAD_Y = -0.486;
const HEAD_R = 0.094;
const YOKE_TOP = -0.373;
const YOKE_BOT = -0.262;
const BODY_BOT = 0.03;

const dir = (phi: number): [number, number] => [-Math.sin(phi), Math.cos(phi)];

function roundRectPath(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, rTop: number, rBot = 0) {
  const rt = Math.min(rTop, (x1 - x0) / 2, (y1 - y0) / 2);
  const rb = Math.min(rBot, (x1 - x0) / 2, (y1 - y0) / 2);
  ctx.moveTo(x0 + rt, y0);
  ctx.lineTo(x1 - rt, y0);
  ctx.arcTo(x1, y0, x1, y0 + rt, rt);
  ctx.lineTo(x1, y1 - rb);
  if (rb > 0) ctx.arcTo(x1, y1, x1 - rb, y1, rb);
  else ctx.lineTo(x1, y1);
  ctx.lineTo(x0 + rb, y1);
  if (rb > 0) ctx.arcTo(x0, y1, x0, y1 - rb, rb);
  else ctx.lineTo(x0, y1);
  ctx.lineTo(x0, y0 + rt);
  ctx.arcTo(x0, y0, x0 + rt, y0, rt);
  ctx.closePath();
}

export interface DrawExtras {
  /** 손에 든 물건 그리기 (월드 좌표의 손 위치, 팔 각도) */
  held?: (ctx: CanvasRenderingContext2D, hx: number, hy: number, ang: number) => void;
  heldBehind?: boolean;
  /** 손에 든 물건이 어느 팔인지 (기본: 앞쪽 팔) */
  heldArm?: 0 | 1;
}

/**
 * 픽토그램 인물을 그린다. (x, y) = 발 중심, scale = 키(px).
 * ctx 는 반드시 투명한 오프스크린 레이어여야 흰 틈이 배경을 뚫지 않는다.
 */
export function drawFigure(
  ctx: CanvasRenderingContext2D,
  pose: Pose,
  x: number,
  y: number,
  scale: number,
  style: FigureStyle = defaultStyle(),
  extras: DrawExtras = {},
): Joints {
  const tt = clamp(Math.abs(pose.turn));
  const f = pose.turn >= 0 ? 1 : -1;
  const th = pose.lean * f;
  const cs = Math.cos(th),
    sn = Math.sin(th);
  const hipY = -(HIP - pose.crouch);
  const hipX = pose.bodyX;
  const gap = Math.max(0.017, 1.7 / scale);
  const sq = pose.squash;
  const sx = 1 / Math.sqrt(sq);

  const rot = (lx: number, ly: number): [number, number] => [hipX + lx * cs - ly * sn, hipY + lx * sn + ly * cs];

  // 관절 계산
  const sides = [-1, 1];
  const sh: [number, number][] = [];
  const el: [number, number][] = [];
  const hd: [number, number][] = [];
  const hAng: number[] = [];
  const hp: [number, number][] = [];
  const kn: [number, number][] = [];
  const ft: [number, number][] = [];
  for (let i = 0; i < 2; i++) {
    const s = sides[i];
    const mix = lerp(s, f, tt);
    const shx = s * lerp(0.1655, 0.02, tt);
    sh[i] = rot(shx, SHOULDER_Y);
    const p1 = th - pose.arms[i].a * mix;
    const d1 = dir(p1);
    el[i] = [sh[i][0] + d1[0] * UPPER_ARM, sh[i][1] + d1[1] * UPPER_ARM];
    const p2 = p1 - pose.arms[i].b * mix;
    const d2 = dir(p2);
    hd[i] = [el[i][0] + d2[0] * LOWER_ARM, el[i][1] + d2[1] * LOWER_ARM];
    hAng[i] = p2;
    hp[i] = rot(s * lerp(0.059, 0.014, tt), 0);
    const q1 = -pose.legs[i].a * mix;
    const e1 = dir(q1);
    kn[i] = [hp[i][0] + e1[0] * THIGH, hp[i][1] + e1[1] * THIGH];
    const q2 = q1 + pose.legs[i].b * mix;
    const e2 = dir(q2);
    ft[i] = [kn[i][0] + e2[0] * SHIN, kn[i][1] + e2[1] * SHIN];
  }
  const near = tt < 0.35 ? -1 : f > 0 ? 0 : 1;
  const far = near === -1 ? -1 : 1 - near;
  const headR = HEAD_R * style.headScale;
  // 머리: 목을 축으로 기울어진다
  const neckLen = -HEAD_Y + YOKE_TOP + (style.headScale - 1) * HEAD_R * 0.9;
  const ht = pose.headTilt * (tt < 0.35 ? 1 : f);
  const neck = rot(pose.headX, YOKE_TOP);
  const headC: [number, number] = [
    neck[0] + Math.sin(th + ht) * neckLen,
    neck[1] - Math.cos(th + ht) * neckLen + pose.headY,
  ];

  ctx.save();
  const worldT = ctx.getTransform();
  ctx.translate(x, y);
  ctx.scale(scale * sx, scale * sq);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = style.alpha;

  const limbPath = (a: [number, number], b: [number, number], c: [number, number]) => {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(c[0], c[1]);
  };
  const drawLimb = (a: [number, number], b: [number, number], c: [number, number], w: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    limbPath(a, b, c);
    ctx.stroke();
  };
  /** 팔다리 둘레를 투명하게 파낸다 (시작점 근처는 남겨 몸과 이어지게) */
  const knockLimb = (a: [number, number], b: [number, number], c: [number, number], w: number, startFrac: number) => {
    const L1 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6;
    const s0: [number, number] = [a[0] + ((b[0] - a[0]) * startFrac) / 1, a[1] + ((b[1] - a[1]) * startFrac) / 1];
    void L1;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = w + gap * 2;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(s0[0], s0[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(c[0], c[1]);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c[0], c[1], w / 2 + gap, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const yw = lerp(0.205, 0.08, tt);
  const bw = lerp(0.1115, 0.074, tt);
  const torsoPath = () => {
    ctx.save();
    ctx.translate(hipX, hipY);
    ctx.rotate(th);
    ctx.beginPath();
    roundRectPath(ctx, -yw, YOKE_TOP, yw, YOKE_BOT, lerp(0.088, 0.07, tt));
    roundRectPath(ctx, -bw, YOKE_TOP + 0.04, bw, BODY_BOT, 0.02, 0);
    ctx.restore();
  };
  const headPath = () => {
    ctx.beginPath();
    ctx.arc(headC[0], headC[1], headR, 0, Math.PI * 2);
  };
  const knockBody = () => {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    ctx.lineWidth = gap * 2;
    ctx.strokeStyle = '#000';
    torsoPath();
    ctx.stroke();
    ctx.fill();
    headPath();
    ctx.stroke();
    ctx.restore();
  };

  const heldArm = extras.heldArm ?? (near === -1 ? 1 : near);
  const drawHeld = () => {
    if (!extras.held) return;
    const cur = ctx.getTransform();
    const ga = ctx.globalAlpha;
    ctx.setTransform(worldT);
    ctx.globalAlpha = 1;
    extras.held(ctx, x + hd[heldArm][0] * scale * sx, y + hd[heldArm][1] * scale * sq, hAng[heldArm]);
    ctx.setTransform(cur);
    ctx.globalAlpha = ga;
  };

  if (near === -1) {
    // 정면 모드
    if (extras.held && extras.heldBehind) drawHeld();
    for (let i = 0; i < 2; i++) drawLimb(hp[i], kn[i], ft[i], LEG_W, style.color);
    ctx.fillStyle = style.color;
    torsoPath();
    ctx.fill();
    headPath();
    ctx.fill();
    for (let i = 0; i < 2; i++) {
      knockLimb(sh[i], el[i], hd[i], ARM_W, 0.62);
      drawLimb(sh[i], el[i], hd[i], ARM_W, style.color);
    }
    if (extras.held && !extras.heldBehind) drawHeld();
  } else {
    // 옆모습 모드: 먼 팔다리 → 몸통 → 가까운 팔다리
    drawLimb(hp[far], kn[far], ft[far], LEG_W, style.farColor);
    drawLimb(sh[far], el[far], hd[far], ARM_W, style.farColor);
    if (extras.held && (extras.heldBehind || heldArm === far)) drawHeld();
    knockBody();
    ctx.fillStyle = style.color;
    torsoPath();
    ctx.fill();
    headPath();
    ctx.fill();
    knockLimb(hp[near], kn[near], ft[near], LEG_W, 0.55);
    drawLimb(hp[near], kn[near], ft[near], LEG_W, style.color);
    knockLimb(sh[near], el[near], hd[near], ARM_W, 0.62);
    drawLimb(sh[near], el[near], hd[near], ARM_W, style.color);
    if (extras.held && !extras.heldBehind && heldArm === near) drawHeld();
  }

  // 눈
  const eyeC: [number, number] = [headC[0] + pose.turn * headR * 0.38, headC[1] - headR * 0.04];
  // 얼굴은 없다 (기준 픽토그램처럼). drawEye 는 남겨두지만 인물에는 그리지 않는다.
  ctx.restore();

  const toW = (p: [number, number]): [number, number] => [x + p[0] * scale * sx, y + p[1] * scale * sq];
  return {
    hand: [toW(hd[0]), toW(hd[1])],
    handAngle: [hAng[0], hAng[1]],
    head: toW(headC),
    headR: headR * scale,
    eye: toW(eyeC),
    near: near === -1 ? 1 : near,
    top: y + (headC[1] - headR) * scale * sq,
  };
}

/** 단 하나의 눈. 아몬드형 흰자 + 검은 눈동자 + (선택) 꽃잎 색 홍채 */
export function drawEye(ctx: CanvasRenderingContext2D, cx: number, cy: number, headR: number, pose: Pose, style: FigureStyle) {
  const tt = clamp(Math.abs(pose.turn));
  const show = clamp(pose.eyeShow);
  const ew = headR * 1.08 * (1 - 0.38 * tt) * lerp(0.15, 1, Math.min(1, show * 1.6));
  const open = clamp(pose.eye) * clamp(show * 1.5 - 0.3);
  const eh = headR * 0.78 * open;
  ctx.save();
  // 감긴 눈 / 등장 직전: 얇은 선
  if (eh < headR * 0.06) {
    ctx.strokeStyle = '#f4f4f4';
    ctx.globalAlpha *= Math.min(1, show * 3);
    ctx.lineWidth = headR * 0.07;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - ew / 2, cy);
    ctx.quadraticCurveTo(cx, cy + headR * 0.08, cx + ew / 2, cy);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(cx - ew / 2, cy);
  ctx.quadraticCurveTo(cx, cy - eh, cx + ew / 2, cy);
  ctx.quadraticCurveTo(cx, cy + eh, cx - ew / 2, cy);
  ctx.closePath();
  ctx.fillStyle = '#f7f7f5';
  ctx.fill();
  ctx.clip();
  // 아래쪽 그늘 (입체감)
  const g = ctx.createLinearGradient(0, cy - eh / 2, 0, cy + eh / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.18)');
  g.addColorStop(0.35, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - ew, cy - eh, ew * 2, eh * 2);
  const px = cx + pose.lookX * ew * 0.27 + pose.turn * ew * 0.12;
  const py = cy + pose.lookY * eh * 0.22;
  const pr = headR * 0.26 * pose.pupil;
  if (style.iris && style.irisAmt > 0) {
    ctx.globalAlpha = style.irisAmt;
    ctx.fillStyle = style.iris;
    ctx.beginPath();
    ctx.arc(px, py, pr * 1.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#060606';
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(px - pr * 0.35, py - pr * 0.4, pr * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------
// 절차적 동작
// ------------------------------------------------------------------

/** 걷기/달리기 사이클. phase 는 라디안, speed 0..1 (1 = 전력질주) */
export function applyRunCycle(p: Pose, phase: number, speed: number, facing: number) {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const amp = lerp(0.28, 0.72, speed);
  const nearI = facing > 0 ? 0 : 1;
  const farI = 1 - nearI;
  // 가까운 다리/먼 다리 반대 위상
  const legs = [nearI, farI];
  for (let k = 0; k < 2; k++) {
    const i = legs[k];
    const ph = k === 0 ? 0 : Math.PI;
    const ls = Math.sin(phase + ph);
    const lc = Math.cos(phase + ph);
    p.legs[i].a = ls * amp + 0.05 * speed;
    // 다리가 앞으로 나갈 때(스윙) 무릎이 크게 굽는다
    p.legs[i].b = Math.max(0, lc) * lerp(0.5, 1.5, speed) + 0.08;
    // 팔은 반대
    p.arms[i].a = -ls * amp * lerp(0.6, 1.05, speed);
    p.arms[i].b = lerp(0.25, 1.35, speed) + Math.max(0, -ls) * 0.25 * speed;
  }
  p.crouch = 0.018 + Math.abs(c) * lerp(0.008, 0.03, speed) + speed * 0.02;
  p.lean = lerp(0.04, 0.2, speed);
  p.headTilt = -p.lean * 0.4;
  p.squash = 1 + s * s * 0.01;
}

export function applyIdle(p: Pose, t: number, facing: number, breath = 1) {
  const b = Math.sin(t * 1.9) * breath;
  for (let i = 0; i < 2; i++) {
    p.legs[i].a = 0;
    p.legs[i].b = 0.02;
    p.arms[i].a = 0.04 + b * 0.012;
    p.arms[i].b = 0.12 + b * 0.02;
  }
  const nearI = facing > 0 ? 0 : 1;
  p.legs[nearI].a = 0.07;
  p.legs[1 - nearI].a = -0.05;
  p.crouch = 0.008 + b * 0.004;
  p.lean = 0.02;
  p.headY = -b * 0.003;
  p.squash = 1;
}

/** 웅크림(crouch)에 맞춰 발이 땅에 붙도록 다리 각도를 계산한다 (2관절 IK) */
export function plantLegs(p: Pose, spread = 0, which: number[] = [0, 1]) {
  const D = Math.max(0.12, HIP - p.crouch - LEG_W / 2);
  const L1 = THIGH,
    L2 = SHIN;
  const d = Math.min(L1 + L2 - 1e-4, Math.hypot(D, spread));
  const cosK = (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2);
  const K = Math.acos(Math.max(-1, Math.min(1, cosK)));
  const bend = Math.PI - K;
  const cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
  const A = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const base = Math.atan2(spread, D);
  for (const i of which) {
    p.legs[i].a = A + base;
    p.legs[i].b = bend;
  }
}

const wrapPi = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
};

/**
 * 정면 자세(turn = 0, lean = 0)에서 팔/다리 끝을 목표점에 닿게 한다 (2관절 IK).
 * (tx, ty) 는 발 중심 기준 H 단위 로컬 좌표. 팔꿈치/무릎은 바깥쪽으로 굽는다.
 */
export function reachIK(p: Pose, limb: 'arm' | 'leg', i: 0 | 1, tx: number, ty: number) {
  const s = i === 0 ? -1 : 1;
  const hipY = -(HIP - p.crouch);
  const arm = limb === 'arm';
  const ox = (arm ? s * 0.1655 : s * 0.059) + p.bodyX;
  const oy = arm ? hipY + SHOULDER_Y : hipY;
  const L1 = arm ? UPPER_ARM : THIGH;
  const L2 = arm ? LOWER_ARM : SHIN;
  let vx = tx - ox,
    vy = ty - oy;
  let d = Math.hypot(vx, vy);
  const maxD = L1 + L2 - 1e-4;
  if (d > maxD) {
    vx *= maxD / d;
    vy *= maxD / d;
    d = maxD;
  }
  d = Math.max(d, 1e-4);
  const base = Math.atan2(vy, vx);
  const A = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const c1 = base + A,
    c2 = base - A;
  const up1 = s * Math.cos(c1) >= s * Math.cos(c2) ? c1 : c2;
  const ex = ox + Math.cos(up1) * L1,
    ey = oy + Math.sin(up1) * L1;
  const lo = Math.atan2(oy + vy - ey, ox + vx - ex);
  // 세계 각도 → 리그 각도 (dir(φ) = (-sin φ, cos φ) 이므로 φ = 각도 - π/2)
  const phi1 = up1 - Math.PI / 2;
  const phi2 = lo - Math.PI / 2;
  let a = wrapPi(-phi1 * s);
  if (a < -Math.PI / 2) a += Math.PI * 2;
  const bend = wrapPi(phi2 - phi1);
  if (arm) {
    p.arms[i].a = a;
    p.arms[i].b = -bend * s;
  } else {
    p.legs[i].a = a;
    p.legs[i].b = bend * s;
  }
}
