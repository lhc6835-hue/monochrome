/**
 * 회색 숲
 *  - 새 떼 (Flock): 땅에서 모이를 쪼다가, 굳지 않은 채 가까이 오면 한꺼번에 날아오른다 (큰 소리)
 *  - 술래 (Seeker): 나무에 얼굴을 묻고 "무궁화 꽃이 피었습니다"를 세는 아이.
 *    다 세면 돌아본다. 그때 굳어 있지 않으면 들킨다. 새 떼가 날아오르면 세다 말고 바로 돌아본다.
 *    아이 뒤 안개에는 거대한 그림자가 같은 동작을 한다.
 */
import { Entity, Resident } from './entities';
import type { EntityDef, GameAPI } from './types';
import { audio } from '../core/audio';
import { clamp, ease, hash1, lerp, TAU } from '../core/math';
import { drawIcon } from '../gfx/icons';
import { drawFigure, defaultStyle, rigidPose, type Pose } from '../gfx/figure';
import { app } from '../app';

// ------------------------------------------------------------------
// 새 떼
// ------------------------------------------------------------------
interface Bird {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dir: number;
  peck: number;
  delay: number;
  flap: number;
  gone: boolean;
}

export class Flock extends Entity {
  readonly type = 'flock';
  birds: Bird[] = [];
  startled = false;
  private t = 0;
  constructor(public def: Extract<EntityDef, { type: 'flock' }>) {
    super(def.id);
    this.reset();
  }
  private reset() {
    const d = this.def;
    const n = d.n ?? 7;
    const spread = d.spread ?? 90;
    this.birds = [];
    for (let i = 0; i < n; i++) {
      const h = hash1(i * 7.13 + d.x * 0.01);
      this.birds.push({ x: d.x + (h - 0.5) * 2 * spread, y: d.y ?? 0, vx: 0, vy: 0, dir: hash1(i * 3.3 + 1) < 0.5 ? -1 : 1, peck: hash1(i * 5.1) * 10, delay: hash1(i * 9.7) * 0.28, flap: hash1(i) * 6, gone: false });
    }
    this.startled = false;
  }
  /** 날아오른다 (fromX 반대쪽 위로) */
  startle(g: GameAPI, fromX: number) {
    if (this.startled) return;
    this.startled = true;
    const d = this.def;
    const away = fromX < d.x ? 1 : -1;
    for (const b of this.birds) {
      b.dir = away;
      b.vx = away * (260 + hash1(b.x) * 260);
      b.vy = -(520 + hash1(b.x * 1.7) * 380);
    }
    audio.play('whoosh', { vol: 0.7, rate: 1.5 });
    for (let i = 0; i < 6; i++) audio.play((['flip1', 'flip2', 'flip3'] as const)[i % 3], { vol: 0.55, rate: 1.4 + Math.random() * 0.5, delay: i * 0.05 });
    g.noise(d.x, (d.y ?? 0) - 20, 760);
  }
  hear(x: number, y: number, r: number) {
    // 다른 새 떼가 날아오르는 소리에 함께 놀란다
    const d = this.def;
    if (r >= 700 && Math.hypot(x - d.x, y - (d.y ?? 0)) < 420) this.startleLater = x;
  }
  private startleLater: number | null = null;

