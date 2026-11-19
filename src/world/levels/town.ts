/**
 * 구간 1 — 표지의 마을
 *  A. 출발 (오프닝과 같은 자리)     -1500 ~ 1600
 *  B. 주택가 (상자 퍼즐, 숨은 꽃잎)  1600 ~ 3500
 *  C. 놀이터 (아이 구출 + 발판 퍼즐) 3500 ~ 5200
 *  D. 큰길 (감시의 눈 잠입)          5200 ~ 7300
 *  E. 광장 (여백의 등장)             7300 ~ 7700
 *  F. 추격전                          7700 ~ 11400
 */
import type { LevelDef, GameAPI, SolidDef, DecorDef, EntityDef, TriggerDef, BlankCtl, CamFocus } from '../types';
import type { Player } from '../player';
import { clamp, ease, lerp } from '../../core/math';
import type { Co } from '../../core/co';
import { townTheme } from '../../gfx/background';
import { audio } from '../../core/audio';
import { PETAL_COLORS } from '../../gfx/flower';
import type { Resident, Plate } from '../entities';

const ground = (x0: number, x1: number): SolidDef => ({ x: x0, y: 0, w: x1 - x0, h: 3000, look: 'ground' });
const block = (x: number, w: number, h: number, look = 'block'): SolidDef => ({ x, y: -h, w, h, look });

const solids: SolidDef[] = [
  // 바닥 (구덩이 사이사이)
  ground(-2400, 9350),
  ground(9560, 9990),
  ground(10450, 10760),
  ground(10960, 11500),
  // 경계
  { x: -2400, y: -3000, w: 900, h: 3000, look: 'invisible' },
  { x: 11420, y: -3000, w: 400, h: 3000, look: 'invisible' },
  // A
  block(1040, 130, 52, 'bench'),
  block(1360, 210, 110),
  // B
  block(2600, 70, 400, 'wall'),
  { x: 2735, y: -545, w: 110, h: 22, oneway: true, look: 'platform' },
  block(2920, 300, 210, 'building'),
  // C
  { x: 4240, y: -125, w: 110, h: 22, oneway: true, look: 'platform' },
  { x: 4390, y: -245, w: 190, h: 24, oneway: true, look: 'platform' },
  // D
  block(6250, 260, 150, 'bus'),
  block(7200, 70, 400, 'wall'),
  // F (추격)
  block(7980, 220, 92, 'car'),
  { x: 8960, y: -440, w: 170, h: 372, look: 'billboard' },
  block(9750, 120, 110),
  block(9870, 120, 230),
  { x: 9990, y: -230, w: 460, h: 40, look: 'bridge' },
];

const decor: DecorDef[] = [
  // A — 오프닝과 같은 배치
  { icon: 'tree', x: -1750, h: 300 },
  { icon: 'signpost', x: -1420, h: 190 },
  { icon: 'bench', x: -1100, h: 70 },
  { icon: 'lamp', x: -560, h: 300 },
  { icon: 'trash', x: -330, h: 70 },
  { icon: 'lamp', x: 300, h: 300 },
  { icon: 'mailbox', x: 700, h: 120 },
  { icon: 'trafficLight', x: 860, h: 280 },
  { icon: 'tree2', x: 1150, h: 330, flip: true },
  // B
  { icon: 'house', x: 1850, h: 330 },
  { icon: 'lamp', x: 2300, h: 300 },
  { icon: 'tree', x: 2480, h: 280 },
  { icon: 'hydrant', x: 2760, h: 70 },
  { icon: 'homeCity', x: 3380, h: 360, flip: true },
  // C 놀이터
  { icon: 'ferris', x: 4100, h: 560, color: '#4a4a48' },
  { icon: 'slide', x: 3640, h: 210 },
  { icon: 'seesaw', x: 3980, h: 90 },
  { icon: 'balloon', x: 4290, h: 120 },
  { icon: 'tree2', x: 4700, h: 300 },
  { icon: 'fence', x: 5200, h: 110 },
  // D 큰길
  { icon: 'office', x: 5500, h: 520, color: '#3a3a39' },
  { icon: 'trafficLight', x: 5600, h: 280 },
  { icon: 'mailbox', x: 6040, h: 120 },
  { icon: 'tower', x: 6600, h: 600, color: '#3a3a39' },
  { icon: 'barrier', x: 6960, h: 90 },
  // E 광장 — 시계탑
  { icon: 'townHall', x: 7720, h: 520, color: '#2e2e2d' },
  { icon: 'clock', x: 7720, y: -520, h: 120, color: '#2e2e2d' },
  { icon: 'lamp', x: 7480, h: 300 },
  // F
  { icon: 'lamp', x: 8700, h: 300 },
  { icon: 'barrier', x: 9300, h: 80 },
  { icon: 'crane', x: 9700, h: 520, color: '#3a3a39' },
  { icon: 'lamp', x: 10600, h: 300 },
];

