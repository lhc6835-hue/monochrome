/**
 * 구간 7 — 표지의 바다
 *  A. 표류 해변 (숲 벼랑에서 뛰어든 바다에서 헤엄쳐 나온다. 밀려오는 파도, 난파선, 상자)   -700 ~ 1900
 *  B. 조수 동굴 (썰물 8초 → 밀물 3초 → 만조 6초 → 썰물 3초. 밀물 전에 웅덩이의 아이를,
 *     만조에만 닿는 공기 주머니의 꽃잎, 만조에 헤엄쳐 올라가는 출구)                       1900 ~ 4300
 *  C. 부표 길 (오르내리는 부표, 밟으면 가라앉는 무거운 부표, 박자에 맞춰 덮치는 큰 파도는 굳어서 버틴다,
 *     난파선 돛대 꼭대기의 꽃잎, 부두의 짐꾼)                                               4500 ~ 7100
 *  D. 등대 (사다리로 올라 등불을 켜면 불빛이 바다를 훑고, 불빛이 닿는 동안만 안개 속 판자 다리가 생긴다) 7100 ~ 8850
 *  E. 폭풍 추격 (번개가 칠 때만 앞이 보이는 방파제. 옆에서 덮치는 파도, 뒤에서 바다를 지우는 하얀 파도.
 *     끝에서 지워진 수평선 앞에 서고, 하얀 파도에 삼켜진다)                                  8850 ~ 11800
 */
import type { LevelDef, GameAPI, SolidDef, DecorDef, EntityDef, TriggerDef, BlankCtl, CamFocus } from '../types';
import type { Co } from '../../core/co';
import type { Player } from '../player';
import type { Resident } from '../entities';
import type { Tide } from '../entities7';
import { seaTheme } from '../../gfx/background';
import { audio } from '../../core/audio';
import { PETAL_COLORS } from '../../gfx/flower';
import { PAPER } from '../../gfx/blank';
import { clamp, ease, lerp, rand } from '../../core/math';

const floor = (x0: number, x1: number, y = 0): SolidDef => ({ x: x0, y, w: x1 - x0, h: 3000, look: 'ground' });
const wall = (x: number, y0: number, y1: number, w = 30): SolidDef => ({ x, y: y0, w, h: y1 - y0, look: 'brick' });
const deck = (x0: number, x1: number, y: number): SolidDef => ({ x: x0, y, w: x1 - x0, h: 22, oneway: true, look: 'bridge' });

const CAVE = { x0: 1950, x1: 4250, ceil: -330 };
const TOWER = { x0: 7300, x1: 7600, top: -1520 };
const BREAK = 8850;
const END = 11700;