  update(g: GameAPI, dt: number) {
    this.t += dt;
    const d = this.def;
    const p = g.player;
    if (!this.startled) {
      if (this.startleLater !== null) {
        this.startle(g, this.startleLater);
        this.startleLater = null;
      }
      const dx = p.x - d.x,
        dy = p.y - (d.y ?? 0);
      const near = Math.abs(dx) < (d.spread ?? 90) + 120 && Math.abs(dy) < 220;
      const moving = !p.frozen && (Math.abs(p.body.vx) > 30 || !p.body.onGround);
      if (near && moving && !g.isDead()) this.startle(g, p.x);
      // 가끔 종종걸음
      for (const b of this.birds) {
        b.peck += dt;
        if (hash1(Math.floor(b.peck * 0.7) + b.x) < dt * 1.2) b.dir = -b.dir;
      }
      return;
    }
    for (const b of this.birds) {
      if (b.gone) continue;
      if (b.delay > 0) {
        b.delay -= dt;
        continue;
      }
      b.flap += dt * 22;
      b.vy += (-260 - b.vy) * Math.min(1, dt * 1.5);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < (d.y ?? 0) - 1600) b.gone = true;
    }
  }

  drawFront(ctx: CanvasRenderingContext2D) {
    const d = this.def;
    const H = d.size ?? 44;
    for (const b of this.birds) {
      if (b.gone) continue;
      ctx.save();
      ctx.translate(b.x, b.y);
      if (!this.startled || b.delay > 0) {
        // 땅에서 고개를 까딱이며 쪼기
        const peck = Math.max(0, Math.sin(b.peck * 5 + b.x)) ** 6;
        ctx.rotate(peck * 0.5 * b.dir);
        drawIcon(ctx, 'bird', 0, 0, H, { color: '#141413', flip: b.dir < 0 });
      } else {
        // 날갯짓: 세로로 접었다 폈다
        const s = 0.35 + Math.abs(Math.sin(b.flap)) * 0.75;
        ctx.rotate(-0.25 * b.dir);
        ctx.scale(1, s);
        drawIcon(ctx, 'bird', 0, H * 0.5, H, { color: '#141413', flip: b.dir < 0 });
      }
      ctx.restore();
    }
  }
  save() {
    return { s: this.startled };
  }
  load(s: unknown) {
    this.reset();
    if ((s as { s: boolean }).s) {
      this.startled = true;
      for (const b of this.birds) b.gone = true;
    }
  }
}

// ------------------------------------------------------------------
// 술래
// ------------------------------------------------------------------
const CHANT = ['무', '궁', '화', '꽃', '이', '피', '었', '습', '니', '다'];
// 아이들이 부르는 가락 (bell1 의 재생 속도로 음높이)
const MELODY = [1.0, 1.0, 0.84, 1.0, 1.12, 1.0, 1.0, 0.84, 0.84, 0.75];
/** 한 번 셀 때 글자마다 걸리는 시간 (박자) — 순서대로 돌아가며 쓴다 */
const TEMPOS: number[][] = [
  [0.42, 0.42, 0.42, 0.42, 0.6, 0.42, 0.42, 0.42, 0.42, 0.5],
  [0.34, 0.34, 0.34, 0.34, 0.5, 0.34, 0.34, 0.34, 0.34, 0.4],
  [0.5, 0.5, 0.5, 0.5, 0.5, 0.13, 0.13, 0.13, 0.13, 0.2],
  [0.17, 0.17, 0.17, 0.17, 0.3, 0.17, 0.17, 0.17, 0.17, 0.2],
  [0.3, 0.3, 0.3, 0.3, 1.6, 0.15, 0.15, 0.15, 0.15, 0.2],
  [0.34, 0.34, 0.34, 0.34, 0.5, 0.34, 0.34, 0.34, 0.34, 0.4],
  [0.62, 0.62, 0.62, 0.62, 0.7, 0.62, 0.62, 0.62, 0.15, 0.15],
  [0.14, 0.14, 0.14, 0.14, 0.2, 0.5, 0.5, 0.5, 0.5, 0.5],
];
/** 돌아보는 시간 (새 소리에 놀라 돌아볼 때는 먼저 흠칫하는 시간이 더 붙는다) */
const TURN = 0.58;
const STARTLE = 0.35;
/** 다 돌아본 뒤 굳을 수 있는 여유 */
const GRACE = 0.2;

type SState = 'count' | 'turn' | 'look' | 'back' | 'caught' | 'found';

export class Seeker extends Entity {
  readonly type = 'seeker';
  state: SState = 'count';
  private t = 0;
  private syl = 0;
  private cycle = 0;
  private lookDur = 1.4;
  private alerted = false;
  /** 돌아보는 정도 0..1 */
  private turnAmt = 0;
  private sweep = 0;
  /** 글자를 셀 때마다 고개를 까딱하는 박자 (1 → 0) */
  private beat = 0;
  /** 새 소리에 놀라 돌아보는 중 */
  private startled = false;
  constructor(public def: Extract<EntityDef, { type: 'seeker' }>) {
    super(def.id);
  }
  private child(g: GameAPI) {
    return g.entity<Resident>(this.def.child);
  }
  /** 이 구역 안에 있을 때만 술래가 본다 */
  private inZone(g: GameAPI) {
    const p = g.player;
    return p.x > this.def.x0 && p.x < this.def.x - 60;
  }
  hear(x: number, _y: number, r: number) {
    if (this.state !== 'count' || r < 700) return;
    if (x < this.def.x0 - 200 || x > this.def.x) return;
    // 새 떼가 날아오르는 소리 → 세다 말고 돌아본다
    this.alerted = true;
  }

