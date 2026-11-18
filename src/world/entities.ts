import { Body, moveBody, type Solid } from './physics';
import type { EntityDef, GameAPI } from './types';
import { drawFigure, rigidPose, clonePose, lerpPose, applyIdle, applyRunCycle, plantLegs, defaultStyle, type Pose, type Joints } from '../gfx/figure';
import { drawIcon, type IconName } from '../gfx/icons';
import { drawGlow, drawPetal, PETAL_COLORS, hexA } from '../gfx/flower';
import { clamp, damp, ease, lerp, rand, segHitsRect, TAU, noise1 } from '../core/math';
import { audio } from '../core/audio';
import { INK } from '../gfx/ground';

export interface Prompt {
  text: string;
  hold: number;
  disabled?: boolean;
}

export abstract class Entity {
  abstract readonly type: string;
  constructor(public id: string) {}
  /** 동적 고체 (있다면) */
  solid: Solid | null = null;
  update(_g: GameAPI, _dt: number) {}
  drawBack(_ctx: CanvasRenderingContext2D, _g: GameAPI) {}
  drawFig(_ctx: CanvasRenderingContext2D, _g: GameAPI) {}
  drawFront(_ctx: CanvasRenderingContext2D, _g: GameAPI) {}
  /** 상호작용 위치 (없으면 상호작용 불가) */
  interactPos(): [number, number] | null {
    return null;
  }
  interactRange = 90;
  prompt(_g: GameAPI): Prompt | null {
    return null;
  }
  interact(_g: GameAPI) {}
  save(): unknown {
    return null;
  }
  load(_s: unknown) {}
}

// ------------------------------------------------------------------
// 상자
// ------------------------------------------------------------------
export class Box extends Entity {
  readonly type = 'box';
  body: Body;
  size: number;
  private moved = 0;
  private scrapeT = 0;
  constructor(id: string, x: number, y: number, size = 96) {
    super(id);
    this.size = size;
    this.body = new Body(x, y, size, size);
    this.solid = { x: 0, y: 0, w: size, h: size, owner: this };
    this.sync();
  }
  sync() {
    const b = this.body;
    if (!this.solid) return;
    const s = this.solid!;
    s.x = b.x - b.w / 2;
    s.y = b.y - b.h;
  }
  floating = false;
  /** 수평으로 밀기: 실제 이동량 반환 */
  push(dx: number, solids: Solid[]) {
    const x0 = this.body.x;
    if (!this.body.onGround && !this.floating) return 0;
    moveBody(this.body, dx, 0, solids, { ignore: this });
    this.sync();
    const d = this.body.x - x0;
    this.moved += Math.abs(d);
    return d;
  }
  update(g: GameAPI, dt: number) {
    const b = this.body;
    const w = g.waterAt(b.x);
    const wasFloat = this.floating;
    this.floating = !!w && b.y > w.level + 6;
    if (w && this.floating) {
      // 물에 뜬다. 위에 사람이 서 있으면 조금 더 가라앉는다
      const pb = (g.player as unknown as { body: { onGround: boolean; groundSolid: unknown } }).body;
      const rider = pb.onGround && pb.groundSolid === this.solid;
      const target = w.level + this.size * 0.42 + (rider ? 18 : 0) + Math.sin(g.t * 1.6 + b.x) * 2;
      b.vy += ((target - b.y) * 38 - b.vy * 7) * dt;
      b.vy = clamp(b.vy, -320, 320);
      if (!wasFloat && b.vy > 200) {
        audio.play('splash1', { vol: 0.6 });
        g.parts.puff(b.x, w.level, 10, 1);
      }
    } else b.vy = Math.min(1400, b.vy + 2500 * dt);
    const wasG = b.onGround;
    const solids = g.solids();
    moveBody(b, 0, b.vy * dt, solids, { ignore: this });
    if (this.floating && b.onGround) b.vy = Math.min(0, b.vy);
    if (b.onGround && !this.floating) {
      if (!wasG && b.vy > 300) {
        audio.play('thud', { vol: 0.6, vary: 0.05 });
        g.parts.puff(b.x, b.y, 10, 1.2);
        g.shake(0.15);
      }
      b.vy = 0;
    }
    this.sync();
    // 끌리는 소리
    this.scrapeT -= dt;
    if (this.moved > 1 && this.scrapeT <= 0) {
      if (this.floating) audio.play('splash3', { vol: 0.25, vary: 0.15 });
      else audio.play(Math.random() < 0.5 ? 'scrape' : 'scrape2', { vol: 0.35, vary: 0.1 });
      g.noise(b.x, b.y, this.floating ? 380 : 560);
      this.scrapeT = 0.38;
    }
    this.moved = 0;
  }
  drawBack(ctx: CanvasRenderingContext2D) {
    const s = this.solid!;
    const r = 8;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, s.w, s.h, r);
    ctx.fill();
    // 픽토그램 상자: 안쪽 흰 선
    ctx.strokeStyle = '#d9d9d6';
    ctx.lineWidth = 3;
    const m = 12;
    ctx.beginPath();
    ctx.roundRect(s.x + m, s.y + m, s.w - m * 2, s.h - m * 2, 4);
    ctx.moveTo(s.x + m, s.y + m);
    ctx.lineTo(s.x + s.w - m, s.y + s.h - m);
    ctx.moveTo(s.x + s.w - m, s.y + m);
    ctx.lineTo(s.x + m, s.y + s.h - m);
    ctx.stroke();
  }
  save() {
    return { x: this.body.x, y: this.body.y };
  }
  load(s: { x: number; y: number }) {
    this.body.x = s.x;
    this.body.y = s.y;
    this.body.vy = 0;
    this.sync();
  }
}

