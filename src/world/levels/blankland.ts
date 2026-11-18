/**
 * 구간 8 — 여백의 땅
 *  흰 종이와 연필 스케치뿐. 색은 손에 든 꽃뿐이고, 꽃빛이 닿는 곳만 스케치가 먹선으로 굳어 밟을 수 있다.
 *  꽃빛의 크기는 꽃잎 수에 비례 → 많이 나눠줄수록 이곳이 어렵다.
 *  A. 하얀 착지 (발밑만 먹선으로 번진다, 첫 스케치 다리)                         -400 ~ 1500
 *  B. 스케치 다리 (오르내리는 연필 계단)                                         1500 ~ 3420
 *  C. 지워진 구간들 (지나온 곳들의 스케치. 깨우지 못한 이웃들이 희미한 윤곽으로 서 있다.
 *     반쯤 지워진 이웃 둘)                                                       3420 ~ 7200
 *  D. 지우개 폭풍 (두 높이를 가르는 지우개 사이로 계단을 오른다, 꽃잎 둘, 반쯤 지워진 이웃)  7200 ~ 9300
 *  E. 여백 (보스): ① 지우며 쫓아온다 ② 손이 내리친다 ③ 앞을 막고 시선으로 찾는다 ④ 색 한 점을 향해
 *     → 색의 경계에서 여백은 멈춘다                                              9300 ~ 13700
 */
import type { LevelDef, GameAPI, SolidDef, DecorDef, EntityDef, TriggerDef, CamFocus } from '../types';
import type { Co } from '../../core/co';
import type { Player } from '../player';
import type { Gaze, Hands } from '../entities8';
import { LEVELS } from './index';
import { blankTheme } from '../../gfx/background';
import { audio } from '../../core/audio';
import { PETAL_COLORS, drawGlow, drawFlower } from '../../gfx/flower';
import { PAPER } from '../../gfx/blank';
import { drawIcon, type IconName } from '../../gfx/icons';
import { drawFigure, defaultStyle, rigidPose } from '../../gfx/figure';
import { clamp, hash1, rand } from '../../core/math';
import { app } from '../../app';

const pencil = (x0: number, x1: number, y = 0): SolidDef => ({ x: x0, y, w: x1 - x0, h: 3000, look: 'pencil' });
/** 땅과 같은 높이의 스케치 다리 (아래가 막힌 덩어리) */
const flush = (id: string, x: number, w: number): EntityDef => ({ type: 'litplank', id, x, y: 0, w, h: 30, by: 'flower' });
/** 위에서만 밟는 스케치 판 */
const sk = (id: string, x: number, y: number, w = 130): EntityDef => ({ type: 'litplank', id, x, y, w, by: 'flower' });

const BOUNDARY = 13300;
const DOT = { x: 13650, y: -260 };

const solids: SolidDef[] = [
  { x: -1500, y: -3000, w: 1100, h: 6000, look: 'invisible' },
  // A
  pencil(-400, 600),
  pencil(1000, 1700),
  // B
  pencil(3420, 5400),
  // C
  pencil(5550, 7400),
  // D
  pencil(9100, 9700),
  // E
  pencil(9860, 10100),
  pencil(10270, 12900),
  pencil(12900, BOUNDARY + 1200),
  { x: BOUNDARY + 1200, y: -3000, w: 400, h: 6000, look: 'invisible' },
];

const decor: DecorDef[] = [
  // E ③ 스케치 숲 (여백의 시선을 피해 지나가는 곳)
  { icon: 'pine', x: 11800, h: 560, color: '#c8c7c2' },
  { icon: 'tree2', x: 12150, h: 480, color: '#c8c7c2' },
  { icon: 'pine', x: 12480, h: 620, color: '#c8c7c2' },
];

const R = (id: string, x: number, extra: Partial<Extract<EntityDef, { type: 'resident' }>> = {}): EntityDef => ({ type: 'resident', id, x, ...extra });