const solids: SolidDef[] = [
  { x: -1600, y: -3000, w: 900, h: 6000, look: 'invisible' },
  // A 바다 밑 → 물속 바위 턱 → 해변
  { x: -700, y: 420, w: 1220, h: 3000, look: 'ground' },
  { x: 500, y: 90, w: 120, h: 330, look: 'rock' },
  floor(620, 2700),
  { x: 1200, y: -220, w: 260, h: 220, look: 'hull' },
  // B 조수 동굴
  { x: CAVE.x0, y: -3000, w: CAVE.x1 - CAVE.x0, h: 3000 + CAVE.ceil, look: 'ceiling' },
  floor(2700, 3500, 220),
  floor(3500, 4500, -100),
  // C 부두와 부표
  floor(4500, 4720),
  { x: 4720, y: 700, w: 2180, h: 3000, look: 'ground' },
  { x: 5550, y: 0, w: 210, h: 22, look: 'platform' },
  { x: 5772, y: -130, w: 80, h: 14, oneway: true, look: 'spar' },
  { x: 5792, y: -270, w: 60, h: 14, oneway: true, look: 'spar' },
  floor(6900, TOWER.x1 + 200),
  // D 등대 (안쪽은 사다리, 바깥 오른쪽 발코니에서 안개 다리로)
  wall(TOWER.x0, TOWER.top, -160),
  // 오른쪽 벽: 숨은 방 문(-900~-760), 발코니 문(-520~-380)
  wall(TOWER.x1 - 30, TOWER.top, -900),
  wall(TOWER.x1 - 30, -760, -520),
  wall(TOWER.x1 - 30, -380, 0),
  { x: TOWER.x0, y: TOWER.top - 30, w: TOWER.x1 - TOWER.x0, h: 30, look: 'brick' },
  deck(TOWER.x0 + 30, TOWER.x1 - 30, -380),
  deck(TOWER.x0 + 30, TOWER.x1 - 30, -760),
  deck(TOWER.x0 + 30, TOWER.x1 - 30, -1140),
  deck(TOWER.x0 + 30, TOWER.x1 - 30, -1300),
  { x: TOWER.x1, y: -380, w: 110, h: 22, look: 'platform' },
  { x: TOWER.x1, y: -760, w: 120, h: 22, look: 'platform' },
  { x: TOWER.x1 + 200, y: 700, w: BREAK - TOWER.x1 - 200, h: 3000, look: 'ground' },
  // E 방파제 (부서진 틈 셋)
  floor(BREAK, 9600),
  floor(9760, 10400),
  { x: 10150, y: -105, w: 100, h: 105, look: 'rock' },
  floor(10560, 11000),
  floor(11160, END),
  { x: END + 300, y: -3000, w: 400, h: 6000, look: 'invisible' },
];

const decor: DecorDef[] = [
  { icon: 'warning', x: -200, y: -260, h: 80, color: '#2a2a28' },
  { icon: 'signpost', x: 900, h: 160, color: '#2a2a28' },
  { icon: 'umbrella', x: 1650, h: 170, color: '#2a2a28', rot: 0.4 },
  { icon: 'lighthouse', x: 7450, y: 0, h: 120, color: '#2a2a28' },
  { icon: 'crane', x: 5000, y: 0, h: 560, color: '#3a3a38' },
  { icon: 'warning', x: 9300, h: 90, color: '#2a2a28' },
  { icon: 'lamp', x: 10000, h: 300, color: '#2a2a28' },
  { icon: 'lamp', x: 10800, h: 300, color: '#2a2a28' },
];

const R = (id: string, x: number, extra: Partial<Extract<EntityDef, { type: 'resident' }>> = {}): EntityDef => ({ type: 'resident', id, x, ...extra });