const R = (id: string, x: number, extra: Partial<Extract<EntityDef, { type: 'resident' }>> = {}): EntityDef => ({ type: 'resident', id, x, ...extra });

const entities: EntityDef[] = [
  // A — 오프닝 속 굳은 주민들
  R('r_a1', -1290, { kind: 'child' }),
  R('r_a2', -1180),
  R('r_a3', -1040),
  R('r_a4', -905, { kind: 'tall' }),
  R('r_a5', -770, { kind: 'child' }),
  R('r_a6', -650),
  R('r_a7', -470),
  R('r_a8', 430),
  R('s_start', 560, { savable: true, after: 'leave', leaveTo: -1300 }),
  // B
  { type: 'box', id: 'box1', x: 2060 },
  { type: 'petal', id: 'p_roof', x: 2790, y: -610, color: PETAL_COLORS[4] },
  R('r_b1', 2150),
  // C
  R('kid', 3820, { kind: 'child', savable: true, after: 'follow' }),
  { type: 'memory', id: 'm_garden', x: 4110, art: 'garden' },
  R('s_tower', 4485, { y: -245, savable: true, after: 'stay' }),
  { type: 'plate', id: 'plate1', x: 4760, w: 120, signal: 'g1' },
  { type: 'gate', id: 'gate1', x: 5010, h: 430, signal: 'g1' },
  // D
  R('r_d1', 5440),
  R('r_d2', 5530, { kind: 'child' }),
  R('r_d3', 5640),
  { type: 'cctv', id: 'cam1', x: 5850, y: -430, mid: Math.PI / 2, amp: 0.58, period: 4.4 },
  R('s_street', 6130, { savable: true, after: 'stay' }),
  { type: 'petal', id: 'p_bus', x: 6440, y: -215, color: PETAL_COLORS[1] },
  { type: 'cctv', id: 'cam2', x: 6700, y: -440, mid: Math.PI / 2 + 0.12, amp: 0.62, period: 3.8, phase: 1.7 },
  { type: 'box', id: 'box2', x: 6880 },
  { type: 'cctv', id: 'cam3', x: 7080, y: -460, mid: Math.PI / 2 - 0.25, amp: 0.45, period: 3.1, phase: 0.6, len: 560 },
  R('r_d4', 6560),
  // E 광장 주민들
  R('r_e1', 7420),
  R('r_e2', 7540, { kind: 'child' }),
  R('r_e3', 7860),
  R('r_e4', 7960, { kind: 'tall' }),
  // F
  { type: 'faller', id: 'lamp_fall', x: 8470, h: 300, dir: 1, trigger: 8140 },
];

const triggers: TriggerDef[] = [
  { id: 'h_move', x: -200, w: 300, once: true, hint: { kb: '{left}  {right}   이동', touch: '◀ ▶   이동', dur: 4 } },
  { id: 'h_jump', x: 820, w: 200, once: true, hint: { kb: '{jump}   점프', touch: '점프 버튼으로 뛰어오르기', dur: 4 } },
  { id: 'h_climb', x: 1250, w: 100, once: true, hint: { kb: '턱에 매달리면 저절로 기어오릅니다', dur: 3.5 } },
  { id: 'cp_b', x: 1650, w: 80, checkpoint: true },
  { id: 'h_box', x: 1880, w: 120, once: true, hint: { kb: '상자는 밀 수 있다  ·  {act} 를 누른 채로 당기기', touch: '상자는 밀 수 있다  ·  행동 버튼을 누른 채로 당기기', dur: 5 } },
  { id: 'cp_c', x: 3420, w: 80, checkpoint: true },
  { id: 'kid_bye', x: 5130, w: 80, once: true, script: 'kidBye' },
  { id: 'cp_d', x: 5250, w: 80, checkpoint: true },
  { id: 'h_freeze', x: 5330, w: 120, once: true, hint: { kb: '{down} 를 누르고 있으면 굳는다  ·  감시의 눈은 움직이는 것만 본다', touch: '굳기 버튼을 누르고 있으면 굳는다  ·  감시의 눈은 움직이는 것만 본다', dur: 6 } },
  { id: 'cp_e', x: 7330, w: 80, checkpoint: true, spawnX: 7360 },
  { id: 'chase', x: 7620, w: 60, once: true, script: 'chase' },
  { id: 'h_slide', x: 8700, w: 60, once: true, hint: { kb: '달리면서 {down}   구르기', touch: '달리면서 굳기 버튼   구르기', dur: 2.2 } },
  // 구덩이 앞: 저절로 뛰어들고, 여백의 손이 머리 위를 아슬아슬하게 스친다
  { id: 'escape', x: 10540, w: 60, once: true, script: 'escape' },
  { id: 'end', x: 10760, w: 200, y: 20, h: 800, once: true, script: 'end' },
];