// ------------------------------------------------------------------
// 발판
// ------------------------------------------------------------------
export class Plate extends Entity {
  readonly type = 'plate';
  pressed = false;
  depth = 0;
  constructor(
    id: string,
    public x: number,
    public y: number,
    public w: number,
    public signal: string,
  ) {
    super(id);
  }
  update(g: GameAPI, dt: number) {
    const was = this.pressed;
    this.pressed = (g as unknown as { weightOn(x0: number, x1: number, y: number): boolean }).weightOn(this.x - this.w / 2, this.x + this.w / 2, this.y);
    if (this.pressed) g.signals.set(this.signal, true);
    if (this.pressed !== was) audio.play(this.pressed ? 'clunk' : 'click4', { vol: 0.5 });
    this.depth = damp(this.depth, this.pressed ? 7 : 0, 20, dt);
  }
  drawBack(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#3a3a39';
    ctx.fillRect(this.x - this.w / 2 - 6, this.y - 4, this.w + 12, 6);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.roundRect(this.x - this.w / 2, this.y - 16 + this.depth, this.w, 14, 4);
    ctx.fill();
    ctx.fillStyle = this.pressed ? '#bdbdba' : '#5b5b59';
    ctx.fillRect(this.x - this.w / 2 + 10, this.y - 13 + this.depth, this.w - 20, 3);
  }
}

