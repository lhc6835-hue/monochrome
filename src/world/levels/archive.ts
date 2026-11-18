/**
 * 구간 5 — 기록 보관소
 *  A. 열람실 (천창으로 떨어짐, 사서, 기억 "함께")                    -300 ~ 1800
 *  B. 기록대 1 (과거의 나에게 발판을 맡기고 문을 지난다)              1800 ~ 3400
 *  C. 서가 미로 (책 수레로 높은 책장, 사다리로 중층의 아이)            3400 ~ 5650
 *  D. 기록대 2 (문 둘, 발판 둘: 수레 + 과거의 나, 기억 "홀로")         5650 ~ 7750
 *  E. 서가 탑 (아래에서 차오르는 여백, 지그재그로 올라 천창으로)        7750 ~ 8800
 */
import type { LevelDef, GameAPI, SolidDef, DecorDef, EntityDef, TriggerDef } from '../types';
import type { Co } from '../../core/co';
import { archiveTheme } from '../../gfx/background';
import { audio } from '../../core/audio';
import { PETAL_COLORS } from '../../gfx/flower';

const CEIL = -900;
const floor = (x0: number, x1: number, y = 0): SolidDef => ({ x: x0, y, w: x1 - x0, h: 3000, look: 'ground' });
const ceil = (x0: number, x1: number): SolidDef => ({ x: x0, y: -3000, w: x1 - x0, h: 3000 + CEIL, look: 'ceiling' });
const shelf = (x: number, w: number, top: number, bottom = 0): SolidDef => ({ x, y: top, w, h: bottom - top, look: 'shelf' });
const walk = (x0: number, x1: number, y: number): SolidDef => ({ x: x0, y, w: x1 - x0, h: 26, oneway: true, look: 'bridge' });

const solids: SolidDef[] = [
  ceil(-1200, 140),
  ceil(260, 7800),
  { x: 7760, y: -3200, w: 40, h: 3200 + CEIL, look: 'brick' },
  { x: 8800, y: -3200, w: 400, h: 6200, look: 'brick' },
  { x: -1200, y: -3000, w: 900, h: 6000, look: 'brick' },
  floor(-300, 8800),
  // A
  { x: 640, y: -80, w: 160, h: 80, look: 'crate' },
  shelf(1350, 160, -220),
  // C
  shelf(4380, 200, -340),
  walk(4700, 5500, -420),
  // E 서가 탑
  walk(7820, 8200, -340),
  shelf(8300, 400, -500, -460),
  walk(7900, 8720, -860),
  shelf(7820, 180, -1000, -960),
  walk(7820, 8400, -1360),
  shelf(8500, 260, -1500, -1460),
  walk(8100, 8760, -1860),
  shelf(7820, 180, -2000, -1960),
];

const decor: DecorDef[] = [
  { icon: 'bookshelf', x: 400, h: 520, color: '#232321' },
  { icon: 'bookshelf', x: 1000, h: 520, color: '#232321' },
  { icon: 'bulb', x: 760, y: -380, h: 70, color: '#232321' },
  { icon: 'bookshelf', x: 2300, h: 520, color: '#232321' },
  { icon: 'bookshelf', x: 2850, h: 520, color: '#232321' },
  { icon: 'bookshelf', x: 3800, h: 600, color: '#232321' },
  { icon: 'bookshelf', x: 5300, h: 380, y: -420, color: '#232321' },
  { icon: 'bookshelf', x: 6600, h: 520, color: '#232321' },
  { icon: 'clock', x: 7200, y: -620, h: 110, color: '#232321' },
];

const R = (id: string, x: number, extra: Partial<Extract<EntityDef, { type: 'resident' }>> = {}): EntityDef => ({ type: 'resident', id, x, ...extra });

