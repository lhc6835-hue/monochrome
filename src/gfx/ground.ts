import { hash1 } from '../core/math';

export const INK = '#0e0e0e';

/** 땅 (검은 판) + 윗면 하이라이트 */
export function drawGroundSlab(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, depth = 3000) {
  ctx.fillStyle = INK;
  ctx.fillRect(x0, y, x1 - x0, depth);
  ctx.fillStyle = '#2c2c2b';
  ctx.fillRect(x0, y, x1 - x0, 3);
}

/** 보도블록 틈 (흰 선) */
export function drawCrack(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, seed = 1) {
  ctx.save();
  ctx.strokeStyle = '#d8d8d5';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - len / 2, y + 1);
  let cx = x - len / 2;
  let cy = y + 1;
  const n = 7;
  for (let i = 1; i <= n; i++) {
    cx = x - len / 2 + (len * i) / n;
    cy = y + 2 + hash1(seed * 13 + i) * 9;
    ctx.lineTo(cx, cy);
  }
  ctx.stroke();
  // 가지
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 3; i++) {
    const bx = x - len / 3 + hash1(seed + i * 5.1) * len * 0.6;
    ctx.beginPath();
    ctx.moveTo(bx, y + 4);
    ctx.lineTo(bx + (hash1(seed + i) - 0.5) * 24, y + 14 + hash1(seed * 2 + i) * 16);
    ctx.stroke();
  }
  ctx.restore();
}

/** 블록(벽/턱): 검은 사각형 + 상단 하이라이트 */
export function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color = INK) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x, y, w, 3);
}