// ------------------------------------------------------------------
// 문 (철창)
// ------------------------------------------------------------------
export class Gate extends Entity {
  readonly type = 'gate';
  open = 0;
  private wasOpen = false;
  constructor(
    id: string,
    public x: number,
    public y: number,
    public w: number,
    public h: number,
    public signal: string,
  ) {
    super(id);
    this.solid = { x: x - w / 2, y: y - h, w, h, owner: this, look: 'gate' };
  }
  update(g: GameAPI, dt: number) {
    const want = g.signals.get(this.signal) ? 1 : 0;
    const p = g.player.body;
    const under = Math.abs(p.x - this.x) < this.w / 2 + p.w / 2 && p.y > this.y - this.h;
    let target = want;
    if (!want && under && this.open > 0.3) target = this.open; // 사람이 밑에 있으면 멈춘다
    const speed = target > this.open ? 1.6 : 1.1;
    this.open = clamp(this.open + Math.sign(target - this.open) * Math.min(Math.abs(target - this.open), speed * dt));
    const lift = this.open * (this.h - 24);
    const s = this.solid!;
    s.y = this.y - this.h - lift;
    s.h = this.h;
    const isOpen = this.open > 0.05;
    if (isOpen !== this.wasOpen) {
      audio.play(isOpen ? 'elevator_door' : 'slam', { vol: isOpen ? 0.5 : 0.55 });
      if (!isOpen) g.shake(0.18);
      this.wasOpen = isOpen;
    }
  }
  drawBack(ctx: CanvasRenderingContext2D) {
    const s = this.solid!;
    ctx.fillStyle = INK;
    // 창살
    const bars = 3;
    for (let i = 0; i < bars; i++) {
      const bx = s.x + (s.w / (bars - 1)) * i;
      ctx.fillRect(bx - 5, s.y, 10, s.h);
    }
    ctx.fillRect(s.x - 5, s.y + s.h - 18, s.w + 10, 18);
    ctx.fillRect(s.x - 5, s.y + s.h * 0.4, s.w + 10, 12);
    drawIcon(ctx, 'warning', this.x, s.y + s.h * 0.4 - 6, 46, { color: INK });
    // 문 위쪽 벽 (열리면 문이 이 안으로 들어간다)
    const top = this.y - this.h;
    ctx.fillRect(this.x - this.w / 2 - 26, top - 1600, this.w + 52, 1600);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(this.x - this.w / 2 - 26, top - 3, this.w + 52, 3);
  }
  save() {
    return { open: this.open };
  }
  load(s: { open: number }) {
    this.open = s.open;
    this.wasOpen = s.open > 0.05;
  }
}

// ------------------------------------------------------------------
// 주민
// ------------------------------------------------------------------
type RState = 'frozen' | 'waking' | 'awake' | 'follow' | 'goto' | 'stay' | 'leave' | 'gone' | 'crawl';

export class Resident extends Entity {
  readonly type = 'resident';
  body: Body;
  scale: number;
  headScale: number;
  savable: boolean;
  after: 'leave' | 'follow' | 'stay';
  leaveTo: number;
  state: RState = 'frozen';
  iris: string | null = null;
  pose: Pose = rigidPose();
  private wakeT = 0;
  facing = 1;
  private phase = 0;
  private target = 0;
  private alpha = 1;
  private lookT = 0;
  private stepI = 0;
  private waveT = -1;
  kid: boolean;
  joints: Joints | null = null;

  constructor(def: Extract<EntityDef, { type: 'resident' }>) {
    super(def.id);
    const kind = def.kind ?? 'adult';
    this.kid = kind === 'child';
    this.scale = kind === 'child' ? 100 : kind === 'tall' ? 162 : 146 + (Math.abs(Math.sin(def.x)) * 10);
    this.headScale = kind === 'child' ? 1.3 : 1;
    this.body = new Body(def.x, def.y ?? 0, 36, this.scale * 0.92);
    this.savable = !!def.savable;
    this.after = def.after ?? 'leave';
    this.leaveTo = def.leaveTo ?? def.x - 1600;
    this.interactRange = 110;
  }

  get awake() {
    return this.state !== 'frozen';
  }

  interactPos(): [number, number] | null {
    if (this.state !== 'frozen' || !this.savable) return null;
    return [this.body.x, this.body.y - this.scale];
  }
  prompt(g: GameAPI): Prompt | null {
    if (this.state !== 'frozen' || !this.savable) return null;
    if (g.petals.length <= 1) return { text: '꽃잎이 한 장뿐입니다', hold: 0, disabled: true };
    return { text: '꽃잎 건네기', hold: 0.65 };
  }

