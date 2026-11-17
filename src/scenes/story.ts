/**
 * 오프닝 — 그림 한 장 + 타자기 내레이션을 넘겨 가며 이야기를 들려준다.
 * 그림은 시작할 때 한 번 오프스크린 캔버스에 구워 두고, 천천히 패닝/줌만 한다.
 */
import { app, type Scene } from '../app';
import { audio } from '../core/audio';
import { clamp, ease, mulberry32, TAU } from '../core/math';
import { drawFigure, rigidPose, applyIdle, plantLegs, defaultStyle, type Pose } from '../gfx/figure';
import { drawFlower, drawGlow, drawPetal, PETAL_COLORS } from '../gfx/flower';
import { drawIcon, type IconName } from '../gfx/icons';
import { drawCrack, INK } from '../gfx/ground';
import { TitleScene } from './title';

const PW = 1200;
const PH = 720;
const GY = 560; // 그림 속 땅 높이
const KR = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

interface Page {
  lines: string[];
  draw: (c: CanvasRenderingContext2D, fig: CanvasRenderingContext2D) => void;
  /** 카메라 움직임: 시작/끝 (중심 x,y 비율, 줌) */
  from: [number, number, number];
  to: [number, number, number];
}

// ------------------------------------------------------------------
// 그림 도구
// ------------------------------------------------------------------
function sky(c: CanvasRenderingContext2D, top: string, bot: string) {
  const g = c.createLinearGradient(0, 0, 0, PH);
  g.addColorStop(0, top);
  g.addColorStop(1, bot);
  c.fillStyle = g;
  c.fillRect(0, 0, PW, PH);
}
function groundFill(c: CanvasRenderingContext2D, color = INK, y = GY) {
  c.fillStyle = color;
  c.fillRect(0, y, PW, PH - y);
}
function hills(c: CanvasRenderingContext2D, color: string, y: number, amp: number, seed: number) {
  const r = mulberry32(seed);
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(0, PH);
  for (let x = 0; x <= PW; x += 40) c.lineTo(x, y + Math.sin(x * 0.006 + seed) * amp + r() * 6);
  c.lineTo(PW, PH);
  c.closePath();
  c.fill();
}
function figure(f: CanvasRenderingContext2D, x: number, y: number, s: number, setup?: (p: Pose) => void, color = INK, head = 1, held?: boolean) {
  const p = rigidPose();
  setup?.(p);
  const st = defaultStyle();
  st.color = color;
  st.farColor = color === INK ? '#3c3c3c' : color;
  st.headScale = head;
  return drawFigure(f, p, x, y, s, st, held ? { heldArm: p.turn >= 0 ? 0 : 1, held: (cc, hx, hy) => drawFlower(cc, hx, hy + 3, s * 0.15, PETAL_COLORS, { stem: 1.25 }) } : {});
}
const relaxed = (facing = 1, t = 0) => (p: Pose) => {
  applyIdle(p, t, facing, 0);
  p.turn = facing * 0.6;
};
function flowerField(c: CanvasRenderingContext2D, seed: number, n: number, y0: number, gray = false, wilt = 0) {
  const r = mulberry32(seed);
  const items = Array.from({ length: n }, () => ({ x: r() * PW, y: y0 + r() * (PH - y0 - 30), s: 14 + r() * 16 }));
  items.sort((a, b) => a.y - b.y);
  for (const it of items) {
    const k = (it.y - y0) / (PH - y0);
    const size = it.s * (0.7 + k * 0.8);
    const petals = gray ? Array.from({ length: 5 }, (_, i) => ['#8a8a88', '#9c9c99', '#777775'][i % 3]) : PETAL_COLORS.slice(Math.floor(r() * 3), 4 + Math.floor(r() * 4));
    drawFlower(c, it.x, it.y, size, petals, { stem: 1.4, sway: (r() - 0.5) * 0.3 + wilt * (r() < 0.5 ? 1 : -1), angle: wilt * (r() - 0.2) * 1.2, bloom: gray ? 0.6 : 1 });
  }
}
function composite(c: CanvasRenderingContext2D, f: CanvasRenderingContext2D, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  c.drawImage(f.canvas, 0, 0);
  c.restore();
  f.clearRect(0, 0, PW, PH);
}
function ash(c: CanvasRenderingContext2D, seed: number, n: number, color = 'rgba(80,80,78,0.55)') {
  const r = mulberry32(seed);
  c.fillStyle = color;
  for (let i = 0; i < n; i++) {
    c.beginPath();
    c.arc(r() * PW, r() * GY, 1 + r() * 2.2, 0, TAU);
    c.fill();
  }
}
function icons(c: CanvasRenderingContext2D, list: [IconName, number, number, string?, boolean?][], y = GY) {
  for (const [ic, x, h, col, flip] of list) drawIcon(c, ic, x, y, h, { color: col ?? INK, flip });
}