const entities: EntityDef[] = [
  // A
  { type: 'water', id: 'w_beach', x0: -700, x1: 620, floor: 420, low: -20, swim: true },
  { type: 'box', id: 's_crate', x: 980, size: 100 },
  R('s_fisher', 780, { savable: true }),
  { type: 'flock', id: 'sb_a', x: 1600, n: 6, spread: 70 },
  // B
  { type: 'tide', id: 'tide', x0: CAVE.x0, x1: CAVE.x1, floor: 440, low: 260, high: -150, timing: [8, 3, 6, 3], swim: true, post: 2120, offset: 0 },
  R('s_tidekid', 2460, { kind: 'child', savable: true, leaveTo: 1300 }),
  { type: 'petal', id: 's_p_air', x: 3150, y: -185, color: PETAL_COLORS[2] },
  // C
  { type: 'water', id: 'w_harbor', x0: 4720, x1: 6900, floor: 700, low: 60 },
  { type: 'buoy', id: 'b1', x: 4900, y: 30, amp: 18, period: 2.6, phase: 0 },
  { type: 'buoy', id: 'b2', x: 5140, y: 30, amp: 14, period: 3.0, phase: 1.3, heavy: true },
  { type: 'buoy', id: 'b3', x: 5370, y: 30, amp: 24, period: 2.4, phase: 2.2 },
  { type: 'buoy', id: 'b4', x: 5960, y: 30, amp: 22, period: 2.8, phase: 0.6 },
  { type: 'buoy', id: 'b5', x: 6190, y: 30, amp: 14, period: 3.2, phase: 2.9, heavy: true },
  { type: 'buoy', id: 'b6', x: 6430, y: 30, amp: 26, period: 2.5, phase: 1.7 },
  { type: 'buoy', id: 'b7', x: 6660, y: 30, amp: 20, period: 2.7, phase: 0.2 },
  R('s_porter', 5660, { y: 0, savable: true, after: 'stay' }),
  { type: 'petal', id: 's_p_mast', x: 5822, y: -330, color: PETAL_COLORS[4] },
  { type: 'flock', id: 'sb_c', x: 7050, n: 8, spread: 90 },
  // D
  { type: 'ladder', id: 's_l1', x: TOWER.x0 + 60, top: -380, bottom: 0 },
  { type: 'ladder', id: 's_l2', x: TOWER.x1 - 60, top: -760, bottom: -380 },
  { type: 'ladder', id: 's_l3', x: TOWER.x0 + 60, top: -1140, bottom: -760 },
  { type: 'ladder', id: 's_l4', x: TOWER.x1 - 60, top: -1300, bottom: -1140 },
  { type: 'petal', id: 's_p_room', x: TOWER.x1 + 70, y: -860, color: PETAL_COLORS[5] },
  R('s_keeper', TOWER.x0 + 75, { y: -1300, savable: true, after: 'stay', kind: 'tall' }),
  { type: 'lever', id: 's_lamp', x: TOWER.x1 - 62, y: -1300, signal: 'lamp' },
  { type: 'beacon', id: 'beacon', x: 7450, y: TOWER.top - 60, mid: 1.05, amp: 0.34, period: 9.5, len: 2300, half: 0.15, signal: 'lamp', sweep: [6.5, 2.2] },
  { type: 'water', id: 'w_fog', x0: TOWER.x1 + 200, x1: BREAK, floor: 700, low: 60 },
  { type: 'litplank', id: 'fp1', x: 7760, y: -360, w: 150, by: 'beacon', hold: 1.4 },
  { type: 'litplank', id: 'fp2', x: 7985, y: -320, w: 150, by: 'beacon', hold: 1.4 },
  { type: 'litplank', id: 'fp3', x: 8210, y: -270, w: 150, by: 'beacon', hold: 1.4 },
  { type: 'litplank', id: 'fp4', x: 8435, y: -220, w: 150, by: 'beacon', hold: 1.4 },
  { type: 'litplank', id: 'fp5', x: 8650, y: -170, w: 150, by: 'beacon', hold: 1.4 },
  // E
  { type: 'water', id: 'w_storm', x0: BREAK, x1: END + 300, floor: 700, low: 120 },
  { type: 'petal', id: 's_p_rail', x: 10200, y: -250, color: PETAL_COLORS[0] },
];

const triggers: TriggerDef[] = [
  { id: 'cp_s1', x: 1700, w: 60, checkpoint: true },
  { id: 'cp_s2', x: 1880, w: 50, checkpoint: true },
  { id: 'cave', x: 1990, w: 60, once: true, script: 'cave' },
  { id: 'cp_s3', x: 4380, w: 60, y: -400, h: 400, checkpoint: true, spawnY: -100 },
  { id: 'h_buoy', x: 4560, w: 60, once: true, hint: { kb: '큰 파도가 오면 {down} 로 굳어서 버틴다  ·  무거운 부표는 밟으면 가라앉는다', touch: '큰 파도가 오면 굳어서 버틴다  ·  무거운 부표는 밟으면 가라앉는다', dur: 5 } },
  { id: 'cp_s4', x: 5620, w: 80, y: -200, h: 200, checkpoint: true },
  { id: 'cp_s5', x: 7050, w: 60, checkpoint: true },
  { id: 'cp_s6', x: TOWER.x0 + 60, w: 180, y: -1460, h: 160, checkpoint: true, spawnY: -1300 },
  { id: 'h_fog', x: TOWER.x1 + 20, w: 80, y: -520, h: 140, once: true, hint: { kb: '불빛이 닿는 동안만 판자가 생긴다  ·  불빛을 따라 건넌다', dur: 4 } },
  { id: 'cp_s6b', x: TOWER.x1 + 10, w: 90, y: -520, h: 140, checkpoint: true, spawnX: TOWER.x1 + 50, spawnY: -380 },
  { id: 'cp_s7', x: BREAK + 60, w: 60, checkpoint: true },
  { id: 'storm', x: BREAK + 200, w: 60, once: true, script: 'storm' },
  { id: 'swallow', x: END - 260, w: 120, once: true, script: 'swallow' },
];

