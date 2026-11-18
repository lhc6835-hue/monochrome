/**
 * 구간 3 — 아이콘 공장
 *  A. 지하 창고 (배수로에서 올라옴, 거꾸로 도는 컨베이어, 선반 위 꽃잎)  -300 ~ 1900
 *  B. 프레스 복도 (박자 맞추기, 상자로 프레스 멈추기)                1900 ~ 3500
 *  C. 검수 라인 (굳은 채 실려 지나가기, 도장으로 향하는 주민 구출)     3500 ~ 6400
 *  D. 승강 발판과 제어실 (작업자, 기억 조각, 꽃잎)                   6400 ~ 8500
 *  E. 거대한 도장 추격 → 화물열차                                   8500 ~ 11500
 */
import type { LevelDef, GameAPI, SolidDef, DecorDef, EntityDef, TriggerDef } from '../types';
import type { Co } from '../../core/co';
import { factoryTheme } from '../../gfx/background';
import { audio } from '../../core/audio';
import { PETAL_COLORS } from '../../gfx/flower';
import type { Conveyor, GiantStamp, Train } from '../entities3';
import type { Player } from '../player';

const CEIL = -900;
const floor = (x0: number, x1: number, y = 0): SolidDef => ({ x: x0, y, w: x1 - x0, h: 3000, look: 'ground' });
const crate = (x: number, w: number, h: number): SolidDef => ({ x, y: -h, w, h, look: 'crate' });

const solids: SolidDef[] = [
  { x: -1200, y: -3000, w: 13600, h: 3000 + CEIL, look: 'ceiling' },
  { x: -1200, y: -3000, w: 900, h: 6000, look: 'brick' },
  { x: 12400, y: -3000, w: 400, h: 6000, look: 'brick' },
  floor(-300, 7215),
  floor(7215, 7385, 200),
  floor(7385, 10000),
  floor(10220, 11060),
  floor(11060, 12400, 160),
  // A
  crate(700, 100, 100),
  crate(800, 100, 200),
  { x: 880, y: -330, w: 240, h: 24, oneway: true, look: 'pipe' },
  // C: 벨트 위쪽 벽, 도장 뒤 기계 벽, 위쪽 통로
  { x: 4000, y: CEIL, w: 120, h: -CEIL - 230, look: 'wall' },
  { x: 6340, y: -330, w: 80, h: 330, look: 'wall' },
  { x: 5900, y: -560, w: 1100, h: 26, look: 'bridge' },
  // D
  { x: 7400, y: -650, w: 900, h: 26, look: 'bridge' },
  // E
  crate(10500, 120, 110),
];

const decor: DecorDef[] = [
  { icon: 'industry', x: 300, y: -500, h: 220, color: '#3a3a38' },
  { icon: 'warning', x: 2350, y: -420, h: 80, color: '#2a2a28' },
  { icon: 'toiletSign', x: 4400, y: -420, h: 110, color: '#2a2a28' },
  { icon: 'info', x: 4700, y: -760, h: 70, color: '#2a2a28' },
  { icon: 'fan', x: 5400, y: -620, h: 200, color: '#2a2a28' },
  { icon: 'bulb', x: 7650, y: -800, h: 80, color: '#2a2a28' },
  { icon: 'warning', x: 9800, y: -500, h: 90, color: '#2a2a28' },
  { icon: 'signpost', x: 10900, h: 170 },
];

const R = (id: string, x: number, extra: Partial<Extract<EntityDef, { type: 'resident' }>> = {}): EntityDef => ({ type: 'resident', id, x, ...extra });

const entities: EntityDef[] = [
  // A
  { type: 'shaft', id: 'fs_a', x: 520, top: CEIL, w: 160, bright: 0.6 },
  { type: 'petal', id: 'fp_shelf', x: 1060, y: -390, color: PETAL_COLORS[6] },
  { type: 'conveyor', id: 'c1', x0: 1220, x1: 1820, y: -40, speed: -140 },
  // B
  { type: 'box', id: 'f_box1', x: 2120 },
  { type: 'press', id: 'p1', x: 2520, w: 170, floor: 0, upY: -300, period: 2.6, phase: 0 },
  { type: 'press', id: 'p2', x: 2870, w: 170, floor: 0, upY: -300, period: 2.6, phase: 0.87 },
  { type: 'press', id: 'p3', x: 3220, w: 170, floor: 0, upY: -300, period: 2.6, phase: 1.73 },
  { type: 'shaft', id: 'fs_b', x: 2870, top: CEIL, w: 140, bright: 0.5 },
  // C 검수 라인
  { type: 'conveyor', id: 'c2', x0: 3700, x1: 6340, y: -40, speed: 85, auto: false, sink: 6200 },
  { type: 'scanner', id: 'scan1', x: 4700, top: CEIL, bottom: -40 },
  R('f_belt1', 3880, { y: -40, savable: true, after: 'leave', leaveTo: 3300 }),
  R('f_belt2', 4380, { y: -40, savable: true, after: 'leave', leaveTo: 3300, kind: 'child' }),
  R('f_belt3', 4920, { y: -40, savable: true, after: 'leave', leaveTo: 3300 }),
  { type: 'ladder', id: 'f_lad', x: 5970, top: -560, bottom: -40 },
  { type: 'press', id: 'stamp', x: 6240, w: 190, floor: -40, upY: -300, period: 2.0, head: 230, big: true },
  { type: 'shaft', id: 'fs_c', x: 5400, top: CEIL, w: 160, bright: 0.5 },
  // D
  { type: 'lift', id: 'lift1', x: 7300, w: 170, y0: 0, y1: -650, period: 7 },
  R('f_worker', 7650, { y: -650, savable: true, after: 'stay' }),
  { type: 'memory', id: 'm_factory', x: 7950, y: -650, art: 'factory' },
  { type: 'petal', id: 'fp_top', x: 8250, y: -720, color: PETAL_COLORS[3] },
  { type: 'shaft', id: 'fs_d', x: 7800, top: CEIL, w: 200, bright: 0.6 },
  // E
  { type: 'giant', id: 'giant', x: 7700, rail: -860, floor: 0 },
  { type: 'conveyor', id: 'c3', x0: 8900, x1: 9500, y: -40, speed: -150 },
  { type: 'press', id: 'p4', x: 9800, w: 160, floor: 0, upY: -300, period: 1.5 },
  { type: 'train', id: 'train', x: 11050, y: 0 },
];