  /** 꽃잎이 닿았을 때 */
  awaken(g: GameAPI, color: string) {
    this.state = 'waking';
    this.wakeT = 0;
    this.iris = color;
    g.saved.add(this.id);
    const hx = this.body.x,
      hy = this.body.y - this.scale * 0.9;
    g.parts.burst(hx, hy, [color, color, '#ffffff'], 22, 260);
    g.parts.ring(hx, hy, color, 220, 1.1);
    audio.play('bell2', { vol: 0.55, rate: 0.9 + Math.random() * 0.2 });
    audio.play('chime', { vol: 0.4 });
    audio.play('click3', { vol: 0.4, rate: 0.7, delay: 0.25 });
    this.facing = g.player.x < this.body.x ? -1 : 1;
  }

  /** 기계 속으로 사라진다 (아이콘으로 찍힘) */
  lose(g: GameAPI) {
    if (this.state !== 'frozen') return;
    this.state = 'gone';
    this.alpha = 0;
    g.flags.add('lost:' + this.id);
    g.parts.paper(this.body.x, this.body.y - this.scale * 0.5, 14, 1);
  }

  command(kind: 'goto' | 'stay' | 'follow' | 'leave' | 'crawl', x?: number) {
    if (kind === 'goto' || kind === 'crawl') {
      this.state = kind;
      this.target = x ?? this.body.x;
    } else this.state = kind;
  }
  wave() {
    this.waveT = 0;
  }

  update(g: GameAPI, dt: number) {
    if (this.state === 'gone') return;
    const b = this.body;
    let moveX = 0;
    const speed = this.kid ? 300 : 260;
    switch (this.state) {
      case 'frozen':
        return;
      case 'waking':
        this.wakeT += dt;
        if (this.wakeT > 2.2) this.state = this.after === 'follow' ? 'follow' : this.after === 'stay' ? 'stay' : 'leave';
        break;
      case 'follow': {
        const p = g.player;
        const tx = p.x - p.facing * (this.kid ? 95 : 120);
        const d = tx - b.x;
        if (Math.abs(p.x - b.x) < 1100 && Math.abs(d) > 40) moveX = Math.sign(d) * Math.min(speed, Math.abs(d) * 3);
        break;
      }
      case 'goto':
      case 'crawl': {
        const d = this.target - b.x;
        if (Math.abs(d) > 6) moveX = Math.sign(d) * Math.min(speed * (this.state === 'crawl' ? 0.45 : 1), Math.abs(d) * 4);
        else this.state = 'stay';
        break;
      }
      case 'leave': {
        const d = this.leaveTo - b.x;
        moveX = Math.sign(d) * 220;
        if (Math.abs(d) < 30) this.alpha = Math.max(0, this.alpha - dt * 1.5);
        if (Math.abs(this.leaveTo - g.player.x) > 1600 && Math.abs(b.x - g.player.x) > 1300) this.alpha = 0;
        if (this.alpha <= 0) this.state = 'gone';
        break;
      }
    }
    b.vx = damp(b.vx, moveX, 10, dt);
    b.vy = Math.min(1400, b.vy + 2500 * dt);
    const solids = g.solids().filter((s) => s.owner !== this);
    b.h = this.state === 'crawl' ? 44 : this.scale * 0.92;
    moveBody(b, b.vx * dt, b.vy * dt, solids, { kid: this.kid, ignore: this });
    if (b.onGround) b.vy = 0;
    if (Math.abs(b.vx) > 20) this.facing = Math.sign(b.vx);
    // 발소리
    const ph0 = this.phase;
    this.phase += (Math.abs(b.vx) * dt * Math.PI) / (this.kid ? 70 : 100);
    if (Math.floor(ph0 / Math.PI) !== Math.floor(this.phase / Math.PI) && Math.abs(b.vx) > 50 && this.alpha > 0.5) {
      const d = Math.abs(b.x - g.player.x);
      if (d < 900) audio.step(this.stepI++, 0.22 * (1 - d / 900) * (this.kid ? 0.8 : 1));
    }
    this.lookT += dt;
    if (this.waveT >= 0) this.waveT += dt;
  }

