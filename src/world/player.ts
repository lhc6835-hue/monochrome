import { Body, moveBody, areaFree, type Solid } from './physics';
import type { GameAPI, PlayerLike } from './types';
import type { Input } from '../core/input';
import { Box } from './entities';
import { audio } from '../core/audio';
import { clamp, damp, ease, lerp, noise1 } from '../core/math';
import { applyIdle, applyRunCycle, clonePose, drawFigure, lerpPose, plantLegs, reachIK, rigidPose, defaultStyle, type Pose, type Joints } from '../gfx/figure';
import { drawFlower, drawGlow, PETAL_COLORS } from '../gfx/flower';

export const PH = {
  RUN: 335,
  PUSH: 150,
  ACC_G: 2800,
  ACC_A: 1800,
  FRIC: 3200,
  GRAV: 2500,
  JUMP: 905,
  MAX_FALL: 1450,
  COYOTE: 0.1,
  BUFFER: 0.13,
  H: 138,
  W: 42,
  SLIDE_H: 60,
  SCALE: 150,
};

/** 사다리 가로대 간격, 한 칸 오르는 시간 */
export const RUNG = 34;
const CLIMB_STEP = 0.19;
/** 구르기 한 바퀴 시간 */
const ROLL_T = 0.5;
/** 웅크린 몸 중심 (발 기준) */
const ROLL_CY = 40;
const ROLL_DX = 33;
const ROLL_DY = 14;
const ROLL_SCALE = 0.88;

export type PState = 'normal' | 'mantle' | 'freeze' | 'slide' | 'give' | 'dead' | 'scripted' | 'climb';

export interface LadderLike {
  x: number;
  top: number;
  bottom: number;
}

export class Player implements PlayerLike {
  body = new Body(0, 0, PH.W, PH.H);
  state: PState = 'normal';
  facing = 1;
  pose: Pose = rigidPose();
  private phase = 0;
  private coyote = 0;
  private buffer = 0;
  private jumping = false;
  private freezeHold = 0;
  freezeAmt = 0;
  private slideT = 0;
  private mantleT = 0;
  private mantleFrom: [number, number] = [0, 0];
  private mantleTo: [number, number] = [0, 0];
  /** 착지 흡수 동작 */
  private landT = 9;
  private landImpact = 0;
  /** 상태가 바뀔 때 이전 자세에서 이어지게 */
  private poseKey = 'ground';
  private blendFrom: Pose | null = null;
  private blendT = 1;
  private blendDur = 0.1;
  /** 구르기 */
  private rollEnd = 0;
  private rollDir = 1;
  rollAngle = 0;
  rollK = 0;
  /** 사다리: 가로대 단위 이동 */
  private climbM = 0;
  private climbE = 0;
  private climbDir = 0;
  private climbExit = 0;
  private fallStartY = 0;
  private idleT = 0;
  private stepI = 0;
  pushing = 0;
  grabbing: Box | null = null;
  giveT = 0;
  giveDir = 1;
  /** 스크립트 제어: 목표 x 로 걷기 */
  scriptTarget: number | null = null;
  scriptSpeed = 200;
  deathT = 0;
  deathCause: 'erase' | 'fall' | 'crush' | 'drown' = 'erase';
  joints: Joints | null = null;
  hideFlower = false;
  /** 물에 잠긴 정도 0..1 */
  submerge = 0;
  ladder: LadderLike | null = null;
  private climbPhase = 0;
  private hopT = 0;
  holdAnim = 0;

  get x() {
    return this.body.x;
  }
  get y() {
    return this.body.y;
  }
  get frozen() {
    return this.state === 'freeze' && this.freezeAmt > 0.82;
  }

  place(x: number, y: number) {
    const b = this.body;
    b.x = x;
    b.y = y;
    b.vx = b.vy = 0;
    b.h = PH.H;
    this.state = 'normal';
    this.freezeAmt = 0;
    this.grabbing = null;
    this.deathT = 0;
    this.fallStartY = y;
  }

