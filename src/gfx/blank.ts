/**
 * 여백 (The Blank) — 색을 지우는 하얀 존재.
 * 하얀 몸 + 연필로 휘갈긴 윤곽 + 텅 빈 눈 하나. 지나간 자리는 하얀 종이가 된다.
 */
import { drawFigure, type Pose, defaultStyle } from './figure';
import { noise1, hash1, TAU } from '../core/math';

export const PAPER = '#f6f5f1';

export function drawBlankFigure(ctx: CanvasRenderingContext2D, pose: Pose, x: number, y: number, scale: number, t: number, alpha = 1) {
  const frame = Math.floor(t * 12); // 연필 선이 12fps 로 끓는다
  const st = defaultStyle();
  // 연필 윤곽: 검은 실루엣을 조금씩 어긋나게 여러 번 (굵게)
  for (let k = 0; k < 5; k++) {
    const jx = (hash1(frame * 7.1 + k * 3.3) - 0.5) * scale * 0.03;
    const jy = (hash1(frame * 3.7 + k * 9.1) - 0.5) * scale * 0.03;
    drawFigure(ctx, pose, x + jx, y + jy, scale * 1.045, { ...st, color: '#141414', farColor: '#2a2a2a', alpha: 0.55 * alpha });
  }
  drawFigure(ctx, pose, x, y + scale * 0.006, scale * 0.985, { ...st, color: '#fdfdfb', farColor: '#e4e3df', alpha });
  // 몸 위 연필 해칭
  ctx.save();
  ctx.globalAlpha = 0.18 * alpha;
  ctx.strokeStyle = '#555';
  ctx.lineWidth = Math.max(1, scale * 0.004);
  const rnd = (n: number) => hash1(frame * 13.7 + n);
  for (let i = 0; i < 9; i++) {
    const hx = x + (rnd(i) - 0.5) * scale * 0.25;
    const hy = y - scale * (0.15 + rnd(i + 50) * 0.7);
    const len = scale * (0.03 + rnd(i + 90) * 0.06);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + len, hy - len * 0.6);
    ctx.stroke();
  }
  ctx.restore();
}

/** 텅 빈 눈 (검은 구멍). 머리 위치에 그린다 */
export function drawHollowEye(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number, open = 1) {
  const w = r * 1.15;
  const h = r * 0.8 * open;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy);
  ctx.quadraticCurveTo(cx, cy - h, cx + w / 2, cy);
  ctx.quadraticCurveTo(cx, cy + h, cx - w / 2, cy);
  ctx.closePath();
  ctx.fillStyle = '#050505';
  ctx.fill();
  // 깊이감: 안쪽으로 빨려 들어가는 회색 링
  ctx.clip();
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.6);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.6 + Math.sin(t * 2) * 0.05, 'rgba(40,40,40,1)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - w, cy - h, w * 2, h * 2);
  ctx.restore();
}

/**
 * 지워진 영역: frontX 왼쪽을 하얀 종이로 덮는다. 경계는 찢긴 종이 + 연필 자국.
 * 월드 좌표계에서 호출. (y0..y1 = 덮을 세로 범위)
 */
export function drawErasedRegion(ctx: CanvasRenderingContext2D, frontX: number, x0: number, y0: number, y1: number, t: number, color = PAPER) {
  if (frontX <= x0) return;
  const steps = 48;
  const frame = Math.floor(t * 12);
  const edge = (yy: number) => frontX + noise1(yy * 0.012 + t * 0.7) * 40 + noise1(yy * 0.05 + frame * 0.3) * 10;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0 - 50, y0);
  for (let i = 0; i <= steps; i++) {
    const yy = y0 + ((y1 - y0) * i) / steps;
    ctx.lineTo(edge(yy), yy);
  }
  ctx.lineTo(x0 - 50, y1);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  // 경계 연필선
  ctx.strokeStyle = 'rgba(25,25,25,0.55)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const yy = y0 + ((y1 - y0) * i) / steps;
      const xx = edge(yy) + (hash1(frame * 5 + i * 1.3 + k * 77) - 0.5) * 8;
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
  }
  // 지워지다 남은 흔적 (흐린 해칭)
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 26; i++) {
    const yy = y0 + hash1(i * 3.1 + frame * 0.01) * (y1 - y0);
    const xx = edge(yy) - 20 - hash1(i * 7.7) * 260;
    ctx.beginPath();
    ctx.moveTo(xx, yy);
    ctx.lineTo(xx + 30 + hash1(i) * 40, yy - 18);
    ctx.stroke();
  }
  ctx.restore();
}