// ------------------------------------------------------------------
// 페이지
// ------------------------------------------------------------------
const PAGES: Page[] = [
  {
    lines: ['아주 먼 옛날, 세상에는 색이 있었다.'],
    from: [0.45, 0.5, 1.12],
    to: [0.55, 0.5, 1.02],
    draw: (c, f) => {
      sky(c, '#e9e7e1', '#f6f4ee');
      c.fillStyle = '#d9d7d1';
      c.beginPath();
      c.arc(930, 170, 70, 0, TAU);
      c.fill();
      hills(c, '#bdbcb6', 470, 26, 3);
      hills(c, '#8f8e89', 520, 18, 7);
      groundFill(c, '#2b2b2a', GY);
      flowerField(c, 11, 70, GY - 10);
      figure(f, 470, GY + 40, 210, relaxed(1, 0.4));
      figure(f, 600, GY + 40, 200, relaxed(-1, 1.2));
      figure(f, 540, GY + 52, 130, relaxed(1, 2.1), INK, 1.3);
      composite(c, f);
      flowerField(c, 23, 26, GY + 70);
    },
  },
  {
    lines: ['색은 곧 마음이었다.', '기쁨도, 그리움도, 슬픔도 모두 색이었다.'],
    from: [0.5, 0.52, 1.0],
    to: [0.5, 0.48, 1.12],
    draw: (c, f) => {
      sky(c, '#e4e2dc', '#f3f1eb');
      hills(c, '#a9a8a3', 500, 20, 5);
      groundFill(c, '#2b2b2a', GY);
      flowerField(c, 4, 30, GY + 20);
      figure(f, 470, GY + 30, 260, (p) => {
        applyIdle(p, 0, 1, 0);
        p.turn = 1;
        p.arms[0].a = 1.35;
        p.arms[0].b = 0.25;
      }, INK, 1, true);
      figure(f, 760, GY + 30, 250, (p) => {
        applyIdle(p, 0, -1, 0);
        p.turn = -1;
        p.arms[1].a = 0.9;
        p.arms[1].b = 0.5;
        p.lean = 0.06;
      });
      composite(c, f);
      const r = mulberry32(9);
      for (let i = 0; i < 16; i++) {
        const col = PETAL_COLORS[i % 7];
        const x = 560 + r() * 220;
        const y = 180 + r() * 220;
        drawGlow(c, x, y, 40, [col], 0.6);
        drawPetal(c, x, y, 12 + r() * 8, col, r() * TAU);
      }
    },
  },
  {
    lines: ['그러던 어느 날, 꽃밭이 시들었다.'],
    from: [0.5, 0.55, 1.15],
    to: [0.48, 0.5, 1.02],
    draw: (c, f) => {
      sky(c, '#9d9c98', '#c4c3be');
      hills(c, '#7a7976', 480, 24, 2);
      groundFill(c, '#1e1e1d', GY);
      flowerField(c, 31, 60, GY - 6, true, 0.9);
      figure(f, 600, GY + 46, 230, (p) => {
        p.turn = 0.7;
        p.crouch = 0.17;
        plantLegs(p, 0);
        p.lean = 0.55;
        p.headTilt = 0.4;
        p.arms[0].a = 0.4;
        p.arms[0].b = 0.3;
        p.arms[1].a = 0.25;
      });
      composite(c, f);
      ash(c, 4, 70);
    },
  },
  {
    lines: ['사람들은 더 이상 아프고 싶지 않았다.', '그래서, 아무것도 느끼지 않기로 했다.'],
    from: [0.5, 0.5, 1.05],
    to: [0.5, 0.5, 1.18],
    draw: (c, f) => {
      sky(c, '#cfcfcc', '#e6e6e3');
      groundFill(c, INK, GY);
      for (let i = 0; i < 9; i++) figure(f, 120 + i * 120, GY, 190, undefined, INK, i % 4 === 2 ? 1.3 : 1);
      composite(c, f);
    },
  },
  {
    lines: ['그렇게, 세상은 표지판이 되었다.'],
    from: [0.4, 0.5, 1.15],
    to: [0.6, 0.5, 1.15],
    draw: (c, f) => {
      sky(c, '#c9c9c6', '#ebebe8');
      icons(c, [['office', 140, 420, '#b3b3b0'], ['tower', 380, 500, '#b3b3b0'], ['building', 620, 380, '#b3b3b0'], ['office', 880, 470, '#b3b3b0'], ['tower', 1100, 420, '#b3b3b0']], GY - 40);
      icons(c, [['house', 220, 230, '#7b7b79'], ['townHall', 760, 260, '#7b7b79'], ['house', 1040, 220, '#7b7b79', true]], GY - 10);
      groundFill(c, INK, GY);
      icons(c, [['lamp', 90, 260], ['trafficLight', 330, 240], ['signpost', 640, 170], ['lamp', 900, 260], ['bench', 1130, 60]]);
      for (const [x, s, h] of [[200, 150, 1], [430, 145, 1], [500, 100, 1.3], [720, 152, 1], [800, 148, 1], [1010, 150, 1]] as const) figure(f, x, GY, s, undefined, INK, h);
      composite(c, f);
      // 기둥 위 픽토그램 표지
      c.fillStyle = INK;
      c.fillRect(1086, GY - 200, 10, 200);
      c.fillStyle = '#e9e9e6';
      c.fillRect(1046, GY - 290, 90, 90);
      drawIcon(c, 'toiletSign', 1091, GY - 208, 72, { color: INK });
    },
  },
  {
    lines: ['아주, 아주 오랜 시간이 흘렀다.'],
    from: [0.5, 0.45, 1.0],
    to: [0.5, 0.55, 1.1],
    draw: (c, f) => {
      sky(c, '#8f8f8c', '#b8b8b5');
      icons(c, [['office', 300, 360, '#6d6d6b'], ['tower', 820, 430, '#6d6d6b']], GY - 20);
      groundFill(c, '#141414', GY);
      icons(c, [['lamp', 600, 300, '#141414']]);
      figure(f, 450, GY, 150);
      figure(f, 760, GY, 146);
      composite(c, f, 0.9);
      ash(c, 8, 160, 'rgba(60,60,58,0.6)');
    },
  },
  {
    lines: ['그리고 어느 날, 갈라진 보도블록 틈에서', '작은 꽃 한 송이가 피어났다.'],
    from: [0.5, 0.6, 1.25],
    to: [0.5, 0.62, 1.05],
    draw: (c, f) => {
      sky(c, '#cfcfcc', '#e3e3e0');
      groundFill(c, INK, 600);
      c.fillStyle = '#2c2c2b';
      c.fillRect(0, 600, PW, 4);
      // 굳은 주민의 다리
      c.fillStyle = INK;
      for (const x of [300, 370, 840, 910]) {
        c.beginPath();
        c.roundRect(x, -40, 62, 640, 30);
        c.fill();
      }
      drawCrack(c, 620, 600, 180, 4);
      drawGlow(c, 616, 470, 260, PETAL_COLORS, 1.6);
      drawFlower(c, 612, 602, 70, PETAL_COLORS, { stem: 1.85, sway: 0.04 });
      void f;
    },
  },
  {
    lines: ['굳어 있던 한 주민이,', '그 꽃에 손을 뻗었다.'],
    from: [0.52, 0.55, 1.2],
    to: [0.56, 0.6, 1.32],
    draw: (c, f) => {
      sky(c, '#c6c6c3', '#e2e2df');
      icons(c, [['house', 200, 260, '#a4a4a1'], ['tree', 1000, 300, '#a4a4a1']], GY - 20);
      groundFill(c, INK, GY);
      figure(f, 160, GY, 200);
      figure(f, 1090, GY, 196);
      const j = figure(f, 560, GY, 260, (p) => {
        p.crouch = 0.13;
        plantLegs(p, 0.085);
        p.lean = 0.29;
        p.headTilt = 0.26;
        p.arms[1].a = 0.62;
        p.arms[1].b = 0.18;
      });
      composite(c, f);
      const [hx, hy] = j.hand[1];
      drawGlow(c, hx + 8, hy + 6, 200, PETAL_COLORS, 1.4);
      drawFlower(c, hx + 6, GY, 46, PETAL_COLORS, { stem: (GY - hy - 6) / 46 });
      drawCrack(c, hx + 6, GY, 90, 2);
    },
  },
  {
    lines: ['그 순간 — 멈춰 있던 관절이,', '처음으로 풀렸다.'],
    from: [0.5, 0.5, 1.0],
    to: [0.5, 0.46, 1.16],
    draw: (c, f) => {
      sky(c, '#d3d3d0', '#ececE9');
      groundFill(c, INK, GY);
      for (let i = 0; i < 7; i++) {
        const k = (i + 1) / 8;
        c.strokeStyle = PETAL_COLORS[i];
        c.globalAlpha = 0.5 * (1 - k * 0.6);
        c.lineWidth = 10 - i;
        c.beginPath();
        c.arc(600, 380, 120 + i * 70, 0, TAU);
        c.stroke();
      }
      c.globalAlpha = 1;
      figure(f, 250, GY, 170, undefined, '#5a5a58');
      figure(f, 950, GY, 168, undefined, '#5a5a58');
      figure(f, 600, GY, 270, (p) => {
        applyIdle(p, 0.6, 1, 0);
        p.turn = 0.2;
        p.arms[0].a = 1.15;
        p.arms[0].b = 1.5;
      }, INK, 1, true);
      composite(c, f);
    },
  },
];

