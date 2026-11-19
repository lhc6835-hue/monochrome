import { Body, moveBody, areaFree, type Solid } from './physics';
import type { GameAPI, PlayerLike } from './types';
import type { Input } from '../core/input';
import { Box } from './entities';
import { ROLL_CONTACTS, ROLL_T, sampleRoll, RollPath } from './roll';
import { audio } from '../core/audio';
import { clamp, damp, ease, lerp, noise1 } from '../core/math';
import { applyIdle, applyRunCycle, clonePose, drawFigure, lerpPose, plantLegs, reachIK, sideIK, rigidPose, defaultStyle, type Pose, type Joints } from '../gfx/figure';
import { drawFlower, drawGlow, PETAL_COLORS } from '../gfx/flower';
import { drawBlankFigure } from '../gfx/blank';

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
/** 꼭대기를 넘어가는 시간, 사다리 위에서 몸이 사다리 뒤로 물러난 거리 */
const CLIMB_EXIT_T = 0.62;
const CLIMB_BACK = 30;
/** 구르기: 발이 엉덩이 밑에 닿는 순간 (여기서 일어설 수 없으면 다시 한 바퀴) */
const ROLL_REPEAT_AT = 0.7;
const ROLL_REPEAT_TO = 0.12;
/** 웅크린 몸 중심 (발 기준) */

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
  /** 구르기 진행 (0..1), 몇 바퀴째인지 */
  private rollT = 0;
  private rollLaps = 0;
  private rollSpeed = 0;
  private rollAir = 0;
  private rollPath: RollPath | null = null;
  /** 다시 구른 바퀴 수만큼 쌓인 거리 (+ 벽에 막혀 못 간 만큼 뺀다) */
  private rollBase = 0;
  /** 루트 모션이 정한 몸의 위치(구르기 시작점 기준)와, 그려지는 몸이 실제 충돌 몸에서 벗어난 양 */
  private rollRootX = 0;
  private rollStartX = 0;
  /** 그릴 때만 쓰는 가로 어긋남: 충돌 몸은 부드럽게 움직이고, 손발이 땅에 박히는 건 그림이 맡는다 */
  visX = 0;
  private rollPose: Pose = rigidPose();
  private rollDir = 1;
  rollAngle = 0;
  rollK = 0;
  private rollU = 0;
  /** 사다리: 가로대 단위 이동 */
  private climbM = 0;
  private climbE = 0;
  private climbDir = 0;
  private climbExit = 0;
  /** 꼭대기 동작 방향 (1 = 올라서기, -1 = 내려서기) */
  private climbExitDir = 1;
  /** 사다리 위에서 바라보는 쪽, 올라설 쪽 */
  private climbFace = 1;
  private climbSide = 1;
  private climbFrom: [number, number] = [0, 0];
  private climbTo: [number, number] = [0, 0];
  private climbEdge = 0;
  private lastSolids: Solid[] = [];
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
  deathCause: 'erase' | 'fall' | 'crush' | 'drown' | 'grab' = 'erase';
  joints: Joints | null = null;
  hideFlower = false;
  /** 물에 잠긴 정도 0..1 */
  submerge = 0;
  /** 물 위에 떠서 헤엄치는 중 */
  swimming = false;
  /** 연출: 픽토그램으로 굳어 있게 한다 */
  forceFreeze = false;
  /** 꽃을 가슴 앞에 받쳐 든 정도 (0..1) */
  private holdK = 0;
  /** 연출: 몸이 하얗게 비어 연필 윤곽만 남는다 (0..1) */
  hollow = 0;
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
      // 여백에게 붙잡힘: 위치는 장면이 손에 맞춰 옮기고, 몸은 버둥거린다
      if (this.deathCause === 'grab') this.struggle(dt);
      return;
    }
    let ax = control ? inp.axisX : 0;
    const downHeld = control && inp.down('down');
    const solids = g.solids();
    this.lastSolids = solids;
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

    // ---------- 사다리: 옆모습으로 가로대를 하나씩 잡고 오른다 ----------
    if (this.state === 'climb' && this.ladder) {
      const L = this.ladder;
      const upHeld = control && (inp.down('up') || (inp.touchMode && inp.down('jump')));
      const downHeld = control && inp.down('down');
      const side = control ? Math.sign(inp.axisX) : 0;
      const M = Math.floor((L.bottom - L.top) / RUNG);
      b.vx = 0;
      b.vy = 0;
      // 꼭대기 넘어가기 / 꼭대기에서 내려오기 (정해진 동작)
      if (this.climbExit !== 0) {
        this.climbExit += dt / CLIMB_EXIT_T;
        const k = clamp(this.climbExit);
        const u = this.climbExitDir > 0 ? k : 1 - k;
        const [x0, y0] = this.climbFrom,
          [x1, y1] = this.climbTo;
        b.x = lerp(x0, x1, ease.inOutSine(clamp((u - 0.12) / 0.8)));
        b.y = lerp(y0, y1, ease.inOutSine(clamp(u / 0.72)));
        if (k >= 1) {
          this.climbExit = 0;
          if (this.climbExitDir > 0) {
            b.x = x1;
            b.y = y1;
            this.state = 'normal';
            this.ladder = null;
            this.facing = this.climbSide;
            b.onGround = true;
            audio.step(this.stepI++, 0.35, true);
          } else {
            b.x = x0;
            b.y = y0;
            this.climbM = this.climbTopM(L);
          }
        }
        this.animate(g, dt);
        return;
      }
      b.x = damp(b.x, L.x - this.climbFace * CLIMB_BACK, 16, dt);
      const topM = this.climbTopM(L);
      let left = dt;
      while (left > 0) {
        if (this.climbDir === 0) {
          // 꼭대기: 위나 옆으로 누르면 올라설 곳으로 넘어간다
          if (this.climbM >= topM && (upHeld || side !== 0)) {
            const ex = this.ladderExit(L, side, solids);
            if (ex) {
              this.beginLadderExit(L, ex[0], ex[1], 1);
              break;
            }
          }
          if (upHeld) {
            if (this.climbM < M) this.climbDir = 1;
            else break;
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
      if (this.state === 'climb' && this.climbExit === 0) b.y = L.bottom - (this.climbM + this.climbDir * ease.inOutSine(this.climbE)) * RUNG;
      // 점프: 사다리를 박차고 뛰어내린다 (터치: 꼭대기가 아닌 곳에서 옆으로 밀면)
      if (this.state === 'climb' && this.climbExit === 0 && control && ((inp.pressed('jump') && !inp.down('up') && !inp.touchMode) || (inp.touchMode && side !== 0 && this.climbM < topM))) {
        this.state = 'normal';
        this.ladder = null;
        const d = side || -this.climbFace;
        this.facing = d;
        b.vy = -480;
        b.vx = d * 260;
      }
      this.animate(g, dt);
      return;
    }
    if (this.state === 'normal' && control && !this.grabbing) {
      for (const L of g.ladders()) {
        const dx = b.x - L.x;
        const atTop = Math.abs(b.y - L.top) < 6 && b.onGround;
        // 꼭대기에서 ↓: 몸을 돌려 사다리로 내려선다
        if (atTop && inp.down('down') && Math.abs(dx) < 90) {
          const s = Math.abs(dx) > 8 ? Math.sign(dx) : this.facing;
          this.state = 'climb';
          this.ladder = L;
          this.buffer = 0;
          this.jumping = false;
          this.climbDir = 0;
          this.climbE = 0;
          this.climbFace = s;
          this.climbM = this.climbTopM(L);
          this.beginLadderExit(L, b.x, b.y, -1);
          audio.play('clunk', { vol: 0.3, rate: 1.4 });
          this.animate(g, dt);
          return;
        }
        if (Math.abs(dx) > 40) continue;
        const onBody = b.y > L.top + 4 && b.y - b.h < L.bottom;
        if ((inp.down('up') || (inp.touchMode && inp.down('jump'))) && onBody) {
          this.state = 'climb';
          this.ladder = L;
          this.buffer = 0;
          this.jumping = false;
          const M = Math.floor((L.bottom - L.top) / RUNG);
          this.climbM = clamp(Math.round((L.bottom - b.y) / RUNG), 0, Math.min(M, this.climbTopM(L)));
          this.climbE = 0;
          this.climbDir = 0;
          this.climbExit = 0;
          // 꼭대기에서 올라설 곳이 한쪽뿐이면 그쪽을 보고 오른다
          const l = !!this.ladderExit(L, -1, solids, true),
            r = !!this.ladderExit(L, 1, solids, true);
          this.climbFace = l && !r ? -1 : r && !l ? 1 : this.facing;
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
    if (this.forceFreeze && (this.state === 'normal' || this.state === 'scripted')) this.state = 'freeze';
    if (this.state === 'freeze') {
      ax = 0;
      this.freezeAmt = Math.min(1, this.freezeAmt + dt / (this.forceFreeze ? 2.4 : 0.2));
      if (!downHeld && !this.forceFreeze) {
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
    if (this.state === 'normal' && b.onGround && control && inp.pressed('down') && ax !== 0 && Math.abs(b.vx) > 230) {
      this.state = 'slide';
      this.slideT = 0;
      this.rollT = 0;
      this.rollLaps = 0;
      this.rollAir = 0;
      this.rollPath = new RollPath(measureCtx(), Math.min(Math.max(Math.abs(b.vx), 300), PH.RUN), PH.SCALE);
      this.rollBase = 0;
      this.rollDir = Math.sign(b.vx);
      this.rollSpeed = Math.max(Math.abs(b.vx), 300);
      this.rollStartX = b.x + this.visX;
      this.rollRootX = 0;
      b.h = PH.SLIDE_H;
      audio.play('swish2', { vol: 0.5, rate: 0.85 });
      audio.play('land', { vol: 0.25, rate: 1.3 });
      g.noise(b.x, b.y, 430);
      g.parts.puff(b.x, b.y, 6, 0.8);
    }
    if (this.state === 'slide') {
      this.slideT += dt;
      ax = 0;
      const canStand = () => areaFree({ x: b.x - b.w / 2, y: b.y - PH.H, w: b.w, h: PH.H - 2 }, solids);
      const u0 = this.rollT;
      this.rollT += dt / ROLL_T;
      // 발이 엉덩이 밑에 닿았는데 머리 위가 막혀 있으면, 일어서지 않고 그대로 한 바퀴 더 (웅크린 자세로 이어진다)
      if ((u0 < ROLL_REPEAT_AT && this.rollT >= ROLL_REPEAT_AT && !canStand()) || (this.rollT >= 1 && !canStand())) {
        const path = this.rollPath!;
        this.rollBase += path.at(Math.min(this.rollT, 1)) - path.at(ROLL_REPEAT_TO);
        this.rollT = ROLL_REPEAT_TO + (this.rollT - Math.min(this.rollT, ROLL_REPEAT_AT));
        this.rollLaps++;
        this.rollU = this.rollT;
        this.blendFrom = clonePose(this.pose);
        this.blendT = 0;
        this.blendDur = 0.1;
      }
      // 구르다 턱에서 떨어지면 몸을 펴고 떨어진다
      this.rollAir = b.onGround ? 0 : this.rollAir + dt;
      const fellOff = this.rollAir > 0.12 && this.rollT > 0.1 && this.rollT < 0.62 && canStand();
      if ((this.rollT >= 1 || fellOff) && canStand()) {
        this.state = 'normal';
        b.h = PH.H;
        b.vx = this.rollDir * Math.max(PH.RUN * 0.92, Math.min(this.rollSpeed, PH.RUN));
        if (b.onGround) audio.play('step2', { vol: 0.35 });
      } else {
        // 루트 모션: 짚은 손·디딘 발은 미끄러지지 않고, 등은 굴러간 만큼만 나아간다
        // 미리 구해 둔 부드러운 길을 따라간다. 벽에 막혀 몸이 못 가면 길도 그만큼 멈춘다
        const prevRoot = this.rollRootX;
        this.rollRootX = this.rollDir * (this.rollBase + this.rollPath!.at(Math.min(this.rollT, 1)));
        const bodyOff = b.x - this.rollStartX;
        const lim = clamp(this.rollRootX, bodyOff - 24, bodyOff + 24);
        this.rollBase += (lim - this.rollRootX) * this.rollDir;
        this.rollRootX = lim;
        const off = this.rollStartX + this.rollRootX - b.x;
        b.vx = clamp((this.rollRootX - prevRoot) / dt + off * 8, -900, 900);
        this.visX = off;
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
      const canStand = this.state !== 'slide' || (this.rollT >= 0.64 && areaFree({ x: b.x - b.w / 2, y: b.y - PH.H, w: b.w, h: PH.H - 2 }, solids));
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
    } else if (control && inp.pressed('jump') && sub > 0.3 && sub < (this.swimming ? 0.97 : 0.8) && this.hopT <= 0 && this.state === 'normal') {
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
    // 헤엄칠 수 있는 물(잔잔한 바다·동굴): 머리가 물 위로 나오도록 떠오른다
    this.swimming = !!(water && (water as { def?: { swim?: boolean } }).def?.swim) && sub > 0.62 && !b.onGround;
    if (water && (water as { def?: { swim?: boolean } }).def?.swim && sub > 0.8) {
      b.vy -= (sub - 0.8) * 15000 * dt;
      b.vy *= Math.max(0, 1 - 4 * dt);
    }

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

  die(cause: 'erase' | 'fall' | 'crush' | 'drown' | 'grab') {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.deathCause = cause;
    this.deathT = 0;
    this.grabbing = null;
  }

  /** 붙잡혀 들려 올라가며 버둥거리는 자세 (뒤에서 잡혔으니 몸은 앞을, 팔은 뒤의 손을 향한다) */
  private struggle(dt: number) {
    const t = this.deathT;
    const P = rigidPose();
    const f = this.facing;
    const nI = f > 0 ? 0 : 1;
    const fI = 1 - nI;
    P.turn = f;
    const lift = clamp((t - 0.18) / 0.4);
    // 잡히는 순간 움찔 → 들리며 다리를 허우적, 팔은 등 뒤의 손을 밀어낸다
    const kick = Math.sin(t * 15) * lerp(0.15, 0.75, lift) * (1 - clamp((t - 0.9) / 0.4));
    P.lean = lerp(0.25, -0.25, lift) + Math.sin(t * 9) * 0.06 * lift;
    P.headTilt = lerp(0.2, -0.5, lift);
    P.crouch = 0.02;
    P.legs[nI].a = 0.35 + kick;
    P.legs[nI].b = 0.7 + Math.max(0, kick) * 0.9;
    P.legs[fI].a = -0.1 - kick * 0.8;
    P.legs[fI].b = 0.9 + Math.max(0, -kick) * 0.9;
    const wave = Math.sin(t * 12 + 1) * 0.35 * lift;
    P.arms[nI].a = lerp(0.6, -1.7, lift) + wave;
    P.arms[nI].b = lerp(0.3, 0.9, lift);
    P.arms[fI].a = lerp(0.9, -1.2, lift) - wave;
    P.arms[fI].b = lerp(0.3, 1.2, lift);
    lerpPose(this.pose, P, 1 - Math.exp(-20 * dt), this.pose);
    this.pose.turn = f;
    this.rollK = damp(this.rollK, 0, 16, dt);
    this.rollAngle = damp(this.rollAngle, 0, 16, dt);
    this.visX = damp(this.visX, 0, 12, dt);
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
      // 실제 앞구르기 키프레임 (손 짚기 → 어깨 → 등 → 엉덩이 → 발)
      const u = Math.min(this.rollT, 1);
      this.visX = this.rollStartX + this.rollRootX - this.body.x;
      const rot = sampleRoll(P, u, this.rollDir);
      this.rollAngle = this.rollDir * (rot + this.rollLaps * Math.PI * 2);
      for (const c of ROLL_CONTACTS) {
        const u0 = this.rollU;
        if (u0 < c && u >= c) {
          if (c === ROLL_CONTACTS[0]) audio.play('land', { vol: 0.22, rate: 1.5 });
          else if (c === ROLL_CONTACTS[1]) audio.play('thud', { vol: 0.28, rate: 1.3 });
          else audio.step(this.stepI++, 0.35);
        }
      }
      this.rollU = u;
    } else if (this.swimming) {
      // 헤엄: 팔을 번갈아 저으며 다리로 찬다
      key = 'swim';
      const sw = g.t * 5.5;
      P.turn = this.facing;
      const nI = this.facing > 0 ? 0 : 1;
      const fI = 1 - nI;
      P.lean = 0.55;
      P.headTilt = -0.45;
      P.arms[nI].a = 1.7 + Math.sin(sw) * 1.1;
      P.arms[nI].b = 0.5 + Math.max(0, Math.cos(sw)) * 0.8;
      P.arms[fI].a = 1.7 - Math.sin(sw) * 1.1;
      P.arms[fI].b = 0.5 + Math.max(0, -Math.cos(sw)) * 0.8;
      P.legs[nI].a = -0.25 + Math.sin(sw * 1.6) * 0.3;
      P.legs[fI].a = -0.25 - Math.sin(sw * 1.6) * 0.3;
      P.legs[nI].b = P.legs[fI].b = 0.35;
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
    // 구르기를 마치면 남은 회전은 가장 가까운 한 바퀴로 부드럽게 정리
    if (this.state === 'slide') this.rollK = 1;
    else {
      const TW = Math.PI * 2;
      this.rollAngle -= Math.round(this.rollAngle / TW) * TW;
      this.rollAngle = damp(this.rollAngle, 0, 16, dt);
      this.rollK = damp(this.rollK, 0, 16, dt);
      this.visX = damp(this.visX, 0, 9, dt);
      this.rollU = 0;
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
    // 꽃을 든 손: 팔꿈치를 굽혀 꽃을 가슴 앞에 조심스럽게 받쳐 든다. 달릴 때도 크게 흔들지 않는다.
    // (구르기·사다리·턱 오르기·상자·꽃잎 건네기·헤엄·굳기 중에는 손을 풀었다가, 끝나면 다시 든다)
    const holdOk =
      g.petals.length > 0 && !this.hideFlower && (this.state === 'normal' || this.state === 'scripted') && !this.swimming && !this.grabbing && !this.pushing && key !== 'climb' && key !== 'mantle' && key !== 'slide';
    this.holdK = damp(this.holdK, holdOk ? 1 : 0, 9, dt);
    if (this.holdK > 0.01) {
      const h = this.facing > 0 ? 0 : 1;
      const tt = clamp(Math.abs(P.turn));
      const run = clamp(sp / PH.RUN);
      // 걸음마다 아주 조금 오르내린다
      const bob = Math.sin(this.phase * 2) * 0.07 * run;
      // 정면: 가슴 가운데로 / 옆모습: 가슴 앞으로 (공중에서는 몸 쪽으로 조금 더 당긴다)
      const ha = lerp(-0.35, 0.32 + bob - (b.onGround ? 0 : 0.12), tt);
      const hb = lerp(-2.25, 1.72 - bob * 0.6, tt);
      P.arms[h].a = lerp(P.arms[h].a, ha, this.holdK);
      P.arms[h].b = lerp(P.arms[h].b, hb, this.holdK);
    }
    this.pose = P;
  }

  /** 꼭대기 동작을 시작하는 칸: 허리가 꼭대기 높이에 닿는 곳 */
  private climbTopM(L: LadderLike) {
    const M = Math.floor((L.bottom - L.top) / RUNG);
    return Math.max(0, Math.min(M, Math.round((L.bottom - L.top - 62) / RUNG)));
  }
  /**
   * 꼭대기에서 올라설 자리. want(누른 방향) → 바라보는 쪽 → 반대쪽 순서로 찾는다.
   * 사다리 옆 턱(열차 지붕)이든, 사다리가 뚫고 올라온 바닥이든 같은 방식.
   */
  private ladderExit(L: LadderLike, want: number, solids: Solid[], only = false): [number, number] | null {
    const b = this.body;
    const find = (s: number) => {
      for (const d of [26, 38, 52, 66, 82, 96]) {
        const x = L.x + s * d;
        // 발 디딜 곳이 몸 폭만큼은 있어야 한다 (모서리에 아슬아슬하게 서지 않게)
        const o = solids.find((o) => Math.abs(o.y - L.top) <= 3 && o.x <= x - 14 && o.x + o.w >= x + 14);
        if (!o) continue;
        if (!areaFree({ x: x - b.w / 2, y: L.top - PH.H - 1, w: b.w, h: PH.H - 2 }, solids)) continue;
        return { s, d, x, edge: clamp(s > 0 ? o.x : o.x + o.w, Math.min(L.x, x), Math.max(L.x, x)) };
      }
      return null;
    };
    let best: { s: number; d: number; x: number; edge: number } | null = null;
    if (only || want !== 0) best = find(want);
    else {
      // 누른 방향이 없으면 가까운 쪽 (같으면 바라보는 쪽)
      const a = find(this.climbFace),
        c = find(-this.climbFace);
      best = a && c ? (a.d <= c.d + 14 ? a : c) : a || c;
    }
    if (!best) return null;
    this.climbSide = best.s;
    this.climbEdge = best.edge;
    return [best.x, L.top];
  }
  /** 꼭대기 넘어가기(dir 1) 또는 꼭대기에서 사다리로 내려서기(dir -1) */
  private beginLadderExit(L: LadderLike, fx: number, fy: number, dir: 1 | -1) {
    const tm = this.climbTopM(L);
    const b = this.body;
    this.climbFrom = dir > 0 ? [b.x, b.y] : [L.x - this.climbFace * CLIMB_BACK, L.bottom - tm * RUNG];
    this.climbTo = [fx, fy];
    if (dir < 0) {
      this.climbSide = Math.sign(fx - L.x) || this.climbFace;
      this.ladderExit(L, this.climbSide, this.lastSolids, true);
    }
    this.climbExitDir = dir;
    this.climbExit = 0.0001;
    this.climbDir = 0;
    this.climbE = 0;
    audio.play('swish3', { vol: 0.22, rate: 1.1 });
  }

  /** 사다리 위 자세: 옆모습으로 손은 가로대를 번갈아 잡고, 발은 가로대를 딛는다 */
  private climbPose(P: Pose, _dt: number) {
    const L = this.ladder!;
    const b = this.body;
    const S = PH.SCALE;
    const f = this.climbFace;
    const rungY = (k: number) => L.bottom - k * RUNG;
    const railTop = L.top - 26;
    // 월드 좌표 목표 → 로컬 IK
    const arm = (i: 0 | 1, x: number, y: number) => sideIK(P, 'arm', i, (x - b.x) / S, (y - b.y) / S);
    const leg = (i: 0 | 1, x: number, y: number) => sideIK(P, 'leg', i, (x - b.x) / S, (y - 7.9 - b.y) / S);
    const near = (f > 0 ? 0 : 1) as 0 | 1;
    const far = (1 - near) as 0 | 1;

    if (this.climbExit !== 0) {
      // ----- 꼭대기 넘어가기: 바닥을 짚고 → 몸을 끌어올리고 → 앞발을 올려 딛고 → 일어선다 -----
      const k = clamp(this.climbExit);
      const u = this.climbExitDir > 0 ? k : 1 - k;
      const s = this.climbSide;
      // 몸은 처음엔 사다리 쪽을 보다가, 올라설 쪽으로 돈다
      const tw = ease.inOutSine(clamp((u - 0.05) / 0.3));
      P.turn = f === s ? s : lerp(f, s, tw) >= 0 ? 1 : -1;
      const sf = P.turn >= 0 ? 1 : -1;
      const nI = (sf > 0 ? 0 : 1) as 0 | 1;
      const fI = (1 - nI) as 0 | 1;
      const push = Math.sin(Math.PI * clamp(u / 0.85));
      P.lean = 0.42 * push;
      P.crouch = 0.05 * push;
      P.headTilt = -0.15 * push;
      const [x0, y0] = this.climbFrom;
      const edge = this.climbEdge;
      // 손: 바닥 모서리를 짚고 밀다가 (u < 0.7), 몸이 다 올라오면 내려놓는다
      const handOn = 1 - ease.inOutSine(clamp((u - 0.62) / 0.3));
      for (const i of [nI, fI]) {
        const hx = edge + s * (i === nI ? 14 : 2);
        const hy = L.top - 3;
        const rx = b.x + sf * (i === nI ? 6 : -4),
          ry = b.y - 64;
        arm(i, lerp(rx, hx, handOn), lerp(ry, hy, handOn));
      }
      // 앞발: 무릎을 높이 들어 바닥에 올려 딛는다 / 뒷발: 마지막 가로대를 밀고 따라온다
      const step = ease.inOutSine(clamp((u - 0.28) / 0.34));
      const lift = Math.sin(Math.PI * clamp((u - 0.28) / 0.34));
      const nfx = lerp(x0 + f * 4, this.climbTo[0] + s * 4, step),
        nfy = Math.min(lerp(y0 - RUNG, L.top, step) - 26 * lift, b.y + 0);
      leg(nI, nfx, Math.max(nfy, b.y - 70));
      const trail = ease.inOutSine(clamp((u - 0.62) / 0.3));
      const tlift = Math.sin(Math.PI * trail);
      const tfx = lerp(x0 + f * 2, this.climbTo[0] - s * 6, trail),
        tfy = lerp(y0, L.top, trail) - 18 * tlift;
      leg(fI, tfx, Math.min(tfy, b.y));
      // 다 올라서면 평소 서 있는 자세로
      const st = ease.inOutSine(clamp((u - 0.86) / 0.14));
      if (st > 0) {
        const I = rigidPose();
        applyIdle(I, 0, sf, 0);
        I.turn = sf;
        lerpPose(P, I, st, P);
      }
      P.headY = 0;
      return;
    }

    P.turn = f;
    P.lean = 0.14;
    P.crouch = 0;
    P.headTilt = -0.16;
    const m = this.climbM;
    const dir = this.climbDir;
    const e = dir !== 0 ? this.climbE : 0;
    const le = ease.inOutSine(clamp(e * 1.15));
    const arc = Math.sin(Math.PI * le);
    // 칸마다 손발이 번갈아 (한쪽 손 + 반대쪽 발)
    const hh = ((((m % 2) + 2) % 2 === 0 ? near : far) as 0 | 1);
    const lo = (1 - hh) as 0 | 1;
    const hx = L.x + f * 4,
      fx = L.x - f * 12;
    const clampH = (y: number) => Math.max(y, railTop);
    let hyH = rungY(m + 4),
      hyL = rungY(m + 3);
    let hxH = hx,
      hxL = hx;
    let fyH = rungY(m + 1),
      fyL = rungY(m);
    let fxH = fx,
      fxL = fx;
    if (dir > 0) {
      // 낮은 손 → 두 칸 위로, 낮은 발 → 두 칸 위로 (가로대에서 살짝 떼어 뒤로 둥글게)
      hyL = lerp(rungY(m + 3), rungY(m + 5), le) - 4 * arc;
      hxL = hx - f * 9 * arc;
      fyL = lerp(rungY(m), rungY(m + 2), le) - 6 * arc;
      fxL = fx - f * 12 * arc;
    } else if (dir < 0) {
      hyH = lerp(rungY(m + 4), rungY(m + 2), le) - 4 * arc;
      hxH = hx - f * 9 * arc;
      fyH = lerp(rungY(m + 1), rungY(Math.max(0, m - 1)), le) - 6 * arc;
      fxH = fx - f * 12 * arc;
    }
    arm(hh, hxH, clampH(hyH));
    arm(lo, hxL, clampH(hyL));
    leg(lo, fxL, Math.min(L.bottom, fyL));
    leg(hh, fxH, Math.min(L.bottom, fyH));
    P.headY = -0.004 * arc;
  }

  draw(ctx: CanvasRenderingContext2D, g: GameAPI, petals: string[]) {
    // 깔려서 터졌다: 몸은 조각(파티클)으로만 남는다
    if (this.state === 'dead' && this.deathCause === 'crush') return;
    const b = this.body;
    const st = defaultStyle();
    if (this.state === 'dead') {
      const k = clamp(this.deathT / 0.6);
      if (this.deathCause === 'grab') {
        // 들려 올라가 버둥대다가, 하얗게 바래며 종이로 흩어진다
        const g2 = clamp((this.deathT - 0.85) / 0.4);
        st.color = lerpColor('#0e0e0e', '#f6f5f1', g2);
        st.farColor = st.color;
        st.alpha = 1 - clamp((this.deathT - 1.05) / 0.35);
      } else if (this.deathCause === 'erase') {
        st.color = lerpColor('#0e0e0e', '#f6f5f1', k);
        st.farColor = st.color;
        st.alpha = 1 - clamp((this.deathT - 0.5) / 0.6);
      }
    }
    const hide = this.freezeAmt > 0.5 || this.hideFlower || this.state === 'climb';
    const fsize = 22;
    // 구르기: 엉덩이를 축으로 몸을 돌리고, 가장 낮은 점(손/어깨/등/발)을 바닥에 붙인다
    const rk = this.rollK,
      ra = this.rollAngle;
    const rolling = rk > 0.01 || Math.abs(ra) > 0.01;
    const fx = b.x + this.visX,
      fy = b.y;
    if (rolling) {
      const m = drawFigure(measureCtx(), this.pose, fx, fy, PH.SCALE, st);
      const [cx, cy] = m.hip;
      const cs = Math.cos(ra),
        sn = Math.sin(ra);
      let low = -1e9;
      for (const [px, py, r] of m.pts) {
        const ry = cy + (px - cx) * sn + (py - cy) * cs + r;
        if (ry > low) low = ry;
      }
      const dy = (b.y - low) * Math.min(1, rk * 1.5);
      ctx.save();
      ctx.translate(0, dy);
      ctx.translate(cx, cy);
      ctx.rotate(ra);
      ctx.translate(-cx, -cy);
    }
    if (this.hollow > 0.01) st.alpha *= 1 - this.hollow;
    this.joints = drawFigure(ctx, this.pose, fx, fy, PH.SCALE, st, {
      heldBehind: hide,
      // 정면이든 옆모습이든 같은 손 (돌아설 때 꽃이 반대 손으로 건너가지 않게)
      heldArm: this.facing > 0 ? 0 : 1,
      held:
        petals.length > 0 && !(this.state === 'dead' && (this.deathCause === 'erase' || (this.deathCause === 'grab' && this.deathT > 0.9)))
          ? (fc, hx, hy, ang) => {
              const sway = Math.sin(g.t * 2.1) * 0.08 - b.vx * 0.0006;
              const a = clamp(-ang * 0.25 * this.facing, -0.6, 0.6) * this.facing * 0;
              // 구르는 동안에도 꽃은 위를 향한다 (몸의 회전을 되돌린다)
              fc.save();
              fc.translate(hx, hy);
              if (rolling) fc.rotate(-ra);
              drawFlower(fc, 0, rolling ? -6 * rk : 4, fsize, petals, { sway, angle: a, stem: 1.25, alpha: hide ? 0.0 : 1 });
              fc.restore();
            }
          : undefined,
    });
    // 하얗게 비어 가는 몸: 여백처럼 끓는 연필 윤곽
    if (this.hollow > 0.01) drawBlankFigure(ctx, this.pose, fx, fy, PH.SCALE, g.t, this.hollow);
    if (rolling) ctx.restore();
  }

  /** 꽃 빛 (인물 레이어 아래에 깔린다) */
  drawGlow(ctx: CanvasRenderingContext2D, petals: string[]) {
    if (!this.joints || this.freezeAmt > 0.5 || petals.length === 0) return;
    if (this.state === 'dead' && (this.deathCause === 'erase' || this.deathCause === 'crush' || (this.deathCause === 'grab' && this.deathT > 0.9))) return;
    const [hx, hy] = this.joints.hand[this.joints.near];
    drawGlow(ctx, hx, hy - 26, 120 + petals.length * 10, petals, 0.7);
  }
}

let mctx: CanvasRenderingContext2D | null = null;
/** 자세 측정용 (보이지 않는) 캔버스 */
function measureCtx() {
  if (!mctx) {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    mctx = c.getContext('2d')!;
  }
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  return mctx;
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
