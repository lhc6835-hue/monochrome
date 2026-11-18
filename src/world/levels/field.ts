/**
 * 구간 9 — 꽃밭 (위험 없음)
 *  A. 회색 들판: 시든 꽃대 사이를 걷는다. 꽃빛이 스칠 때마다 잠깐 색이 돌았다 사라진다.   0 ~ 1000
 *  B. 정원사의 언덕: 빈 오두막, 녹슨 물뿌리개, 의자 두 개.                                  1000 ~ 1500
 *  C. 꽃밭 한가운데: 꽃을 심는다 → 엔딩 판정대로 배드 / 노말 / 진.                         1500 ~ 3600
 *  왼쪽(x < 0)은 지나온 하얀 땅. 노말·진엔딩에서 여백은 그 경계에 서 있다.
 */
import type { LevelDef, GameAPI, SolidDef, DecorDef, EntityDef, TriggerDef, BlankCtl, CamFocus } from '../types';
import type { Co } from '../../core/co';
import type { Player } from '../player';
import type { Resident, Memory } from '../entities';
import { LEVELS, LEVEL_ORDER } from './index';
import { meadowTheme } from '../../gfx/background';
import { audio } from '../../core/audio';
import { PETAL_COLORS, STEM, drawFlower, drawGlow } from '../../gfx/flower';
import { PAPER } from '../../gfx/blank';
import { clamp, ease, hash1, lerp, rand } from '../../core/math';
import { params } from '../../app';

const CENTER = 2000;
const PLATEAU = -150;
const BX = -230; // 경계 밖 여백이 서는 곳
const NPCS = 32;

const step = (x0: number, x1: number, y: number): SolidDef => ({ x: x0, y, w: x1 - x0, h: 3000, look: 'ground' });
const solids: SolidDef[] = [
  { x: -1500, y: -3000, w: 700, h: 6000, look: 'invisible' },
  { x: -800, y: 0, w: 800, h: 3000, look: 'pencil' },
  step(0, 1000, 0),
  step(1000, 1100, -30),
  step(1100, 1200, -60),
  step(1200, 1300, -90),
  step(1300, 1400, -120),
  step(1400, 3200, PLATEAU),
  step(3200, 3800, -120),
  { x: 3800, y: -3000, w: 400, h: 6000, look: 'invisible' },
];

/** 땅 높이 (꽃대 그리기용) */
function groundY(x: number) {
  if (x < 1000) return 0;
  if (x < 1400) return -30 * Math.floor((x - 1000) / 100 + 1);
  if (x < 3200) return PLATEAU;
  return -120;
}

const decor: DecorDef[] = [
  { icon: 'house', x: 1180, y: -60, h: 190, color: '#2a2a28' },
  { icon: 'bench', x: 1340, y: -120, h: 46, color: '#2a2a28' },
  { icon: 'bench', x: 1420, y: PLATEAU, h: 46, color: '#2a2a28', flip: true },
  { icon: 'tree2', x: 2900, y: PLATEAU, h: 360, color: '#2f2f2d' },
];

const entities: EntityDef[] = [
  // 엔딩에 모여드는 이웃들 (처음엔 보이지 않는다)
  ...Array.from({ length: NPCS }, (_, i): EntityDef => ({ type: 'resident', id: 'fn' + i, x: 3500, y: -120, kind: i % 4 === 1 ? 'child' : i % 7 === 3 ? 'tall' : 'adult' })),
  { type: 'resident', id: 'f_kid', x: 3600, y: -120, kind: 'child' },
  { type: 'memory', id: 'm_firsteye', x: CENTER + 110, y: PLATEAU, art: 'firsteye' },
];

const triggers: TriggerDef[] = [{ id: 'cp_f0', x: 60, w: 60, checkpoint: true }];

// ------------------------------------------------------------------
// 상태 (엔딩 연출)
// ------------------------------------------------------------------
type Route = 'bad' | 'normal' | 'true';
const st = {
  route: 'bad' as Route,
  planted: false,
  /** 꽃밭이 피어난 정도 (가운데부터) / 하얀 땅까지 */
  bloom: 0,
  bloomWide: 0,
  /** 진엔딩: 여백이 나타났다 / 마지막 꽃잎을 건넸다 */
  blankShown: false,
  given: false,
  credits: -1,
  title: 0,
};