// ------------------------------------------------------------------
// 바다의 날씨: 해변 파도 · 항구의 큰 파도 · 폭풍 (번개, 비, 옆에서 덮치는 파도)
// ------------------------------------------------------------------
type WaveState = { phase: 'rest' | 'warn' | 'hit'; t: number; i: number };
const waveFx = { warn: 0, hit: 0 };

function spray(g: GameAPI, amount: number, fromRight = true) {
  const p = g.player;
  const n = Math.floor(amount);
  for (let i = 0; i < n; i++) g.parts.add({ t: 'spark', x: g.cam.x + (fromRight ? rand(500, 1100) : rand(-1100, -500)), y: p.y - rand(-40, 380), vx: fromRight ? rand(-1500, -900) : rand(900, 1500), vy: rand(-200, 80), life: 0.8, size: rand(3, 6), color: '#f0f0ec', drag: 0.3, g: 600 });
}

function waveStep(g: GameAPI, st: WaveState, pattern: number[], warn: number, hit: number, power: number, sweeps = false) {
  const W = g as unknown as { wind: number };
  st.t += g.dt;
  if (st.phase === 'rest') {
    W.wind = 0;
    (g as unknown as { waveWarn: number }).waveWarn = 0;
    if (st.t >= pattern[st.i % pattern.length]) {
      st.phase = 'warn';
      st.t = 0;
      audio.play('amb_rumble', { vol: 0.55, rate: 1.4 });
      audio.play('whoosh', { vol: 0.35, rate: 0.4 });
    }
  } else if (st.phase === 'warn') {
    waveFx.warn = Math.max(0.01, st.t / warn);
    (g as unknown as { waveWarn: number }).waveWarn = 1;
    if (Math.random() < 0.5) spray(g, 1);
    if (st.t >= warn) {
      st.phase = 'hit';
      st.t = 0;
      audio.play('splash2', { vol: 0.9, rate: 0.7 });
      audio.play('whoosh', { vol: 0.8, rate: 0.6 });
      g.shake(0.25);
    }
  } else {
    waveFx.warn = 0;
    waveFx.hit = 1 - st.t / hit;
    W.wind = -power * Math.min(1, st.t / 0.08, Math.max(0, hit - st.t) / 0.12);
    spray(g, 3);
    // 폭풍의 파도: 굳어서 버티지 않으면 방파제 밖으로 쓸려 간다
    const p = g.player;
    if (sweeps && st.t > 0.1 && !p.frozen && !g.isDead() && p.y > -60) {
      p.body.vy = -520;
      p.body.vx = -260;
      g.parts.puff(p.x, p.y - 40, 18, 1.8);
      audio.play('splash1', { vol: 0.9 });
      g.kill('drown');
    }
    if (st.t >= hit) {
      st.phase = 'rest';
      st.t = 0;
      st.i++;
      W.wind = 0;
      waveFx.hit = 0;
    }
  }
}