  update(g: GameAPI, dt: number) {
    const kid = this.child(g);
    // 놀이가 끝나기 전에는 술래 아이에게 꽃잎을 건넬 수 없다
    if (kid) kid.locked = this.state !== 'found';
    if (this.state === 'found') {
      (g.player as unknown as { preferFreeze: boolean }).preferFreeze = false;
      this.turnAmt = Math.max(0, this.turnAmt - dt * 2);
      if (kid) kid.poseOverride = null;
      return;
    }
    this.t += dt;
    const p = g.player;
    // 술래에게 닿으면 놀이가 끝난다
    if (p.x > this.def.x - 150 && !g.isDead() && this.state !== 'caught') {
      this.finish(g);
      return;
    }
    this.beat = Math.max(0, this.beat - dt * 4);
    // 구역 안에서는 달리다 ↓ 를 눌러도 구르지 않고 굳는다
    (p as unknown as { preferFreeze: boolean }).preferFreeze = this.inZone(g);
    const tempo = TEMPOS[this.cycle % TEMPOS.length];
    switch (this.state) {
      case 'count': {
        this.turnAmt = Math.max(0, this.turnAmt - dt * 4);
        if (this.alerted) {
          this.alerted = false;
          this.state = 'turn';
          this.t = 0;
          this.startled = true;
          this.lookDur = 1.8;
          if (Math.abs(p.x - this.def.x) < 2600) {
            audio.play('sting4', { vol: 0.7 });
            audio.play('click4', { vol: 0.6, rate: 0.6 });
          }
          break;
        }
        if (this.syl < CHANT.length && this.t >= tempo[this.syl]) {
          this.t -= tempo[this.syl];
          this.syl++;
          this.beat = 1;
          this.sing(g, this.syl - 1);
        }
        if (this.syl >= CHANT.length) {
          this.state = 'turn';
          this.t = 0;
          this.startled = false;
          this.lookDur = 1.2 + hash1(this.cycle * 3.7) * 0.7;
        }
        break;
      }
      case 'turn': {
        // 놀랐을 때는 먼저 흠칫 멈췄다가 돌아본다
        const pre = this.startled ? STARTLE : 0;
        this.turnAmt = clamp((this.t - pre) / TURN);
        if (this.t >= TURN + pre) {
          this.state = 'look';
          this.t = 0;
          this.sweep = 0;
          if (this.near(g)) audio.play('click5', { vol: 0.5, rate: 0.5 });
        }
        break;
      }
      case 'look':
        this.turnAmt = 1;
        this.sweep += dt;
        // 굳지 않고 구역 안에 있으면 들킨다 (돌아본 직후 아주 짧은 여유)
        if (this.sweep > GRACE && this.inZone(g) && !p.frozen && !g.isDead()) {
          this.state = 'caught';
          this.t = 0;
          audio.play('sting2', { vol: 0.9 });
          audio.play('bell1', { vol: 0.6, rate: 0.5 });
          g.kill('erase');
          break;
        }
        if (this.t >= this.lookDur) {
          this.state = 'back';
          this.t = 0;
        }
        break;
      case 'back':
        this.turnAmt = 1 - clamp(this.t / 0.5);
        if (this.t >= 0.62) {
          this.startled = false;
          this.state = 'count';
          this.t = 0;
          this.syl = 0;
          this.cycle++;
        }
        break;
      case 'caught':
        this.turnAmt = 1;
        if (!g.isDead()) {
          // 다시 시작: 새로 센다
          this.state = 'count';
          this.startled = false;
          this.t = -0.6;
          this.syl = 0;
          this.turnAmt = 0;
        }
        break;
    }
    if (kid) kid.poseOverride = () => this.pose(kid.facing, g.t);
  }