const entities: EntityDef[] = [
  // A 첫 다리
  flush('a1', 600, 140),
  flush('a2', 740, 130),
  flush('a3', 870, 130),
  // B 연필 계단
  sk('b1', 1760, -60, 120),
  sk('b2', 1930, -150, 120),
  sk('b3', 2100, -240, 130),
  sk('b4', 2320, -240, 170),
  sk('b5', 2560, -200, 140),
  sk('b6', 2790, -160, 140),
  sk('b7', 3010, -110, 140),
  sk('b8', 3230, -60, 150),
  // C
  R('b_half1', 4960, { savable: true, after: 'stay', half: true }),
  flush('c1', 5400, 150),
  R('b_half2', 6460, { savable: true, after: 'stay', half: true, kind: 'tall' }),
  // D 지우개 폭풍
  sk('d1', 7460, -40),
  sk('d2', 7660, -120),
  sk('d3', 7860, -200),
  sk('d4', 8060, -280),
  sk('d5', 8280, -280, 170),
  sk('d6', 8510, -200),
  sk('d7', 8710, -120),
  sk('d8', 8910, -40),
  { type: 'eraser', id: 'er1', x0: 7430, x1: 9070, y: -170, h: 60, period: 3.4, dir: 1 },
  { type: 'eraser', id: 'er2', x0: 7430, x1: 9070, y: -420, h: 70, period: 4.4, phase: 1.9, dir: -1 },
  { type: 'petal', id: 'b_p1', x: 8360, y: -360, color: PETAL_COLORS[3] },
  { type: 'petal', id: 'b_p2', x: 8965, y: -190, color: PETAL_COLORS[1] },
  R('b_half3', 9230, { savable: true, after: 'stay', half: true, kind: 'child' }),
  // E
  flush('e1', 9700, 160),
  flush('e2', 10100, 170),
  { type: 'hands', id: 'hands' },
  { type: 'gaze', id: 'gaze', x: 13050, y: -980, mid: 2.35, amp: 0.32, period: 3.6, half: 0.1 },
  sk('e3', 12960, -150, 120),
  sk('e4', 13130, -290, 120),
  { type: 'petal', id: 'b_p3', x: 13190, y: -370, color: PETAL_COLORS[6] },
];

const triggers: TriggerDef[] = [
  { id: 'cp_b1', x: 1100, w: 60, checkpoint: true },
  { id: 'cp_b2', x: 3500, w: 60, checkpoint: true },
  { id: 'cp_b3', x: 7250, w: 60, checkpoint: true },
  { id: 'h_eraser', x: 7300, w: 60, once: true, hint: { kb: '회색 띠가 비치면 지우개가 지나간다  ·  두 띠 사이에서 기다린다', dur: 5 } },
  { id: 'cp_b4', x: 9300, w: 60, checkpoint: true },
  { id: 'boss', x: 9420, w: 60, once: true, script: 'boss' },
  { id: 'cp_b5', x: 11620, w: 60, checkpoint: true },
  { id: 'cp_b6', x: 12620, w: 60, checkpoint: true },
  { id: 'boundary', x: BOUNDARY - 60, w: 80, once: true, script: 'boundary' },
];

// ------------------------------------------------------------------
// 스크립트
// ------------------------------------------------------------------
function* arrive(g: GameAPI): Co {
  const S = g as unknown as { fadeColor: string; fadeA: number };
  S.fadeColor = PAPER;
  S.fadeA = 1;
  g.setControl(false);
  audio.play('paper_crush', { vol: 0.5, rate: 0.7 });
  yield 1.6;
  g.setControl(true);
  g.hint('꽃빛이 닿는 곳만 그려진다  ·  꽃잎이 적을수록 빛도 작다', '꽃빛이 닿는 곳만 그려진다  ·  꽃잎이 적을수록 빛도 작다', 5);
}