function* seaWeather(g: GameAPI): Co {
  const S = g as unknown as { darkBoost: number; wind: number; flash: number };
  const shore: WaveState = { phase: 'rest', t: 1, i: 0 };
  const harbor: WaveState = { phase: 'rest', t: 0, i: 0 };
  const storm: WaveState = { phase: 'rest', t: 0, i: 0 };
  let bolt = 2;
  let kidUnder = 0;
  while (true) {
    const p = g.player;
    const x = p.x;
    // 어두움: 동굴 / 등대 안 / 폭풍
    // (끝의 하얀 수평선 앞에서는 폭풍이 걷힌다)
    const target = g.co.running('swallow') ? 0.12 : x > CAVE.x0 + 40 && x < CAVE.x1 ? 0.55 : x > TOWER.x0 && x < TOWER.x1 ? 0.45 : x > END - 500 ? 0.45 : x > BREAK ? 0.82 : 0;
    S.darkBoost += (target - S.darkBoost) * Math.min(1, g.dt * 2);
    waveFx.warn = 0;
    waveFx.hit = 0;
    (g as unknown as { waveWarn: number }).waveWarn = 0;
    if (g.isDead()) S.wind = 0;
    else if (x < 900) waveStep(g, shore, [3.0, 3.6], 0.6, 0.7, 210);
    else if (x > 4560 && x < 7000) waveStep(g, harbor, [3.2, 3.2, 2.4, 4.0], 0.8, 0.7, 430);
    else if (x > BREAK + 200 && g.chaseActive() && !(g as unknown as { chase: { cine: boolean } }).chase.cine) {
      waveStep(g, storm, [3.0, 3.4, 2.6, 3.6], 0.75, 0.5, 300, true);
      // 번개
      bolt -= g.dt;
      if (bolt <= 0) {
        bolt = rand(1.2, 2.8);
        S.flash = 1;
        audio.play('slam', { vol: 0.7, rate: 0.35 });
        audio.play('amb_rumble', { vol: 0.8, rate: 0.7, delay: 0.25 });
      }
    } else S.wind = 0;
    // 비
    if (x > BREAK) {
      for (let i = 0; i < 4; i++) g.parts.add({ t: 'spark', x: g.cam.x + rand(-1300, 1300), y: g.cam.y - 700, vx: -380, vy: 1700, life: 0.75, size: 2, color: '#d6d6d2', drag: 0 });
    }
    // 웅덩이의 아이: 굳은 채 물에 잠기면 바다가 데려간다
    const kid = g.entity<Resident>('s_tidekid');
    const tide = g.entity<Tide>('tide');
    if (kid && tide && kid.state === 'frozen' && !kid.locked) {
      if (tide.level < kid.body.y - kid.scale + 10) kidUnder += g.dt;
      else kidUnder = 0;
      if (kidUnder > 1.6) {
        kid.lose(g);
        audio.play('bubble1', { vol: 0.6 });
        audio.play('bubble2', { vol: 0.5, delay: 0.3 });
      }
    }
    yield;
  }
}

function* arrive(g: GameAPI): Co {
  // 벼랑에서 뛰어든 그대로, 물 위에 떠 있다
  g.setControl(false);
  const S = g as unknown as { fadeColor: string; fadeA: number };
  S.fadeColor = '#000';
  audio.play('splash1', { vol: 0.6 });
  yield 1.2;
  g.setControl(true);
  g.hint('물에서는 헤엄친다  ·  {jump} 로 물 위로 차오른다', '물에서는 헤엄친다  ·  점프 버튼으로 물 위로 차오른다', 4);
}

function* cave(g: GameAPI): Co {
  // 들어서는 순간부터 썰물이 8초 남는다
  const tide = g.entity<Tide>('tide');
  if (tide) tide.t = 0;
  g.hint('밧줄의 매듭이 다 하얘지면 물이 찬다', '밧줄의 매듭이 다 하얘지면 물이 찬다', 4);
}

function* stormStart(g: GameAPI): Co {
  audio.play('paper_rip', { vol: 1, rate: 0.55 });
  audio.play('sting1', { vol: 0.8 });
  g.shake(0.4);
  g.startChase({ startOffset: -1100, max: 185 });
  yield 0.8;
  audio.loop('heart', 'heart_fast', 0.6, 0.3, 'sfx');
  audio.loop('chasebed', 'chase_bed', 0.45, 0.5, 'amb');
  g.hint('파도가 부풀어 오르면 {down} 로 굳는다  ·  굳지 않으면 쓸려 간다', '파도가 부풀어 오르면 굳는다  ·  굳지 않으면 쓸려 간다', 4);
}