  private near(g: GameAPI) {
    return Math.abs(g.player.x - this.def.x) < 2600;
  }

  private sing(g: GameAPI, i: number) {
    if (!this.near(g)) return;
    const d = Math.abs(g.player.x - this.def.x);
    const vol = clamp(1.05 - d / 2800, 0.25, 0.75);
    audio.play('bell1', { vol, rate: MELODY[i] * 1.18 });
    if (i === CHANT.length - 1) audio.play('bell3', { vol: vol * 0.6, rate: 0.9 });
  }

  /** 놀이가 끝났다: 술래 아이는 굳은 채 돌아서 있다 (이제 꽃잎을 건넬 수 있다) */
  finish(g: GameAPI) {
    if (this.state === 'found') return;
    this.state = 'found';
    const kid = this.child(g);
    if (kid) {
      kid.locked = false;
      kid.poseOverride = null;
    }
    audio.play('bell2', { vol: 0.6, rate: 0.8 });
    audio.play('chime', { vol: 0.5 });
    g.flags.add('seek:done');
  }

  /**
   * 술래 아이의 자세: 나무에 이마를 대고 두 팔로 눈을 가린다 → 돌아본다.
   * 아이콘은 정면 아니면 옆모습뿐이라, 도는 동작을 단계로 나눈다:
   *  ① 팔을 얼굴에서 내리며 고개를 든다 (나무를 본 채)  ② 정면을 거쳐  ③ 반대쪽(아이들 쪽)을 보고 선다
   */
  pose(_facing: number, t: number): Pose {
    const P = rigidPose();
    const k = this.turnAmt;
    const back = this.state === 'back';
    // 놀랐을 때: 흠칫 — 고개가 번쩍 들리고 몸이 굳는다 (아직 돌지 않음)
    const pre = this.state === 'turn' && this.startled ? clamp(this.t / STARTLE) : this.state === 'turn' || this.state === 'look' || this.state === 'caught' ? 1 : 0;
    // ① 팔 내리기·고개 들기 (돌아설 때는 앞쪽 40%, 되돌아갈 때는 뒤쪽 40% 에 팔을 다시 올린다)
    const lower = back ? clamp((k - 0.15) / 0.45) : ease.inOutSine(clamp(k / 0.42));
    // ② 정면 → ③ 반대쪽
    const side = k < 0.46 ? 1 : k < 0.62 ? 0 : -1;
    P.turn = side;
    const nI = side >= 0 ? 0 : 1;
    const fI = 1 - nI;
    // 셀 때: 나무에 이마를 기대고 두 팔을 굽혀 눈을 가린다
    const cover = 1 - lower;
    P.lean = 0.24 * cover + (side < 0 ? -0.03 : 0);
    P.headTilt = 0.4 * cover - (side < 0 ? 0.12 : 0) - (this.startled && this.state === 'turn' ? 0.25 * pre * (1 - clamp(k * 3)) : 0);
    if (side === 0) {
      // 정면: 팔은 몸 옆에 곧게
      P.arms[0].a = P.arms[1].a = 0.1;
      P.arms[0].b = P.arms[1].b = 0.12;
    } else {
      P.arms[nI].a = lerp(0.22, 2.45, cover);
      P.arms[nI].b = lerp(0.25, 2.35, cover);
      P.arms[fI].a = lerp(0.1, 2.25, cover);
      P.arms[fI].b = lerp(0.2, 2.45, cover);
    }
    P.legs[0].a = 0.04;
    P.legs[1].a = -0.04;
    // 셀 때: 글자마다 고개를 까딱, 몸이 박자에 맞춰 살짝 들썩인다
    if (this.state === 'count') {
      P.headTilt += 0.1 * this.beat;
      P.crouch = 0.012 * this.beat;
      P.headX = Math.sin(t * 5) * 0.002;
    }
    // 돌아본 뒤: 아이들 쪽을 노려보며 고개를 아주 조금씩 움직인다
    if (this.state === 'look') P.headTilt += Math.sin(t * 2.2) * 0.04;
    if (this.state === 'caught') {
      // 손가락으로 가리킨다
      P.arms[nI].a = 1.55;
      P.arms[nI].b = 0.05;
      P.lean = -0.05;
    }
    return P;
  }

