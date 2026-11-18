/**
 * 오프닝 — 그림 한 장 + 타자기 내레이션을 넘겨 가며 이야기를 들려준다.
 *
 * 그림마다 세 겹(먼 배경 / 인물이 있는 가운데 / 초점이 나간 앞쪽)을 따로 구워 두고,
 * 카메라가 천천히 움직일 때 겹마다 다르게 흘러가게 한다 (패럴랙스).
 * 그 위로 꽃잎·재·먼지·반짝임이 실시간으로 떠다닌다.
 * 색은 꽃과 꽃잎(그리고 그 빛)에만 있다.
 */
import { app, type Scene } from '../app';
import { audio } from '../core/audio';
import { clamp, ease, lerp, mulberry32, TAU } from '../core/math';
import { drawFigure, rigidPose, applyIdle, plantLegs, lerpPose, defaultStyle, type Pose, type Joints } from '../gfx/figure';
import { drawFlower, drawGlow, drawPetal, PETAL_COLORS } from '../gfx/flower';
import { drawIcon, type IconName } from '../gfx/icons';
import { drawCrack, INK } from '../gfx/ground';
import { TitleScene } from './title';

const PW = 1200;
const PH = 720;
const GY = 560; // 그림 속 땅 높이
const KR = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
/** 내레이션: 이야기책 같은 명조 (없으면 기본 세리프) */
const SERIF = '"Noto Serif KR", "Noto Serif CJK KR", "Nanum Myeongjo", "AppleMyungjo", "Batang", "BatangChe", serif';
const JOY = PETAL_COLORS[2],
  LONG = PETAL_COLORS[4],
  SAD = PETAL_COLORS[5];

type Fx = 'petals' | 'ash' | 'dust' | 'sparks' | 'rise' | 'swirl' | 'none';
type Draw = (c: CanvasRenderingContext2D, f: CanvasRenderingContext2D) => void;
interface Page {
  lines: string[];
  /** 먼 배경 / 가운데(인물) / 앞쪽 */
  far: Draw;
  mid: Draw;
  near?: Draw;
  fx: Fx;
  /** 카메라: 시작/끝 (중심 x,y 비율, 줌) */
  from: [number, number, number];
  to: [number, number, number];
  /** 꽃잎이 생겨나는 곳 (그림 좌표) */
  src?: [number, number];
}

