/**
 * 구간 4 — 끊긴 철로 (달리는 화물열차 위)
 * 열차는 세계 좌표에 고정, 바깥 풍경과 장애물이 trainSpeed 로 뒤로 흘러간다.
 *  A 화차(출발) → B 평판차(상자 사이 아이) → C 컨테이너(지붕 위 꽃잎, 신호 철골)
 *  → D 화차(터널, 기억 조각, 여백 등장) → E 평판차(철교: 가로재 뛰어넘기 + 옆바람)
 *  → F 객차(승객 셋) → G 석탄차 → H 기관차 → 끊긴 다리
 */
import type { LevelDef, GameAPI, SolidDef, EntityDef, TriggerDef } from '../types';
import type { Co } from '../../core/co';
import { fieldTheme } from '../../gfx/background';
import { audio } from '../../core/audio';
import { PETAL_COLORS } from '../../gfx/flower';
import { INK } from '../../gfx/ground';
import { rand } from '../../core/math';
import { Hazard, ROOF } from '../entities4';
import type { Player } from '../player';

type Kind = 'box' | 'flat' | 'container' | 'passenger' | 'tender' | 'loco';
const CARS: { id: string; x: number; w: number; kind: Kind }[] = [
  { id: 'carA', x: 0, w: 900, kind: 'box' },
  { id: 'carB', x: 980, w: 900, kind: 'flat' },
  { id: 'carC', x: 1960, w: 900, kind: 'container' },
  { id: 'carD', x: 2940, w: 900, kind: 'box' },
  { id: 'carE', x: 3920, w: 1100, kind: 'flat' },
  { id: 'carF', x: 5100, w: 900, kind: 'passenger' },
  { id: 'carG', x: 6080, w: 600, kind: 'tender' },
  { id: 'carH', x: 6760, w: 1000, kind: 'loco' },
];
const FRONT = 7760;

const solids: SolidDef[] = [];
const inv = (x: number, y: number, w: number, h: number, extra: Partial<SolidDef> = {}): SolidDef => ({ x, y, w, h, look: 'invisible', ...extra });
CARS.forEach((c, i) => {
  solids.push(inv(c.x, 0, c.w, 30));
  const next = CARS[i + 1];
  if (next) solids.push(inv(c.x + c.w, 6, next.x - c.x - c.w, 10));
  if (c.kind === 'box' || c.kind === 'passenger') {
    solids.push(inv(c.x - 4, ROOF, c.w + 8, 22));
    solids.push(inv(c.x, ROOF, 22, i === 0 ? -ROOF : 160));
    solids.push(inv(c.x + c.w - 22, ROOF, 22, 160));
  }
  if (c.kind === 'container') solids.push(inv(c.x + 40, -420, c.w - 80, 420));
  if (c.kind === 'tender') {
    solids.push(inv(c.x + 20, -140, c.w - 40, 140));
    solids.push(inv(c.x + 140, -250, c.w - 280, 110));
  }
  if (c.kind === 'loco') {
    solids.push(inv(c.x - 10, -390, 310, 26));
    solids.push(inv(c.x, -390, 22, 210));
    solids.push(inv(c.x + 300, -300, c.w - 330, 300));
    solids.push(inv(c.x + c.w - 260, -440, 64, 140));
    solids.push(inv(c.x + c.w - 470, -350, 70, 50));
  }
});
// B 평판차 위 상자들
solids.push({ x: 1180, y: -140, w: 140, h: 140, look: 'crate' }, { x: 1560, y: -110, w: 120, h: 110, look: 'crate' }, { x: 1700, y: -220, w: 100, h: 220, look: 'crate' });
// E 평판차 위 낮은 상자 하나 (바람을 피할 곳)
solids.push({ x: 4420, y: -90, w: 110, h: 90, look: 'crate' });

/** 칸 안 (바람과 지나가는 철골을 피하는 곳) */
function sheltered(x: number, y: number) {
  for (const c of CARS) {
    if ((c.kind === 'box' || c.kind === 'passenger') && x > c.x + 22 && x < c.x + c.w - 22 && y > ROOF && y < 2) return true;
    if (c.kind === 'loco' && x > c.x + 22 && x < c.x + 300 && y > -390 && y < 2) return true;
  }
  return false;
}

const R = (id: string, x: number, extra: Partial<Extract<EntityDef, { type: 'resident' }>> = {}): EntityDef => ({ type: 'resident', id, x, ...extra });

const gapLadder = (i: number, top: number): EntityDef => {
  const c = CARS[i];
  return { type: 'ladder', id: 'lad' + i, x: c.x + c.w + 40, top, bottom: 0 };
};