  private computePose(g: GameAPI): Pose {
    const p = this.pose;
    if (this.state === 'frozen') return rigidPose();
    const t = g.t;
    const R = rigidPose();
    const sp = Math.abs(this.body.vx);
    if (this.state === 'waking') {
      // 굳은 몸이 풀리는 스프링
      const u = this.wakeT;
      const rel = u <= 0 ? 0 : 1 - Math.exp(-3.8 * u) * Math.cos(8 * u);
      const idle = rigidPose();
      applyIdle(idle, t, 1, 1);
      idle.crouch = 0.002;
      plantLegs(idle, 0.01);
      const out = lerpPose(R, idle, rel);
      out.eye = ease.outBack(clamp((u - 0.9) / 0.5));
      out.lookX = Math.sin(u * 3) * 0.6 * clamp((u - 1.2) / 0.3);
      const face = clamp((u - 1.6) / 0.5);
      out.turn = lerp(0, this.facing * 0.5, face);
      out.headX += Math.exp(-u * 5) * Math.sin(u * 70) * 0.01;
      return out;
    }
    const out = rigidPose();
    out.eyeShow = 1;
    out.eye = 1;
    if (this.state === 'crawl') {
      out.turn = this.facing;
      out.crouch = 0.3;
      out.lean = 1.15;
      out.arms[0].a = out.arms[1].a = 1.2;
      out.arms[0].b = out.arms[1].b = -0.3;
      const ph = this.phase;
      out.legs[0].a = 0.9 + Math.sin(ph) * 0.3;
      out.legs[1].a = 0.9 - Math.sin(ph) * 0.3;
      out.legs[0].b = out.legs[1].b = 1.8;
      out.arms[0].a += Math.sin(ph) * 0.3;
      out.arms[1].a -= Math.sin(ph) * 0.3;
      return out;
    }
    const turnT = sp > 30 ? this.facing : this.facing * 0.55;
    out.turn = damp(p.turn, turnT, 10, g.dt);
    if (sp > 30) {
      applyRunCycle(out, this.phase, clamp(sp / 330), this.facing);
    } else {
      applyIdle(out, t + this.body.x, this.facing, 1);
      out.lookX = noise1(this.lookT * 0.4 + this.body.x) * 0.6;
    }
    if (this.waveT >= 0 && this.waveT < 2.4) {
      const k = clamp(this.waveT / 0.3) * clamp((2.4 - this.waveT) / 0.3);
      const nearI = this.facing > 0 ? 0 : 1;
      out.arms[nearI].a = lerp(out.arms[nearI].a, 2.7, k);
      out.arms[nearI].b = lerp(out.arms[nearI].b, 0.3 + Math.sin(this.waveT * 12) * 0.35, k);
      out.turn = lerp(out.turn, this.facing * 0.3, k);
    }
    return out;
  }

  drawFig(ctx: CanvasRenderingContext2D, g: GameAPI) {
    if (this.state === 'gone') return;
    this.pose = this.computePose(g);
    const st = defaultStyle();
    st.headScale = this.headScale;
    st.alpha = this.alpha;
    this.joints = drawFigure(ctx, this.pose, this.body.x, this.body.y, this.scale, st);
  }

  drawFront(ctx: CanvasRenderingContext2D, g: GameAPI) {
    // 깨어난 주민: 가슴에 받은 꽃잎이 빛난다
    if (this.iris && this.state !== 'gone' && this.alpha > 0.05) {
      const k = this.state === 'waking' ? clamp(this.wakeT / 0.6) : 1;
      const cx = this.body.x + this.pose.turn * this.scale * 0.03;
      const cy = this.body.y - this.scale * (0.66 - this.pose.crouch);
      const pulse = 0.75 + Math.sin(g.t * 2.4 + this.body.x) * 0.25;
      ctx.save();
      ctx.globalAlpha = this.alpha * k;
      drawGlow(ctx, cx, cy, this.scale * 0.32, [this.iris], pulse);
      drawPetal(ctx, cx, cy + this.scale * 0.035, this.scale * 0.07, this.iris, Math.sin(g.t * 1.3) * 0.15);
      ctx.restore();
    }
    // 깨울 수 있는 주민: 머리 위 희미한 꽃잎 표시
    if (this.state === 'frozen' && this.savable) {
      const p = g.player;
      const d = Math.hypot(p.x - this.body.x, p.y - this.body.y);
      const a = clamp(1 - (d - 200) / 500) * 0.8;
      if (a > 0.01) {
        const y = this.body.y - this.scale - 38 + Math.sin(g.t * 2) * 5;
        const c = PETAL_COLORS[Math.floor(g.t * 0.7 + this.body.x) % PETAL_COLORS.length];
        drawGlow(ctx, this.body.x, y, 40, [c], a);
        drawPetal(ctx, this.body.x, y + 10, 13, c, Math.sin(g.t * 1.4) * 0.3, a);
      }
    }
  }