// ------------------------------------------------------------------
// 그림 도구
// ------------------------------------------------------------------
function sky(c: CanvasRenderingContext2D, top: string, bot: string, y1 = PH) {
  const g = c.createLinearGradient(0, 0, 0, y1);
  g.addColorStop(0, top);
  g.addColorStop(1, bot);
  c.fillStyle = g;
  c.fillRect(0, 0, PW, PH);
}
/** 땅: 위쪽이 살짝 밝은 띠 */
function ground(c: CanvasRenderingContext2D, color = INK, y = GY, rim = '#3a3a38') {
  const g = c.createLinearGradient(0, y, 0, PH);
  g.addColorStop(0, rim);
  g.addColorStop(0.08, color);
  g.addColorStop(1, color);
  c.fillStyle = g;
  c.fillRect(0, y, PW, PH - y);
}
function hills(c: CanvasRenderingContext2D, color: string, y: number, amp: number, seed: number, freq = 0.006) {
  const r = mulberry32(seed);
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(0, PH);
  for (let x = 0; x <= PW + 40; x += 30) c.lineTo(x, y + Math.sin(x * freq + seed) * amp + Math.sin(x * freq * 2.7 + seed * 3) * amp * 0.35 + r() * 3);
  c.lineTo(PW, PH);
  c.closePath();
  c.fill();
}
/** 원근감: 위로 갈수록 옅어지는 안개 띠 */
function haze(c: CanvasRenderingContext2D, y: number, h: number, color: string, a: number) {
  const g = c.createLinearGradient(0, y - h, 0, y + h * 0.3);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, color);
  c.save();
  c.globalAlpha = a;
  c.fillStyle = g;
  c.fillRect(0, y - h, PW, h * 1.3);
  c.restore();
}
/** 흐리게 (작게 그렸다가 크게 늘려 초점이 나간 느낌) */
function blurred(c: CanvasRenderingContext2D, draw: (b: CanvasRenderingContext2D) => void, k = 5, alpha = 1) {
  const b = document.createElement('canvas');
  b.width = PW;
  b.height = PH;
  const bc = b.getContext('2d')!;
  draw(bc);
  // 진짜 흐림 필터를 쓸 수 있으면 쓰고, 아니면 작게 줄였다가 늘린다
  const canFilter = typeof (c as unknown as { filter?: string }).filter === 'string';
  c.save();
  c.globalAlpha = alpha;
  if (canFilter) {
    c.filter = `blur(${k * 2.2}px)`;
    c.drawImage(b, 0, 0);
    c.filter = 'none';
  }
  if (!canFilter || c.filter !== 'none') {
    const sm = document.createElement('canvas');
    sm.width = Math.ceil(PW / k);
    sm.height = Math.ceil(PH / k);
    const sc = sm.getContext('2d')!;
    sc.drawImage(b, 0, 0, sm.width, sm.height);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(sm, 0, 0, PW, PH);
  }
  c.restore();
}
function composite(c: CanvasRenderingContext2D, f: CanvasRenderingContext2D, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  c.drawImage(f.canvas, 0, 0);
  c.restore();
  f.clearRect(0, 0, PW, PH);
}
function icons(c: CanvasRenderingContext2D, list: [IconName, number, number, string?, boolean?][], y = GY) {
  for (const [ic, x, h, col, flip] of list) drawIcon(c, ic, x, y, h, { color: col ?? INK, flip });
}
/** 사람 하나 (투명한 인물 레이어에 그리고 돌려준다) */
function person(f: CanvasRenderingContext2D, x: number, y: number, s: number, setup?: (p: Pose) => void, o: { color?: string; head?: number; flower?: boolean; flowerSize?: number } = {}): Joints {
  const p = rigidPose();
  setup?.(p);
  // 아이콘은 정면 아니면 옆모습뿐: 비스듬한 각도에선 어깨·골반 모서리가 몸 밖으로 튀어나온다
  p.turn = Math.abs(p.turn) < 0.5 ? 0 : Math.sign(p.turn);
  const st = defaultStyle();
  st.color = o.color ?? INK;
  st.farColor = st.color === INK ? '#3c3c3c' : st.color;
  st.headScale = o.head ?? 1;
  return drawFigure(
    f,
    p,
    x,
    y,
    s,
    st,
    o.flower ? { heldArm: p.turn >= 0 ? 0 : 1, held: (cc, hx, hy) => drawFlower(cc, hx, hy + 3, o.flowerSize ?? s * 0.14, PETAL_COLORS, { stem: 1.25 }) } : {},
  );
}
const idle = (facing: number, t = 0, turn = 0.75) => (p: Pose) => {
  applyIdle(p, t, facing, 0);
  p.turn = facing * turn;
};
/** 가슴의 꽃잎 (그 사람의 마음) */
function heart(c: CanvasRenderingContext2D, j: Joints, color: string, s: number, a = 1) {
  const x = lerp(j.hip[0], j.head[0], 0.56),
    y = lerp(j.hip[1], j.head[1], 0.56);
  drawGlow(c, x, y, s * 0.6, [color], 0.75 * a);
  drawPetal(c, x, y + s * 0.02, s * 0.07, color, 0.3, a);
}
function flowerField(c: CanvasRenderingContext2D, seed: number, n: number, y0: number, y1: number, o: { gray?: boolean; wilt?: number; scale?: number } = {}) {
  const r = mulberry32(seed);
  const items = Array.from({ length: n }, () => ({ x: r() * (PW + 60) - 30, y: y0 + r() * (y1 - y0), s: 12 + r() * 14 }));
  items.sort((a, b) => a.y - b.y);
  for (const it of items) {
    const k = (it.y - y0) / Math.max(1, y1 - y0);
    const size = it.s * (0.6 + k * 0.9) * (o.scale ?? 1);
    const petals = o.gray ? Array.from({ length: 5 }, (_, i) => ['#8a8a88', '#9c9c99', '#777775'][i % 3]) : PETAL_COLORS.slice(Math.floor(r() * 3), 4 + Math.floor(r() * 4));
    const wilt = o.wilt ?? 0;
    drawFlower(c, it.x, it.y, size, petals, { stem: 1.4, sway: (r() - 0.5) * 0.3 + wilt * (r() < 0.5 ? 1 : -1), angle: wilt * (r() - 0.2) * 1.2, bloom: o.gray ? 0.6 : 1 });
  }
}
/** 앙상한 나무 */
function deadTree(c: CanvasRenderingContext2D, x: number, y: number, h: number, seed: number, color = INK) {
  const r = mulberry32(seed);
  c.strokeStyle = color;
  c.lineCap = 'round';
  const branch = (x0: number, y0: number, len: number, ang: number, w: number, d: number) => {
    const x1 = x0 + Math.sin(ang) * len,
      y1 = y0 - Math.cos(ang) * len;
    c.lineWidth = w;
    c.beginPath();
    c.moveTo(x0, y0);
    c.quadraticCurveTo((x0 + x1) / 2 + (r() - 0.5) * len * 0.2, (y0 + y1) / 2, x1, y1);
    c.stroke();
    if (d <= 0 || w < 1.5) return;
    const n = 2 + (r() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) branch(x1, y1, len * (0.55 + r() * 0.2), ang + (i - (n - 1) / 2) * (0.5 + r() * 0.3) + (r() - 0.5) * 0.2, w * 0.62, d - 1);
  };
  branch(x, y, h * 0.42, (r() - 0.5) * 0.1, h * 0.06, 5);
}
/** 종이 결: 아주 옅은 얼룩과 섬유 */
function paper(c: CanvasRenderingContext2D, seed: number, a = 0.05) {
  const r = mulberry32(seed);
  c.save();
  for (let i = 0; i < 260; i++) {
    c.globalAlpha = a * (0.4 + r());
    c.fillStyle = r() < 0.5 ? '#000' : '#fff';
    c.fillRect(r() * PW, r() * PH, 1 + r() * 90, 1);
  }
  for (let i = 0; i < 1800; i++) {
    c.globalAlpha = a * 0.8 * r();
    c.fillStyle = r() < 0.5 ? '#000' : '#fff';
    c.fillRect(r() * PW, r() * PH, 1.4, 1.4);
  }
  c.restore();
}
/** 빛줄기 (꽃에서 퍼지는) */
function rays(c: CanvasRenderingContext2D, x: number, y: number, len: number, n: number, colors: readonly string[], a: number, seed: number) {
  const r = mulberry32(seed);
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const ang = r() * TAU;
    const wdt = 0.04 + r() * 0.07;
    const g = c.createRadialGradient(x, y, 0, x, y, len * (0.6 + r() * 0.4));
    g.addColorStop(0, colors[i % colors.length]);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = a * (0.4 + r() * 0.6);
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x, y);
    c.arc(x, y, len, ang - wdt, ang + wdt);
    c.closePath();
    c.fill();
  }
  c.restore();
}
/** 원근이 있는 보도블록 */
function pavement(c: CanvasRenderingContext2D, horizon: number, vpx: number, color: string, line: string) {
  c.fillStyle = color;
  c.fillRect(0, horizon, PW, PH - horizon);
  c.strokeStyle = line;
  c.lineWidth = 2;
  // 가로줄: 멀수록 촘촘
  for (let i = 1; i < 14; i++) {
    const y = horizon + (PH - horizon) * Math.pow(i / 13, 1.8);
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(PW, y);
    c.stroke();
  }
  // 세로줄: 소실점으로
  for (let i = -12; i <= 12; i++) {
    c.beginPath();
    c.moveTo(vpx + i * 8, horizon);
    c.lineTo(vpx + i * 210, PH + 60);
    c.stroke();
  }
}