const triggers: TriggerDef[] = [
  { id: 'cp_f1', x: 1900, w: 80, checkpoint: true },
  { id: 'h_press', x: 2250, w: 100, once: true, hint: { kb: '프레스는 내려오기 직전에 떨린다  ·  상자를 밀어 넣으면 멈춘다', dur: 5 } },
  { id: 'cp_f2', x: 3480, w: 60, checkpoint: true },
  { id: 'beltStart', x: 3560, w: 60, once: true, script: 'beltStart' },
  { id: 'h_scan', x: 4300, w: 60, y: -300, h: 300, once: true, hint: { kb: '검수대는 움직이는 것을 통과시키지 않는다  ·  {down} 굳어서, 제품처럼', touch: '검수대는 움직이는 것을 통과시키지 않는다  ·  굳어서, 제품처럼', dur: 6 } },
  { id: 'cp_f3', x: 6500, w: 80, y: -800, h: 400, checkpoint: true, spawnX: 6520, spawnY: -560 },
  { id: 'cp_f4', x: 8420, w: 80, y: -300, h: 400, checkpoint: true },
  { id: 'giantStart', x: 8640, w: 60, once: true, script: 'giant' },
  { id: 'board', x: 11120, w: 300, y: -300, h: 310, once: true, script: 'board' },
];

// ------------------------------------------------------------------
function* arrive(g: GameAPI): Co {
  g.setControl(false);
  audio.play('clank', { vol: 0.7 });
  audio.play('door_close', { vol: 0.5, delay: 0.3 });
  yield 1.3;
  g.setControl(true);
}

function* beltStart(g: GameAPI): Co {
  audio.play('machine', { vol: 0.8, rate: 0.6 });
  g.shake(0.2);
  yield 0.6;
  g.entity<Conveyor>('c2')?.start();
}

function* giant(g: GameAPI): Co {
  g.setControl(false);
  audio.loop('alarm', 'alarm_loop', 0.55, 0.3, 'sfx');
  yield 0.5;
  audio.play('machine', { vol: 1, rate: 0.45 });
  audio.play('sting1', { vol: 0.7 });
  g.shake(0.4);
  g.entity<GiantStamp>('giant')?.activate(g.player.x - 820);
  yield 1.0;
  audio.loop('heart', 'heart_fast', 0.6, 0.3, 'sfx');
  audio.loop('chasebed', 'chase_bed', 0.45, 0.5, 'amb');
  g.setControl(true);
  g.hint('→', '→', 1.2);
  yield 3;
  audio.stopLoop('alarm', 2);
}

function* board(g: GameAPI): Co {
  const giantE = g.entity<GiantStamp>('giant');
  if (giantE) giantE.active = false;
  g.setControl(false);
  audio.stopLoop('heart', 2);
  audio.stopLoop('chasebed', 2);
  audio.stopLoop('alarm', 1);
  audio.play('whistle', { vol: 0.9 });
  const train = g.entity<Train>('train');
  yield 0.6;
  audio.loop('train', 'train_engine', 0.7, 1, 'sfx');
  train?.depart();
  const p = g.player as unknown as Player;
  p.facing = 1;
  yield 3.2;
  audio.play('whistle', { vol: 0.6, rate: 0.9 });
  yield 1.2;
  g.goToLevel('rail');
}

export const factory: LevelDef = {
  id: 'factory',
  width: 12400,
  killY: 700,
  spawn: { x: 200, y: 0 },
  theme: () => factoryTheme(12400, 33),
  dark: 0.32,
  solids,
  decor,
  entities,
  triggers,
  camZones: [
    { x0: 2300, x1: 3400, zoom: 0.95 },
    { x0: 3600, x1: 6400, zoom: 0.92, yOff: -30 },
    { x0: 5900, x1: 8400, yOff: -160, zoom: 0.88 },
    { x0: 8500, x1: 12400, zoom: 0.88, lead: 320 },
  ],
  scripts: { arrive, beltStart, giant, board },
  startScript: 'arrive',
  ambience: () => {
    audio.loop('amb', 'amb_factory', 0.4, 3);
    audio.loop('wind', 'machine_loop', 0.12, 3);
    audio.loop('ghost', 'amb_rumble', 0.12, 3);
  },
};