  update(g: GameAPI & { boxes(): Box[]; ladders(): LadderLike[] }, inp: Input, control: boolean, dt: number) {
    const b = this.body;
    if (this.state === 'dead') {
      this.deathT += dt;
      if (this.deathCause === 'fall' || this.deathCause === 'drown') {
        b.vy = Math.min(this.deathCause === 'drown' ? 120 : PH.MAX_FALL, b.vy + PH.GRAV * dt);
        b.y += b.vy * dt;
      }
      return;
    }
    let ax = control ? inp.axisX : 0;
    const downHeld = control && inp.down('down');
    const solids = g.solids();
    // 물
    const water = g.waterAt(b.x);
    const prevSub = this.submerge;
    this.submerge = water ? clamp((b.y - water.level) / PH.H) : 0;
    const sub = this.submerge;
    if (water && prevSub <= 0.02 && sub > 0.02 && b.vy > 150) {
      audio.play(b.vy > 700 ? 'splash2' : 'splash1', { vol: clamp(b.vy / 900, 0.3, 0.9) });
      g.parts.puff(b.x, water.level, 12, 1.3);
      g.noise(b.x, b.y, 520);
    }
    this.hopT = Math.max(0, this.hopT - dt);

    // ---------- 사다리: 가로대를 하나씩 잡고 오른다 ----------
    if (this.state === 'climb' && this.ladder) {
      const L = this.ladder;
      const upHeld = control && (inp.down('up') || (inp.touchMode && inp.down('jump')));
      const downHeld = control && inp.down('down');
      const M = Math.floor((L.bottom - L.top) / RUNG);
      b.vx = 0;
      b.vy = 0;
      b.x = damp(b.x, L.x, 14, dt);
      if (this.climbExit !== 0) {
        // 꼭대기로 올라서기
        this.climbExit += dt / 0.34;
        const k = ease.inOutSine(clamp(this.climbExit));
        b.y = lerp(L.bottom - M * RUNG, L.top, k);
        if (this.climbExit >= 1) {
          b.y = L.top;
          this.state = 'normal';
          this.ladder = null;
          this.climbExit = 0;
          b.onGround = true;
          audio.step(this.stepI++, 0.35, true);
        }
        this.animate(g, dt);
        return;
      }
      let left = dt;
      while (left > 0) {
        if (this.climbDir === 0) {
          if (upHeld) {
            if (this.climbM < M) this.climbDir = 1;
            else {
              this.climbExit = 0.0001;
              break;
            }
          } else if (downHeld) {
            if (this.climbM > 0) this.climbDir = -1;
            else {
              b.y = L.bottom;
              this.state = 'normal';
              this.ladder = null;
              break;
            }
          } else break;
        }
        const need = (1 - this.climbE) * CLIMB_STEP;
        if (left >= need) {
          left -= need;
          this.climbM += this.climbDir;
          this.climbE = 0;
          this.climbDir = 0;
          audio.step(this.stepI++, 0.28, true);
          audio.play('click4', { vol: 0.12, rate: 1.5, vary: 0.1 });
          g.noise(b.x, b.y, 260);
        } else {
          this.climbE += left / CLIMB_STEP;
          left = 0;
        }
      }
      if (this.state === 'climb') b.y = L.bottom - (this.climbM + this.climbDir * ease.inOutSine(this.climbE)) * RUNG;
      if (control && ((inp.pressed('jump') && !inp.down('up') && !inp.touchMode) || (inp.touchMode && inp.axisX !== 0))) {
        this.state = 'normal';
        this.ladder = null;
        b.vy = -520;
        b.vx = inp.axisX * 260;
      }
      this.animate(g, dt);
      return;
    }
    if (this.state === 'normal' && control && !this.grabbing) {
      for (const L of g.ladders()) {
        if (Math.abs(b.x - L.x) > 34) continue;
        const onBody = b.y > L.top + 4 && b.y - b.h < L.bottom;
        const atTop = Math.abs(b.y - L.top) < 6 && b.onGround;
        if (((inp.down('up') || (inp.touchMode && inp.down('jump'))) && onBody) || (inp.down('down') && atTop)) {
          this.state = 'climb';
          this.ladder = L;
          this.buffer = 0;
          this.jumping = false;
          const M = Math.floor((L.bottom - L.top) / RUNG);
          this.climbM = atTop && inp.down('down') ? M : clamp(Math.round((L.bottom - b.y) / RUNG), 0, M);
          this.climbE = 0;
          this.climbDir = 0;
          this.climbExit = 0;
          b.y = L.bottom - this.climbM * RUNG;
          audio.play('clunk', { vol: 0.3, rate: 1.4 });
          this.animate(g, dt);
          return;
        }
      }
    }

    if (this.state === 'scripted') {
      ax = 0;
      if (this.scriptTarget !== null) {
        const d = this.scriptTarget - b.x;
        if (Math.abs(d) > 8) ax = Math.sign(d) * Math.min(1, this.scriptSpeed / PH.RUN);
        else this.scriptTarget = null;
      }
    }

    // ---------- 마지막 턱 오르기 ----------
    if (this.state === 'mantle') {
      this.mantleT += dt / 0.36;
      const k = clamp(this.mantleT);
      const up = ease.outCubic(clamp(k / 0.65));
      const over = ease.inOutQuad(clamp((k - 0.45) / 0.55));
      b.x = lerp(this.mantleFrom[0], this.mantleTo[0], over);
      b.y = lerp(this.mantleFrom[1], this.mantleTo[1], up);
      b.vx = b.vy = 0;
      if (k >= 1) {
        this.state = 'normal';
        b.y = this.mantleTo[1];
        b.onGround = true;
        audio.play('land', { vol: 0.35, vary: 0.1 });
      }
      this.animate(g, dt);
      return;
    }

    // ---------- 굳기 ----------
    if (this.state === 'normal' && b.onGround && downHeld && Math.abs(b.vx) < 90 && !this.grabbing) {
      this.freezeHold += dt;
      if (this.freezeHold > 0.06) {
        this.state = 'freeze';
        audio.play('click2', { vol: 0.5, rate: 0.75 });
        audio.play('click4', { vol: 0.35, rate: 0.6, delay: 0.08 });
      }
    } else if (!downHeld) this.freezeHold = 0;
    if (this.state === 'freeze') {
      ax = 0;
      this.freezeAmt = Math.min(1, this.freezeAmt + dt / 0.2);
      if (!downHeld) {
        this.state = 'normal';
        audio.play('click1', { vol: 0.3, rate: 1.1 });
      }
    } else this.freezeAmt = Math.max(0, this.freezeAmt - dt / 0.18);

    // ---------- 꽃잎 건네기 (연출 중 이동 불가) ----------
    if (this.state === 'give') {
      ax = 0;
      this.giveT += dt;
      if (this.giveT > 1.25) this.state = 'normal';
    }

    // ---------- 구르기 (달리면서 ↓) ----------
    if (this.state === 'normal' && b.onGround && control && inp.pressed('down') && Math.abs(b.vx) > 230) {
      this.state = 'slide';
      this.slideT = 0;
      this.rollEnd = ROLL_T;
      this.rollDir = Math.sign(b.vx);
      b.h = PH.SLIDE_H;
      b.vx = Math.sign(b.vx) * Math.max(Math.abs(b.vx), 420);
      audio.play('swish2', { vol: 0.5, rate: 0.85 });
      audio.play('land', { vol: 0.25, rate: 1.3 });
      g.noise(b.x, b.y, 430);
      g.parts.puff(b.x, b.y, 6, 0.8);
    }
    if (this.state === 'slide') {
      this.slideT += dt;
      ax = 0;
      b.vx = Math.sign(b.vx || this.facing) * Math.max(200, Math.abs(b.vx) - 440 * dt);
      // 한 바퀴를 다 돌았을 때만 일어선다 (낮은 곳 아래면 한 바퀴 더)
      if (this.slideT >= this.rollEnd) {
        const canStand = areaFree({ x: b.x - b.w / 2, y: b.y - PH.H, w: b.w, h: PH.H - 2 }, solids);
        if (canStand) {
          this.state = 'normal';
          b.h = PH.H;
          if (b.onGround) audio.play('step2', { vol: 0.35 });
        } else this.rollEnd += ROLL_T;
      }
    }

    // ---------- 수평 이동 ----------
    const boxes = g.boxes();
    // 잡기 (상호작용 키 길게 + 상자에 붙어 있음)
    if (this.state === 'normal' && control && inp.down('interact') && b.onGround && !(g as unknown as { promptActive: boolean }).promptActive) {
      if (!this.grabbing) {
        for (const bx of boxes) {
          const s = bx.solid!;
          const touchR = Math.abs(b.right - s.x) < 4 && this.facing > 0;
          const touchL = Math.abs(b.left - (s.x + s.w)) < 4 && this.facing < 0;
          if ((touchR || touchL) && b.y > s.y && b.y - b.h < s.y + s.h) {
            this.grabbing = bx;
            audio.play('clunk', { vol: 0.3, rate: 1.3 });
            break;
          }
        }
      }
    } else this.grabbing = null;
    if (this.grabbing && !this.grabbing.body.onGround) this.grabbing = null;

    const pushingDir = this.pushing;
    const maxSp = (this.grabbing || pushingDir ? PH.PUSH : PH.RUN) * (sub > 0.25 ? 0.6 : 1);
    if (this.state === 'normal' || this.state === 'scripted' || this.state === 'freeze' || this.state === 'give') {
      const target = ax * maxSp;
      const acc = b.onGround ? (ax !== 0 && Math.sign(ax) === Math.sign(b.vx || ax) ? PH.ACC_G : PH.FRIC) : PH.ACC_A;
      if (b.vx < target) b.vx = Math.min(target, b.vx + acc * dt);
      else if (b.vx > target) b.vx = Math.max(target, b.vx - acc * dt);
      if (ax !== 0 && !this.grabbing) this.facing = Math.sign(ax);
    }
    // 바람: 굳어 있으면 버틴다
    const wind = this.state === 'freeze' ? 0 : g.windAt(b.x, b.y - 70);
    if (wind && this.state !== 'climb') moveBody(b, wind * dt * (b.onGround ? 1 : 0.7), 0, g.solids());

    // ---------- 점프 ----------
    this.coyote = b.onGround ? PH.COYOTE : Math.max(0, this.coyote - dt);
    if (control && inp.pressed('jump') && this.state !== 'scripted') this.buffer = PH.BUFFER;
    else this.buffer = Math.max(0, this.buffer - dt);
    if (this.buffer > 0 && this.coyote > 0 && (this.state === 'normal' || this.state === 'slide')) {
      const canStand = this.state !== 'slide' || areaFree({ x: b.x - b.w / 2, y: b.y - PH.H, w: b.w, h: PH.H - 2 }, solids);
      if (canStand) {
        if (this.state === 'slide') {
          this.state = 'normal';
          b.h = PH.H;
        }
        b.vy = -PH.JUMP * (sub > 0.25 ? 0.7 : 1);
        this.jumping = true;
        this.buffer = 0;
        this.coyote = 0;
        this.grabbing = null;
        audio.play('swish1', { vol: 0.35, vary: 0.1 });
        audio.step(this.stepI++, 0.35);
        g.noise(b.x, b.y, sub > 0.05 ? 420 : 260);
        if (sub > 0.05) audio.play('splash3', { vol: 0.4 });
      }
    } else if (control && inp.pressed('jump') && sub > 0.3 && sub < 0.8 && this.hopT <= 0 && this.state === 'normal') {
      // 물속에서 가볍게 차오르기 (머리가 물 밖에 있을 때만)
      b.vy = -600;
      this.hopT = 0.5;
      this.buffer = 0;
      audio.play('splash3', { vol: 0.45 });
      g.noise(b.x, b.y, 450);
    }
    if (this.jumping && b.vy < 0 && control && !inp.down('jump')) {
      b.vy *= 0.45;
      this.jumping = false;
    }
    if (b.vy >= 0) this.jumping = false;
    if (sub > 0.3) b.vy = Math.min(230, b.vy + PH.GRAV * 0.45 * dt);
    else b.vy = Math.min(PH.MAX_FALL, b.vy + PH.GRAV * dt);

    // ---------- 상자 밀기 ----------
    this.pushing = 0;
    let dx = b.vx * dt;
    if (b.onGround && dx !== 0 && this.state === 'normal') {
      for (const bx of boxes) {
        if (bx === this.grabbing) continue;
        const s = bx.solid!;
        if (b.y <= s.y + 2 || b.y - b.h >= s.y + s.h) continue;
        if (dx > 0 && b.right <= s.x + 0.5 && b.right + dx > s.x) {
          const moved = bx.push(Math.min(dx, PH.PUSH * dt), solids);
          this.pushing = 1;
          dx = Math.min(dx, s.x - b.right + moved + 0.01);
        } else if (dx < 0 && b.left >= s.x + s.w - 0.5 && b.left + dx < s.x + s.w) {
          const moved = bx.push(Math.max(dx, -PH.PUSH * dt), solids);
          this.pushing = -1;
          dx = Math.max(dx, s.x + s.w - b.left + moved - 0.01);
        }
      }
    }
    // 끌기: 플레이어가 상자에서 멀어지는 방향
    const grab = this.grabbing;
    const wasGround = b.onGround;
    const vyBefore = b.vy;
    if (grab && dx !== 0) {
      const s = grab.solid!;
      const boxRight = s.x > b.x;
      const away = (boxRight && dx < 0) || (!boxRight && dx > 0);
      if (away) {
        moveBody(b, dx, 0, g.solids());
        const gap = boxRight ? s.x - b.right : b.left - (s.x + s.w);
        grab.push(boxRight ? -gap : gap, g.solids());
        dx = 0;
      } else {
        const moved = grab.push(dx, solids);
        dx = moved;
        this.pushing = Math.sign(moved);
      }
    }
    moveBody(b, dx, b.vy * dt, g.solids());
    // 낮은 턱(46px 이하)은 걸어서 올라선다
    if (b.onGround && (b.hitR || b.hitL) && ax !== 0 && this.state === 'normal') {
      const dir = b.hitR ? 1 : -1;
      for (const so of g.solids()) {
        if (so.oneway) continue;
        const side = dir > 0 ? so.x : so.x + so.w;
        if (Math.abs((dir > 0 ? b.right : b.left) - side) > 2) continue;
        if (so.y >= b.y || so.y < b.y - 46) continue;
        if (!areaFree({ x: b.x - b.w / 2 + dir * 4, y: so.y - b.h - 1, w: b.w, h: b.h }, g.solids())) continue;
        b.y = so.y;
        b.x += dir * 4;
        break;
      }
    }

    // ---------- 턱 오르기 감지 ----------
    if (!b.onGround && this.state === 'normal' && ax !== 0 && b.vy > -350) {
      const dir = Math.sign(ax);
      const probe = { x: dir > 0 ? b.right : b.left - 6, y: b.top - 30, w: 6, h: b.h * 0.6 };
      for (const s of g.solids()) {
        if (s.oneway || s.owner instanceof Box ? false : false) continue;
        if (s.oneway) continue;
        const sideX = dir > 0 ? s.x : s.x + s.w;
        if (Math.abs((dir > 0 ? b.right : b.left) - sideX) > 3) continue;
        if (s.y < b.top - 22 || s.y > b.top + b.h * 0.5) continue;
        if (probe.y > s.y + s.h) continue;
        const tx = dir > 0 ? s.x + b.w / 2 + 4 : s.x + s.w - b.w / 2 - 4;
        if (!areaFree({ x: tx - b.w / 2, y: s.y - PH.H - 2, w: b.w, h: PH.H }, g.solids())) continue;
        this.state = 'mantle';
        this.mantleT = 0;
        this.mantleFrom = [b.x, b.y];
        this.mantleTo = [tx, s.y];
        this.facing = dir;
        audio.play('swish3', { vol: 0.3 });
        g.noise(b.x, b.y, 260);
        audio.play('click4', { vol: 0.25 });
        break;
      }
    }

    // ---------- 착지 ----------
    if (!wasGround && b.onGround) {
      const fall = b.y - this.fallStartY;
      const v = vyBefore;
      if (v > 400) {
        this.landT = 0;
        this.landImpact = clamp((v - 200) / 1100);
        g.parts.puff(b.x, b.y, Math.round(4 + v / 150), clamp(v / 1000, 0.5, 1.5));
        audio.play(v > 1100 ? 'land_hard' : 'land', { vol: clamp(v / 1200, 0.25, 0.9), vary: 0.08 });
        g.noise(b.x, b.y, 200 + v * 0.35);
        if (v > 1100) g.shake(0.25);
      }
      void fall;
    }
    if (b.onGround || b.vy < 0) this.fallStartY = b.y;
    if (b.onGround) b.vy = 0;
    if (b.hitTop) b.vy = Math.max(b.vy, 60);

    this.animate(g, dt);
  }