// ------------------------------------------------------------------
// 페이지
// ------------------------------------------------------------------
const PAGES: Page[] = [
  // 1. 색이 있던 세상: 꽃밭의 정원사와 아이들
  {
    lines: ['아주 먼 옛날, 세상은 색으로 숨 쉬었다.', '사람들은 저마다 가슴에 꽃잎 하나를 품고 살았다.'],
    from: [0.42, 0.5, 1.16],
    to: [0.56, 0.47, 1.04],
    fx: 'petals',
    src: [600, 420],
    far: (c) => {
      sky(c, '#e7e5df', '#f9f7f1');
      // 해와, 꽃밭에서 번지는 색 빛
      drawGlow(c, 880, 210, 520, PETAL_COLORS, 0.28);
      const g = c.createRadialGradient(880, 200, 0, 880, 200, 160);
      g.addColorStop(0, 'rgba(255,255,252,1)');
      g.addColorStop(1, 'rgba(255,255,252,0)');
      c.fillStyle = g;
      c.fillRect(700, 40, 360, 320);
      hills(c, '#d7d5cf', 420, 30, 3, 0.004);
      icons(c, [['tree2', 180, 70, '#ccc9c3'], ['pine', 260, 60, '#ccc9c3'], ['tree2', 1010, 80, '#ccc9c3']], 430);
      haze(c, 440, 80, '#f3f1eb', 0.7);
      hills(c, '#b9b7b1', 470, 24, 7);
      icons(c, [['tree2', 120, 120, '#aaa8a2'], ['tree2', 1100, 110, '#aaa8a2', true]], 485);
      haze(c, 500, 60, '#ece9e3', 0.55);
      hills(c, '#8e8c87', 525, 16, 11);
      paper(c, 1);
    },
    mid: (c, f) => {
      ground(c, '#2e2e2c', GY, '#4a4a47');
      flowerField(c, 11, 110, GY - 30, GY + 20);
      // 정원사: 물뿌리개로 꽃밭에 물을 준다
      const jg = person(f, 470, GY + 34, 236, (p) => {
        applyIdle(p, 0.4, 1, 0);
        p.turn = 1;
        p.lean = 0.16;
        p.headTilt = 0.22;
        p.arms[0].a = 1.15;
        p.arms[0].b = 0.35;
      });
      // 아이: 떠다니는 꽃잎에 손을 뻗는다
      const jk = person(f, 640, GY + 40, 128, (p) => {
        applyIdle(p, 1.2, -1, 0);
        p.turn = -0.7;
        p.headTilt = -0.35;
        p.arms[1].a = 2.5;
        p.arms[1].b = 0.2;
        p.arms[0].a = 0.4;
      }, { head: 1.3 });
      // 손잡은 두 사람
      const ja = person(f, 820, GY + 30, 214, (p) => {
        applyIdle(p, 2, 1, 0);
        p.turn = 0.55;
        p.arms[0].a = 0.55;
        p.arms[0].b = 0.15;
      });
      const jb = person(f, 900, GY + 30, 200, (p) => {
        applyIdle(p, 2.6, -1, 0);
        p.turn = -0.55;
        p.headTilt = 0.15;
        p.arms[1].a = 0.55;
        p.arms[1].b = 0.15;
      });
      composite(c, f);
      // 물뿌리개
      const [wx, wy] = jg.hand[0];
      c.fillStyle = INK;
      c.beginPath();
      c.roundRect(wx - 8, wy - 6, 44, 30, 6);
      c.fill();
      c.beginPath();
      c.moveTo(wx + 34, wy);
      c.lineTo(wx + 74, wy - 22);
      c.lineTo(wx + 78, wy - 16);
      c.lineTo(wx + 36, wy + 12);
      c.closePath();
      c.fill();
      c.fillStyle = 'rgba(210,214,220,0.8)';
      for (let i = 0; i < 6; i++) c.fillRect(wx + 76 + i * 5, wy - 10 + i * 16, 2.5, 8);
      heart(c, jg, PETAL_COLORS[3], 236);
      heart(c, jk, JOY, 128);
      heart(c, ja, PETAL_COLORS[0], 214);
      heart(c, jb, PETAL_COLORS[6], 200);
      flowerField(c, 23, 34, GY + 60, PH - 30, { scale: 1.3 });
    },
    near: (c) => {
      blurred(c, (b) => {
        drawFlower(b, 50, PH + 60, 120, PETAL_COLORS, { stem: 1.5, sway: 0.2 });
        drawFlower(b, 1160, PH + 80, 130, PETAL_COLORS.slice(2), { stem: 1.6, sway: -0.25 });
      }, 7, 0.75);
    },
  },
  // 2. 색은 곧 마음: 기쁨 · 그리움 · 슬픔 (카메라가 차례로 비춘다)
  {
    lines: ['기쁨은 노랗게 번졌고, 그리움은 푸르게 멀어졌다.', '슬픔마저도, 누군가의 빛깔이었다.'],
    // 기쁨에 다가가 있다가, 천천히 물러나 세 마음을 한 화면에
    from: [0.21, 0.5, 1.6],
    to: [0.5, 0.5, 1.0],
    fx: 'petals',
    src: [600, 380],
    far: (c) => {
      sky(c, '#e3e1db', '#f4f2ec');
      hills(c, '#c9c7c1', 455, 22, 5, 0.005);
      haze(c, 470, 70, '#f0eee8', 0.6);
      hills(c, '#a4a29d', 505, 18, 9);
      paper(c, 2);
    },
    mid: (c, f) => {
      ground(c, '#2e2e2c', GY, '#4a4a47');
      flowerField(c, 4, 40, GY - 10, GY + 30);
      // 기쁨: 두 팔을 들고 뛰어오른 아이
      drawGlow(c, 250, 380, 300, [JOY], 0.55);
      const j1 = person(f, 250, GY - 30, 170, (p) => {
        // 정면: 두 팔을 V자로 번쩍, 다리는 살짝 벌려 뛰어오른다
        p.turn = 0;
        p.headTilt = -0.12;
        p.arms[0].a = p.arms[1].a = 2.45;
        p.arms[0].b = p.arms[1].b = 0.12;
        p.legs[0].a = p.legs[1].a = 0.24;
      }, { head: 1.3 });
      // 그리움: 멀리 언덕 위 작은 사람을 바라본다
      drawGlow(c, 600, 400, 300, [LONG], 0.5);
      const j2 = person(f, 560, GY + 10, 230, (p) => {
        applyIdle(p, 0, 1, 0);
        p.turn = 1;
        p.headTilt = -0.12;
        p.arms[0].a = 0.85;
        p.arms[0].b = 0.6;
      });
      person(f, 760, 500, 54, idle(-1, 0, 0.6), { color: '#8f8d88' });
      // 슬픔: 무릎을 끌어안고 앉았다
      drawGlow(c, 960, 470, 300, [SAD], 0.5);
      const j3 = person(f, 960, GY + 10, 220, (p) => {
        p.turn = -0.85;
        p.crouch = 0.33;
        plantLegs(p, 0.07);
        p.lean = 0.55;
        p.headTilt = 0.6;
        p.arms[0].a = 1.0;
        p.arms[1].a = 1.0;
        p.arms[0].b = 1.6;
        p.arms[1].b = 1.6;
      });
      composite(c, f);
      heart(c, j1, JOY, 170);
      heart(c, j2, LONG, 230);
      heart(c, j3, SAD, 220);
      // 기쁨의 꽃잎은 터지고, 그리움은 저 멀리로 흐르고, 슬픔은 하나 떨어진다
      const r = mulberry32(7);
      for (let i = 0; i < 18; i++) {
        const a = r() * TAU,
          d = 70 + r() * 110;
        drawPetal(c, 250 + Math.cos(a) * d, 330 + Math.sin(a) * d * 0.8, 10 + r() * 8, [JOY, PETAL_COLORS[1], PETAL_COLORS[6]][i % 3], r() * TAU);
      }
      for (let i = 0; i < 9; i++) {
        const k = i / 8;
        drawPetal(c, lerp(610, 750, k), lerp(380, 470, k) - Math.sin(k * Math.PI) * 50, 11 - k * 5, LONG, k * 3, 1 - k * 0.6);
      }
      drawPetal(c, 1030, 400, 14, SAD, 1.2);
      flowerField(c, 14, 22, GY + 70, PH - 30, { scale: 1.2 });
    },
    near: (c) => {
      blurred(c, (b) => {
        drawFlower(b, 420, PH + 80, 120, [JOY, PETAL_COLORS[1]], { stem: 1.5, sway: 0.15 });
        drawFlower(b, 800, PH + 90, 110, [LONG, PETAL_COLORS[3]], { stem: 1.5, sway: -0.1 });
      }, 7, 0.7);
    },
  },
  // 3. 꽃밭이 시들었다
  {
    lines: ['그러던 어느 해, 꽃들이 소리 없이 고개를 떨구었다.', '색이 하나 바랠 때마다, 마음도 함께 아팠다.'],
    from: [0.5, 0.55, 1.18],
    to: [0.47, 0.5, 1.03],
    fx: 'ash',
    far: (c) => {
      sky(c, '#7e7d79', '#b4b3ae');
      // 낮게 깔린 구름
      const r = mulberry32(12);
      for (let i = 0; i < 9; i++) {
        c.fillStyle = `rgba(60,60,58,${0.12 + r() * 0.12})`;
        c.beginPath();
        c.ellipse(r() * PW, 60 + r() * 200, 200 + r() * 260, 26 + r() * 24, 0, 0, TAU);
        c.fill();
      }
      hills(c, '#6f6e6a', 470, 26, 2);
      haze(c, 490, 70, '#9a9995', 0.5);
      hills(c, '#525250', 520, 14, 6);
      paper(c, 3, 0.07);
    },
    mid: (c, f) => {
      ground(c, '#1c1c1b', GY, '#353533');
      deadTree(c, 900, GY + 6, 520, 4, '#151515');
      flowerField(c, 31, 70, GY - 20, GY + 30, { gray: true, wilt: 0.9 });
      // 무릎 꿇은 정원사: 손에는 마지막 한 송이만 색이 남았다
      const j = person(f, 560, GY + 40, 236, (p) => {
        p.turn = 0.75;
        p.crouch = 0.2;
        plantLegs(p, 0.05);
        p.legs[1].a = 1.35;
        p.legs[1].b = 1.9;
        p.lean = 0.42;
        p.headTilt = 0.5;
        p.arms[0].a = 0.95;
        p.arms[0].b = 0.9;
        p.arms[1].a = 0.25;
      });
      composite(c, f);
      const [hx, hy] = j.hand[0];
      drawGlow(c, hx, hy - 30, 150, PETAL_COLORS, 0.9);
      drawFlower(c, hx, hy + 3, 30, PETAL_COLORS.slice(0, 4), { stem: 1.25, sway: 0.25 });
      // 떨어지는 마지막 꽃잎들 (이미 바랬다)
      drawPetal(c, hx + 40, hy + 30, 10, '#9a9995', 2.1);
      drawPetal(c, hx + 70, hy + 80, 9, '#8a8985', 0.7);
      flowerField(c, 35, 26, GY + 70, PH - 20, { gray: true, wilt: 1.1, scale: 1.3 });
    },
    near: (c) => {
      blurred(c, (b) => {
        b.strokeStyle = '#121212';
        b.lineCap = 'round';
        for (const [x, h, bend] of [[80, 260, 0.6], [140, 200, -0.4], [1120, 300, -0.7], [1060, 220, 0.5]] as const) {
          b.lineWidth = 14;
          b.beginPath();
          b.moveTo(x, PH + 20);
          b.quadraticCurveTo(x + bend * 60, PH - h * 0.6, x + bend * 140, PH - h * 0.7);
          b.stroke();
        }
      }, 6);
    },
  },
  // 4. 아무것도 느끼지 않기로 했다: 왼쪽은 사람, 오른쪽으로 갈수록 아이콘
  {
    lines: ['사람들은 더는 아프고 싶지 않았다.', '그래서 — 느끼기를, 그만두었다.'],
    from: [0.38, 0.5, 1.2],
    to: [0.62, 0.5, 1.2],
    fx: 'rise',
    far: (c) => {
      sky(c, '#d8d6d0', '#e9e8e4');
      // 왼쪽에만 남은 따뜻한 빛
      const g = c.createLinearGradient(0, 0, PW, 0);
      g.addColorStop(0, 'rgba(255,214,150,0.18)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(90,100,110,0.14)');
      c.fillStyle = g;
      c.fillRect(0, 0, PW, PH);
      hills(c, '#c2c1bc', 500, 10, 4, 0.003);
      paper(c, 4);
    },
    mid: (c, f) => {
      ground(c, '#1a1a19', GY, '#3a3a38');
      const N = 7;
      const loose = (i: number) => (p: Pose) => {
        applyIdle(p, i * 1.3, i % 2 ? -1 : 1, 0);
        p.turn = (i % 2 ? -1 : 1) * 0.5;
        p.lean = 0.08 * (i % 2 ? -1 : 1);
        p.headTilt = 0.25 + (i % 3) * 0.1;
        p.arms[0].a = 0.3 + (i % 3) * 0.15;
        p.arms[1].a = -0.25;
      };
      for (let i = 0; i < N; i++) {
        const k = i / (N - 1);
        const x = 140 + i * 152;
        const s = i % 3 === 1 ? 150 : 210 - (i % 2) * 12;
        const j = person(f, x, GY + 4, s, (p) => {
          const a = rigidPose();
          loose(i)(a);
          const out = lerpPose(a, rigidPose(), ease.inOutSine(k));
          Object.assign(p, out);
        }, { head: i % 3 === 1 ? 1.3 : 1 });
        composite(c, f);
        const col = PETAL_COLORS[i % 7];
        if (k < 0.35) heart(c, j, col, s);
        else if (k < 0.9) {
          // 꽃잎이 가슴을 떠나 위로 오르며 바랜다
          const up = (k - 0.35) / 0.55;
          const px = lerp(j.hip[0], j.head[0], 0.56) + Math.sin(i) * 14;
          const py = lerp(j.head[1] - 20, j.head[1] - 170, up);
          drawPetal(c, px, py, 12, up < 0.5 ? col : '#a3a29e', i, 1 - up * 0.6);
        }
      }
    },
  },
  // 5. 세상은 표지판이 되었다: 소실점으로 뻗은 길
  {
    lines: ['세상은 반듯하고, 조용하고, 흑백이 되었다.', '아무도 다치지 않았다. 아무도 웃지 않았다.'],
    from: [0.5, 0.5, 1.25],
    to: [0.5, 0.48, 1.05],
    fx: 'none',
    far: (c) => {
      sky(c, '#cbcbc8', '#ececE9'.toLowerCase());
      // 멀리 줄 맞춰 선 건물들
      for (let i = 0; i < 16; i++) {
        const x = 40 + i * 75;
        const h = 90 + ((i * 37) % 5) * 26;
        drawIcon(c, (['office', 'tower', 'building'] as IconName[])[i % 3], x, 430, h, { color: '#bdbdba' });
      }
      haze(c, 440, 90, '#e2e2df', 0.8);
      paper(c, 5);
    },
    mid: (c, f) => {
      const VP = 600,
        HZ = 430;
      // 길
      c.fillStyle = '#1a1a19';
      c.fillRect(0, HZ, PW, PH - HZ);
      c.fillStyle = '#2a2a29';
      c.beginPath();
      c.moveTo(VP - 30, HZ);
      c.lineTo(VP + 30, HZ);
      c.lineTo(PW + 300, PH);
      c.lineTo(-300, PH);
      c.closePath();
      c.fill();
      c.fillStyle = '#d6d6d2';
      for (let i = 0; i < 9; i++) {
        const k0 = Math.pow(i / 9, 1.7),
          k1 = Math.pow((i + 0.45) / 9, 1.7);
        const y0 = lerp(HZ, PH, k0),
          y1 = lerp(HZ, PH, k1);
        const w0 = lerp(1, 12, k0),
          w1 = lerp(1, 12, k1);
        c.beginPath();
        c.moveTo(VP - w0, y0);
        c.lineTo(VP + w0, y0);
        c.lineTo(VP + w1, y1);
        c.lineTo(VP - w1, y1);
        c.closePath();
        c.fill();
      }
      // 길가: 원근에 맞춘 건물, 표지 기둥, 사람
      const at = (k: number, side: number) => ({ x: lerp(VP, VP + side * 760, k), y: lerp(HZ, PH + 40, k), s: lerp(0.08, 1.25, k) });
      for (const k of [0.1, 0.2, 0.33, 0.5, 0.72]) {
        for (const side of [-1, 1]) {
          const q = at(k, side * 1.25);
          drawIcon(c, (['building', 'office', 'tower'] as IconName[])[Math.floor(k * 10) % 3], q.x, q.y - 10 * q.s, 380 * q.s, { color: '#6f6f6d' });
        }
      }
      const signs: IconName[] = ['info', 'warning', 'toiletSign', 'phone', 'signpost', 'warning'];
      [0.16, 0.28, 0.42, 0.6, 0.82].forEach((k, i) => {
        for (const side of [-1, 1]) {
          const q = at(k, side * 0.78);
          c.fillStyle = INK;
          c.fillRect(q.x - 4 * q.s, q.y - 300 * q.s, 8 * q.s, 300 * q.s);
          c.fillStyle = '#e8e8e5';
          c.fillRect(q.x - 46 * q.s, q.y - 390 * q.s, 92 * q.s, 92 * q.s);
          drawIcon(c, signs[(i + (side > 0 ? 1 : 0)) % signs.length], q.x, q.y - 306 * q.s, 74 * q.s, { color: INK });
        }
      });
      [0.12, 0.22, 0.34, 0.48, 0.66, 0.88].forEach((k, i) => {
        for (const side of [-1, 1]) {
          const q = at(k, side * 0.52);
          person(f, q.x, q.y, 200 * q.s, undefined, { head: (i + (side > 0 ? 1 : 0)) % 4 === 2 ? 1.3 : 1 });
        }
      });
      composite(c, f);
    },
    near: (c) => {
      blurred(c, (b) => {
        b.fillStyle = '#101010';
        b.fillRect(1110, -40, 26, PH + 80);
        b.fillStyle = '#e6e6e3';
        b.fillRect(1040, 120, 170, 170);
        drawIcon(b, 'warning', 1125, 270, 130, { color: INK });
      }, 5);
    },
  },
  // 6. 아주 오랜 시간이 흘렀다: 하늘에 남은 해의 궤적
  {
    lines: ['해가 뜨고 지기를 셀 수 없이 되풀이하는 동안,', '먼지는 쌓였고, 누구도 고개를 들지 않았다.'],
    from: [0.5, 0.42, 1.04],
    to: [0.5, 0.55, 1.14],
    fx: 'dust',
    far: (c) => {
      sky(c, '#8e8e8b', '#b9b9b6');
      // 해가 수없이 뜨고 진 자리
      c.strokeStyle = 'rgba(240,240,236,0.42)';
      c.lineWidth = 2.5;
      for (let i = 0; i < 9; i++) {
        c.setLineDash([3, 9]);
        c.beginPath();
        c.ellipse(600, 560, 560 - i * 34, 420 - i * 30, 0, Math.PI, TAU);
        c.stroke();
      }
      c.setLineDash([]);
      drawIcon(c, 'clock', 600, 330, 210, { color: 'rgba(60,60,58,0.18)' });
      icons(c, [['office', 250, 340, '#6f6f6c'], ['tower', 880, 400, '#6f6f6c'], ['building', 1060, 280, '#767673']], GY - 30);
      haze(c, GY - 20, 100, '#9f9f9c', 0.6);
      paper(c, 6, 0.08);
    },
    mid: (c, f) => {
      ground(c, '#151515', GY, '#2b2b2a');
      // 금이 번진 바닥
      for (let i = 0; i < 7; i++) drawCrack(c, 120 + i * 160, GY + 30 + (i % 3) * 40, 100 + (i % 2) * 60, i + 3);
      icons(c, [['lamp', 610, 300, '#141414']]);
      const js = [person(f, 430, GY, 158), person(f, 790, GY, 150), person(f, 300, GY, 104, undefined, { head: 1.3 })];
      composite(c, f);
      // 머리와 어깨에 내려앉은 먼지
      c.fillStyle = 'rgba(170,170,166,0.55)';
      for (const j of js) {
        c.beginPath();
        c.ellipse(j.head[0], j.head[1] - j.headR * 0.55, j.headR * 0.75, j.headR * 0.3, 0, Math.PI, TAU);
        c.fill();
      }
    },
    near: (c) => {
      blurred(c, (b) => {
        const r = mulberry32(66);
        b.fillStyle = 'rgba(205,205,200,0.5)';
        for (let i = 0; i < 24; i++) {
          b.beginPath();
          b.arc(r() * PW, r() * PH, 5 + r() * 10, 0, TAU);
          b.fill();
        }
      }, 6, 0.8);
    },
  },
  // 7. 보도블록 틈의 꽃 (낮은 시점)
  {
    lines: ['그리고 어느 날, 갈라진 보도블록 틈으로', '아주 작은 색 하나가 고개를 내밀었다.'],
    from: [0.5, 0.64, 1.3],
    to: [0.5, 0.66, 1.06],
    fx: 'sparks',
    src: [604, 560],
    far: (c) => {
      sky(c, '#c9c9c6', '#dededb');
      blurred(c, (b) => {
        icons(b, [['house', 220, 300, '#8d8d8a'], ['lamp', 470, 380, '#6d6d6a'], ['office', 900, 420, '#9c9c99']], 470);
        for (const [x, s] of [[330, 190], [700, 200], [1050, 180]] as const) {
          const st = defaultStyle();
          st.color = '#5a5a58';
          st.farColor = '#5a5a58';
          drawFigure(b, rigidPose(), x, 470, s, st);
        }
      }, 7);
      paper(c, 7);
    },
    mid: (c) => {
      pavement(c, 470, 604, '#202020', '#3a3a38');
      // 꽃빛이 둘레의 블록을 물들인다
      c.save();
      c.globalCompositeOperation = 'lighter';
      drawGlow(c, 604, 600, 340, PETAL_COLORS, 0.45);
      c.restore();
      drawCrack(c, 604, 640, 220, 4);
      drawCrack(c, 560, 680, 120, 9);
      rays(c, 604, 520, 420, 14, PETAL_COLORS, 0.18, 3);
      drawGlow(c, 604, 520, 220, PETAL_COLORS, 1.4);
      drawFlower(c, 604, 646, 64, PETAL_COLORS, { stem: 2.0, sway: 0.05 });
    },
    near: (c) => {
      // 지나가는 사람들의 다리 (초점 밖)
      blurred(c, (b) => {
        b.fillStyle = '#0c0c0c';
        for (const x of [120, 210, 990, 1080]) {
          b.beginPath();
          b.roundRect(x, -60, 78, PH + 30, 38);
          b.fill();
        }
      }, 6);
    },
  },
  // 8. 굳어 있던 한 주민이 손을 뻗었다
  {
    lines: ['굳어 있던 한 사람이, 까닭도 모른 채', '그 작은 빛을 향해 몸을 굽혔다.'],
    from: [0.5, 0.56, 1.18],
    to: [0.58, 0.64, 1.42],
    fx: 'sparks',
    src: [700, 540],
    far: (c) => {
      sky(c, '#c4c4c1', '#e0e0dd');
      blurred(c, (b) => {
        icons(b, [['house', 160, 300, '#a7a7a4'], ['tree', 1040, 320, '#a7a7a4']], GY - 10);
        for (const [x, s] of [[150, 200], [1100, 196], [320, 170]] as const) {
          const st = defaultStyle();
          st.color = '#77777a';
          st.farColor = '#77777a';
          drawFigure(b, rigidPose(), x, GY, s, st);
        }
      }, 5);
      paper(c, 8);
    },
    mid: (c, f) => {
      ground(c, INK, GY, '#2c2c2b');
      // 허리만 뻣뻣하게 굽혀, 처음으로 손을 내민다
      const j = person(f, 560, GY, 290, (p) => {
        // 다리는 굳은 채 곧게, 허리만 굽는다
        p.turn = 1;
        p.lean = 0.7;
        p.legs[0].a = 0.06;
        p.legs[1].a = -0.04;
        p.headTilt = 0.35;
        p.arms[0].a = 1.05;
        p.arms[0].b = 0.12;
        p.arms[1].a = 0.25;
      });
      composite(c, f);
      const [hx, hy] = j.hand[0];
      // 손끝과 꽃 사이 아주 작은 틈
      const fx = hx + 18;
      drawCrack(c, fx, GY, 100, 2);
      drawGlow(c, fx, hy + 20, 230, PETAL_COLORS, 1.3);
      drawFlower(c, fx, GY + 2, 44, PETAL_COLORS, { stem: Math.max(0.6, (GY - hy - 26) / 44) });
      // 꽃빛이 손끝을 물들인다
      c.save();
      c.globalCompositeOperation = 'lighter';
      drawGlow(c, hx, hy, 50, [PETAL_COLORS[2], PETAL_COLORS[6]], 0.6);
      c.restore();
    },
  },
  // 9. 관절이 처음으로 풀렸다
  {
    lines: ['손끝에 색이 닿는 순간, 굳은 관절이 풀리고', '멈춰 있던 마음이 — 다시, 뛰기 시작했다.'],
    from: [0.5, 0.52, 1.02],
    to: [0.5, 0.47, 1.2],
    fx: 'swirl',
    src: [600, 400],
    far: (c) => {
      sky(c, '#d0d0cd', '#ebebe8');
      rays(c, 600, 380, 900, 22, PETAL_COLORS, 0.22, 9);
      paper(c, 9);
    },
    mid: (c, f) => {
      ground(c, INK, GY, '#2c2c2b');
      // 땅을 따라 퍼지는 색의 물결
      for (let i = 0; i < 7; i++) {
        c.save();
        c.strokeStyle = PETAL_COLORS[i];
        c.globalAlpha = 0.65 - i * 0.07;
        c.lineWidth = 7 - i * 0.6;
        c.beginPath();
        c.ellipse(600, GY + 10, 120 + i * 90, 18 + i * 13, 0, 0, TAU);
        c.stroke();
        c.restore();
      }
      person(f, 230, GY, 172, undefined, { color: '#5e5e5c' });
      person(f, 980, GY, 166, undefined, { color: '#5e5e5c' });
      person(f, 1100, GY, 112, undefined, { color: '#6b6b69', head: 1.3 });
      // 꽃빛은 인물 뒤에서 번진다
      drawGlow(c, 640, 360, 300, PETAL_COLORS, 1.0);
      const j = person(f, 600, GY, 290, (p) => {
        applyIdle(p, 0.6, 1, 0);
        // 정면: 꽃 든 팔은 높이 들고, 다른 팔도 몸에서 풀려 벌어진다
        p.turn = 0;
        p.headTilt = -0.18;
        p.arms[0].a = 1.85;
        p.arms[0].b = 0.45;
        p.arms[1].a = 0.42;
        p.arms[1].b = 0;
      }, { flower: true, flowerSize: 40 });
      composite(c, f);
      const [hx, hy] = j.hand[0];
      drawGlow(c, hx, hy - 34, 90, PETAL_COLORS, 0.9);
    },
    near: (c) => {
      blurred(c, (b) => {
        const r = mulberry32(91);
        for (let i = 0; i < 12; i++) drawPetal(b, r() * PW, r() * PH, 26 + r() * 20, PETAL_COLORS[i % 7], r() * TAU, 0.8);
      }, 5);
    },
  },
];