/** 보스: 지나온 체크포인트에 맞춰 이어서 시작한다 */
function* boss(g: GameAPI): Co {
  const S = g as unknown as { chase: { front: number; max: number; active: boolean } };
  const hands = g.entity<Hands>('hands');
  const gaze = g.entity<Gaze>('gaze');
  const p = g.player;
  const startChase = (off: number, max: number) => {
    g.startChase({ startOffset: off, max });
    audio.loop('heart', 'heart_fast', 0.6, 0.3, 'sfx');
    audio.loop('chasebed', 'chase_bed', 0.45, 0.5, 'amb');
  };
  // ① 지우며 쫓아온다
  if (p.x < 10600) {
    audio.play('paper_rip', { vol: 1, rate: 0.5 });
    audio.play('sting1', { vol: 0.9 });
    g.shake(0.4);
    startChase(-950, 230);
    g.hint('앞을 비추며 달린다', '앞을 비추며 달린다', 2.5);
    yield () => p.x > 10600 || g.isDead();
    if (g.isDead()) return;
  }
  // ② 손이 내리친다
  if (p.x < 11600) {
    if (!g.chaseActive()) startChase(-900, 230);
    let t = 0.6,
      k = 0;
    while (p.x < 11600 && !g.isDead()) {
      t -= g.dt;
      if (t <= 0) {
        t = 1.05;
        k++;
        // 둘은 앞길에, 하나는 지금 선 자리에
        hands?.slam(k % 3 === 0 ? p.x + 30 : p.x + 250 + rand(0, 120), 0.85);
      }
      yield;
    }
    if (g.isDead()) return;
  }
  // ③ 앞을 막아선 여백이 시선으로 찾는다 (뒤의 지우개는 멈춘다)
  if (p.x < 12600) {
    if (g.chaseActive()) S.chase.max = 0;
    audio.stopLoop('chasebed', 1.5);
    audio.loop('heart', 'heart_slow', 0.6, 0.6, 'sfx');
    audio.play('sting4', { vol: 0.7 });
    if (gaze) gaze.active = true;
    g.hint('여백이 찾고 있다  ·  시선이 닿을 때 {down} 로 굳는다', '여백이 찾고 있다  ·  시선이 닿을 때 굳는다', 4);
    yield () => p.x > 12600 || g.isDead();
    if (gaze) gaze.active = false;
    if (g.isDead()) return;
  }
  // ④ 색 한 점을 향해
  audio.play('sting1', { vol: 0.8 });
  if (!g.chaseActive()) startChase(-850, 300);
  else {
    S.chase.max = 300;
    S.chase.front = Math.max(S.chase.front, p.x - 850);
    audio.loop('chasebed', 'chase_bed', 0.5, 0.5, 'amb');
    audio.loop('heart', 'heart_fast', 0.6, 0.3, 'sfx');
  }
  g.hint('→', '→', 1.2);
}

/** 색의 경계: 여백은 넘어오지 못하고 멈춘다 */
function* boundary(g: GameAPI): Co {
  const S = g as unknown as { chase: { front: number; max: number; cine: boolean }; camFocus: CamFocus | null; cineFade: number; cineFadeColor: string };
  const p = g.player as unknown as Player;
  S.chase.cine = true;
  S.chase.max = 0;
  g.setControl(false);
  p.state = 'scripted';
  p.scriptTarget = BOUNDARY + 420;
  p.scriptSpeed = 260;
  audio.stopLoop('chasebed', 2.5);
  audio.stopLoop('heart', 3);
  audio.play('chime', { vol: 0.6, rate: 0.8 });
  const cam: CamFocus = { x: BOUNDARY + 100, y: -320, zoom: 0.8, smooth: 1.2 };
  S.camFocus = cam;
  let t = 0;
  S.cineFadeColor = '#000';
  while (S.cineFade < 1) {
    t += g.dt;
    // 여백은 경계 바로 앞까지 와서 멈춘다
    S.chase.front += (Math.min(BOUNDARY - 120, p.x - 200) - S.chase.front) * Math.min(1, g.dt * 1.5);
    cam.x = BOUNDARY + 100 + t * 30;
    if (t > 3.2) S.cineFade = Math.min(1, S.cineFade + g.dt / 1.6);
    yield;
  }
  g.stopChase();
  g.goToLevel('field');
}

// ------------------------------------------------------------------
// 그리기
// ------------------------------------------------------------------
/** 지나온 구간들의 스케치 (아이콘 몇 개) */
const VIGNETTES: { id: string; icons: [IconName, number, number][] }[] = [
  { id: 'town', icons: [['house', -60, 220], ['lamp', 90, 260], ['trafficLight', 170, 150]] },
  { id: 'drain', icons: [['pipe', -40, 180], ['ladder', 100, 260]] },
  { id: 'factory', icons: [['factory', 0, 260], ['industry', 150, 150]] },
  { id: 'rail', icons: [['train', 0, 230], ['bridge', 160, 140]] },
  { id: 'archive', icons: [['bookshelf', -40, 260], ['bookshelf', 80, 260], ['clock', 180, 90]] },
  { id: 'forest', icons: [['pine', -30, 300], ['tree2', 120, 240]] },
  { id: 'sea', icons: [['lighthouse', 0, 300], ['crane', 160, 220]] },
];
const VX0 = 3900,
  VGAP = 470;