// ------------------------------------------------------------------
// 스크립트
// ------------------------------------------------------------------
function* kidBye(g: GameAPI): Co {
  const kid = g.entity<Resident>('kid');
  if (!kid || kid.state !== 'stay') return;
  yield 0.4;
  kid.wave();
  audio.play('bell4', { vol: 0.3, rate: 1.3 });
  yield 2.6;
  kid.command('leave');
  kid.leaveTo = 3300;
}

function* chase(g: GameAPI): Co {
  g.setControl(false);
  audio.getLoop('amb')?.setVol(0.05, 2);
  audio.getLoop('wind')?.setVol(0.1, 2);
  yield 0.6;
  for (let i = 0; i < 3; i++) {
    audio.play('gong', { vol: 0.8, rate: 0.62 });
    g.shake(0.25);
    yield 1.25;
  }
  audio.loop('heart', 'heart_slow', 0.6, 0.5, 'sfx');
  yield 0.6;
  audio.play('paper_rip', { vol: 1, rate: 0.6 });
  audio.play('sting1', { vol: 0.9 });
  g.startChase({ speed: 0, startOffset: -760 });
  yield 1.7;
  audio.loop('heart', 'heart_fast', 0.7, 0.3, 'sfx');
  audio.loop('chasebed', 'chase_bed', 0.55, 0.5, 'amb');
  audio.loop('timeloop', 'time_loop', 0.35, 1, 'amb');
  g.setControl(true);
  g.hint('→', '→', 1.5);
}

/** 연출에 필요한 장면 내부 (GameScene) */
interface Cine {
  chase: { front: number; cine: boolean };
  blankCtl: BlankCtl | null;
  timeScale: number;
  camFocus: CamFocus | null;
  cineFade: number;
  dt: number;
  parts: { paper(x: number, y: number, n: number, s: number): void };
  co: { running(tag: string): boolean };
}

const EDGE = 10760;