const CPS = 18; // 초당 글자 수
const PAR = [0.55, 1, 1.45]; // 겹마다 움직이는 정도

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  vr: number;
  life: number;
  max: number;
  color: string;
}

export class StoryScene implements Scene {
  /** 구운 그림 (페이지마다 [먼 배경, 가운데, 앞쪽]) — 필요할 때 굽는다 */
  private baked = new Map<number, HTMLCanvasElement[]>();
  private page = 0;
  private prev = -1;
  private prevT = 0;
  private prevK = 1;
  private t = 0;
  private chars = 0;
  private fadeOut = -1;
  private skipArmed = 0;
  private blipI = 0;
  private tapped = false;
  private motes: Mote[] = [];
  private onTap = () => (this.tapped = true);
  private fig: CanvasRenderingContext2D;

  constructor() {
    const fig = document.createElement('canvas');
    fig.width = PW;
    fig.height = PH;
    this.fig = fig.getContext('2d')!;
    this.bake(0);
    this.bake(1);
  }

  /** (테스트용) 모든 그림을 합친 모습 */
  get images(): HTMLCanvasElement[] {
    return PAGES.map((_, i) => {
      const L = this.bake(i);
      const cv = document.createElement('canvas');
      cv.width = PW;
      cv.height = PH;
      const c = cv.getContext('2d')!;
      for (const l of L) c.drawImage(l, 0, 0);
      return cv;
    });
  }

