/**
 * 구간 6 — 회색 숲
 *  A. 숲 입구 (천창에서 떨어져 낙엽 더미로, 첫 새 떼)                 -400 ~ 1500
 *  B. 바람 고개 (맞바람이 박자에 맞춰 분다: 바위 뒤에서 기다렸다가 건너기,
 *     나뭇가지 위 꽃잎, 바람 속에 굳은 나무꾼)                          1500 ~ 3450
 *  C. 숨바꼭질 마당 ("무궁화 꽃이 피었습니다"를 세는 술래 아이와 그 그림자,
 *     덤불 뒤에 숨은 채 굳은 아이들, 새 떼 = 술래를 부르는 소리)          3450 ~ 6450
 *  D. 새 떼의 길 (여백이 숲을 지우며 쫓아온다. 뒤에서 부는 바람을 타야만
 *     넓은 골짜기를 건널 수 있다 → 숲 끝 벼랑에서 바다로)                6450 ~ 9500
 */
import type { LevelDef, GameAPI, SolidDef, DecorDef, EntityDef, TriggerDef, CamFocus } from '../types';
import type { Co } from '../../core/co';
import type { Player } from '../player';
import { forestTheme } from '../../gfx/background';
import { audio } from '../../core/audio';
import { PETAL_COLORS } from '../../gfx/flower';
import { rand } from '../../core/math';
import type { Seeker } from '../entities6';
import { app } from '../../app';

const floor = (x0: number, x1: number): SolidDef => ({ x: x0, y: 0, w: x1 - x0, h: 3000, look: 'ground' });
const rock = (x: number, w = 120, h = 84): SolidDef => ({ x, y: -h, w, h, look: 'rock' });
const log = (x: number, w = 170, h = 70): SolidDef => ({ x, y: -h, w, h, look: 'log' });
const branch = (x: number, y: number, w: number, dir: 1 | -1 = 1): SolidDef => ({ x, y, w, h: 16, oneway: true, look: 'branch', dir } as SolidDef);

// 바람 고개의 바위 (바람이 오른쪽에서 불 때 왼쪽이 바람그늘)
const ROCKS = [1640, 2200, 2760];
// 뒤바람 구간의 골짜기
const GAPS: [number, number][] = [
  [7250, 7570],
  [7950, 8280],
  [8650, 8960],
];

const solids: SolidDef[] = [
  { x: -1400, y: -3000, w: 1000, h: 6000, look: 'invisible' },
  // A ~ B
  floor(-400, 1900),
  floor(2080, 2500),
  floor(2700, 3050),
  floor(3240, GAPS[0][0]),
  ...ROCKS.map((x) => rock(x)),
  // B 나뭇가지 (꽃잎)
  branch(2140, -150, 170, 1),
  branch(2290, -300, 180, -1),
  // C 숨바꼭질 마당
  log(4040),
  log(5330, 190, 76),
  branch(6060, -250, 200, -1),
  // D 골짜기 사이 땅
  floor(GAPS[0][1], GAPS[1][0]),
  floor(GAPS[1][1], GAPS[2][0]),
  floor(GAPS[2][1], 9420),
  { x: 9700, y: -3000, w: 400, h: 6000, look: 'invisible' },
];

const decor: DecorDef[] = [
  // A
  { icon: 'pine', x: -200, h: 620, color: '#2a2a28' },
  { icon: 'tree2', x: 380, h: 520, color: '#2a2a28' },
  { icon: 'pine', x: 1050, h: 700, color: '#2a2a28' },
  { icon: 'signpost', x: 1350, h: 170, color: '#2a2a28' },
  // B
  { icon: 'pine2', x: 2300, h: 760, color: '#262624' },
  { icon: 'pine', x: 2820, h: 560, color: '#2a2a28' },
  { icon: 'tree2', x: 3180, h: 480, color: '#2a2a28' },
  // C
  { icon: 'pine', x: 3600, h: 640, color: '#2a2a28' },
  { icon: 'tree2', x: 4700, h: 560, color: '#2a2a28' },
  { icon: 'pine', x: 5600, h: 600, color: '#2a2a28' },
  { icon: 'tree2', x: 6330, h: 620, color: '#1d1d1c' },
  // 숨은 아이들을 가리는 덤불 (인물 앞)
  { icon: 'tree2', shape: 'bush', x: 4390, h: 70, layer: 'front' },
  { icon: 'tree2', shape: 'bush', x: 4990, h: 68, layer: 'front' },
  { icon: 'tree2', shape: 'bush', x: 5820, h: 72, layer: 'front' },
  { icon: 'tree2', shape: 'bush', x: 3880, h: 70, layer: 'front' },
  // D
  { icon: 'pine', x: 6800, h: 680, color: '#2a2a28' },
  { icon: 'pine2', x: 7700, h: 720, color: '#2a2a28' },
  { icon: 'tree2', x: 8450, h: 540, color: '#2a2a28' },
  { icon: 'pine', x: 9200, h: 640, color: '#2a2a28' },
];