const CPS = 18; // 초당 글자 수

export class StoryScene implements Scene {
  private images: HTMLCanvasElement[] = [];
  private page = 0;
  private t = 0;
  private chars = 0;
  private fadeOut = -1;
  private skipArmed = 0;
  private blipI = 0;
  private tapped = false;
  private onTap = () => (this.tapped = true);

  constructor() {
    const fig = document.createElement('canvas');
    fig.width = PW;
    fig.height = PH;
    const fc = fig.getContext('2d')!;
    for (const p of PAGES) {
      const cv = document.createElement('canvas');
      cv.width = PW;
      cv.height = PH;
      const c = cv.getContext('2d')!;
      fc.clearRect(0, 0, PW, PH);
      p.draw(c, fc);
      this.images.push(cv);
    }
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

  private get text() {
    return PAGES[this.page].lines.join('\n');
  }

  private finish() {
    if (this.fadeOut < 0) this.fadeOut = 0;
  }

  update(dt: number) {
    const inp = app.input;
    this.t += dt;
    this.skipArmed = Math.max(0, this.skipArmed - dt);
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
    if (this.chars >= full && this.t > 0.9 + full / CPS + 3.2) this.next();
    inp.consumeAll();
  }

  private next() {
    if (this.page >= PAGES.length - 1) {
      this.finish();
      return;
    }
    this.page++;
    this.t = 0;
    this.chars = 0;
    audio.play('paper_crush', { vol: 0.12, rate: 1.4 });
  }

  render(dt: number) {
    const s = app.screen;
    const ctx = s.ctx;
    s.base(ctx);
    ctx.fillStyle = '#000';
    ctx.fillRect(-10, -10, s.W + 20, s.H + 20);
    const p = PAGES[this.page];
    const img = this.images[this.page];
    // 그림 틀
    const fw = Math.min(s.W * 0.62, 1080);
    const fh = fw * 0.6;
    const fx = (s.W - fw) / 2;
    const fy = s.H * 0.09;
    const dur = 0.9 + this.text.length / CPS + 3.2;
    const k = ease.inOutSine(clamp(this.t / dur));
    const cx = (p.from[0] + (p.to[0] - p.from[0]) * k) * PW;
    const cy = (p.from[1] + (p.to[1] - p.from[1]) * k) * PH;
    const z = p.from[2] + (p.to[2] - p.from[2]) * k;
    const sw = PW / z;
    const sh = (sw * fh) / fw;
    const sx = clamp(cx - sw / 2, 0, PW - sw);
    const sy = clamp(cy - sh / 2, 0, PH - sh);
    const appear = clamp(this.t / 0.9);
    ctx.save();
    ctx.globalAlpha = appear;
    ctx.drawImage(img, sx, sy, sw, sh, fx, fy, fw, fh);
    ctx.restore();
    ctx.strokeStyle = `rgba(235,235,232,${0.85 * appear})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(fx - 6, fy - 6, fw + 12, fh + 12);
    // 내레이션
    const shown = this.text.slice(0, Math.floor(this.chars));
    ctx.fillStyle = '#ecece9';
    ctx.font = `400 ${Math.round(Math.min(34, s.W / 44))}px ${KR}`;
    ctx.textAlign = 'left';
    const lh = Math.min(54, s.W / 30);
    const tx = fx + 10;
    const ty = fy + fh + 90;
    shown.split('\n').forEach((ln, i) => ctx.fillText(ln, tx, ty + i * lh));
    // 다음 표시
    if (this.chars >= this.text.length) {
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(this.t * 4);
      ctx.fillStyle = '#ecece9';
      ctx.beginPath();
      const ax = fx + fw - 10,
        ay = ty + lh * (p.lines.length - 1) + 6;
      ctx.moveTo(ax - 12, ay - 10);
      ctx.lineTo(ax + 12, ay - 10);
      ctx.lineTo(ax, ay + 4);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // 건너뛰기 안내
    ctx.font = `400 16px ${KR}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = this.skipArmed > 0 ? '#bdbdba' : '#4a4a48';
    ctx.fillText(this.skipArmed > 0 ? 'Esc 를 한 번 더 누르면 건너뜁니다' : app.input.isTouch ? '화면을 눌러 넘기기' : 'Enter · Space 다음      Esc 건너뛰기', s.W - 40, s.H - 34);
    app.post.apply(s, dt, 0.35, 0.06);
    if (this.fadeOut >= 0) app.post.fill(s, '#000', clamp(this.fadeOut / 1.4));
  }
}