  private bake(i: number): HTMLCanvasElement[] {
    const got = this.baked.get(i);
    if (got) return got;
    const p = PAGES[i];
    const out: HTMLCanvasElement[] = [];
    for (const d of [p.far, p.mid, p.near]) {
      const cv = document.createElement('canvas');
      cv.width = PW;
      cv.height = PH;
      if (d) {
        this.fig.clearRect(0, 0, PW, PH);
        d(cv.getContext('2d')!, this.fig);
      }
      out.push(cv);
    }
    this.baked.set(i, out);
    // 오래된 그림은 버린다 (메모리)
    for (const k of [...this.baked.keys()]) if (k < i - 2) this.baked.delete(k);
    return out;
  }

  enter() {
    app.input.setTouchVisible(false);
    audio.loop('music', 'music_despair', 0.5, 4, 'music');
    audio.loop('wind', 'amb_wind', 0.3, 3);
    setTimeout(() => window.addEventListener('pointerdown', this.onTap), 0);
  }

  exit() {
    window.removeEventListener('pointerdown', this.onTap);
  }

  private textOf(i: number) {
    return PAGES[i].lines.join('\n');
  }
  private get text() {
    return this.textOf(this.page);
  }
  private durOf(i: number) {
    return 0.9 + this.textOf(i).length / CPS + 3.2;
  }