const entities: EntityDef[] = [
  // A
  { type: 'shaft', id: 'as_sky', x: 200, top: CEIL, w: 120, bright: 0.9 },
  R('a_lib', 860, { savable: true, after: 'stay', kind: 'tall' }),
  { type: 'memory', id: 'm_together', x: 1150, art: 'together' },
  { type: 'shaft', id: 'as_a', x: 1150, top: CEIL, w: 130, bright: 0.45 },
  // B 기록대 1
  { type: 'recorder', id: 'rec1', x: 2000, dur: 8 },
  { type: 'plate', id: 'pl1', x: 2600, w: 120, signal: 'a1' },
  { type: 'gate', id: 'gt1', x: 3150, h: 430, signal: 'a1' },
  { type: 'shaft', id: 'as_b', x: 2600, top: CEIL, w: 120, bright: 0.55 },
  // C 서가 미로
  { type: 'box', id: 'cart1', x: 3800, size: 100 },
  { type: 'petal', id: 'ap_shelf', x: 4480, y: -410, color: PETAL_COLORS[2] },
  { type: 'ladder', id: 'a_lad1', x: 5050, top: -420, bottom: 0 },
  R('a_child', 5260, { y: -420, kind: 'child', savable: true, after: 'stay' }),
  { type: 'shaft', id: 'as_c', x: 5260, top: CEIL, w: 140, bright: 0.5 },
  // D 기록대 2
  { type: 'box', id: 'cart2', x: 5780, size: 100 },
  { type: 'plate', id: 'plA', x: 5980, w: 120, signal: 'aA' },
  { type: 'recorder', id: 'rec2', x: 6170, dur: 8 },
  { type: 'gate', id: 'gtA', x: 6360, h: 430, signal: 'aA' },
  { type: 'plate', id: 'plB', x: 6900, w: 120, signal: 'aB' },
  { type: 'gate', id: 'gtB', x: 7400, h: 430, signal: 'aB' },
  { type: 'shaft', id: 'as_d', x: 6900, top: CEIL, w: 120, bright: 0.5 },
  { type: 'memory', id: 'm_alone', x: 7600, art: 'alone' },
  // E 서가 탑
  { type: 'ladder', id: 'a_t1', x: 7880, top: -340, bottom: 0 },
  { type: 'ladder', id: 'a_t2', x: 8650, top: -860, bottom: -500 },
  { type: 'ladder', id: 'a_t3', x: 7855, top: -1360, bottom: -1000 },
  { type: 'ladder', id: 'a_t4', x: 8700, top: -1860, bottom: -1500 },
  { type: 'petal', id: 'ap_tower', x: 8000, y: -930, color: PETAL_COLORS[4] },
  R('a_tower', 8300, { y: -1360, savable: true, after: 'stay' }),
  { type: 'shaft', id: 'as_top', x: 7910, top: -2600, w: 160, bright: 1 },
];

const triggers: TriggerDef[] = [
  { id: 'cp_a1', x: 1800, w: 60, checkpoint: true },
  { id: 'h_rec', x: 1880, w: 60, once: true, hint: { kb: '기록대: {act} 를 누르면 8초 동안 움직임을 기록한다  ·  끝나면 처음 자리로 돌아가고, 기록된 내가 그대로 움직인다', touch: '기록대: 행동 버튼으로 8초 동안 움직임을 기록한다  ·  끝나면 기록된 내가 그대로 움직인다', dur: 7 } },
  { id: 'cp_a2', x: 3300, w: 60, checkpoint: true },
  { id: 'cp_a3', x: 5640, w: 60, checkpoint: true },
  { id: 'cp_a4', x: 7650, w: 60, checkpoint: true, spawnX: 7680 },
  { id: 'flood', x: 7840, w: 60, once: true, script: 'flood' },
  { id: 'exit', x: 7820, w: 180, y: -2300, h: 330, once: true, script: 'exit' },
];

// ------------------------------------------------------------------
function* arrive(g: GameAPI): Co {
  g.setControl(false);
  audio.play('flip1', { vol: 0.6 });
  audio.play('flip3', { vol: 0.5, delay: 0.3 });
  g.parts.paper(200, -400, 14, 0.8);
  yield 1.6;
  g.setControl(true);
}

function* flood(g: GameAPI): Co {
  audio.play('paper_rip', { vol: 1, rate: 0.5 });
  audio.play('sting1', { vol: 0.7 });
  g.shake(0.4);
  yield 0.5;
  g.startFlood({ startOffset: 800, max: 80 });
  audio.loop('heart', 'heart_fast', 0.6, 0.3, 'sfx');
  audio.loop('chasebed', 'chase_bed', 0.4, 0.5, 'amb');
  g.hint('↑', '↑', 1.2);
}

function* exit(g: GameAPI): Co {
  g.stopFlood();
  g.setControl(false);
  audio.stopLoop('heart', 2);
  audio.stopLoop('chasebed', 2);
  audio.play('flip2', { vol: 0.7 });
  audio.play('amb_wind', { vol: 0.5 });
  yield 1.0;
  g.goToLevel('forest');
}

export const archive: LevelDef = {
  id: 'archive',
  width: 8800,
  killY: 900,
  spawn: { x: 200, y: -700 },
  theme: () => archiveTheme(8800, 55),
  dark: 0.6,
  solids,
  decor,
  entities,
  triggers,
  camZones: [
    { x0: 3400, x1: 5600, zoom: 0.92, yOff: -60 },
    { x0: 5650, x1: 7700, zoom: 0.9 },
    { x0: 7760, x1: 8800, zoom: 0.85, yOff: 160 },
  ],
  scripts: { arrive, flood, exit },
  startScript: 'arrive',
  onRestore: (g) => {
    // 탑 안에서 다시 시작하면 여백이 다시 차오른다
    if ((g as unknown as { fired: Set<string> }).fired.has('flood')) g.co.run(flood(g), 'flood');
  },
  ambience: () => {
    audio.loop('amb', 'amb_ghost', 0.3, 3);
    audio.loop('wind', 'amb_dungeon', 0.2, 3);
    audio.loop('ghost', 'amb_rumble', 0.1, 3);
  },
};