const R = (id: string, x: number, extra: Partial<Extract<EntityDef, { type: 'resident' }>> = {}): EntityDef => ({ type: 'resident', id, x, ...extra });

const entities: EntityDef[] = [
  // A
  { type: 'flock', id: 'fb_a', x: 720, n: 8, spread: 80 },
  R('f_hunter', 1180, { savable: true }),
  // B
  { type: 'petal', id: 'fp_branch', x: 2340, y: -380, color: PETAL_COLORS[1] },
  R('f_wood', 2965, { savable: true, kind: 'tall' }),
  // C
  R('f_hide1', 4385, { kind: 'child', savable: true, after: 'stay' }),
  R('f_hide2', 4985, { kind: 'child', savable: true, after: 'stay' }),
  R('f_hide3', 5815, { kind: 'child', savable: true, after: 'stay' }),
  { type: 'flock', id: 'fb_c1', x: 4660, n: 9, spread: 90 },
  { type: 'flock', id: 'fb_c2', x: 5560, n: 8, spread: 80 },
  R('f_tagger', 6230, { kind: 'child', savable: true, after: 'stay' }),
  { type: 'seeker', id: 'seeker', x: 6230, x0: 3720, child: 'f_tagger' },
  { type: 'petal', id: 'fp_tree', x: 6120, y: -330, color: PETAL_COLORS[6] },
  { type: 'memory', id: 'm_hide', x: 6440, art: 'hide' },
  // D
  { type: 'flock', id: 'fb_d1', x: 6950, n: 14, spread: 150 },
  { type: 'flock', id: 'fb_d2', x: 7760, n: 16, spread: 150 },
  { type: 'flock', id: 'fb_d3', x: 8460, n: 18, spread: 160 },
  { type: 'flock', id: 'fb_d4', x: 9150, n: 22, spread: 190 },
];

const triggers: TriggerDef[] = [
  { id: 'cp_f1', x: 1450, w: 60, checkpoint: true },
  { id: 'h_wind', x: 1540, w: 60, once: true, hint: { kb: '바람은 박자에 맞춰 분다  ·  바위 뒤에서 기다리거나 {down} 로 굳어서 버틴다', touch: '바람은 박자에 맞춰 분다  ·  바위 뒤에서 기다리거나 굳어서 버틴다', dur: 5 } },
  { id: 'cp_f2', x: 3400, w: 60, checkpoint: true },
  {
    id: 'h_seek',
    x: 3560,
    w: 60,
    once: true,
    hint: { kb: '술래가 다 세면 돌아본다  ·  그때 {down} 로 굳어 있지 않으면 들킨다', touch: '술래가 다 세면 돌아본다  ·  그때 굳어 있지 않으면 들킨다', dur: 6 },
  },
  { id: 'cp_f3', x: 5080, w: 60, checkpoint: true },
  { id: 'cp_f4', x: 6560, w: 60, checkpoint: true },
  { id: 'blank', x: 6760, w: 60, once: true, script: 'blank' },
  { id: 'exit', x: 9260, w: 120, once: true, script: 'exit' },
];

// ------------------------------------------------------------------
// 바람
// ------------------------------------------------------------------
function sheltered(x: number, y: number) {
  // 바위 왼쪽(바람그늘)에 붙어 있으면 맞바람을 피한다
  for (const r of ROCKS) if (x > r - 140 && x < r + 6 && y > -40) return true;
  return false;
}

/** 바람 줄기와 날리는 잎 */
function gustFx(g: GameAPI, dir: number, strength: number) {
  const p = g.player;
  const cam = g.cam;
  if (Math.random() < strength) {
    g.parts.add({ t: 'spark', x: cam.x - dir * rand(700, 1200), y: p.y - rand(-20, 520), vx: dir * 1500, vy: rand(-30, 30), life: 0.9, size: 3, color: '#f2f2ee', drag: 0 });
  }
  if (Math.random() < strength * 0.7) {
    g.parts.add({ t: 'shard', x: cam.x - dir * rand(600, 1100), y: p.y - rand(0, 600), vx: dir * rand(700, 1100), vy: rand(-120, 60), life: 1.6, size: rand(7, 12), w: rand(4, 6), rot: rand(0, 6), vr: rand(-12, 12), color: '#3c3c3a', drag: 0.2, g: 120 });
  }
}