  private finish() {
    if (this.fadeOut < 0) this.fadeOut = 0;
  }

  update(dt: number) {
    const inp = app.input;
    this.t += dt;
    this.prevT += dt;
    this.skipArmed = Math.max(0, this.skipArmed - dt);
    this.updateMotes(dt);
    if (this.fadeOut >= 0) {
      this.fadeOut += dt;
      if (this.fadeOut > 1.6) {
        audio.stopLoop('wind', 2);
        app.setScene(new TitleScene(undefined, 0));
      }
      return;
    }
    // 이미지가 나타난 뒤 글자가 찍힌다
    const full = this.text.length;
    if (this.t > 0.9) {
      const before = Math.floor(this.chars);
      this.chars = Math.min(full, this.chars + dt * CPS);
      const now = Math.floor(this.chars);
      for (let i = before; i < now; i++) {
        const ch = this.text[i];
        if (ch && ch !== ' ' && ch !== '\n' && this.blipI++ % 2 === 0) audio.play('click5', { vol: 0.12, rate: 1.9, vary: 0.05 });
      }
    }
    const advance = inp.pressed('confirm') || inp.pressed('interact') || inp.pressed('jump') || this.tapped;
    this.tapped = false;
    if (inp.pressed('back') || inp.pressed('pause')) {
      if (this.skipArmed > 0) this.finish();
      else this.skipArmed = 2.5;
    }
    if (advance) {
      if (this.chars < full) this.chars = full;
      else this.next();
    }
    // 다 읽고 잠시 뒤 자동으로 넘어감
    if (this.chars >= full && this.t > this.durOf(this.page)) this.next();
    inp.consumeAll();
  }