/** 종이 조각 파티클용 */
export function drawPaperBit(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, a: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha *= a;
  ctx.fillStyle = PAPER;
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-s, -s * 0.6);
  ctx.lineTo(s * 0.8, -s * 0.8);
  ctx.lineTo(s, s * 0.5);
  ctx.lineTo(-s * 0.6, s * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export const BLANK_TAU = TAU;

let bctx: CanvasRenderingContext2D | null = null;
function measureCtx() {
  if (!bctx) {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    bctx = c.getContext('2d')!;
  }
  return bctx;
}
const wrapPi = (x: number) => x - Math.PI * 2 * Math.round(x / (Math.PI * 2));

/**
 * 여백(거대한 흰 인물)의 팔 i 를 세계 좌표 (tx, ty) 로 뻗게 한다. pose.turn 은 ±1 이어야 한다.
 * 팔꿈치는 사람처럼 앞쪽으로만 접힌다. 닿지 않으면 그 방향으로 쭉 편다.
 * 돌려주는 값: 실제 손 위치.
 */
export function blankReach(P: Pose, i: 0 | 1, bx: number, by: number, scale: number, tx: number, ty: number): [number, number] {
  const j = drawFigure(measureCtx(), P, bx, by, scale);
  const [sx, sy] = j.pts[4 + i];
  const L1 = 0.17 * scale,
    L2 = 0.17 * scale;
  let vx = tx - sx,
    vy = ty - sy;
  let d = Math.hypot(vx, vy);
  const maxD = (L1 + L2) * 0.999;
  if (d > maxD) {
    vx *= maxD / d;
    vy *= maxD / d;
    d = maxD;
  }
  d = Math.max(d, 1);
  const base = Math.atan2(vy, vx);
  const A = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const th = P.lean * (P.turn >= 0 ? 1 : -1);
  const f = P.turn >= 0 ? 1 : -1;
  let best: [number, number] | null = null;
  for (const c of [base + A, base - A]) {
    const ex = sx + Math.cos(c) * L1,
      ey = sy + Math.sin(c) * L1;
    const u2x = (sx + vx - ex) / L2,
      u2y = (sy + vy - ey) / L2;
    // dir(φ) = (-sin φ, cos φ)
    const p1 = Math.atan2(-Math.cos(c), Math.sin(c));
    const p2 = Math.atan2(-u2x, u2y);
    const a = wrapPi((th - p1) * f);
    const b = wrapPi((p1 - p2) * f);
    // 팔꿈치가 앞으로 접히는 쪽 (b ≥ 0)
    if (!best || b > best[1]) best = [a, b];
  }
  P.arms[i].a = best![0];
  P.arms[i].b = Math.max(0, best![1]);
  return [sx + vx, sy + vy];
}

/**
 * 여백의 손 (흰 몸 + 끓는 연필 윤곽). 손목 (x, y) 에서 angle 방향(0 = 아래)으로 손가락이 뻗는다.
 *  size = 손바닥 너비, curl = 0(활짝 폄) ~ 1(움켜쥠), arm = 손목에서 반대쪽으로 뻗는 팔뚝 길이.
 *  각 부분을 둥근 막대로 겹쳐 그린다: 어두운 굵은 선을 먼저 모두 긋고 흰 선을 위에 덮어, 바깥 윤곽만 남긴다.
 */
export function drawBlankHand(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number, t: number, opts: { curl?: number; arm?: number; spread?: number; flip?: boolean; alpha?: number } = {}) {
  const curl = opts.curl ?? 0;
  const spread = opts.spread ?? 1;
  const s = size;
  const fl = opts.flip ? -1 : 1;
  // 손 좌표: 손목 (0,0), 손끝 방향 +y
  type Seg = { a: [number, number]; b: [number, number]; w: number };
  const segs: Seg[] = [];
  // 팔뚝 (손목에서 위로, 팔꿈치 쪽이 조금 굵다)
  if (opts.arm) {
    segs.push({ a: [0, 0], b: [0, -opts.arm * 0.5], w: s * 0.42 });
    segs.push({ a: [0, -opts.arm * 0.5], b: [0, -opts.arm], w: s * 0.5 });
  }
  // 손바닥: 손목 쪽은 좁고 손가락 마디 쪽은 넓다
  segs.push({ a: [0, s * 0.05], b: [0, s * 0.5], w: s * 0.62 });
  segs.push({ a: [-s * 0.18 * fl, s * 0.35], b: [s * 0.18 * fl, s * 0.35], w: s * 0.5 });
  // 손가락 넷: 검지 ~ 새끼, 길이와 벌어짐이 다르다. 굽힐 때는 두 마디로 접힌다
  const fingers: [number, number, number][] = [
    // 마디 x, 길이, 벌어짐
    [-0.27, 0.5, -0.1],
    [-0.09, 0.58, -0.03],
    [0.09, 0.54, 0.04],
    [0.26, 0.42, 0.12],
  ];
  for (const [fx, len, sp] of fingers) {
    const bx = fx * s * fl,
      by = s * 0.58;
    const a1 = sp * spread * fl;
    const l1 = len * s * 0.55,
      l2 = len * s * 0.5;
    const mx = bx + Math.sin(a1) * l1,
      my = by + Math.cos(a1) * l1;
    // 둘째 마디는 손바닥 쪽으로 굽는다
    const a2 = a1 - curl * 1.9 * fl;
    const ex = mx + Math.sin(a2) * l2,
      ey = my + Math.cos(a2) * l2;
    segs.push({ a: [bx, by], b: [mx, my], w: s * 0.17 });
    segs.push({ a: [mx, my], b: [ex, ey], w: s * 0.15 });
  }
  // 엄지: 손바닥 옆에서 비스듬히
  {
    const bx = -0.3 * s * fl,
      by = s * 0.22;
    const a1 = (-0.75 + curl * 0.6) * fl;
    const mx = bx + Math.sin(a1) * s * 0.26,
      my = by + Math.cos(a1) * s * 0.26;
    const a2 = a1 + (0.5 + curl * 0.9) * fl;
    segs.push({ a: [bx, by], b: [mx, my], w: s * 0.19 });
    segs.push({ a: [mx, my], b: [mx + Math.sin(a2) * s * 0.2, my + Math.cos(a2) * s * 0.2], w: s * 0.16 });
  }
  const frame = Math.floor(t * 12);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-angle);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha *= opts.alpha ?? 1;
  const line = (sg: Seg, w: number, jx = 0, jy = 0) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(sg.a[0] + jx, sg.a[1] + jy);
    ctx.lineTo(sg.b[0] + jx, sg.b[1] + jy);
    ctx.stroke();
  };
  // 연필 윤곽: 조금씩 어긋나게 여러 번
  const ow = Math.max(2.5, s * 0.035);
  for (let k = 0; k < 3; k++) {
    const jx = (hash1(frame * 7.1 + k * 3.3) - 0.5) * s * 0.03;
    const jy = (hash1(frame * 3.7 + k * 9.1) - 0.5) * s * 0.03;
    ctx.strokeStyle = k === 0 ? 'rgba(20,20,20,0.85)' : 'rgba(20,20,20,0.35)';
    for (const sg of segs) line(sg, sg.w + ow * 2, jx, jy);
  }
  ctx.strokeStyle = '#fdfdfb';
  for (const sg of segs) line(sg, sg.w);
  // 손가락 사이의 옅은 주름
  ctx.strokeStyle = 'rgba(60,60,58,0.35)';
  ctx.lineWidth = Math.max(1, s * 0.012);
  for (const fx of [-0.18, 0, 0.18]) {
    ctx.beginPath();
    ctx.moveTo(fx * s * fl, s * 0.5);
    ctx.lineTo(fx * s * fl, s * 0.62);
    ctx.stroke();
  }
  ctx.restore();
}