  startGive(dir: number) {
    this.state = 'give';
    this.giveT = 0;
    this.giveDir = dir;
    this.facing = dir;
    this.body.vx = 0;
  }

  die(cause: 'erase' | 'fall' | 'crush' | 'drown') {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.deathCause = cause;
    this.deathT = 0;
    this.grabbing = null;
  }

  /** 발밑 땅까지의 거리 (공중에서 착지 준비 자세용) */
  private groundGap(g: GameAPI) {
    const b = this.body;
    let best = 9999;
    for (const so of g.solids()) {
      if (b.x + b.w / 2 <= so.x || b.x - b.w / 2 >= so.x + so.w) continue;
      const d = so.y - b.y;
      if (d >= -2 && d < best) best = d;
    }
    return best;
  }

  private animate(g: GameAPI, dt: number) {
    const b = this.body;
    const P = rigidPose();
    const prev = this.pose;
    const sp = Math.abs(b.vx);
    P.turn = damp(prev.turn, this.facing, 16, dt);
    P.lookX = damp(prev.lookX, this.facing * 0.35, 6, dt);
    // 발걸음
    const ph0 = this.phase;
    if (b.onGround && sp > 10) this.phase += (sp * dt * Math.PI) / (this.pushing || this.grabbing ? 70 : 118);
    if (b.onGround && sp > 40 && Math.floor(ph0 / Math.PI) !== Math.floor(this.phase / Math.PI)) {
      const metal = (b.groundSolid as { look?: string } | null)?.look === 'pipe';
      if (this.submerge > 0.03) audio.play('splash3', { vol: clamp(sp / PH.RUN, 0.15, 0.4), vary: 0.15, rate: 1.2 });
      else audio.step(this.stepI++, clamp(sp / PH.RUN, 0.15, 0.5), metal);
      g.noise(b.x, b.y, this.submerge > 0.03 ? 440 : metal ? 520 : 330);
    }
    this.landT += dt;
    this.idleT = sp < 5 && b.onGround ? this.idleT + dt : 0;
    let key = 'ground';

    if (this.state === 'climb' && this.ladder) {
      key = 'climb';
      this.climbPose(P, dt);
    } else if (this.state === 'mantle') {
      key = 'mantle';
      const k = clamp(this.mantleT);
      P.turn = this.facing;
      const near = this.facing > 0 ? 0 : 1;
      const far = 1 - near;
      P.arms[near].a = lerp(2.6, 0.9, k);
      P.arms[far].a = lerp(2.4, 0.7, k);
      P.arms[near].b = P.arms[far].b = lerp(0.3, 1.2, k);
      P.lean = lerp(0.2, 0.55, k);
      P.legs[near].a = lerp(0.2, 1.4, Math.sin(k * Math.PI));
      P.legs[near].b = lerp(0.3, 1.9, Math.sin(k * Math.PI));
      P.legs[far].a = lerp(-0.2, 0.6, k);
      P.legs[far].b = 0.6;
      P.crouch = 0.04 * Math.sin(k * Math.PI);
    } else if (this.state === 'slide') {
      key = 'slide';
      // 몸을 공처럼 만다
      // 다리 각도는 수직 기준이라, 몸통 기울기만큼 빼서 무릎을 가슴 쪽으로 당긴다
      P.turn = this.rollDir;
      P.crouch = 0.25;
      P.lean = 1.2;
      P.legs[0].a = P.legs[1].a = Math.PI - 1.2 - 0.3;
      P.legs[0].b = P.legs[1].b = 2.8;
      P.arms[0].a = P.arms[1].a = 1.2;
      P.arms[0].b = P.arms[1].b = 0.9;
      P.headTilt = 0.7;
    } else if (!b.onGround) {
      key = 'air';
      P.turn = this.facing;
      const near = this.facing > 0 ? 0 : 1;
      const far = 1 - near;
      const up = clamp(-b.vy / PH.JUMP);
      const down = clamp(b.vy / 900);
      P.legs[near].a = lerp(0.35, 0.75, up);
      P.legs[near].b = lerp(0.6, 1.4, up);
      P.legs[far].a = lerp(-0.25, -0.05, up);
      P.legs[far].b = lerp(0.5, 0.9, up);
      P.arms[near].a = lerp(lerp(0.6, 1.4, down), -0.6, up);
      P.arms[far].a = lerp(lerp(-0.4, 1.0, down), 1.2, up);
      P.arms[near].b = P.arms[far].b = 0.5;
      P.lean = 0.12;
      P.lookY = lerp(-0.2, 0.5, down);
      // 땅이 가까워지면 다리를 뻗어 받을 준비를 한다
      if (b.vy > 0) {
        const prep = ease.inOutSine(clamp(1 - this.groundGap(g) / 170));
        P.legs[near].a = lerp(P.legs[near].a, 0.32, prep);
        P.legs[near].b = lerp(P.legs[near].b, 0.32, prep);
        P.legs[far].a = lerp(P.legs[far].a, -0.12, prep);
        P.legs[far].b = lerp(P.legs[far].b, 0.22, prep);
        P.arms[near].a = lerp(P.arms[near].a, 0.75, prep);
        P.arms[far].a = lerp(P.arms[far].a, 0.55, prep);
        P.lean = lerp(P.lean, 0.06, prep);
      }
    } else if (sp > 8) {
      const sn = clamp(sp / PH.RUN);
      applyRunCycle(P, this.phase, sn, this.facing);
      if (this.pushing || this.grabbing) {
        const near = this.facing > 0 ? 0 : 1;
        const pull = this.grabbing && Math.sign(b.vx) !== this.facing;
        P.lean = pull ? -0.3 : 0.38;
        P.arms[near].a = P.arms[1 - near].a = pull ? 1.2 : 1.35;
        P.arms[near].b = P.arms[1 - near].b = 0.35;
        P.crouch = 0.05;
      }
    } else {
      applyIdle(P, g.t, this.facing, 1);
      if (this.grabbing) {
        const near = this.facing > 0 ? 0 : 1;
        P.arms[near].a = P.arms[1 - near].a = 1.35;
        P.arms[near].b = P.arms[1 - near].b = 0.35;
        P.lean = 0.2;
      }
      // 오래 서 있으면 두리번
      if (this.idleT > 4) P.lookX = noise1(this.idleT * 0.5) * 0.9;
    }
    // 착지: 무릎이 굽었다가 천천히 펴진다 (발은 땅에 붙어 있다)
    if (key === 'ground' && this.landImpact > 0 && this.landT < 1) {
      const t = this.landT;
      const absorb = this.landImpact * (1 - Math.exp(-30 * t)) * Math.exp(-7 * t) * 2.3;
      if (absorb > 0.002) {
        P.crouch += 0.105 * absorb;
        if (sp > 8) {
          P.legs[0].b += 0.45 * absorb;
          P.legs[1].b += 0.45 * absorb;
        } else plantLegs(P, 0.015 + 0.035 * absorb);
        const near = this.facing > 0 ? 0 : 1;
        P.arms[near].a += 0.22 * absorb;
        P.arms[1 - near].a += 0.12 * absorb;
        P.arms[0].b += 0.35 * absorb;
        P.arms[1].b += 0.35 * absorb;
        P.lean += 0.14 * absorb;
        P.headTilt += 0.08 * absorb;
      }
    }
    // 건네기: 팔을 내민다
    if (this.state === 'give') {
      const k = ease.outCubic(clamp(this.giveT / 0.35)) * (1 - ease.inOutQuad(clamp((this.giveT - 0.9) / 0.35)));
      const near = this.facing > 0 ? 0 : 1;
      P.arms[near].a = lerp(P.arms[near].a, 1.4, k);
      P.arms[near].b = lerp(P.arms[near].b, 0.15, k);
      P.lean = lerp(P.lean, 0.1, k);
      P.lookX = this.facing * 0.6;
    }
    // 굳기: 정면을 향해 픽토그램처럼 굳는다
    if (this.freezeAmt > 0) {
      const R = rigidPose();
      R.eyeShow = 1;
      R.eye = 0;
      const k = ease.inOutCubic(this.freezeAmt);
      lerpPose(P, R, k, P);
      P.turn = lerp(P.turn, 0, k);
      P.eye = 1 - k;
      if (this.freezeAmt < 1 && this.freezeAmt > 0.2) P.headX += Math.sin(g.t * 80) * 0.004;
    }
    // 구르기 회전: 한 바퀴 안에서 천천히 시작해 천천히 멈춘다
    if (this.state === 'slide') {
      const turns = this.slideT / ROLL_T;
      const n = Math.floor(turns);
      this.rollAngle = this.rollDir * Math.PI * 2 * (n + ease.inOutSine(turns - n));
      this.rollK = damp(this.rollK, 1, 30, dt);
    } else {
      const TW = Math.PI * 2;
      this.rollAngle -= Math.round(this.rollAngle / TW) * TW;
      this.rollAngle = damp(this.rollAngle, 0, 16, dt);
      this.rollK = damp(this.rollK, 0, 16, dt);
    }
    // 상태가 바뀌면 이전 자세에서 이어진다
    if (key !== this.poseKey) {
      const durs: Record<string, number> = { ground: this.poseKey === 'climb' ? 0.22 : this.poseKey === 'slide' ? 0.14 : 0.09, air: this.poseKey === 'slide' ? 0.12 : 0.08, climb: 0.2, mantle: 0.07, slide: 0.08 };
      this.blendFrom = clonePose(prev);
      this.blendT = 0;
      this.blendDur = durs[key] ?? 0.1;
      this.poseKey = key;
    }
    if (this.blendFrom && this.blendT < this.blendDur) {
      this.blendT += dt;
      const k = ease.outCubic(clamp(this.blendT / this.blendDur));
      const turn = P.turn;
      lerpPose(this.blendFrom, P, k, P);
      if (key !== 'climb' && this.poseKey !== 'climb') P.turn = turn;
    }
    this.pose = P;
  }