function* escape(g: GameAPI): Co {
  if (!g.chaseActive()) return;
  const S = g as unknown as Cine;
  const p = g.player as unknown as Player;
  const b = p.body;
  g.setControl(false);
  S.chase.cine = true;
  // 1. 구덩이 끝까지 저절로 달린다. 여백은 바짝 따라붙는다
  p.state = 'scripted';
  p.scriptTarget = EDGE - 10;
  p.scriptSpeed = 335;
  let bx = S.chase.front - 60;
  const cam: CamFocus = { x: b.x + 60, y: -300, zoom: 0.84, smooth: 0.5 };
  S.camFocus = cam;
  while (b.x < EDGE - 26) {
    bx = Math.min(bx + 470 * S.dt, b.x - 290);
    S.chase.front = bx + 60;
    cam.x = (b.x + bx) / 2 + 150;
    yield;
  }
  // 2. 뛰어든다
  // (조작은 꺼진 채 '연출 이동' 상태로 앞으로 몸을 던진다)
  p.facing = 1;
  p.scriptTarget = EDGE + 110;
  p.scriptSpeed = 150;
  b.vy = -760;
  b.vx = 150;
  audio.play('swish2', { vol: 0.8 });
  audio.step(0, 0.5);
  const bx0 = bx;
  // 손끝이 등에 닿을락 말락 하는 순간 (뛰어오른 몸이 막 떨어지기 시작할 때)
  const T_MISS = 0.44;
  let t = 0;
  let missed = false;
  let hand: [number, number] = [bx + 200, -300];
  const ctl: BlankCtl = { bx, by: -20, lean: 0.3, crouch: 0, head: 0.1, hand: null, grip: 0.2 };
  S.blankCtl = ctl;
  audio.muffle(0.55, 0.3);
  let cock: [number, number] = [0, 0];
  let miss: [number, number] = [0, 0];
  while (t < 1.3) {
    const dt = S.dt;
    t += dt;
    // 느린 화면: 손이 덮쳐 오는 순간부터 빗나갈 때까지
    S.timeScale = t < 0.3 ? lerp(1, 0.2, ease.inOutSine(clamp((t - 0.16) / 0.14))) : t < 0.62 ? 0.2 : lerp(0.2, 1, ease.inOutSine(clamp((t - 0.62) / 0.22)));
    // 몸: 구덩이 끝까지 달려들며 → 손을 내지르는 순간 온몸을 앞으로 던지듯 숙이고 →
    //     헛손질의 기세에 앞으로 쏠려 가장자리에서 휘청 → 겨우 버티고 선다
    const thrust = ease.inOutSine(clamp((t - 0.2) / (T_MISS - 0.2)));
    const lurch = ease.inOutSine(clamp((t - T_MISS) / 0.2)) * (1 - 0.6 * ease.inOutSine(clamp((t - 0.78) / 0.45)));
    ctl.bx = lerp(bx0, EDGE - 232, ease.outCubic(clamp(t / 0.35))) + 22 * thrust + 26 * lurch;
    ctl.crouch = 0.05 * thrust + 0.03 * lurch;
    ctl.lean = lerp(0.3, 0.45, ease.inOutSine(clamp(t / 0.2))) + 0.5 * thrust + 0.18 * lurch + Math.sin(Math.max(0, t - 0.75) * 9) * 0.03 * clamp((t - 0.75) / 0.2) * (1 - clamp((t - 1.1) / 0.2));
    ctl.head = lerp(0.1, 0.4, clamp(t / 0.4)) + 0.2 * lurch;
    // 다른 팔: 손을 내지르는 동안 뒤로 젖혀 균형을 잡고, 휘청일 때 앞으로 허우적인다
    ctl.hand2 = [lerp(lerp(1.0, -0.5, thrust), 0.5, lurch), lerp(0.4, 0.7, lurch)];
    S.chase.front = Math.min(ctl.bx + 90, EDGE);
    // 어깨 위치 (여백의 그림 비율: 엉덩이 0.42, 어깨는 엉덩이 위 0.311, 상체 기울기만큼 앞으로)
    const sh: [number, number] = [ctl.bx + 134 * Math.sin(ctl.lean), ctl.by - 180.6 - 134 * Math.cos(ctl.lean)];
    let target: [number, number];
    if (t < 0.22) {
      // 예비 동작: 손을 허리 뒤로 끌어당기며 손가락을 벌린다
      const u = ease.inOutSine(clamp(t / 0.22));
      cock = [sh[0] + lerp(90, -20, u), sh[1] + lerp(60, 95, u)];
      target = cock;
      ctl.grip = lerp(0.2, 0, u);
    } else if (t < T_MISS) {
      // 손가락을 활짝 편 채, 뛰어오른 몸을 향해 곧장 내지른다 (점점 빨라진다)
      // 노리는 곳은 몸이 '조금 전에' 있던 자리 — 몸은 이미 앞으로 빠져나가고 있다
      const u = ease.inQuad(clamp((t - 0.22) / (T_MISS - 0.22)));
      const aim: [number, number] = [b.x - 58, b.y - 74];
      target = [lerp(cock[0], aim[0], u), lerp(cock[1], aim[1], u)];
      miss = target;
      ctl.grip = 0;
    } else {
      // 등 바로 뒤에서 손가락이 허공을 움켜쥐고, 주먹이 움찔 당겨진다 (몸은 그 앞으로 떨어져 간다)
      const f = ease.outCubic(clamp((t - T_MISS) / 0.3));
      const hang = ease.inOutSine(clamp((t - 0.85) / 0.45));
      target = [miss[0] - 14 * f - 6 * hang, miss[1] + 22 * f + 14 * hang];
      ctl.grip = ease.outCubic(clamp((t - T_MISS) / 0.07));
    }
    const follow = t < 0.08 ? 20 : 60;
    hand = [lerp(hand[0], target[0], 1 - Math.exp(-dt * follow)), lerp(hand[1], target[1], 1 - Math.exp(-dt * follow))];
    ctl.hand = hand;
    if (t > 0.3 && t - dt <= 0.3) audio.play('whoosh', { vol: 1, rate: 0.55 });
    if (!missed && t >= T_MISS) {
      missed = true;
      // 손끝이 등을 스치고 허공을 움켜쥔다: 종이 부스러기가 주먹에서 터진다
      audio.play('paper_crush', { vol: 1, rate: 0.7 });
      audio.play('sting2', { vol: 0.8 });
      S.parts.paper(hand[0], hand[1], 16, 1.1);
      g.shake(0.3);
    }
    // 휘청이다 가장자리를 딛고 버티는 소리
    if (t > 0.72 && t - dt <= 0.72) {
      audio.play('thud', { vol: 0.6, rate: 0.55 });
      S.parts.paper(EDGE - 10, -6, 8, 0.9);
    }
    // 카메라: 덮쳐 오는 순간 바짝 다가가고, 빗나간 뒤에는 물러나며 떨어지는 몸을 따라간다
    const close = t > 0.18 && t < 0.8;
    cam.x = close ? EDGE - 10 : EDGE + 20;
    cam.y = close ? -300 : Math.max(-250, b.y - 280);
    cam.zoom = close ? 1.45 : 0.8;
    cam.smooth = close ? 0.25 : 0.45;
    yield;
  }
  S.timeScale = 1;
  audio.muffle(0, 0.6);
  // 3. 아래로 떨어져 가는 동안, 여백은 구덩이 가장자리에서 내려다보며 한 번 더 손을 뻗는다
  t = 0;
  while (S.cineFade < 1) {
    const dt = S.dt;
    t += dt;
    ctl.head = lerp(ctl.head, 0.95, 1 - Math.exp(-dt * 3));
    ctl.lean = lerp(ctl.lean, 1.05, 1 - Math.exp(-dt * 2));
    const reach: [number, number] = [EDGE + 70 + Math.sin(t * 2.2) * 25, 60 + Math.sin(t * 1.3) * 10];
    hand = [lerp(hand[0], reach[0], 1 - Math.exp(-dt * 3)), lerp(hand[1], reach[1], 1 - Math.exp(-dt * 3))];
    ctl.hand = hand;
    // 움켜쥔 주먹을 천천히 풀며, 떨어지는 몸을 향해 다시 손을 뻗는다
    ctl.grip = lerp(ctl.grip ?? 1, 0.3, 1 - Math.exp(-dt * (t > 0.4 ? 1.6 : 0)));
    if (Math.random() < dt * 10) S.parts.paper(EDGE - 20 + Math.random() * 30, -10 - Math.random() * 60, 1, 0.8);
    cam.y = Math.min(Math.max(-250, b.y - 280), 160);
    if (b.y > 380) S.cineFade = Math.min(1, S.cineFade + dt / 1.0);
    yield;
  }
  g.stopChase();
  audio.play('land_hard', { vol: 0.7, delay: 0.4 });
  g.goToLevel('drain');
}