/** 엔딩 판정: 깨운 이웃 수, 기억 조각 수 */
function judge(g: GameAPI): Route {
  const forced = params.get('route');
  if (forced === 'bad' || forced === 'normal' || forced === 'true') return forced;
  let total = 0,
    saved = 0,
    mems = 0,
    memTotal = 0;
  for (const id of LEVEL_ORDER) {
    const lv = LEVELS[id];
    if (!lv || id === 'field') continue;
    for (const d of lv.entities) {
      if (d.type === 'resident' && d.savable) {
        total++;
        if (g.saved.has(d.id)) saved++;
      }
      if (d.type === 'memory') {
        memTotal++;
        if (g.memories.has(d.id)) mems++;
      }
    }
  }
  if (saved < Math.ceil(total * 0.4)) return 'bad';
  if (saved >= total && mems >= memTotal) return 'true';
  return 'normal';
}

function npc(g: GameAPI, i: number) {
  return g.entity<Resident>('fn' + i);
}
function hideAll(g: GameAPI) {
  for (let i = 0; i < NPCS; i++) npc(g, i)?.load({ s: 'gone', x: 3500, y: -120, iris: null });
  g.entity<Resident>('f_kid')?.load({ s: 'gone', x: 3600, y: -120, iris: null });
  const m = g.entity<Memory>('m_firsteye');
  if (m && st.route !== 'true') m.x = -99999;
}

// ------------------------------------------------------------------
// 스크립트
// ------------------------------------------------------------------
function* arrive(g: GameAPI): Co {
  g.setControl(false);
  yield 1.4;
  g.setControl(true);
}

function savedCount(g: GameAPI) {
  let n = 0;
  for (const id of LEVEL_ORDER) {
    const lv = LEVELS[id];
    if (!lv) continue;
    for (const d of lv.entities) if (d.type === 'resident' && d.savable && g.saved.has(d.id)) n++;
  }
  return params.get('route') === 'true' ? NPCS - 1 : params.get('route') === 'normal' ? 18 : n;
}

/** 이웃들이 하나둘 도착해 꽃밭에 모인다 */
function* gather(g: GameAPI, n: number, around: number, spread: number): Co {
  for (let i = 0; i < Math.min(n, NPCS); i++) {
    const r = npc(g, i);
    if (!r) continue;
    r.load({ s: 'goto', x: -60 - (i % 5) * 50, y: 0, iris: PETAL_COLORS[i % 7] });
    const side = i % 2 === 0 ? -1 : 1;
    const k = Math.floor(i / 2) + 1;
    r.command('goto', around + side * (90 + k * (spread / Math.max(1, n / 2))));
    if (i % 3 === 0) audio.play('bell2', { vol: 0.25, rate: 0.9 + (i % 5) * 0.08 });
    yield 0.45;
  }
}