  save() {
    return { s: this.state === 'waking' ? (this.after === 'follow' ? 'follow' : this.after === 'stay' ? 'stay' : 'gone') : this.state === 'leave' ? 'gone' : this.state, x: this.body.x, y: this.body.y, iris: this.iris };
  }
  load(s: { s: RState; x: number; y: number; iris: string | null }) {
    this.state = s.s;
    this.body.x = s.x;
    this.body.y = s.y;
    this.body.vx = this.body.vy = 0;
    this.iris = s.iris;
    this.alpha = s.s === 'gone' ? 0 : 1;
    this.waveT = -1;
  }
}

// ------------------------------------------------------------------
// 떨어진 꽃잎 (줍기)
// ------------------------------------------------------------------
export class PetalPickup extends Entity {
  readonly type = 'petal';
  taken = false;
  constructor(
    id: string,
    public x: number,
    public y: number,
    public color: string,
  ) {
    super(id);
  }
  update(g: GameAPI) {
    if (this.taken) return;
    const p = g.player.body;
    if (Math.abs(p.x - this.x) < 50 && p.y - p.h - 20 < this.y && p.y + 20 > this.y) {
      this.taken = true;
      if (g.petals.length < 7) g.petals.push(this.color);
      audio.play('chime', { vol: 0.6, rate: 1.2 });
      audio.play('bell4', { vol: 0.35, rate: 1.4 });
      g.parts.burst(this.x, this.y, [this.color, '#ffffff'], 16, 220);
      g.parts.ring(this.x, this.y, this.color, 120, 0.8);
      g.flags.add('petal:' + this.id);
    }
  }
  drawFront(ctx: CanvasRenderingContext2D, g: GameAPI) {
    if (this.taken) return;
    const bob = Math.sin(g.t * 2.2 + this.x) * 6;
    drawGlow(ctx, this.x, this.y + bob, 70, [this.color], 1);
    drawPetal(ctx, this.x, this.y + bob + 10, 18, this.color, Math.sin(g.t * 1.3) * 0.5);
  }
  save() {
    return this.taken;
  }
  load(s: boolean) {
    this.taken = s;
  }
}