  /** 사다리 위 자세: 손은 가로대를 잡고, 발은 가로대를 딛는다 */
  private climbPose(P: Pose, dt: number) {
    const L = this.ladder!;
    const b = this.body;
    const S = PH.SCALE;
    P.turn = damp(this.pose.turn, 0, 14, dt);
    P.crouch = 0.03;
    const m = this.climbM;
    const dir = this.climbDir;
    const e = dir !== 0 ? this.climbE : this.climbExit > 0 ? 0 : 0;
    const le = ease.inOutSine(clamp(e * 1.3));
    const hh = (((m % 2) + 2) % 2 === 0 ? 0 : 1) as 0 | 1; // 높은 손 쪽
    const lo = (1 - hh) as 0 | 1;
    const rungY = (k: number) => L.bottom - k * RUNG;
    // 손 (가로대 중심), 발 (가로대 윗면)
    const handPos: [number, number][] = [
      [0, 0],
      [0, 0],
    ];
    const footPos: [number, number][] = [
      [0, 0],
      [0, 0],
    ];
    const sideX = (i: number, w: number) => L.x + (i === 0 ? -w : w);
    // 기본 위치
    handPos[hh] = [sideX(hh, 15), rungY(m + 5)];
    handPos[lo] = [sideX(lo, 15), rungY(m + 4)];
    footPos[lo] = [sideX(lo, 11), rungY(m)];
    footPos[hh] = [sideX(hh, 11), rungY(m + 1)];
    const arc = Math.sin(Math.PI * le);
    if (dir > 0) {
      // 낮은 손 → 두 칸 위, 낮은 발 → 두 칸 위
      handPos[lo] = [sideX(lo, 15 + 9 * arc), lerp(rungY(m + 4), rungY(m + 6), le) - 6 * arc];
      footPos[hh] = [sideX(hh, 11 + 7 * arc), lerp(rungY(m), rungY(m + 2), le) - 10 * arc];
    } else if (dir < 0) {
      // 높은 손 → 두 칸 아래, 높은 발 → 두 칸 아래
      handPos[hh] = [sideX(hh, 15 + 9 * arc), lerp(rungY(m + 5), rungY(m + 3), le) - 6 * arc];
      footPos[lo] = [sideX(lo, 11 + 7 * arc), lerp(rungY(m + 1), rungY(Math.max(0, m - 1)), le) - 10 * arc];
    }
    // 꼭대기: 손은 바닥 모서리를 짚고 몸을 밀어 올린다, 발은 따라 올라온다
    const exitK = this.climbExit > 0 ? ease.inOutSine(clamp(this.climbExit)) : 0;
    for (const i of [0, 1] as const) {
      let [hx, hy] = handPos[i];
      if (hy < L.top - 4) {
        hy = L.top - 2;
        hx = sideX(i, 24);
      }
      reachIK(P, 'arm', i, (hx - b.x) / S, (hy - 4 - b.y) / S);
      let [fx, fy] = footPos[i];
      if (exitK > 0) {
        fy = lerp(fy, b.y, ease.inQuad(exitK));
        fx = lerp(fx, sideX(i, 9), exitK);
      }
      reachIK(P, 'leg', i, (fx - b.x) / S, (Math.min(L.bottom, fy) - 7.9 - b.y) / S);
    }
    if (exitK > 0) P.lean = 0;
    P.headY = -0.006 + Math.sin(Math.PI * le) * 0.004;
  }