function* plant(g: GameAPI): Co {
  const S = g as unknown as { camFocus: CamFocus | null; cineFade: number; cineFadeColor: string; blankCtl: BlankCtl | null };
  const p = g.player as unknown as Player;
  st.planted = true;
  g.setControl(false);
  p.startGive(1);
  audio.play('swish2', { vol: 0.3, rate: 0.7 });
  yield 1.4;
  const cam: CamFocus = { x: CENTER, y: -420, zoom: 0.86, smooth: 1.4 };
  S.camFocus = cam;

  if (st.route === 'bad') {
    // 아무 일도 일어나지 않는다
    audio.play('bell1', { vol: 0.2, rate: 0.5 });
    yield 2.2;
    for (const f of [-1, 1, -1, 1]) {
      p.facing = f;
      yield 1.1;
    }
    // 꽃잎이 하나씩 바랜다
    for (let i = g.petals.length - 1; i >= 0; i--) {
      g.petals[i] = '#9e9e9a';
      audio.play('bell4', { vol: 0.25, rate: 0.6 - i * 0.03 });
      yield 0.7;
    }
    audio.play('erase', { vol: 0.5, rate: 0.6 });
    let t = 0;
    while (t < 4) {
      t += g.dt;
      p.hollow = ease.inOutSine(clamp(t / 3.5));
      yield;
    }
    yield 1.2;
    while (S.cineFade < 1) {
      S.cineFade = Math.min(1, S.cineFade + g.dt / 2);
      yield;
    }
    (g as unknown as { finish(r: Route): void }).finish('bad');
    return;
  }

  // 꽃을 심은 자리부터 색이 번진다
  audio.play('chime', { vol: 0.6, rate: 0.8 });
  audio.play('bell3', { vol: 0.4, rate: 0.7, delay: 0.4 });
  let t = 0;
  while (t < 4) {
    t += g.dt;
    st.bloom = ease.outCubic(clamp(t / 4));
    cam.zoom = lerp(0.86, 0.66, clamp(t / 4));
    yield;
  }
  // 깨운 이웃들이 하나둘 도착한다
  const n = savedCount(g);
  g.co.run(gather(g, n, CENTER, 700), 'gather');
  yield Math.min(n, NPCS) * 0.45 + 3;

  if (st.route === 'normal') {
    // 경계 밖의 여백: 다가오지도 떠나지도 않고, 발끝부터 스스로를 지운다
    cam.x = 500;
    cam.zoom = 0.62;
    const ctl: BlankCtl = { bx: BX, by: 0, lean: 0.05, head: 0.15, hand: null, alpha: 0, erase: 0, scale: 360 };
    S.blankCtl = ctl;
    t = 0;
    while (t < 2.5) {
      t += g.dt;
      ctl.alpha = clamp(t / 2);
      yield;
    }
    audio.play('ghost_breath', { vol: 0.4 });
    t = 0;
    while (t < 9) {
      t += g.dt;
      // 꽃밭 쪽으로 손이 반쯤 들린다
      const k = ease.inOutSine(clamp(t / 3));
      ctl.hand = [BX + 120 + k * 120, lerp(-200, -470, k)];
      ctl.erase = ease.inSine(clamp((t - 2) / 6.5)) * 0.99;
      if (Math.random() < g.dt * 6) g.parts.paper(BX + rand(-60, 60), -ctl.erase * 360 * 1.05, 1, 0.6);
      yield;
    }
    yield 1.5;
    while (S.cineFade < 1) {
      S.cineFade = Math.min(1, S.cineFade + g.dt / 2.2);
      yield;
    }
    (g as unknown as { finish(r: Route): void }).finish('normal');
    return;
  }

  // 진엔딩: 꽃밭 한가운데에 여덟 번째 기억 조각이 놓여 있다
  const m = g.entity<Memory>('m_firsteye');
  if (m) {
    m.x = CENTER + 110;
    g.parts.ring(m.x, PLATEAU - 150, PETAL_COLORS[0], 120, 1);
    audio.play('bell1', { vol: 0.5, rate: 0.9 });
  }
  S.camFocus = null;
  g.setControl(true);
  yield () => g.memories.has('m_firsteye') && (g as unknown as { mode: string }).mode === 'play';
  // 경계에 여백이 서 있다
  const ctl: BlankCtl = { bx: BX, by: 0, lean: 0.05, head: 0.15, hand: null, alpha: 0, scale: 360 };
  S.blankCtl = ctl;
  st.blankShown = true;
  audio.loop('heart', 'heart_slow', 0.5, 2, 'sfx');
  t = 0;
  while (t < 2) {
    t += g.dt;
    ctl.alpha = clamp(t / 2);
    yield;
  }
}