// ------------------------------------------------------------------
// 기억 조각 (크레용 그림)
// ------------------------------------------------------------------
export class Memory extends Entity {
  readonly type = 'memory';
  seen = false;
  constructor(
    id: string,
    public x: number,
    public y: number,
    public art: string,
  ) {
    super(id);
    this.interactRange = 100;
  }
  interactPos(): [number, number] {
    return [this.x, this.y - 150];
  }
  prompt(): Prompt {
    return { text: this.seen ? '그림 다시 보기' : '그림 보기', hold: 0 };
  }
  interact(g: GameAPI) {
    if (!this.seen) {
      this.seen = true;
      g.memories.add(this.id);
      audio.play('paper_crush', { vol: 0.4 });
    }
    g.showMemory(this.art);
  }
  drawBack(ctx: CanvasRenderingContext2D, g: GameAPI) {
    // 벽에 붙은 종이 한 장
    const w = 74,
      h = 58;
    const x = this.x - w / 2,
      y = this.y - 175;
    ctx.save();
    ctx.translate(this.x, y + h / 2);
    ctx.rotate(-0.06);
    ctx.translate(-this.x, -(y + h / 2));
    ctx.fillStyle = '#efeee9';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#777';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 14, y + 45);
    ctx.lineTo(x + 18, y + 18);
    ctx.lineTo(x + 24, y + 45);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 18, y + 13, 5, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = PETAL_COLORS[(i * 2) % 7];
      ctx.beginPath();
      ctx.arc(x + 36 + i * 9, y + 42 - (i % 2) * 6, 3.5, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#999';
    ctx.fillRect(this.x - 3, y - 4, 6, 6);
    ctx.restore();
    if (!this.seen) drawGlow(ctx, this.x, y + h / 2, 60, ['#ffd43b'], 0.5 + Math.sin(g.t * 2) * 0.2);
  }
  save() {
    return this.seen;
  }
  load(s: boolean) {
    this.seen = s;
  }
}

// ------------------------------------------------------------------
// 감시의 눈 (CCTV)
// ------------------------------------------------------------------
export class Cctv extends Entity {
  readonly type = 'cctv';
  angle = 0;
  detect = 0;
  alarm = false;
  private beepT = 0;
  constructor(
    public def: Extract<EntityDef, { type: 'cctv' }>,
  ) {
    super(def.id);
  }
  get len() {
    return this.def.len ?? 640;
  }
  get half() {
    return this.def.half ?? 0.2;
  }
  lens(): [number, number] {
    return [this.def.x + Math.cos(this.angle) * 46, this.def.y + Math.sin(this.angle) * 46];
  }
  update(g: GameAPI, dt: number) {
    const d = this.def;
    this.angle = d.mid + d.amp * Math.sin((g.t / d.period) * TAU + (d.phase ?? 0));
    const p = g.player;
    let seen = false;
    if (!p.frozen && !g.isDead()) {
      const [lx, ly] = this.lens();
      const b = p.body;
      const pts: [number, number][] = [
        [b.x, b.y - b.h * 0.85],
        [b.x, b.y - b.h * 0.45],
        [b.x, b.y - 8],
      ];
      const solids = g.solids();
      for (const [px, py] of pts) {
        const dx = px - lx,
          dy = py - ly;
        const dist = Math.hypot(dx, dy);
        if (dist > this.len) continue;
        let da = Math.atan2(dy, dx) - this.angle;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        if (Math.abs(da) > this.half) continue;
        let blocked = false;
        for (const s of solids) {
          if (s.oneway || s.owner === undefined ? false : false) continue;
          if (s.oneway) continue;
          if (segHitsRect(lx, ly, px, py, { x: s.x + 2, y: s.y + 2, w: s.w - 4, h: s.h - 4 })) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          seen = true;
          break;
        }
      }
    }
    const was = this.detect;
    this.detect = clamp(this.detect + (seen ? dt * 3.2 : -dt * 1.5));
    if (seen) {
      this.beepT -= dt;
      if (this.beepT <= 0) {
        audio.play('click5', { vol: 0.5, rate: 1.6 + this.detect });
        this.beepT = 0.18 - this.detect * 0.08;
      }
    }
    if (this.detect >= 1 && was < 1) {
      this.alarm = true;
      audio.play('sting2', { vol: 0.9 });
      audio.play('erase', { vol: 0.8 });
      g.kill('erase');
    }
  }
  drawBack(ctx: CanvasRenderingContext2D, g: GameAPI) {
    const d = this.def;
    if (d.pole !== false) {
      ctx.fillStyle = INK;
      ctx.fillRect(d.x - 7, d.y, 14, -d.y + 2);
      ctx.fillRect(d.x - 26, -14, 52, 14);
    }
    // 원뿔 빛
    const [lx, ly] = this.lens();
    const L = this.len;
    const flick = this.detect > 0 ? 0.5 + 0.5 * Math.sin(g.t * 40) : 1;
    const g1 = ctx.createRadialGradient(lx, ly, 0, lx, ly, L);
    const base = 0.26 + this.detect * 0.35 * flick;
    g1.addColorStop(0, `rgba(255,255,250,${base + 0.15})`);
    g1.addColorStop(0.75, `rgba(255,255,250,${base * 0.6})`);
    g1.addColorStop(1, 'rgba(255,255,250,0)');
    ctx.fillStyle = g1;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.arc(lx, ly, L, this.angle - this.half, this.angle + this.half);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,250,${0.35 + this.detect * 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + Math.cos(this.angle - this.half) * L * 0.9, ly + Math.sin(this.angle - this.half) * L * 0.9);
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + Math.cos(this.angle + this.half) * L * 0.9, ly + Math.sin(this.angle + this.half) * L * 0.9);
    ctx.stroke();
    // 카메라 몸체 (각도를 따라 회전)
    ctx.save();
    ctx.fillStyle = INK;
    ctx.fillRect(d.x - 4, d.y - 30, 8, 30);
    ctx.fillRect(d.x - 18, d.y - 34, 36, 8);
    ctx.translate(d.x, d.y);
    ctx.rotate(this.angle);
    ctx.beginPath();
    ctx.roundRect(-18, -15, 58, 30, 6);
    ctx.fill();
    ctx.fillRect(36, -11, 10, 22);
    ctx.fillStyle = '#d9d9d6';
    ctx.fillRect(-6, -4, 26, 3);
    ctx.restore();
    // 감지 중이면 렌즈가 하얗게
    if (this.detect > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.detect})`;
      ctx.beginPath();
      ctx.arc(lx, ly, 6 + this.detect * 6, 0, TAU);
      ctx.fill();
    }
  }
  save() {
    return null;
  }
  load() {
    this.detect = 0;
    this.alarm = false;
  }
}

// ------------------------------------------------------------------
// 쓰러지는 가로등
// ------------------------------------------------------------------
export class Faller extends Entity {
  readonly type = 'faller';
  ang = 0;
  vel = 0;
  state: 'up' | 'falling' | 'down' = 'up';
  icon: IconName;
  constructor(public def: Extract<EntityDef, { type: 'faller' }>) {
    super(def.id);
    this.icon = def.icon ?? 'lamp';
  }
  update(g: GameAPI, dt: number) {
    const d = this.def;
    if (this.state === 'up' && g.player.x > d.trigger && g.chaseActive()) {
      this.state = 'falling';
      this.vel = 0.6;
      audio.play('metal_fall', { vol: 0.7, rate: 0.8 });
      audio.play('clank', { vol: 0.5 });
    }
    if (this.state === 'falling') {
      this.vel += 5.5 * dt;
      this.ang += this.vel * dt;
      // 플레이어 충돌
      const tipX = d.x + Math.sin(this.ang) * d.h * d.dir;
      const tipY = -Math.cos(this.ang) * d.h;
      const b = g.player.body;
      if (this.ang > 0.35 && segHitsRect(d.x, -10, tipX, tipY, { x: b.x - b.w / 2 + 4, y: b.y - b.h + 6, w: b.w - 8, h: b.h - 10 })) {
        g.kill('crush');
      }
      if (this.ang >= Math.PI / 2) {
        this.ang = Math.PI / 2;
        this.state = 'down';
        audio.play('land_hard', { vol: 0.9 });
        audio.play('metal_fall', { vol: 0.5, rate: 1.2 });
        g.shake(0.45);
        g.parts.puff(d.x + d.h * 0.7 * d.dir, 0, 16, 1.6);
      }
    }
    if (this.state === 'down') {
      const x0 = d.dir > 0 ? d.x + 20 : d.x - d.h + 30;
      this.solid = { x: x0, y: -46, w: d.h - 50, h: 46, owner: this };
    } else this.solid = null;
  }
  drawBack(ctx: CanvasRenderingContext2D) {
    const d = this.def;
    ctx.save();
    ctx.translate(d.x, 0);
    ctx.rotate(this.ang * d.dir);
    drawIcon(ctx, this.icon, 0, 0, d.h, { color: INK });
    ctx.restore();
  }
  save() {
    return null;
  }
  load() {
    this.state = 'up';
    this.ang = 0;
    this.vel = 0;
    this.solid = null;
  }
}

export { clonePose, rand, hexA };
