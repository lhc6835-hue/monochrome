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
import { ease, hash1, lerp, rand } from '../../core/math';
import { Hazard, ROOF, CONTAINER_TOP } from '../entities4';
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
  if (c.kind === 'container') solids.push(inv(c.x + 40, CONTAINER_TOP, c.w - 80, -CONTAINER_TOP));
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
  const next = CARS[i + 1];
  // 컨테이너는 칸 사이가 아니라 컨테이너 벽에 기대어 세운다 (꼭대기에서 바로 올라설 수 있게)
  const x = next?.kind === 'container' ? next.x + 40 - 28 : c.x + c.w + 40;
  return { type: 'ladder', id: 'lad' + i, x, top, bottom: 0 };
};

const entities: EntityDef[] = [
  ...CARS.map((c): EntityDef => ({ type: 'car', id: c.id, x: c.x, w: c.w, kind: c.kind })),
  gapLadder(0, ROOF),
  gapLadder(1, CONTAINER_TOP),
  gapLadder(3, ROOF),
  gapLadder(4, ROOF),
  gapLadder(6, -390),
  R('t_child', 1440, { kind: 'child', savable: true, after: 'stay' }),
  { type: 'petal', id: 'tp_container', x: 2420, y: CONTAINER_TOP - 70, color: PETAL_COLORS[1] },
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
  { id: 'h_beam', x: 1900, w: 60, once: true, hint: { kb: '종소리와 오른쪽 신호등 = 철골이 온다  ·  지붕 위에서는 달리면서 {down} 로 굴러 밑으로', touch: '종소리와 오른쪽 신호등 = 철골이 온다  ·  지붕 위에서는 달리면서 굳기 버튼으로 굴러 밑으로', dur: 5 } },
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
  // 뛰어오른다 (허공으로 계속 나아간다)
  p.state = 'scripted';
  p.scriptTarget = FRONT + 1600;
  p.scriptSpeed = 420;
  p.body.vy = -1050;
  p.body.vx = 420;
  audio.play('swish2', { vol: 0.8 });
  audio.play('sting5', { vol: 0.6 });
  g.letterbox(true);
  // 꼭대기에 닿을 무렵: 시간이 멈춘 듯 느려지고, 끊긴 다리 아래의 아득한 협곡이 한눈에 들어온다
  yield () => p.body.vy > -300;
  audio.muffle(0.75, 0.6);
  audio.play('whistle', { vol: 0.5, rate: 0.5 });
  audio.loop('leapwind', 'amb_wind', 0.75, 0.8);
  g.camFocus = { x: p.x + 420, y: 270, zoom: 0.42, smooth: 0.8 };
  let t = 0;
  while (t < 3.6) {
    const rd = g.realDt;
    t += rd;
    g.timeScale = t < 0.5 ? lerp(1, 0.08, ease.outCubic(t / 0.5)) : t < 2.8 ? 0.08 : lerp(0.08, 1, (t - 2.8) / 0.8);
    // 손에 든 꽃에서 꽃잎 빛이 흩날린다
    if (Math.random() < rd * 22) {
      const c = g.petals[Math.floor(Math.random() * g.petals.length)] ?? PETAL_COLORS[0];
      g.parts.add({ t: 'spark', x: p.x + 20 + rand(-10, 10), y: p.y - 70 + rand(-10, 10), vx: rand(-320, -80), vy: rand(-160, 60), life: 3.2, size: rand(6, 11), color: c, drag: 0.12 });
    }
    // 심장이 두 번 뛴다
    for (const at of [0.9, 1.8]) if (t >= at && t - rd < at) audio.play('thud', { vol: 0.55, rate: 0.55 });
    yield;
  }
  g.timeScale = 1;
  audio.stopLoop('leapwind', 1.8);
  audio.muffle(0, 1.2);
  g.goToLevel('archive');
}

/** 끊긴 다리 아래: 아득한 협곡, 안개, 저 아래의 강, 너무 먼 건너편 */
function drawGorge(ctx: CanvasRenderingContext2D, x: number, g: GameAPI, v: { x0: number; x1: number; y0: number; y1: number }) {
  const bottom = Math.max(v.y1 + 200, 3200);
  ctx.save();
  // 허공 (위는 하늘과 같은 빛, 아래로 갈수록 짙은 안개)
  const sky = ctx.createLinearGradient(0, 40, 0, bottom);
  sky.addColorStop(0, '#cfceca');
  sky.addColorStop(0.55, '#a9a8a3');
  sky.addColorStop(1, '#6f6e6a');
  ctx.fillStyle = sky;
  ctx.fillRect(x, 40, v.x1 - x + 400, bottom);
  // 너무 먼 건너편 절벽 (안개에 반쯤 지워졌다)
  const far = x + 2600;
  ctx.fillStyle = 'rgba(150,149,144,0.55)';
  ctx.beginPath();
  ctx.moveTo(far, 2600);
  for (let y = 2600; y > 160; y -= 120) ctx.lineTo(far + 40 * hash1(y * 0.37) - 20 + (2600 - y) * 0.05, y);
  ctx.lineTo(far + 2600, 160);
  ctx.lineTo(far + 2600, 2600);
  ctx.fill();
  // 저 아래의 강
  ctx.fillStyle = '#8b8a85';
  ctx.fillRect(x, 1180, v.x1 - x + 400, 60);
  ctx.strokeStyle = 'rgba(235,235,230,0.35)';
  ctx.lineWidth = 3;
  const travel = (g as unknown as { travel: number }).travel;
  for (let i = 0; i < 40; i++) {
    const xx = x + ((i * 173 - travel * 0.05) % 3000 + 3000) % 3000;
    ctx.beginPath();
    ctx.moveTo(xx, 1195 + (i % 3) * 14);
    ctx.lineTo(xx + 90, 1195 + (i % 3) * 14);
    ctx.stroke();
  }
  // 안개 띠
  for (let i = 0; i < 4; i++) {
    const y = 420 + i * 230;
    const mg = ctx.createLinearGradient(0, y - 160, 0, y + 160);
    mg.addColorStop(0, 'rgba(225,225,221,0)');
    mg.addColorStop(0.5, `rgba(225,225,221,${0.35 - i * 0.05})`);
    mg.addColorStop(1, 'rgba(225,225,221,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(x - 200 + Math.sin(g.t * 0.2 + i) * 60, y - 160, v.x1 - x + 800, 320);
  }
  // 끊긴 다리 바로 아래로 떨어지는 절벽
  ctx.fillStyle = '#2f2e2b';
  ctx.beginPath();
  ctx.moveTo(x + 6, 40);
  let cx = x + 6;
  for (let y = 40; y < bottom; y += 90) {
    cx = x - 30 - (y - 40) * 0.08 + (hash1(y * 0.13) - 0.5) * 60;
    ctx.lineTo(cx, y);
  }
  ctx.lineTo(x - 3000, bottom);
  ctx.lineTo(x - 3000, 40);
  ctx.fill();
  ctx.restore();
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
  // 끊긴 다리 너머
  const cliff = g.entity<Hazard>('cliff');
  if (cliff && cliff.active && cliff.x < v.x1 + 200) drawGorge(ctx, cliff.x, g, v);
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
