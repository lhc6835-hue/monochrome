/**
 * 구간 2 — 지하 배수로
 *  A. 착지 (맨홀 아래 얕은 물, 첫 빛줄기)          -300 ~ 1700
 *  B. 수로 (부력 상자 + 수위 레버)                  1700 ~ 3000
 *  C. 메아리 복도 (소리로 사냥하는 존재, 위쪽 파이프 길) 3000 ~ 5650
 *  D. 침수된 홀 (수위를 바꿔 건너기 / 바닥 동굴)      5650 ~ 7700
 *  E. 수문 → 메아리 떼 추격 → 사다리 탈출            7700 ~ 10600
 */
import type { LevelDef, GameAPI, SolidDef, DecorDef, EntityDef, TriggerDef } from '../types';
import type { Co } from '../../core/co';
import { drainTheme } from '../../gfx/background';
import { audio } from '../../core/audio';
import { PETAL_COLORS } from '../../gfx/flower';
import { Echo } from '../entities2';
import type { Player } from '../player';

const CEIL = -720;
const floor = (x0: number, x1: number, y = 0): SolidDef => ({ x: x0, y, w: x1 - x0, h: 3000, look: 'ground' });
const ceil = (x0: number, x1: number): SolidDef => ({ x: x0, y: -3000, w: x1 - x0, h: 3000 + CEIL, look: 'ceiling' });
const brick = (x: number, w: number, h: number, y = 0): SolidDef => ({ x, y: y - h, w, h, look: 'brick' });
const pipe = (x0: number, x1: number, y: number): SolidDef => ({ x: x0, y, w: x1 - x0, h: 26, oneway: true, look: 'pipe' });

const solids: SolidDef[] = [
  // 천장 (맨홀 구멍 140~260, 출구 구멍 10260~10360)
  ceil(-1200, 140),
  ceil(260, 10260),
  ceil(10360, 11200),
  // 벽
  brick(-1200, 900, 3000),
  brick(10900, 400, 3000),
  // A
  floor(-300, 1950),
  brick(1300, 120, 140),
  pipe(1380, 1640, -300),
  // B 수로: 바닥 380
  floor(1950, 2850, 480),
  brick(2790, 60, 120, 480),
  floor(2850, 5950),
  // C 위쪽 파이프 길
  pipe(4560, 5160, -380),
  // D 침수된 홀: 구덩이 바닥 420, 오른쪽 아래 동굴(7050~7400, y 200~420)
  floor(5950, 7400, 420),
  { x: 7050, y: 0, w: 350, h: 200, look: 'brick' },
  floor(7400, 8500),
  // E 추격
  { x: 8240, y: -50, w: 120, h: 50, look: 'pipe' },
  floor(8500, 8760, 320),
  floor(8760, 9200),
  floor(9200, 9480, 320),
  floor(9480, 9820),
  floor(9820, 10060, 320),
  floor(10060, 10900),
  { x: 10180, y: CEIL, w: 260, h: 26, oneway: true, look: 'pipe' },
];

const decor: DecorDef[] = [
  { icon: 'pipe', x: 700, y: -560, h: 160, color: '#1b1b1a' },
  { icon: 'fan', x: 2400, y: -520, h: 140, color: '#1b1b1a' },
  { icon: 'warning', x: 2860, y: -260, h: 90, color: '#1d1d1c' },
  { icon: 'pipe', x: 3900, y: -540, h: 180, color: '#1b1b1a', flip: true },
  { icon: 'bulb', x: 6300, y: -560, h: 90, color: '#1d1d1c' },
  { icon: 'warning', x: 7880, y: -260, h: 110, color: '#1d1d1c' },
  { icon: 'fan', x: 9000, y: -500, h: 150, color: '#1b1b1a' },
];

const R = (id: string, x: number, extra: Partial<Extract<EntityDef, { type: 'resident' }>> = {}): EntityDef => ({ type: 'resident', id, x, ...extra });

