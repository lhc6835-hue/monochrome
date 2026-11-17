import { Body, moveBody, areaFree, type Solid } from './physics';
import type { GameAPI, PlayerLike } from './types';
import type { Input } from '../core/input';
import { Box } from './entities';
import { audio } from '../core/audio';
import { clamp, damp, ease, lerp, noise1 } from '../core/math';
import { applyIdle, applyRunCycle, drawFigure, lerpPose, plantLegs, rigidPose, defaultStyle, type Pose, type Joints } from '../gfx/figure';
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

export type PState = 'normal' | 'mantle' | 'freeze' | 'slide' | 'give' | 'dead' | 'scripted';

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
  private landSquash = 0;
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
  deathCause: 'erase' | 'fall' | 'crush' = 'erase';
  joints: Joints | null = null;
  hideFlower = false;
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

  update(g: GameAPI & { boxes(): Box[] }, inp: Input, control: boolean, dt: number) {
    const b = this.body;
    if (this.state === 'dead') {
      this.deathT += dt;
      if (this.deathCause === 'fall') {
        b.vy = Math.min(PH.MAX_FALL, b.vy + PH.GRAV * dt);
        b.y += b.vy * dt;
      }
      return;
    }
    let ax = control ? inp.axisX : 0;
    const downHeld = control && inp.down('down');
    const solids = g.solids();

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

    // ---------- 미끄러지기 ----------
    if (this.state === 'normal' && b.onGround && control && inp.pressed('down') && Math.abs(b.vx) > 230) {
      this.state = 'slide';
      this.slideT = 0;
      b.h = PH.SLIDE_H;
      b.vx = Math.sign(b.vx) * Math.max(Math.abs(b.vx), 420);
      audio.play('swish2', { vol: 0.5 });
      audio.play('scrape', { vol: 0.3, rate: 1.4 });
      g.parts.puff(b.x, b.y, 6, 0.8);
    }
    if (this.state === 'slide') {
      this.slideT += dt;
      ax = 0;
      const canStand = areaFree({ x: b.x - b.w / 2, y: b.y - PH.H, w: b.w, h: PH.H - 2 }, solids);
      b.vx = Math.sign(b.vx || this.facing) * Math.max(180, Math.abs(b.vx) - 520 * dt);
      if (this.slideT > 0.55 && canStand) {
        this.state = 'normal';
        b.h = PH.H;
      }
      if (!b.onGround && this.slideT > 0.1 && canStand) {
        this.state = 'normal';
        b.h = PH.H;
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
    const maxSp = this.grabbing || pushingDir ? PH.PUSH : PH.RUN;
    if (this.state === 'normal' || this.state === 'scripted' || this.state === 'freeze' || this.state === 'give') {
      const target = ax * maxSp;
      const acc = b.onGround ? (ax !== 0 && Math.sign(ax) === Math.sign(b.vx || ax) ? PH.ACC_G : PH.FRIC) : PH.ACC_A;
      if (b.vx < target) b.vx = Math.min(target, b.vx + acc * dt);
      else if (b.vx > target) b.vx = Math.max(target, b.vx - acc * dt);
      if (ax !== 0 && !this.grabbing) this.facing = Math.sign(ax);
    }

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
        b.vy = -PH.JUMP;
        this.jumping = true;
        this.buffer = 0;
        this.coyote = 0;
        this.grabbing = null;
        audio.play('swish1', { vol: 0.35, vary: 0.1 });
        audio.step(this.stepI++, 0.35);
      }
    }
    if (this.jumping && b.vy < 0 && control && !inp.down('jump')) {
      b.vy *= 0.45;
      this.jumping = false;
    }
    if (b.vy >= 0) this.jumping = false;
    b.vy = Math.min(PH.MAX_FALL, b.vy + PH.GRAV * dt);

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
        audio.play('click4', { vol: 0.25 });
        break;
      }
    }

    // ---------- 착지 ----------
    if (!wasGround && b.onGround) {
      const fall = b.y - this.fallStartY;
      const v = vyBefore;
      if (v > 400) {
        this.landSquash = clamp(v / 1400) * 0.22;
        g.parts.puff(b.x, b.y, Math.round(4 + v / 150), clamp(v / 1000, 0.5, 1.5));
        audio.play(v > 1100 ? 'land_hard' : 'land', { vol: clamp(v / 1200, 0.25, 0.9), vary: 0.08 });
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

  die(cause: 'erase' | 'fall' | 'crush') {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.deathCause = cause;
    this.deathT = 0;
    this.grabbing = null;
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
      audio.step(this.stepI++, clamp(sp / PH.RUN, 0.15, 0.5));
    }
    this.landSquash = damp(this.landSquash, 0, 9, dt);
    this.idleT = sp < 5 && b.onGround ? this.idleT + dt : 0;

    if (this.state === 'mantle') {
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
      P.turn = this.facing;
      const near = this.facing > 0 ? 0 : 1;
      const far = 1 - near;
      P.crouch = 0.27;
      P.lean = -0.55;
      P.legs[near].a = 1.45;
      P.legs[near].b = 0.15;
      P.legs[far].a = 1.05;
      P.legs[far].b = 1.25;
      P.arms[near].a = -0.9;
      P.arms[near].b = 0.4;
      P.arms[far].a = 1.1;
      P.arms[far].b = 0.6;
      P.headTilt = 0.3;
      P.squash = 0.86;
    } else if (!b.onGround) {
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
    P.squash *= 1 - this.landSquash;
    if (this.landSquash > 0.01 && b.onGround) {
      P.crouch += this.landSquash * 0.35;
      plantLegs(P, 0.03);
    }
    this.pose = P;
  }

  draw(ctx: CanvasRenderingContext2D, g: GameAPI, petals: string[]) {
    const b = this.body;
    const st = defaultStyle();
    if (this.state === 'dead') {
      const k = clamp(this.deathT / 0.6);
      if (this.deathCause === 'erase') {
        st.color = lerpColor('#0e0e0e', '#f6f5f1', k);
        st.farColor = st.color;
        st.alpha = 1 - clamp((this.deathT - 0.5) / 0.6);
      } else if (this.deathCause === 'crush') {
        this.pose.squash = lerp(1, 0.25, ease.outCubic(k));
      }
    }
    const hide = this.freezeAmt > 0.5 || this.hideFlower;
    const fsize = 22;
    this.joints = drawFigure(ctx, this.pose, b.x, b.y, PH.SCALE, st, {
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
  }

  /** 꽃 빛 (인물 레이어 아래에 깔린다) */
  drawGlow(ctx: CanvasRenderingContext2D, petals: string[]) {
    if (!this.joints || this.freezeAmt > 0.5 || petals.length === 0) return;
    if (this.state === 'dead' && this.deathCause === 'erase') return;
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