function drawBack(ctx: CanvasRenderingContext2D, g: GameAPI, v: { x0: number; x1: number; y0: number; y1: number }) {
  const frame = Math.floor(g.t * 12);
  // C: 지나온 곳들 + 깨우지 못한 이웃들의 윤곽
  if (v.x1 > VX0 - 400 && v.x0 < VX0 + VGAP * VIGNETTES.length + 400) {
    const s = app.screen;
    const L = app.fxLayer;
    s.clearLayer(L);
    g.cam.apply(L.ctx, s, 1);
    VIGNETTES.forEach((vg, i) => {
      const x = VX0 + i * VGAP;
      for (const [icon, dx, h] of vg.icons) {
        const jx = (hash1(frame * 3 + i * 7 + dx) - 0.5) * 2;
        drawIcon(ctx, icon, x + dx + jx, 0, h * 0.8, { color: '#cfcec9' });
      }
      const lv = LEVELS[vg.id];
      if (!lv) return;
      const missed = lv.entities.filter((d) => d.type === 'resident' && d.savable && !g.saved.has(d.id)).length;
      for (let k = 0; k < missed; k++) {
        const px = x - 120 + k * 48 + (k % 2) * 10;
        const st = defaultStyle();
        st.color = '#b3b2ad';
        st.farColor = '#bdbcb7';
        const P = rigidPose();
        const jx = (hash1(frame * 5 + k * 13 + i) - 0.5) * 3;
        drawFigure(L.ctx, P, px + jx, 0, 120 + (k % 3) * 14, st);
      }
    });
    s.composite(L, 0.55);
    g.cam.apply(ctx, s, 1);
  }
  // E: 저 멀리 색 한 점 (가까워질수록 커진다)
  const dist = DOT.x - g.cam.x;
  if (v.x1 > 9000) {
    const z = g.cam.zoom;
    const near = clamp(1 - dist / 4200);
    const x = g.cam.x + Math.min(dist, 760 / z);
    const r = 10 + near * 70;
    drawGlow(ctx, x, DOT.y, r * 4, PETAL_COLORS, 0.6 + near * 0.4);
    drawFlower(ctx, x, DOT.y + r * 0.6, r, PETAL_COLORS, { stem: 0.4, sway: Math.sin(g.t) * 0.05 });
  }
  // 색의 경계 너머: 물감이 번지듯 색이 피어 있다
  if (v.x1 > BOUNDARY - 400) {
    ctx.save();
    for (let i = 0; i < 26; i++) {
      const x = BOUNDARY - 150 + hash1(i * 3.1) * 1500 + Math.sin(g.t * 0.3 + i) * 12;
      const y = -900 + hash1(i * 7.7) * 900;
      const r = 140 + hash1(i * 1.9) * 220;
      const fade = clamp((x - (BOUNDARY - 250)) / 500);
      const c = PETAL_COLORS[i % PETAL_COLORS.length];
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, c);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = 0.22 * fade;
      ctx.fillStyle = grad;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }
}

export const blank: LevelDef = {
  id: 'blank',
  width: BOUNDARY + 1500,
  killY: 900,
  spawn: { x: 0, y: 0 },
  theme: () => blankTheme(BOUNDARY + 1500, 88),
  solids,
  decor,
  entities,
  triggers,
  fallCause: 'erase',
  eraseColor: '#c2c1bc',
  camZones: [
    { x0: 1500, x1: 3420, zoom: 0.9, yOff: -60 },
    { x0: 3420, x1: 7200, zoom: 0.86 },
    { x0: 7200, x1: 9300, zoom: 0.85, yOff: -80 },
    { x0: 9300, x1: 11600, zoom: 0.86, lead: 300 },
    { x0: 11600, x1: 12600, zoom: 0.78, yOff: -160 },
    { x0: 12600, x1: BOUNDARY + 1500, zoom: 0.84, lead: 300 },
  ],
  scripts: { arrive, boss, boundary },
  startScript: 'arrive',
  drawBack,
  onRestore: (g) => {
    // 보스 도중 체크포인트에서 다시 시작하면 그 단계부터
    if ((g as unknown as { fired: Set<string> }).fired.has('boss')) g.co.run(boss(g), 'boss');
  },
  ambience: () => {
    audio.loop('amb', 'amb_ghost', 0.22, 3);
    audio.loop('wind', 'amb_wind', 0.15, 3);
  },
};