const entities: EntityDef[] = [
  // A
  { type: 'shaft', id: 'sh_manhole', x: 200, top: CEIL, w: 120, bright: 1 },
  { type: 'water', id: 'w_land', x0: -300, x1: 900, floor: 0, low: -46 },
  { type: 'shaft', id: 'sh_a2', x: 1150, top: CEIL, w: 110, bright: 0.7 },
  R('d_worker', 1150, { savable: true, after: 'stay' }),
  { type: 'petal', id: 'dp_pipe', x: 1560, y: -360, color: PETAL_COLORS[2] },
  // B
  { type: 'water', id: 'w_canal', x0: 1950, x1: 2850, floor: 480, low: 400, high: 12, signal: 'w1', speed: 50 },
  { type: 'box', id: 'd_box1', x: 2420, y: 442, size: 100 },
  { type: 'lever', id: 'lv1', x: 2820, y: 360, signal: 'w1' },
  { type: 'shaft', id: 'sh_b', x: 2500, top: CEIL, w: 100, bright: 0.45 },
  // C
  { type: 'shaft', id: 'sh_c1', x: 3450, top: CEIL, w: 120, bright: 0.8 },
  { type: 'echo', id: 'e1', x: 4050, x0: 3650, x1: 4450 },
  R('d_child', 4200, { kind: 'child', savable: true, after: 'stay' }),
  { type: 'shaft', id: 'sh_c2', x: 4250, top: CEIL, w: 90, bright: 0.4 },
  { type: 'ladder', id: 'lad_c', x: 4620, top: -380, bottom: 0 },
  { type: 'memory', id: 'm_giving', x: 4880, y: -380, art: 'giving' },
  { type: 'petal', id: 'dp_upper', x: 5100, y: -450, color: PETAL_COLORS[5] },
  { type: 'echo', id: 'e2', x: 5000, x0: 4700, x1: 5500 },
  { type: 'shaft', id: 'sh_c3', x: 5450, top: CEIL, w: 120, bright: 0.7 },
  // D
  { type: 'lever', id: 'lv2', x: 5820, signal: 'w2', on: true },
  { type: 'shaft', id: 'sh_d1', x: 5800, top: CEIL, w: 110, bright: 0.6 },
  { type: 'water', id: 'w_hall', x0: 5950, x1: 7400, floor: 420, low: 340, high: 40, signal: 'w2', speed: 60, start: 40 },
  { type: 'box', id: 'd_box2', x: 6150, y: 82, size: 100 },
  { type: 'box', id: 'd_box3', x: 6460, y: 82, size: 100 },
  { type: 'box', id: 'd_box4', x: 6770, y: 82, size: 100 },
  { type: 'ladder', id: 'lad_d', x: 6010, top: 0, bottom: 420 },
  R('d_elder', 7300, { y: 420, savable: true, after: 'stay', kind: 'tall' }),
  { type: 'petal', id: 'dp_cave', x: 7160, y: 360, color: PETAL_COLORS[0] },
  { type: 'shaft', id: 'sh_d2', x: 6600, top: CEIL, w: 140, bright: 0.5 },
  { type: 'echo', id: 'e3', x: 7250, x0: 7090, x1: 7370 },
  // E
  { type: 'lever', id: 'lv_sluice', x: 7960, signal: 'sluice' },
  { type: 'shaft', id: 'sh_e1', x: 7960, top: CEIL, w: 120, bright: 0.7 },
  { type: 'water', id: 'w_p1', x0: 8500, x1: 8760, floor: 320, low: 40 },
  { type: 'water', id: 'w_p2', x0: 9200, x1: 9480, floor: 320, low: 40 },
  { type: 'box', id: 'd_box5', x: 9340, y: 82, size: 90 },
  { type: 'water', id: 'w_p3', x0: 9820, x1: 10060, floor: 320, low: 40 },
  { type: 'shaft', id: 'sh_e2', x: 9000, top: CEIL, w: 90, bright: 0.35 },
  { type: 'ladder', id: 'lad_exit', x: 10310, top: CEIL, bottom: 0 },
  { type: 'shaft', id: 'sh_exit', x: 10310, top: CEIL, w: 100, bright: 1 },
  // 수문이 열리면 깨어나는 메아리들
  ...[7450, 7560, 7680].map((x, i): EntityDef => ({ type: 'echo', id: 'eh' + i, x, x0: x - 50, x1: x + 50, dormant: true })),
  ...Array.from({ length: 8 }, (_, i): EntityDef => ({ type: 'echo', id: 'es' + i, x: -9999, y: -2000, x0: 0, x1: 0, dormant: true })),
];