function* end(g: GameAPI): Co {
  // 추격 중이었다면 구덩이 연출(escape)이 이어서 처리한다
  if ((g as unknown as Cine).co.running('escape')) return;
  g.stopChase();
  g.setControl(false);
  audio.play('land_hard', { vol: 0.7, delay: 0.5 });
  audio.play('sting5', { vol: 0.6, delay: 0.3 });
  yield 0.8;
  g.goToLevel('drain');
}

function* opening(g: GameAPI): Co {
  yield 1.6;
  g.hint('{left}  {right}   이동', '◀ ▶   이동', 4);
}

export const town: LevelDef = {
  id: 'town',
  width: 11500,
  killY: 700,
  spawn: { x: 0, y: 0 },
  theme: () => townTheme(11500, 11),
  solids,
  decor,
  entities,
  triggers,
  camZones: [
    { x0: 2550, x1: 2900, yOff: -60 },
    { x0: 4300, x1: 5100, zoom: 0.94 },
    { x0: 5300, x1: 7300, zoom: 0.86, yOff: -40 },
    { x0: 7300, x1: 7700, zoom: 0.92 },
    { x0: 7700, x1: 11500, zoom: 0.88, lead: 300 },
  ],
  scripts: { kidBye, chase, escape, end, opening },
  startScript: 'opening',
  customPrompt: (g) => townCustomPrompt(g),
  ambience: () => {
    audio.loop('amb', 'amb_town', 0.32, 3);
    audio.loop('wind', 'amb_wind', 0.45, 3);
    audio.loop('ghost', 'amb_ghost', 0.14, 3);
  },
};

/** 아이에게 발판 위에 서 달라고 부탁하는 상호작용 */
export function townCustomPrompt(g: GameAPI) {
  const kid = g.entity<Resident>('kid');
  const plate = g.entity<Plate>('plate1');
  if (!kid || !plate) return null;
  if (kid.state !== 'follow') return null;
  if (Math.abs(g.player.x - plate.x) > 190) return null;
  if (Math.abs(kid.body.x - plate.x) > 520) return null;
  return {
    text: '아이에게 발판을 부탁하기',
    x: plate.x,
    y: -120,
    act: () => {
      kid.command('goto', plate.x);
      audio.play('bell3', { vol: 0.3, rate: 1.4 });
    },
  };
}