/**
 * 날씨: 박자 있는 돌풍. 구역에 들어와 있으면 언제나 분다 (죽었다 살아나도 그대로).
 *  바람 고개: 맞바람 (오른쪽 → 왼쪽)
 *  숲 끝 (여백이 쫓아오는 동안): 뒤바람 (왼쪽 → 오른쪽)
 * 예고(잎이 먼저 날리고 낮은 소리) 0.55초 → 돌풍 1초 → 쉼. 쉼의 길이는 정해진 순서로 돌아서, 세어 두면 맞출 수 있다.
 */
function* weather(g: GameAPI): Co {
  const W = g as unknown as { wind: number };
  let phase: 'rest' | 'warn' | 'gust' = 'rest';
  let t = 0;
  let i = 0;
  let zone = 0;
  while (true) {
    const x = g.player.x;
    let dir = 0,
      power = 0,
      pattern = [1];
    if (x > 1450 && x < 3350) {
      dir = -1;
      power = 330;
      pattern = [1.7, 1.7, 1.3, 2.1];
    } else if (x > 6500 && g.chaseActive()) {
      dir = 1;
      power = 340;
      pattern = [1.0, 1.0, 1.2];
    }
    if (dir !== zone) {
      zone = dir;
      phase = 'rest';
      t = 0;
      i = 0;
      W.wind = 0;
    }
    if (dir === 0 || g.isDead()) {
      W.wind = 0;
      yield;
      continue;
    }
    t += g.dt;
    if (phase === 'rest') {
      if (Math.random() < g.dt * 3) gustFx(g, dir, 0.2);
      if (t >= pattern[i % pattern.length]) {
        phase = 'warn';
        t = 0;
        audio.play('whoosh', { vol: 0.35, rate: 0.45 });
      }
    } else if (phase === 'warn') {
      gustFx(g, dir, 0.35 + t);
      if (t >= 0.55) {
        phase = 'gust';
        t = 0;
        audio.play('whoosh', { vol: 0.85, rate: dir < 0 ? 0.7 : 0.85 });
      }
    } else {
      W.wind = dir * power * Math.min(1, t / 0.12, Math.max(0, 1.0 - t) / 0.15);
      gustFx(g, dir, 1);
      if (t >= 1.0) {
        phase = 'rest';
        t = 0;
        i++;
        W.wind = 0;
      }
    }
    yield;
  }
}

// ------------------------------------------------------------------
// 스크립트
// ------------------------------------------------------------------
function* arrive(g: GameAPI): Co {
  g.setControl(false);
  // 천창 너머에서 떨어져 낙엽 더미 위로
  const b = g.player.body;
  b.y = -760;
  b.vy = 0;
  audio.play('flip2', { vol: 0.6 });
  yield () => b.onGround;
  audio.play('land', { vol: 0.5, rate: 0.8 });
  for (let i = 0; i < 18; i++) g.parts.add({ t: 'shard', x: g.player.x + rand(-60, 60), y: g.player.y - rand(0, 20), vx: rand(-260, 260), vy: rand(-520, -200), life: 1.6, size: rand(8, 13), w: rand(4, 6), rot: rand(0, 6), vr: rand(-10, 10), color: '#3a3a38', drag: 0.6, g: 700, floor: 0 });
  yield 1.0;
  g.setControl(true);
}

function* blank(g: GameAPI): Co {
  audio.play('paper_rip', { vol: 1, rate: 0.6 });
  audio.play('sting1', { vol: 0.8 });
  g.shake(0.35);
  g.startChase({ startOffset: -1150, max: 225 });
  yield 0.8;
  audio.loop('heart', 'heart_fast', 0.6, 0.3, 'sfx');
  audio.loop('chasebed', 'chase_bed', 0.45, 0.5, 'amb');
  g.hint('뒤에서 부는 바람을 타고 뛰어야 골짜기를 건널 수 있다', '뒤에서 부는 바람을 타고 뛰어야 골짜기를 건널 수 있다', 4);
}