const entities: EntityDef[] = [
  ...CARS.map((c): EntityDef => ({ type: 'car', id: c.id, x: c.x, w: c.w, kind: c.kind })),
  gapLadder(0, ROOF),
  gapLadder(1, -420),
  gapLadder(3, ROOF),
  gapLadder(4, ROOF),
  gapLadder(6, -390),
  R('t_child', 1440, { kind: 'child', savable: true, after: 'stay' }),
  { type: 'petal', id: 'tp_container', x: 2420, y: -480, color: PETAL_COLORS[1] },
  { type: 'memory', id: 'm_station', x: 3390, art: 'station' },
  R('t_p1', 5300, { savable: true, after: 'stay' }),
  R('t_p2', 5520, { savable: true, after: 'stay', kind: 'child' }),
  R('t_p3', 5760, { savable: true, after: 'stay', kind: 'tall' }),
  { type: 'petal', id: 'tp_coal', x: 6380, y: -320, color: PETAL_COLORS[5] },
  ...[0, 1, 2].map((i): EntityDef => ({ type: 'hazard', id: 'beam' + i, kind: 'beam' })),
  ...[0, 1, 2, 3].map((i): EntityDef => ({ type: 'hazard', id: 'bar' + i, kind: 'bar' })),
  { type: 'hazard', id: 'tunnel', kind: 'tunnel' },
  { type: 'hazard', id: 'cliff', kind: 'cliff' },
];

const triggers: TriggerDef[] = [
  { id: 'h_roof', x: 700, w: 100, once: true, hint: { kb: '칸 사이 사다리로 지붕에 오를 수 있다', dur: 3.5 } },
  { id: 'cp_r1', x: 1000, w: 60, checkpoint: true },
  { id: 'beams', x: 1060, w: 60, once: true, script: 'beams' },
  { id: 'h_beam', x: 1900, w: 60, once: true, hint: { kb: '종소리가 울리면 철골이 지나간다  ·  지붕 위에서는 구르거나, 칸 안으로', touch: '종소리가 울리면 철골이 지나간다  ·  지붕 위에서는 구르거나, 칸 안으로', dur: 5 } },
  { id: 'cp_r2', x: 2960, w: 60, y: -120, h: 200, checkpoint: true },
  { id: 'tunnel', x: 3040, w: 60, once: true, script: 'tunnel' },
  { id: 'blank', x: 3700, w: 60, once: true, script: 'blank' },
  { id: 'bridge', x: 3880, w: 60, once: true, script: 'bridge' },
  { id: 'cp_r3', x: 5150, w: 60, y: -120, h: 200, checkpoint: true },
  { id: 'end', x: 7560, w: 200, y: -500, h: 240, once: true, script: 'end' },
];

// ------------------------------------------------------------------
const state = { bridge: false, beams: false };

function spawnAhead(g: GameAPI, prefix: string, n: number, dist = 1500) {
  for (let i = 0; i < n; i++) {
    const h = g.entity<Hazard>(prefix + i);
    if (h && !h.active) {
      h.spawn(g.cam.x + dist / g.cam.zoom);
      return h;
    }
  }
  return null;
}

function* clack(g: GameAPI): Co {
  while (true) {
    if (g.trainSpeed > 100) {
      audio.play('clunk', { vol: 0.12, rate: 0.8 + Math.random() * 0.1 });
      audio.play('clunk', { vol: 0.09, rate: 0.75, delay: 0.11 });
    }
    yield 0.62;
  }
}

function* arrive(g: GameAPI): Co {
  g.trainSpeed = 900;
  if (!g.co.running('clack')) g.co.run(clack(g), 'clack');
  g.setControl(false);
  audio.play('whistle', { vol: 0.5, rate: 0.9 });
  yield 1.4;
  g.setControl(true);
}

function* beams(g: GameAPI): Co {
  state.beams = true;
  if (!g.co.running('clack')) g.co.run(clack(g), 'clack');
  yield 1.5;
  while (state.beams) {
    if (g.player.x > 2900) break;
    spawnAhead(g, 'beam', 3);
    yield 3.4 + Math.random() * 1.6;
  }
}

function* tunnel(g: GameAPI): Co {
  state.beams = false;
  yield 1.2;
  spawnAhead(g, 'tunnel', 1, 1700);
}

function* blank(g: GameAPI): Co {
  audio.play('paper_rip', { vol: 1, rate: 0.6 });
  audio.play('sting1', { vol: 0.8 });
  g.shake(0.4);
  g.startChase({ startOffset: -1000, max: 240 });
  yield 1.0;
  audio.loop('heart', 'heart_fast', 0.6, 0.3, 'sfx');
  audio.loop('chasebed', 'chase_bed', 0.4, 0.5, 'amb');
  g.hint('→', '→', 1.2);
}