/** 진엔딩: 마지막 꽃잎을 여백에게 */
function* giveLast(g: GameAPI): Co {
  const S = g as unknown as { camFocus: CamFocus | null; cineFade: number; blankCtl: BlankCtl | null; finish(r: Route): void };
  const p = g.player as unknown as Player;
  const ctl = S.blankCtl!;
  st.given = true;
  g.setControl(false);
  p.startGive(-1);
  const cam: CamFocus = { x: (p.x + BX) / 2, y: -360, zoom: 0.9, smooth: 1.2 };
  S.camFocus = cam;
  yield 0.4;
  // 꽃잎이 날아간다
  const color = g.petals[g.petals.length - 1] ?? PETAL_COLORS[0];
  g.petals.length = 0;
  audio.play('bell3', { vol: 0.5, rate: 1.2 });
  const j = p.joints;
  const [hx, hy] = j ? j.hand[j.near] : [p.x, p.y - 80];
  const cx = BX + 360 * 0.03,
    cy = -360 * 0.64;
  let t = 0;
  while (t < 1.1) {
    t += g.dt;
    const k = ease.inOutSine(clamp(t / 1.1));
    const x = lerp(hx, cx, k),
      y = lerp(hy, cy, k) - Math.sin(k * Math.PI) * 80;
    g.parts.add({ t: 'spark', x, y, vx: 0, vy: 0, life: 0.6, size: 8, color, drag: 2 });
    yield;
  }
  audio.stopLoop('heart', 3);
  audio.play('chime', { vol: 0.7 });
  // 가슴에 색이 차오르고, 끓던 윤곽이 멈춘다
  ctl.still = true;
  t = 0;
  while (t < 2.4) {
    t += g.dt;
    ctl.glow = ease.outCubic(clamp(t / 2.2));
    yield;
  }
  // 무릎을 꿇는다
  t = 0;
  while (t < 1.8) {
    t += g.dt;
    const k = ease.inOutSine(clamp(t / 1.6));
    ctl.crouch = 0.3 * k;
    ctl.lean = lerp(0.05, 0.55, k);
    ctl.head = lerp(0.15, 0.6, k);
    yield;
  }
  yield 0.6;
  // 꽃잎으로 흩어지며 하얀 땅이 꽃밭이 된다
  audio.play('bell2', { vol: 0.7, rate: 0.8 });
  audio.play('bell4', { vol: 0.5, rate: 1.1, delay: 0.3 });
  g.parts.burst(cx, cy, PETAL_COLORS, 90, 700);
  g.parts.ring(cx, cy, PETAL_COLORS[2], 600, 1.6);
  t = 0;
  while (t < 3) {
    t += g.dt;
    ctl.alpha = 1 - clamp(t / 1.2);
    st.bloomWide = ease.outCubic(clamp(t / 3));
    if (Math.random() < 0.6) g.parts.burst(BX + rand(-300, 300), rand(-400, -50), [PETAL_COLORS[Math.floor(rand(0, 7))]], 2, 160);
    yield;
  }
  S.blankCtl = null;
  // 꽃을 모두 내어준 주인공이 다시 굳어 간다. 이웃들이 둘러선다
  p.state = 'normal';
  p.forceFreeze = true;
  audio.play('click2', { vol: 0.4, rate: 0.7 });
  audio.play('click4', { vol: 0.35, rate: 0.6, delay: 0.6 });
  for (let i = 0; i < NPCS; i++) {
    const r = npc(g, i);
    if (r && r.state !== 'gone') r.command('goto', p.x + (i % 2 === 0 ? -1 : 1) * (100 + Math.floor(i / 2) * 42));
  }
  cam.x = p.x;
  cam.zoom = 0.7;
  yield 5;
  // 크레딧
  st.credits = 0;
  while (st.credits < 16) {
    st.credits += g.dt;
    yield;
  }
  st.credits = -1;
  // 쿠키: 처음 깨운 아이가 꽃 한 송이를 쥐여준다
  const kid = g.entity<Resident>('f_kid');
  if (kid) {
    kid.load({ s: 'goto', x: p.x + 700, y: p.y, iris: PETAL_COLORS[3] });
    kid.command('goto', p.x + 70);
    yield () => kid.state === 'stay';
    kid.facing = -1;
    yield 0.8;
    kid.wave();
    audio.play('bell4', { vol: 0.5, rate: 1.3 });
    yield 0.6;
  }
  g.petals.push(...PETAL_COLORS);
  g.parts.burst(p.x + 30, p.y - 90, PETAL_COLORS, 26, 200);
  audio.play('chime', { vol: 0.6, rate: 1.1 });
  yield 1.0;
  // 손가락부터 관절이 풀리며 고개를 든다
  p.forceFreeze = false;
  audio.play('click1', { vol: 0.4, rate: 1.2 });
  yield 2.2;
  p.facing = 1;
  t = 0;
  while (t < 3.5) {
    t += g.dt;
    st.title = clamp(t / 2.5);
    yield;
  }
  yield 2.5;
  S.finish('true');
}