/** 지워진 수평선 앞에서, 하얀 파도가 솟아올라 삼킨다 */
function* swallow(g: GameAPI): Co {
  const S = g as unknown as { chase: { front: number; cine: boolean; max: number }; blankCtl: BlankCtl | null; camFocus: CamFocus | null; cineFade: number; cineFadeColor: string; wind: number; timeScale: number };
  const p = g.player as unknown as Player;
  S.chase.cine = true;
  g.setControl(false);
  S.wind = 0;
  p.state = 'scripted';
  p.scriptTarget = END - 40;
  p.scriptSpeed = 300;
  const cam: CamFocus = { x: END - 300, y: -320, zoom: 0.75, smooth: 0.8 };
  S.camFocus = cam;
  audio.stopLoop('chasebed', 2);
  yield () => p.x > END - 60;
  p.facing = 1;
  audio.play('sting5', { vol: 0.6 });
  yield 1.0;
  // 돌아본다: 하얀 파도가 솟는다
  p.facing = -1;
  const ctl: BlankCtl = { bx: S.chase.front - 60, by: 300, lean: -0.1, head: -0.2, hand: null, hand2: [2.6, 0.3] };
  S.blankCtl = ctl;
  audio.play('whoosh', { vol: 1, rate: 0.4 });
  audio.play('amb_rumble', { vol: 1, rate: 0.5 });
  let t = 0;
  const bx0 = ctl.bx;
  S.cineFadeColor = PAPER;
  while (S.cineFade < 1) {
    t += g.dt;
    const k = ease.inOutSine(clamp(t / 2.2));
    S.chase.front = lerp(bx0 + 60, p.x - 40, ease.inCubic(clamp(t / 2.6)));
    ctl.bx = S.chase.front - 120;
    ctl.by = lerp(300, -40, k);
    ctl.lean = lerp(-0.1, 0.45, ease.inCubic(clamp((t - 1.4) / 1.0)));
    // 두 팔을 벌리며 덮는다
    ctl.hand = [p.x + 30, lerp(-700, p.y - 120, ease.inCubic(clamp((t - 1.3) / 1.2)))];
    ctl.hand2 = [lerp(2.6, 2.0, k), 0.3];
    cam.x = lerp(END - 300, p.x - 200, k);
    cam.zoom = lerp(0.75, 0.62, k);
    if (t > 2.3) S.cineFade = Math.min(1, S.cineFade + g.dt / 0.9);
    yield;
  }
  g.stopChase();
  g.goToLevel('blank');
}