  draw(ctx: CanvasRenderingContext2D, g: GameAPI, petals: string[]) {
    // 깔려서 터졌다: 몸은 조각(파티클)으로만 남는다
    if (this.state === 'dead' && this.deathCause === 'crush') return;
    const b = this.body;
    const st = defaultStyle();
    if (this.state === 'dead') {
      const k = clamp(this.deathT / 0.6);
      if (this.deathCause === 'erase') {
        st.color = lerpColor('#0e0e0e', '#f6f5f1', k);
        st.farColor = st.color;
        st.alpha = 1 - clamp((this.deathT - 0.5) / 0.6);
      }
    }
    const hide = this.freezeAmt > 0.5 || this.hideFlower;
    const fsize = 22;
    // 구르기: 웅크린 몸의 중심을 축으로 회전
    const rk = this.rollK,
      ra = this.rollAngle;
    const rolling = rk > 0.01 || Math.abs(ra) > 0.01;
    let fx = b.x,
      fy = b.y;
    if (rolling) {
      const cx = b.x,
        cy = b.y - ROLL_CY;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ra);
      ctx.translate(-cx, -cy);
      fx = b.x - this.rollDir * ROLL_DX * rk;
      fy = b.y + ROLL_DY * rk;
    }
    this.joints = drawFigure(ctx, this.pose, fx, fy, PH.SCALE * (1 - (1 - ROLL_SCALE) * rk), st, {
      heldBehind: hide,
      held:
        petals.length > 0 && !(this.state === 'dead' && this.deathCause === 'erase')
          ? (fc, hx, hy, ang) => {
              const sway = Math.sin(g.t * 2.1) * 0.08 - b.vx * 0.0006;
              const a = clamp(-ang * 0.25 * this.facing, -0.6, 0.6) * this.facing * 0;
              drawFlower(fc, hx, hy + 4, fsize, petals, { sway, angle: a, stem: 1.25, alpha: hide ? 0.0 : 1 });
            }
          : undefined,
    });
    if (rolling) ctx.restore();
  }

  /** 꽃 빛 (인물 레이어 아래에 깔린다) */
  drawGlow(ctx: CanvasRenderingContext2D, petals: string[]) {
    if (!this.joints || this.freezeAmt > 0.5 || petals.length === 0) return;
    if (this.state === 'dead' && (this.deathCause === 'erase' || this.deathCause === 'crush')) return;
    const [hx, hy] = this.joints.hand[this.joints.near];
    drawGlow(ctx, hx, hy - 26, 120 + petals.length * 10, petals, 0.7);
  }
}

function lerpColor(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16),
    pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
  const gg = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
  const bb = Math.round(lerp(pa & 255, pb & 255, t));
  return `rgb(${r},${gg},${bb})`;
}

export type { Solid };