  /**
   * 안개에 비친 거대한 그림자: 멀리 떨어진 안개 벽에 맺힌 상이라 카메라를 따라 거의 움직이지 않는다.
   * 나무들 뒤에 그린다 (구간의 drawBack 에서 부른다).
   */
  drawShadow(g: GameAPI) {
    if (this.state === 'found') return;
    const p = g.player;
    if (p.x < this.def.x0 - 600 || p.x > this.def.x + 300) return;
    const kid = this.child(g);
    if (!kid) return;
    const s = app.screen;
    const L = app.fxLayer;
    s.clearLayer(L);
    g.cam.apply(L.ctx, s, 1);
    const P = this.pose(kid.facing, g.t);
    const st = defaultStyle();
    st.color = '#6a6a66';
    st.farColor = '#757571';
    st.headScale = 1.3;
    const z = g.cam.zoom;
    const fade = clamp((p.x - (this.def.x0 - 600)) / 500);
    drawFigure(L.ctx, P, g.cam.x + 330 / z, 80, 900, st);
    s.composite(L, 0.5 * fade);
  }

  /** 세는 소리를 글자로 (화면 위쪽) + 돌아볼 때 세상이 어두워진다 */
  drawFront(ctx: CanvasRenderingContext2D, g: GameAPI) {
    if (this.state === 'found' || !this.near(g)) return;
    const s = app.screen;
    const v = g.cam.view(s);
    const z = g.cam.zoom;
    const cx = (v.x0 + v.x1) / 2;
    const top = v.y0 + 120 / z;
    // 돌아보는 동안: 화면 가장자리가 어두워진다
    if (this.turnAmt > 0.01) {
      ctx.save();
      ctx.globalAlpha = 0.22 * this.turnAmt;
      ctx.fillStyle = '#000';
      ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
      ctx.restore();
    }
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = 54 / z;
    ctx.font = `600 ${fs}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
    const gap = fs * 1.05;
    // 새 소리에 놀라 세다 말았으면, 부른 데까지만
    const n = this.state === 'count' || this.startled ? this.syl : CHANT.length;
    for (let i = 0; i < CHANT.length; i++) {
      const x = cx + (i - (CHANT.length - 1) / 2) * gap + (i >= 5 ? gap * 0.35 : -gap * 0.35);
      if (i < n) {
        const fresh = this.state === 'count' && i === n - 1 ? 1 - clamp(this.t / 0.25) : 0;
        ctx.globalAlpha = this.state === 'count' ? 0.85 : 0.35 + 0.5 * (1 - this.turnAmt);
        ctx.fillStyle = '#1a1a19';
        ctx.fillText(CHANT[i], x, top - fresh * 8 / z);
      } else {
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = '#1a1a19';
        ctx.fillText('·', x, top);
      }
    }
    // 흠칫: 세다 말고 멈췄다 (곧 돌아본다)
    if (this.state === 'turn' && this.startled && this.turnAmt < 0.3) {
      const k = clamp(this.t / 0.12);
      ctx.globalAlpha = k * (1 - clamp(this.turnAmt / 0.3));
      ctx.font = `700 ${fs * 1.5}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
      ctx.fillStyle = '#0d0d0d';
      ctx.fillText('!', cx, top + fs * 1.4 - (1 - k) * 10 / z);
    }
    // 돌아봤다
    if (this.state === 'turn' || this.state === 'look' || this.state === 'caught') {
      ctx.globalAlpha = this.turnAmt;
      ctx.font = `700 ${fs * 1.2}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
      ctx.fillStyle = '#0d0d0d';
      ctx.fillText(this.state === 'caught' ? '움직였다' : '굳어라', cx, top + fs * 1.4);
    }
    ctx.restore();
    void TAU;
  }

  save() {
    return { found: this.state === 'found' };
  }
  load(s: unknown) {
    const f = (s as { found: boolean }).found;
    this.state = f ? 'found' : 'count';
    this.startled = false;
    this.beat = 0;
    this.t = 0;
    this.syl = 0;
    this.turnAmt = 0;
    this.alerted = false;
  }
}
