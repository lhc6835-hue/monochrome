/**
 * 기억 조각: 아이가 크레용으로 그린 그림.
 * 회색 연필 선 위에 꽃만 색이 있다. 획 단위로 그려지듯 나타난다.
 */
import { clamp, hash1, TAU } from '../core/math';
import { PETAL_COLORS, STEM } from './flower';
import type { Screen } from './screen';

type Stroke = { pts: [number, number][]; color: string; w: number; fill?: boolean };

function circle(cx: number, cy: number, r: number, n = 18): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU + 0.3;
    const rr = r * (1 + (hash1(cx + i) - 0.5) * 0.12);
    out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return out;
}

const GRAY = '#6d6d6a';
const DARK = '#2b2b2a';

function gardenArt(): Stroke[] {
  const S: Stroke[] = [];
  // 땅
  S.push({ pts: [[-420, 190], [-200, 182], [0, 192], [220, 184], [420, 190]], color: GRAY, w: 5 });
  // 키 큰 정원사
  S.push({ pts: circle(-120, -160, 42), color: DARK, w: 5 });
  S.push({ pts: [[-120, -118], [-122, 60]], color: DARK, w: 6 });
  S.push({ pts: [[-122, 60], [-160, 186]], color: DARK, w: 6 });
  S.push({ pts: [[-122, 60], [-84, 186]], color: DARK, w: 6 });
  S.push({ pts: [[-121, -70], [-190, 0], [-176, 40]], color: DARK, w: 6 });
  S.push({ pts: [[-121, -70], [-40, -20], [10, -40]], color: DARK, w: 6 });
  // 물뿌리개
  S.push({ pts: [[0, -50], [44, -50], [44, -12], [0, -12], [0, -50]], color: GRAY, w: 5 });
  S.push({ pts: [[44, -40], [86, -70]], color: GRAY, w: 4 });
  // 물방울
  for (let i = 0; i < 4; i++) S.push({ pts: [[92 + i * 8, -50 + i * 22], [94 + i * 8, -40 + i * 22]], color: '#9fb8d8', w: 4 });
  // 가슴에 꽃잎 (색)
  S.push({ pts: circle(-121, -40, 9, 10), color: PETAL_COLORS[4], w: 5, fill: true });
  // 작은 아이 (손잡기)
  S.push({ pts: circle(-250, 40, 26), color: DARK, w: 5 });
  S.push({ pts: [[-250, 66], [-250, 130]], color: DARK, w: 5 });
  S.push({ pts: [[-250, 130], [-272, 186]], color: DARK, w: 5 });
  S.push({ pts: [[-250, 130], [-228, 186]], color: DARK, w: 5 });
  S.push({ pts: [[-250, 86], [-200, 46], [-178, 40]], color: DARK, w: 5 });
  S.push({ pts: [[-250, 86], [-290, 120]], color: DARK, w: 5 });
  // 꽃밭
  const fx = [60, 130, 200, 270, 340, 110, 240, 380];
  fx.forEach((x, i) => {
    const h = 70 + hash1(i * 3) * 60;
    S.push({ pts: [[x, 188], [x + 4, 188 - h * 0.5], [x, 188 - h]], color: STEM, w: 4 });
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      S.push({ pts: circle(x + Math.cos(a) * 13, 188 - h + Math.sin(a) * 13, 10, 8), color: PETAL_COLORS[(i + k) % 7], w: 5, fill: true });
    }
    S.push({ pts: circle(x, 188 - h, 6, 8), color: '#ffe08a', w: 4, fill: true });
  });
  // 해 (회색)
  S.push({ pts: circle(330, -170, 46), color: GRAY, w: 5 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    S.push({ pts: [[330 + Math.cos(a) * 62, -170 + Math.sin(a) * 62], [330 + Math.cos(a) * 86, -170 + Math.sin(a) * 86]], color: GRAY, w: 4 });
  }
  // 나중에 누군가 검게 덧칠한 꽃 하나
  const sc: [number, number][] = [];
  for (let i = 0; i < 16; i++) sc.push([360 + (i % 2 ? 34 : -34) + hash1(i) * 10, 60 + i * 6]);
  S.push({ pts: sc, color: '#111', w: 9 });
  return S;
}

const ARTS: Record<string, () => Stroke[]> = { garden: gardenArt };
const cache = new Map<string, Stroke[]>();

export function drawMemory(s: Screen, art: string, t: number, alpha: number) {
  let strokes = cache.get(art);
  if (!strokes) {
    strokes = (ARTS[art] ?? gardenArt)();
    cache.set(art, strokes);
  }
  const ctx = s.ctx;
  s.base(ctx);
  ctx.save();
  ctx.globalAlpha = alpha * 0.82;
  ctx.fillStyle = '#000';
  ctx.fillRect(-10, -10, s.W + 20, s.H + 20);
  ctx.globalAlpha = alpha;
  const sc = Math.min(s.W / 1200, s.H / 800) * 1.0;
  ctx.translate(s.W / 2, s.H / 2 - 20);
  ctx.scale(sc, sc);
  ctx.rotate(-0.015);
  // 종이
  ctx.fillStyle = '#f1efe8';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 30;
  ctx.fillRect(-470, -300, 940, 560);
  ctx.shadowBlur = 0;
  // 종이 결
  ctx.globalAlpha = alpha * 0.05;
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = '#000';
    ctx.fillRect(-470 + hash1(i) * 940, -300 + hash1(i * 7) * 560, 1 + hash1(i * 3) * 80, 1);
  }
  ctx.globalAlpha = alpha;
  // 크레용 획
  const per = 3.2 / strokes.length;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  strokes.forEach((st, i) => {
    const k = clamp((t - 0.3 - i * per) / 0.35);
    if (k <= 0) return;
    const n = Math.max(2, Math.ceil(st.pts.length * k));
    for (let pass = 0; pass < 3; pass++) {
      ctx.globalAlpha = alpha * (pass === 0 ? 0.85 : 0.35);
      ctx.strokeStyle = st.color;
      ctx.lineWidth = st.w * (pass === 0 ? 1 : 0.6);
      ctx.beginPath();
      for (let j = 0; j < n; j++) {
        const [x, y] = st.pts[j];
        const jx = (hash1(i * 31 + j * 7 + pass * 13) - 0.5) * 3;
        const jy = (hash1(i * 17 + j * 3 + pass * 29) - 0.5) * 3;
        if (j === 0) ctx.moveTo(x + jx, y + jy);
        else ctx.lineTo(x + jx, y + jy);
      }
      ctx.stroke();
      if (st.fill && k >= 1 && pass === 0) {
        ctx.fillStyle = st.color;
        ctx.globalAlpha = alpha * 0.75;
        ctx.fill();
      }
    }
  });
  ctx.restore();
  // 닫기 안내
  if (t > 3.8) {
    ctx.save();
    ctx.globalAlpha = alpha * clamp((t - 3.8) / 0.6) * 0.7;
    ctx.fillStyle = '#bbb';
    ctx.font = '400 20px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('아무 키나 눌러 닫기', s.W / 2, s.H - 50);
    ctx.restore();
  }
}