  private next() {
    if (this.page >= PAGES.length - 1) {
      this.finish();
      return;
    }
    // 이전 장면은 그 자리에서 천천히 사라진다
    this.prev = this.page;
    this.prevK = ease.inOutSine(clamp(this.t / this.durOf(this.page)));
    this.prevT = 0;
    this.page++;
    this.t = 0;
    this.chars = 0;
    this.motes = [];
    this.bake(this.page);
    if (this.page + 1 < PAGES.length) this.bake(this.page + 1);
    audio.play('paper_crush', { vol: 0.12, rate: 1.4 });
  }

  // ---------------- 떠다니는 것들 ----------------
  private updateMotes(dt: number) {
    const p = PAGES[this.page];
    const r = Math.random;
    const want = { petals: 26, ash: 70, dust: 60, sparks: 30, rise: 14, swirl: 40, none: 0 }[p.fx];
    if (this.motes.length < want && r() < dt * want * 1.2) {
      const [sx, sy] = p.src ?? [PW / 2, PH / 2];
      const m: Mote = { x: r() * PW, y: r() * PH, vx: 0, vy: 0, r: 3, rot: r() * TAU, vr: (r() - 0.5) * 2, life: 0, max: 4 + r() * 4, color: PETAL_COLORS[Math.floor(r() * 7)] };
      if (p.fx === 'petals') {
        m.x = sx + (r() - 0.5) * 900;
        m.y = sy - 200 - r() * 200;
        m.vx = 18 + r() * 30;
        m.vy = 12 + r() * 22;
        m.r = 7 + r() * 7;
      } else if (p.fx === 'ash') {
        m.vy = 18 + r() * 30;
        m.vx = -10 + r() * 20;
        m.y = -10;
        m.r = 1.5 + r() * 2.5;
        m.color = '#5c5c59';
      } else if (p.fx === 'dust') {
        m.vx = 4 + r() * 10;
        m.vy = -3 + r() * 6;
        m.r = 1 + r() * 2;
        m.color = '#d9d9d5';
        m.max = 6 + r() * 6;
      } else if (p.fx === 'sparks') {
        const a = r() * TAU,
          d = 20 + r() * 120;
        m.x = sx + Math.cos(a) * d;
        m.y = sy + Math.sin(a) * d * 0.6;
        m.vy = -14 - r() * 20;
        m.r = 1.5 + r() * 2.5;
        m.max = 1.5 + r() * 2;
      } else if (p.fx === 'rise') {
        m.x = 200 + r() * 800;
        m.y = GY - 200 - r() * 100;
        m.vy = -12 - r() * 10;
        m.vx = (r() - 0.5) * 8;
        m.r = 8 + r() * 4;
        m.color = '#a8a7a3';
      } else if (p.fx === 'swirl') {
        m.x = sx;
        m.y = sy;
        const a = r() * TAU;
        m.vx = Math.cos(a) * (80 + r() * 140);
        m.vy = Math.sin(a) * (50 + r() * 90) - 40;
        m.r = 6 + r() * 8;
        m.max = 3 + r() * 3;
      }
      this.motes.push(m);
    }
    for (const m of this.motes) {
      m.life += dt;
      if (p.fx === 'petals') {
        m.vx += Math.sin(m.life * 1.3 + m.rot) * 8 * dt;
      } else if (p.fx === 'swirl') {
        // 꽃을 중심으로 돌며 오른다
        const dx = m.x - (p.src?.[0] ?? 600),
          dy = m.y - (p.src?.[1] ?? 400);
        m.vx += -dy * 0.9 * dt - m.vx * 0.4 * dt;
        m.vy += dx * 0.5 * dt - 14 * dt - m.vy * 0.4 * dt;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.rot += m.vr * dt;
    }
    this.motes = this.motes.filter((m) => m.life < m.max && m.y < PH + 40 && m.y > -60);
  }

  private drawMotes(ctx: CanvasRenderingContext2D, map: (x: number, y: number) => [number, number], scale: number, alpha: number) {
    const fx = PAGES[this.page].fx;
    for (const m of this.motes) {
      const a = alpha * Math.min(1, m.life / 0.6, (m.max - m.life) / 0.8);
      if (a <= 0) continue;
      const [x, y] = map(m.x, m.y);
      if (fx === 'petals' || fx === 'swirl' || fx === 'rise') drawPetal(ctx, x, y, m.r * scale, m.color, m.rot, a);
      else {
        ctx.save();
        ctx.globalAlpha = a * (fx === 'sparks' ? 0.9 : 0.6);
        ctx.fillStyle = fx === 'sparks' ? m.color : m.color;
        if (fx === 'sparks') ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath();
        ctx.arc(x, y, m.r * scale, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // ---------------- 그리기 ----------------
  /** 한 장면을 카드 안에 그린다 (k = 카메라 진행 0..1) */
  private drawPage(ctx: CanvasRenderingContext2D, i: number, k: number, alpha: number, box: { fx: number; fy: number; fw: number; fh: number }, motes: boolean) {
    const p = PAGES[i];
    const L = this.bake(i);
    const cx = lerp(p.from[0], p.to[0], k) * PW;
    const cy = lerp(p.from[1], p.to[1], k) * PH;
    const z = lerp(p.from[2], p.to[2], k);
    const { fx, fy, fw, fh } = box;
    ctx.save();
    ctx.beginPath();
    ctx.rect(fx, fy, fw, fh);
    ctx.clip();
    ctx.globalAlpha = alpha;
    let mainMap: (x: number, y: number) => [number, number] = (x, y) => [x, y];
    let mainScale = 1;
    L.forEach((img, li) => {
      const par = PAR[li];
      const zl = 1 + (z - 1) * par;
      const sw = PW / zl;
      const sh = (sw * fh) / fw;
      const lcx = PW / 2 + (cx - PW / 2) * par;
      const lcy = PH / 2 + (cy - PH / 2) * par;
      const sx = clamp(lcx - sw / 2, 0, PW - sw);
      const sy = clamp(lcy - sh / 2, 0, PH - sh);
      ctx.drawImage(img, sx, sy, sw, sh, fx, fy, fw, fh);
      if (li === 1) {
        const sc = fw / sw;
        mainScale = sc;
        mainMap = (x, y) => [fx + (x - sx) * sc, fy + (y - sy) * sc];
      }
    });
    if (motes) this.drawMotes(ctx, mainMap, mainScale, alpha);
    // 카드 안쪽 가장자리가 은은하게 어둡다
    const vg = ctx.createRadialGradient(fx + fw / 2, fy + fh / 2, fh * 0.35, fx + fw / 2, fy + fh / 2, fw * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = vg;
    ctx.fillRect(fx, fy, fw, fh);
    ctx.restore();
  }

  render(dt: number) {
    const s = app.screen;
    const ctx = s.ctx;
    s.base(ctx);
    ctx.fillStyle = '#050505';
    ctx.fillRect(-10, -10, s.W + 20, s.H + 20);
    const p = PAGES[this.page];
    // 그림 틀
    const fw = Math.min(s.W * 0.66, 1120);
    const fh = fw * 0.6;
    const fx = (s.W - fw) / 2;
    const fy = s.H * 0.08;
    const box = { fx, fy, fw, fh };
    // 틀 그림자
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 50;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(fx, fy, fw, fh);
    ctx.restore();
    const k = ease.inOutSine(clamp(this.t / this.durOf(this.page)));
    const appear = ease.inOutSine(clamp(this.t / 1.1));
    // 이전 장면이 겹치며 사라진다
    if (this.prev >= 0 && this.prevT < 1.1) this.drawPage(ctx, this.prev, this.prevK + this.prevT * 0.02, 1 - ease.inOutSine(clamp(this.prevT / 1.1)), box, false);
    this.drawPage(ctx, this.page, k, this.prev >= 0 ? appear : appear, box, true);
    // 틀: 바깥 가는 선 + 안쪽 가는 선
    ctx.strokeStyle = `rgba(236,236,232,${0.75 * Math.max(appear, this.prev >= 0 ? 1 : 0)})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(fx - 9, fy - 9, fw + 18, fh + 18);
    ctx.strokeStyle = 'rgba(236,236,232,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(fx - 3, fy - 3, fw + 6, fh + 6);
    // 내레이션: 가운데 정렬, 글자가 하나씩 부드럽게 떠오른다
    const size = Math.round(Math.min(32, s.W / 46));
    ctx.font = `500 ${size}px ${SERIF}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const lh = size * 1.7;
    const ty = fy + fh + Math.min(96, s.H * 0.11);
    let n = this.chars;
    p.lines.forEach((ln, li) => {
      const w = ctx.measureText(ln).width;
      let x = s.W / 2 - w / 2;
      for (const ch of ln) {
        if (n <= 0) break;
        const a = clamp(n);
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ecece9';
        ctx.fillText(ch, x, ty + li * lh + (1 - a) * 6);
        x += ctx.measureText(ch).width;
        n -= 1;
      }
      n -= 1; // 줄바꿈
    });
    ctx.globalAlpha = 1;
    // 다음 표시
    if (this.chars >= this.text.length) {
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(this.t * 3.5);
      ctx.fillStyle = '#ecece9';
      ctx.beginPath();
      const ax = s.W / 2,
        ay = ty + lh * (p.lines.length - 1) + lh * 0.75;
      ctx.moveTo(ax - 9, ay - 6);
      ctx.lineTo(ax + 9, ay - 6);
      ctx.lineTo(ax, ay + 4);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // 쪽 표시 (점)
    for (let i = 0; i < PAGES.length; i++) {
      ctx.fillStyle = i === this.page ? '#d6d6d2' : '#3a3a38';
      ctx.beginPath();
      ctx.arc(s.W / 2 + (i - (PAGES.length - 1) / 2) * 16, s.H - 34, i === this.page ? 3.2 : 2.4, 0, TAU);
      ctx.fill();
    }
    // 건너뛰기 안내
    ctx.font = `400 15px ${KR}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = this.skipArmed > 0 ? '#bdbdba' : '#4a4a48';
    ctx.fillText(this.skipArmed > 0 ? 'Esc 를 한 번 더 누르면 건너뜁니다' : app.input.touchMode ? '화면을 눌러 넘기기' : 'Enter · Space 다음      Esc 건너뛰기', s.W - 40, s.H - 28);
    app.post.apply(s, dt, 0.35, 0.06);
    if (this.fadeOut >= 0) app.post.fill(s, '#000', clamp(this.fadeOut / 1.4));
  }
}