const triggers: TriggerDef[] = [
  { id: 'h_light', x: 380, w: 120, once: true, hint: { kb: '꽃잎이 줄면, 빛도 줄어든다', dur: 4 } },
  { id: 'cp_d1', x: 1720, w: 80, checkpoint: true },
  { id: 'h_deep', x: 1960, w: 80, y: 100, h: 500, once: true, hint: { kb: '깊은 물에서는 오래 버틸 수 없다', dur: 3.5 } },
  { id: 'cp_d2', x: 3000, w: 80, checkpoint: true },
  { id: 'h_echo', x: 3300, w: 100, once: true, script: 'meetEcho' },
  { id: 'h_ladder', x: 4500, w: 80, once: true, hint: { kb: '↑ 사다리 오르기', touch: '사다리 앞에서 점프 버튼을 누르고 있으면 오른다', dur: 3 } },
  { id: 'cp_d3', x: 5650, w: 80, checkpoint: true },
  { id: 'cp_d4', x: 7700, w: 60, checkpoint: true, spawnX: 7720 },
  { id: 'exit', x: 10180, w: 260, y: -900, h: 230, once: true, script: 'exit' },
];

// ------------------------------------------------------------------
function* arrive(g: GameAPI): Co {
  g.setControl(false);
  audio.play('sting5', { vol: 0.5 });
  yield 1.2;
  // 위쪽 맨홀이 하얗게 번쩍이다 사라진다 (여백이 입구에서 멈췄다)
  audio.play('paper_rip', { vol: 0.5, rate: 0.7 });
  g.shake(0.2);
  yield 1.4;
  g.setControl(true);
}

function* meetEcho(g: GameAPI): Co {
  audio.play('ghost_breath', { vol: 0.5 });
  yield 0.6;
  g.hint('메아리는 소리를 듣는다  ·  굳어 있으면 지나쳐 간다', '메아리는 소리를 듣는다  ·  굳어 있으면 지나쳐 간다', 5.5);
}

function* sluice(g: GameAPI): Co {
  // 수문 레버를 당기면 시작
  yield () => g.signals.get('sluice') === true;
  audio.play('machine', { vol: 0.9, rate: 0.6 });
  audio.play('elevator_door', { vol: 0.8, rate: 0.7 });
  audio.play('gong', { vol: 0.6, rate: 0.55, delay: 0.4 });
  g.shake(0.5);
  g.noise(g.player.x, g.player.y, 3000);
  yield 0.8;
  audio.play('sting1', { vol: 0.8 });
  for (const id of ['eh0', 'eh1', 'eh2']) g.entity<Echo>(id)?.wake(true, g.player.x);
  audio.loop('heart', 'heart_fast', 0.7, 0.3, 'sfx');
  audio.loop('chasebed', 'chase_bed', 0.45, 0.5, 'amb');
  g.hint('→', '→', 1.2);
  // 천장 격자에서 계속 떨어진다
  let i = 0;
  while (true) {
    const p = g.player as unknown as Player;
    if (p.state === 'climb' && p.y < -200) break;
    yield 1.25;
    const e = g.entity<Echo>('es' + (i % 8));
    i++;
    if (!e || e.alive) continue;
    const x = p.x - 560 - Math.random() * 120;
    if (g.waterAt(x)) continue;
    e.body.x = x;
    e.body.y = CEIL + 160;
    e.body.vy = 0;
    e.wake(true, p.x);
    audio.play('splash3', { vol: 0.35, rate: 0.7, pan: -0.6 });
  }
  audio.stopLoop('heart', 2);
  audio.stopLoop('chasebed', 2);
}

function* exit(g: GameAPI): Co {
  g.setControl(false);
  audio.play('door_close', { vol: 0.8 });
  audio.play('clank', { vol: 0.6, delay: 0.2 });
  yield 1.0;
  g.goToLevel('factory');
}

export const drain: LevelDef = {
  id: 'drain',
  width: 11000,
  killY: 1200,
  spawn: { x: 200, y: -640 },
  theme: () => drainTheme(11000, 21),
  dark: 0.94,
  drips: true,
  solids,
  decor,
  entities,
  triggers: [...triggers, { id: 'sluice_watch', x: 7740, w: 400, once: true, script: 'sluice' }],
  camZones: [
    { x0: -300, x1: 1700, zoom: 1.05 },
    { x0: 1950, x1: 2850, yOff: 200, zoom: 0.92 },
    { x0: 4500, x1: 5200, yOff: -80 },
    { x0: 5950, x1: 7400, zoom: 0.9, yOff: 60 },
    { x0: 8000, x1: 10900, zoom: 0.9, lead: 300 },
  ],
  scripts: { arrive, meetEcho, sluice, exit },
  startScript: 'arrive',
  ambience: () => {
    audio.loop('amb', 'amb_drain', 0.5, 3);
    audio.loop('wind', 'amb_dungeon', 0.32, 3);
    audio.loop('ghost', 'amb_rumble', 0.16, 3);
  },
};