function* bridge(g: GameAPI): Co {
  state.bridge = true;
  audio.play('rattle', { vol: 0.7 });
  g.hint('옆바람이 불 때는 굳어서 버틴다  ·  가로재는 뛰어넘는다', '옆바람이 불 때는 굳어서 버틴다  ·  가로재는 뛰어넘는다', 4);
  let gustOn = 0;
  let gustWait = 1.8;
  let bar = 1.0;
  while (g.player.x < 5060 || g.player.y < -200) {
    yield;
    const dt = g.dt;
    bar -= dt;
    if (bar <= 0) {
      spawnAhead(g, 'bar', 4, 1300);
      bar = 1.55 + Math.random() * 0.5;
    }
    if (gustOn > 0) {
      gustOn -= dt;
      g.wind = gustOn > 0 ? -260 : 0;
      // 바람 줄기
      if (Math.random() < 0.9) {
        const p = g.player;
        g.parts.add({ t: 'spark', x: p.x + rand(300, 900), y: p.y - rand(0, 420), vx: -1500, vy: rand(-20, 20), life: 0.7, size: 3, color: '#e6e6e2', drag: 0 });
      }
    } else {
      gustWait -= dt;
      if (gustWait <= 0) {
        gustOn = 0.95;
        gustWait = 2.3 + Math.random() * 1.2;
        audio.play('whoosh', { vol: 0.8, rate: 0.7 });
      }
    }
  }
  g.wind = 0;
  state.bridge = false;
}

function* end(g: GameAPI): Co {
  g.setControl(false);
  const c = (g as unknown as { chase: { max: number } }).chase;
  c.max = 0;
  const p = g.player as unknown as Player;
  audio.play('whistle', { vol: 1, rate: 0.85 });
  const cliff = g.entity<Hazard>('cliff');
  cliff?.spawn(g.cam.x + 1900 / g.cam.zoom);
  yield 0.6;
  audio.play('scrape', { vol: 0.9, rate: 0.5 });
  audio.play('rattle', { vol: 0.8 });
  p.state = 'scripted';
  p.scriptTarget = FRONT - 40;
  p.scriptSpeed = 330;
  yield () => !!cliff && cliff.x < FRONT + 260;
  // 뛰어오른다
  p.state = 'normal';
  p.body.vy = -1050;
  p.body.vx = 420;
  audio.play('swish2', { vol: 0.8 });
  audio.play('sting5', { vol: 0.6 });
  yield 0.55;
  g.goToLevel('archive');
}

function drawBack(ctx: CanvasRenderingContext2D, g: GameAPI, v: { x0: number; x1: number; y0: number; y1: number }) {
  const travel = (g as unknown as { travel: number }).travel;
  if (state.bridge) {
    // 철교 아래 강
    ctx.fillStyle = '#a3a29d';
    ctx.fillRect(v.x0 - 50, 140, v.x1 - v.x0 + 100, 3000);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      const y = 180 + i * 40;
      const off = (travel * (0.3 + i * 0.02)) % 400;
      for (let x = v.x0 - 400 - off; x < v.x1 + 400; x += 400) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 120, y);
        ctx.stroke();
      }
    }
    ctx.fillStyle = INK;
    ctx.fillRect(v.x0 - 50, 84, v.x1 - v.x0 + 100, 36);
  } else {
    ctx.fillStyle = '#4c4b47';
    ctx.fillRect(v.x0 - 50, 92, v.x1 - v.x0 + 100, 3000);
  }
  // 침목과 레일
  ctx.fillStyle = '#2a2a28';
  const step = 90;
  const off = travel % step;
  for (let x = Math.floor(v.x0 / step) * step - off; x < v.x1 + step; x += step) ctx.fillRect(x, 86, 46, 12);
  ctx.fillStyle = INK;
  ctx.fillRect(v.x0 - 50, 80, v.x1 - v.x0 + 100, 8);
}

export const rail: LevelDef = {
  id: 'rail',
  width: 8400,
  killY: 260,
  spawn: { x: 300, y: 0 },
  theme: () => fieldTheme(44),
  moving: true,
  solids,
  decor: [],
  entities,
  triggers,
  camZones: [{ x0: -2000, x1: 9000, zoom: 0.95, yOff: -40, lead: 240 }],
  scripts: { arrive, beams, tunnel, blank, bridge, end },
  startScript: 'arrive',
  drawBack,
  sheltered,
  onRestore: (g) => {
    state.bridge = false;
    state.beams = false;
    g.trainSpeed = 900;
    if (!g.co.running('clack')) g.co.run(clack(g), 'clack');
    // 여백이 이미 나타난 뒤의 체크포인트라면 다시 쫓아온다
    if (g.player.x > 3760 && (g as unknown as { fired: Set<string> }).fired.has('blank')) g.co.run(blank(g), 'blank');
  },
  ambience: () => {
    audio.loop('amb', 'train_engine', 0.4, 2);
    audio.loop('wind', 'amb_wind', 0.5, 2);
    audio.loop('ghost', 'amb_rumble', 0.25, 2);
  },
};

export const _unused = rand;