// ------------------------------------------------------------------
// 그리기: 동굴 안쪽 벽, 등대 안쪽, 돛대, 큰 파도, 지워진 수평선
// ------------------------------------------------------------------
function drawBack(ctx: CanvasRenderingContext2D, g: GameAPI, v: { x0: number; x1: number; y0: number; y1: number }) {
  // 동굴 안쪽 바위벽
  if (v.x1 > CAVE.x0 && v.x0 < CAVE.x1) {
    ctx.fillStyle = '#3a3a38';
    ctx.fillRect(CAVE.x0, CAVE.ceil, CAVE.x1 - CAVE.x0, 800);
    ctx.fillStyle = '#323230';
    for (let i = 0; i < 14; i++) {
      const x = CAVE.x0 + 60 + i * 165;
      ctx.beginPath();
      ctx.ellipse(x, CAVE.ceil + 120 + ((i * 53) % 90), 70, 40, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 등대 안쪽
  if (v.x1 > TOWER.x0 && v.x0 < TOWER.x1) {
    ctx.fillStyle = '#4a4a47';
    ctx.fillRect(TOWER.x0, TOWER.top, TOWER.x1 - TOWER.x0, -TOWER.top);
    ctx.fillStyle = '#3f3f3c';
    for (let y = TOWER.top + 40; y < 0; y += 60) ctx.fillRect(TOWER.x0, y, TOWER.x1 - TOWER.x0, 4);
    // 꼭대기 등불 방의 유리
    ctx.fillStyle = '#d9d9d5';
    ctx.fillRect(TOWER.x0 + 40, TOWER.top - 150, TOWER.x1 - TOWER.x0 - 80, 110);
    ctx.fillStyle = '#1b1b1a';
    ctx.fillRect(TOWER.x0 + 20, TOWER.top - 170, TOWER.x1 - TOWER.x0 - 40, 22);
    ctx.beginPath();
    ctx.moveTo(TOWER.x0 + 20, TOWER.top - 170);
    ctx.lineTo((TOWER.x0 + TOWER.x1) / 2, TOWER.top - 260);
    ctx.lineTo(TOWER.x1 - 20, TOWER.top - 170);
    ctx.closePath();
    ctx.fill();
  }
  // 부두 끝에 기대 선 난파선 돛대
  if (v.x1 > 5700 && v.x0 < 6000) {
    ctx.fillStyle = '#1b1b1a';
    ctx.fillRect(5816, -420, 12, 520);
    ctx.beginPath();
    ctx.moveTo(5760, 80);
    ctx.lineTo(5900, 50);
    ctx.lineTo(5880, 140);
    ctx.lineTo(5770, 150);
    ctx.closePath();
    ctx.fill();
  }
  // 큰 파도: 오른쪽에서 부풀어 오르는 물마루
  const k = Math.max(waveFx.warn * 0.7, waveFx.hit);
  if (k > 0.01) {
    const cx = g.cam.x + 900 / g.cam.zoom - k * 500;
    ctx.save();
    ctx.globalAlpha = 0.55 * k;
    ctx.fillStyle = '#e9e9e5';
    ctx.beginPath();
    ctx.moveTo(cx - 400, 140);
    ctx.quadraticCurveTo(cx - 120, 140 - 320 * k, cx + 120, 140 - 380 * k);
    ctx.lineTo(cx + 1200, 140 - 300 * k);
    ctx.lineTo(cx + 1200, 300);
    ctx.lineTo(cx - 400, 300);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // 방파제 끝: 지워진 수평선
  if (v.x1 > END - 200) {
    ctx.fillStyle = PAPER;
    ctx.fillRect(END + 40, v.y0 - 100, v.x1 - END + 200, v.y1 - v.y0 + 200);
    ctx.strokeStyle = 'rgba(25,25,25,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = v.y0; y < v.y1; y += 30) ctx.lineTo(END + 40 + Math.sin(y * 0.05 + g.t * 2) * 8, y);
    ctx.stroke();
  }
}

export const sea: LevelDef = {
  id: 'sea',
  width: END + 300,
  killY: 900,
  spawn: { x: -300, y: 0 },
  theme: () => seaTheme(END + 300, 77),
  solids,
  decor,
  entities,
  triggers,
  camZones: [
    { x0: -700, x1: 1900, zoom: 0.92 },
    { x0: CAVE.x0, x1: CAVE.x1, zoom: 0.9, yOff: 40 },
    { x0: 4500, x1: 7000, zoom: 0.86 },
    { x0: TOWER.x0 - 40, x1: TOWER.x1 + 40, zoom: 0.9, lead: 0 },
    { x0: TOWER.x1 + 40, x1: BREAK, zoom: 0.78, yOff: -120 },
    { x0: BREAK, x1: END + 300, zoom: 0.84, lead: 300 },
  ],
  scripts: { arrive, cave, storm: stormStart, swallow },
  startScript: 'arrive',
  drawBack,
  onRestore: (g) => {
    (g as unknown as { wind: number }).wind = 0;
    g.co.run(seaWeather(g), 'sea');
  },
  ambience: () => {
    audio.loop('amb', 'water_loop', 0.3, 3);
    audio.loop('wind', 'amb_wind', 0.35, 3);
    audio.loop('ghost', 'amb_ghost', 0.08, 3);
  },
};
