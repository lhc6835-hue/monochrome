import { TAU, lerp, clamp } from '../core/math';

/** 꽃잎 색 — 이 세계에서 유일한 색 */
export const PETAL_COLORS = ['#ff4d5e', '#ff9a2e', '#ffd43b', '#3fcf8e', '#3a8dff', '#7a5cff', '#ff5fb4'] as const;
export const STEM = '#3f9a55';
export const LEAF = '#4fb866';
export const CENTER = '#fff1b8';

export interface FlowerOpts {
  /** 바람 흔들림 (라디안) */
  sway?: number;
  /** 0..1 피어남 */
  bloom?: number;
  /** 줄기 길이 (size 배수) */
  stem?: number;
  /** 0..1 빛 번짐 */
  glow?: number;
  /** 전체 기울기 */
  angle?: number;
  alpha?: number;
  /** 잎 표시 */
  leaves?: boolean;
  /** 꽃잎 회전 */
  spin?: number;
}

/** 빛 번짐 (밝은 배경 위라 가산 대신 옅은 색 안개) */
export function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colors: readonly string[], amt: number) {
  if (amt <= 0.001) return;
  ctx.save();
  const n = Math.max(1, colors.length);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const gx = x + Math.cos(a) * r * 0.18;
    const gy = y + Math.sin(a) * r * 0.18;
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    g.addColorStop(0, hexA(colors[i], 0.22 * amt));
    g.addColorStop(0.4, hexA(colors[i], 0.08 * amt));
    g.addColorStop(1, hexA(colors[i], 0));
    ctx.fillStyle = g;
    ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
  }
  ctx.restore();
}

export function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a)})`;
}

export function petalPath(ctx: CanvasRenderingContext2D, len: number, wid: number) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(wid * 0.9, -len * 0.25, wid * 0.75, -len * 0.95, 0, -len);
  ctx.bezierCurveTo(-wid * 0.75, -len * 0.95, -wid * 0.9, -len * 0.25, 0, 0);
  ctx.closePath();
}

/**
 * 꽃. (x, y) = 줄기 아래 끝. size = 꽃 머리 지름 정도.
 * 반환: 꽃 머리 중심 좌표
 */
export function drawFlower(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  petals: readonly string[],
  o: FlowerOpts = {},
): [number, number] {
  const sway = o.sway ?? 0;
  const bloom = o.bloom ?? 1;
  const stemLen = size * (o.stem ?? 1.6);
  const ang = (o.angle ?? 0) + sway;
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  ctx.translate(x, y);
  ctx.rotate(o.angle ?? 0);
  // 줄기: 흔들림을 따라 휘는 곡선
  const tipX = Math.sin(sway) * stemLen;
  const tipY = -Math.cos(sway) * stemLen;
  ctx.strokeStyle = STEM;
  ctx.lineWidth = Math.max(1.2, size * 0.075);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(tipX * 0.15, tipY * 0.55, tipX, tipY);
  ctx.stroke();
  if (o.leaves !== false) {
    for (const [t, side] of [
      [0.38, 1],
      [0.58, -1],
    ] as const) {
      const lx = tipX * 0.15 * 2 * t * (1 - t) + tipX * t * t;
      const ly = tipY * 0.55 * 2 * t * (1 - t) + tipY * t * t;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(side * 1.05 + sway * 0.6);
      ctx.fillStyle = LEAF;
      petalPath(ctx, size * 0.42 * clamp(bloom * 1.5), size * 0.2);
      ctx.fill();
      ctx.restore();
    }
  }
  // 꽃 머리
  ctx.translate(tipX, tipY);
  ctx.rotate(sway * 0.5);
  const n = petals.length;
  const len = size * 0.5 * lerp(0.25, 1, bloom);
  const wid = size * lerp(0.2, 0.36, bloom) * (n > 5 ? 1 : 1.15);
  const spin = o.spin ?? 0;
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(n, 1)) * TAU + spin - Math.PI / 2;
    ctx.save();
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = petals[i];
    petalPath(ctx, len, wid);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = CENTER;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.13, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,110,20,0.55)';
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.06, 0, TAU);
  ctx.fill();
  ctx.restore();
  // 월드 좌표 반환
  const ca = Math.cos(o.angle ?? 0),
    sa = Math.sin(o.angle ?? 0);
  void ang;
  return [x + tipX * ca - tipY * sa, y + tipX * sa + tipY * ca];
}

/** 날아가는 꽃잎 하나 */
export function drawPetal(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, rot: number, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  petalPath(ctx, size, size * 0.62);
  ctx.translate(0, size * 0.5);
  ctx.fill();
  ctx.restore();
}