function* exit(g: GameAPI): Co {
  const S = g as unknown as { chase: { max: number; cine: boolean }; camFocus: CamFocus | null; cineFade: number; wind: number };
  S.chase.max = 0;
  S.chase.cine = true;
  g.setControl(false);
  S.wind = 0;
  const p = g.player as unknown as Player;
  p.state = 'scripted';
  p.scriptTarget = 9440;
  p.scriptSpeed = 335;
  audio.stopLoop('heart', 2);
  audio.stopLoop('chasebed', 2);
  // 숲이 끝나고, 아래로 회색 바다가 펼쳐진다
  const cam: CamFocus = { x: 9300, y: -200, zoom: 0.8, smooth: 0.8 };
  S.camFocus = cam;
  yield () => p.x > 9400;
  p.body.vy = -700;
  p.body.vx = 300;
  p.scriptTarget = 9700;
  p.scriptSpeed = 300;
  audio.play('swish2', { vol: 0.7 });
  audio.play('whoosh', { vol: 0.7, rate: 0.6 });
  let t = 0;
  let splashed = false;
  while (S.cineFade < 1) {
    t += g.dt;
    cam.x = 9560;
    cam.y = Math.min(260, -160 + t * 420);
    cam.zoom = 0.62;
    cam.smooth = 0.5;
    if (!splashed && p.body.y > SEA) {
      splashed = true;
      audio.play('splash2', { vol: 0.9 });
      g.parts.puff(p.body.x, SEA, 16, 1.6);
      for (let i = 0; i < 14; i++) g.parts.add({ t: 'spark', x: p.body.x + rand(-30, 30), y: SEA, vx: rand(-260, 260), vy: rand(-620, -260), life: 0.9, size: 5, color: '#e8e8e4', drag: 0.4, g: 1600 });
    }
    // 물 위로 떠올라 머리만 내민 채 흔들린다
    if (splashed) {
      p.body.vy = 0;
      p.body.vx = 0;
      p.scriptTarget = null;
      p.body.y += (SEA + 112 + Math.sin(t * 3) * 6 - p.body.y) * Math.min(1, g.dt * 6);
    }
    if (splashed && t > 0.4) S.cineFade = Math.min(1, S.cineFade + g.dt / 1.3);
    yield;
  }
  g.stopChase();
  g.goToLevel('sea');
}

const SEA = 380;
/** 숲 끝 벼랑 아래: 회색 바다 (다음 구간) */
function drawBack(ctx: CanvasRenderingContext2D, g: GameAPI, v: { x0: number; x1: number; y0: number; y1: number }) {
  // 술래의 그림자 (나무들 뒤 안개에)
  g.entity<Seeker>('seeker')?.drawShadow(g);
  g.cam.apply(ctx, app.screen, 1);
  if (v.x1 < 9300) return;
  const x0 = 9420;
  const sea = SEA;
  // 벼랑 아래 먼 바다
  ctx.fillStyle = '#8e8e8a';
  ctx.fillRect(x0, sea, v.x1 - x0 + 200, 4000);
  ctx.fillStyle = '#b4b4b0';
  ctx.fillRect(x0, sea - 2, v.x1 - x0 + 200, 6);
  // 물결
  ctx.strokeStyle = 'rgba(230,230,226,0.55)';
  ctx.lineWidth = 3;
  for (let r = 0; r < 7; r++) {
    const y = sea + 30 + r * 46;
    ctx.beginPath();
    for (let x = x0; x < v.x1 + 100; x += 24) {
      const yy = y + Math.sin(x * 0.02 + g.t * 1.4 + r) * 5;
      if (x === x0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // 벼랑 면
  ctx.fillStyle = '#1a1a19';
  ctx.beginPath();
  ctx.moveTo(x0, 0);
  ctx.lineTo(x0 + 40, 180);
  ctx.lineTo(x0 + 10, 340);
  ctx.lineTo(x0 + 60, sea + 20);
  ctx.lineTo(x0 - 200, sea + 400);
  ctx.lineTo(x0 - 200, 0);
  ctx.closePath();
  ctx.fill();
}

export const forest: LevelDef = {
  id: 'forest',
  width: 9600,
  killY: 800,
  spawn: { x: 0, y: -900 },
  theme: () => forestTheme(9600, 66),
  solids,
  decor,
  entities,
  triggers,
  camZones: [
    { x0: 1500, x1: 3400, zoom: 0.9, yOff: -40 },
    { x0: 3450, x1: 6450, zoom: 0.82, yOff: -60 },
    { x0: 6450, x1: 9600, zoom: 0.86, lead: 300 },
  ],
  scripts: { arrive, blank, exit },
  startScript: 'arrive',
  sheltered,
  drawBack,
  onRestore: (g) => {
    (g as unknown as { wind: number }).wind = 0;
    g.co.run(weather(g), 'weather');
    g.co.run(leaves(g), 'leaves');
  },
  ambience: () => {
    audio.loop('amb', 'amb_wind', 0.35, 3);
    audio.loop('wind', 'amb_ghost', 0.12, 3);
  },
};

/** 체크포인트에서 다시 시작했을 때도 잎은 떨어진다 */
function* leaves(g: GameAPI): Co {
  while (true) {
    const p = g.player;
    if (Math.random() < g.dt * 4) g.parts.add({ t: 'shard', x: p.x + rand(-900, 900), y: p.y - 900, vx: rand(-40, 40), vy: rand(60, 110), life: 6, size: rand(7, 11), w: rand(4, 6), rot: rand(0, 6), vr: rand(-3, 3), color: '#4a4a47', drag: 0.1, g: 8, floor: 0 });
    yield;
  }
}

// 골짜기 넓이 참고 (뒤바람 없이 달려 뛰면 약 240px, 뒤바람을 타면 약 400px)
void GAPS;