// ------------------------------------------------------------------
// 그리기
// ------------------------------------------------------------------
function drawBack(ctx: CanvasRenderingContext2D, g: GameAPI, v: { x0: number; x1: number; y0: number; y1: number }) {
  // 지나온 하얀 땅 (진엔딩에서 여백이 꽃잎으로 흩어지면, 이곳도 꽃밭이 된다)
  if (v.x0 < 0) {
    ctx.save();
    ctx.globalAlpha = 1 - st.bloomWide * 0.9;
    ctx.fillStyle = PAPER;
    ctx.fillRect(v.x0 - 100, v.y0 - 100, -v.x0 + 100, v.y1 - v.y0 + 200);
    ctx.restore();
    if (st.bloomWide > 0.01) {
      ctx.save();
      ctx.globalAlpha = 0.5 * st.bloomWide;
      ctx.fillStyle = '#3a3a37';
      ctx.fillRect(v.x0 - 100, 0, -v.x0 + 100, v.y1 + 200);
      ctx.restore();
      drawGlow(ctx, -400, -200, 900 * st.bloomWide, PETAL_COLORS, 0.4 * st.bloomWide);
    }
    ctx.strokeStyle = 'rgba(30,30,28,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = v.y0; y < v.y1; y += 28) ctx.lineTo(Math.sin(y * 0.04 + g.t) * 6, y);
    ctx.stroke();
  }
  // 시든 꽃대 (피어나면 색이 든다)
  const p = g.player;
  const j = (p as unknown as { joints: { hand: [number, number][]; near: number } | null }).joints;
  const [hx, hy] = j ? j.hand[j.near] : [p.x, p.y - 80];
  const lr = (g as unknown as { lightRadius(): number }).lightRadius();
  for (let i = 0; i < 170; i++) {
    const x = -800 + i * 27 + (hash1(i * 3.3) - 0.5) * 18;
    if (x < v.x0 - 40 || x > v.x1 + 40) continue;
    const gy = x < 0 ? 0 : groundY(x);
    const h = 40 + hash1(i * 1.7) * 60;
    const sway = Math.sin(g.t * 1.2 + i) * 4;
    // 이 꽃대에 색이 들었는가
    const inBloom = x < 0 ? st.bloomWide : clamp((st.bloom * 3400 - Math.abs(x - CENTER)) / 300);
    const brush = clamp(1 - Math.hypot(x - hx, gy - h - hy) / (lr * 0.7)) * 0.8;
    const c = Math.max(inBloom, brush);
    if (x < 0 && st.bloomWide < 0.01) continue;
    ctx.strokeStyle = c > 0.05 ? STEM : '#5b5b58';
    ctx.globalAlpha = c > 0.05 ? 0.6 + c * 0.4 : 0.8;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    if (c > 0.5) ctx.quadraticCurveTo(x + sway, gy - h * 0.6, x + sway * 1.5, gy - h);
    else ctx.quadraticCurveTo(x + 10, gy - h * 0.7, x + 18, gy - h * 0.8);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (c > 0.5) {
      const col = PETAL_COLORS[i % 7];
      drawFlower(ctx, x + sway * 1.5, gy - h + 6, 11 * c, [col, col, col, col, col], { stem: 0, sway: 0 });
    } else {
      // 고개 숙인 마른 꽃
      ctx.fillStyle = c > 0.05 ? PETAL_COLORS[i % 7] : '#5b5b58';
      ctx.globalAlpha = c > 0.05 ? 0.5 + c : 0.85;
      ctx.beginPath();
      ctx.ellipse(x + 18, gy - h * 0.8 + 6, 5, 7, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  // 녹슨 물뿌리개
  ctx.fillStyle = '#2a2a28';
  ctx.fillRect(1260, -150, 46, 30);
  ctx.beginPath();
  ctx.moveTo(1306, -142);
  ctx.lineTo(1340, -168);
  ctx.lineTo(1344, -162);
  ctx.lineTo(1306, -132);
  ctx.closePath();
  ctx.fill();
  // 피어난 꽃밭 위의 빛
  if (st.bloom > 0.01) drawGlow(ctx, CENTER, PLATEAU - 120, 900 * st.bloom, PETAL_COLORS, 0.35 * st.bloom);
}

/** 크레딧과 마지막 제목 (화면 좌표) */
function drawOverlay(ctx: CanvasRenderingContext2D, _g: GameAPI, W: number, H: number) {
  const KR = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
  if (st.credits >= 0) {
    const lines = ['THE MONOCHROME', '', '이야기 · 기획 · 개발', '— 함께 만든 이들 —', '', '효과음', 'OpenGameArt.org 의 CC0 소리들', '(rubberduck, qubodup, ogrebane, bart 외)', '', '아이콘', 'Maki · Material Design Icons · Material Symbols', '', '그리고', '이 세계의 모든 이웃에게', '', '', '봐 주어서 고마워요'];
    const y0 = H + 40 - st.credits * 70;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.globalAlpha = clamp(st.credits / 1.5) * clamp((16 - st.credits) / 1.5);
    lines.forEach((l, i) => {
      ctx.fillStyle = i === 0 ? '#0d0d0d' : '#2a2a28';
      ctx.font = `${i === 0 ? 600 : 400} ${i === 0 ? 38 : 22}px ${KR}`;
      ctx.fillText(l, W / 2, y0 + i * 46);
    });
    ctx.restore();
  }
  if (st.title > 0.01) {
    ctx.save();
    ctx.globalAlpha = st.title;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0d0d0d';
    ctx.font = `600 64px ${KR}`;
    ctx.fillText('THE MONOCHROME', W / 2, H * 0.24);
    ctx.font = `400 22px ${KR}`;
    ctx.fillStyle = '#2a2a28';
    ctx.fillText('더 모노크롬', W / 2, H * 0.24 + 44);
    drawFlower(ctx, W / 2, H * 0.24 + 120, 30, PETAL_COLORS, { stem: 1.2, sway: Math.sin(performance.now() / 900) * 0.06 });
    ctx.restore();
  }
}

export const field: LevelDef = {
  id: 'field',
  width: 3800,
  killY: 900,
  spawn: { x: 60, y: 0 },
  theme: () => meadowTheme(3800, 99),
  solids,
  decor,
  entities,
  triggers,
  camZones: [
    { x0: -800, x1: 1000, zoom: 0.9 },
    { x0: 1000, x1: 3800, zoom: 0.84, yOff: -80 },
  ],
  scripts: { arrive, plant, giveLast },
  startScript: 'arrive',
  drawBack,
  drawOverlay,
  onRestore: (g) => {
    st.route = judge(g);
    st.planted = false;
    st.bloom = 0;
    st.bloomWide = 0;
    st.blankShown = false;
    st.given = false;
    st.credits = -1;
    st.title = 0;
    (g.player as unknown as Player).hollow = 0;
    (g.player as unknown as Player).forceFreeze = false;
    hideAll(g);
  },
  customPrompt: (g) => {
    const p = g.player;
    if (!st.planted && Math.abs(p.x - CENTER) < 120) return { text: '꽃 심기', x: CENTER, y: PLATEAU - 60, hold: 0.8, act: () => g.co.run(plant(g), 'plant') };
    if (st.route === 'true' && st.blankShown && !st.given && p.x < BX + 170) return { text: '마지막 꽃잎 건네기', x: BX + 60, y: -140, hold: 1.2, act: () => g.co.run(giveLast(g), 'giveLast') };
    return null;
  },
  ambience: () => {
    audio.loop('amb', 'amb_wind', 0.25, 3);
  },
};
