/**
 * 여백의 땅
 *  - 지우개 (Eraser): 정해진 높이를 박자에 맞춰 가로지른다. 먼저 회색 그림자가 지나갈 길을 보여준다.
 *    닿으면 지워지고, 지나간 자리의 먹선 발판은 다시 스케치로 돌아간다.
 *  - 거대한 손 (Hands): 땅에 그림자가 먼저 드리우고, 하얀 손이 내리친다.
 *  - 시선 (Gaze): 앞을 막아선 여백이 스케치 숲을 훑는다. 시선에 닿을 때 굳어 있지 않으면 지워진다.
 */
import { Entity } from './entities';
import type { EntityDef, GameAPI } from './types';
import { LitPlank } from './entities7';
import { audio } from '../core/audio';
import { clamp, ease, hash1, lerp, TAU } from '../core/math';
import { app } from '../app';
import { drawBlankFigure, drawBlankHand } from '../gfx/blank';
import { rigidPose } from '../gfx/figure';

// ------------------------------------------------------------------
// 지우개
// ------------------------------------------------------------------
export class Eraser extends Entity {
  readonly type = 'eraser';
  x: number;
  private t: number;
  private sweeping = false;
  private crumbs = 0;
  constructor(public def: Extract<EntityDef, { type: 'eraser' }>) {
    super(def.id);
    this.t = def.phase ?? 0;
    this.x = def.dir > 0 ? def.x0 - 400 : def.x1 + 400;
  }
  get w() {
    return 170;
  }
  private get sweepDur() {
    return (this.def.x1 - this.def.x0 + 800) / 950;
  }
  /** 다음 지나감까지 남은 시간 (그림자 예고) */
  get warn() {
    const rest = this.def.period - this.sweepDur;
    const u = this.t % this.def.period;
    return u < rest ? clamp(1 - (rest - u) / 0.9) : 0;
  }
  update(g: GameAPI, dt: number) {
    const d = this.def;
    this.t += dt;
    const rest = d.period - this.sweepDur;
    const u = this.t % d.period;
    const was = this.sweeping;
    this.sweeping = u >= rest;
    const k = this.sweeping ? (u - rest) / this.sweepDur : 0;
    const a = d.x0 - 400,
      b = d.x1 + 400;
    this.x = d.dir > 0 ? lerp(a, b, k) : lerp(b, a, k);
    const near = Math.abs(g.player.x - (d.x0 + d.x1) / 2) < 1800;
    if (this.sweeping && !was && near) {
      audio.play('scrape2', { vol: 0.8, rate: 0.7 });
      audio.play('paper_rip', { vol: 0.45, rate: 0.6 });
    }
    if (!this.sweeping) return;
    // 지우는 곳은 계단 구간(x0 ~ x1) 안만 (양 끝 땅은 안전하다)
    const x0 = Math.max(d.x0, this.x - this.w / 2),
      x1 = Math.min(d.x1, this.x + this.w / 2);
    if (x1 <= x0) return;
    // 먹선 발판을 지운다
    for (const e of (g as unknown as { ents: Entity[] }).ents) {
      if (!(e instanceof LitPlank)) continue;
      const p = e.def;
      const ph = p.h ?? 22;
      if (p.x < x1 && p.x + p.w > x0 && p.y < d.y + d.h && p.y + ph > d.y) e.erase();
    }
    // 닿으면 지워진다
    const pb = g.player.body;
    if (!g.isDead() && pb.x + pb.w / 2 > x0 && pb.x - pb.w / 2 < x1 && pb.y > d.y && pb.y - pb.h < d.y + d.h) g.kill('erase');
    this.crumbs += dt * 40;
    while (this.crumbs > 1) {
      this.crumbs--;
      g.parts.add({ t: 'shard', x: this.x - d.dir * this.w * 0.5, y: d.y + Math.random() * d.h, vx: -d.dir * (100 + Math.random() * 200), vy: -100 + Math.random() * 150, life: 0.8, size: 6, w: 4, rot: Math.random() * 6, vr: 8, color: '#bdbcb7', drag: 0.6, g: 900 });
    }
  }
  drawFront(ctx: CanvasRenderingContext2D) {
    const d = this.def;
    // 예고: 지나갈 띠가 회색으로 비친다
    const w = this.warn;
    if (w > 0.01) {
      ctx.save();
      ctx.globalAlpha = 0.25 * w;
      ctx.fillStyle = '#7c7b77';
      ctx.fillRect(d.x0 - 200, d.y, d.x1 - d.x0 + 400, d.h);
      ctx.restore();
    }
    if (!this.sweeping) return;
    // 지우개: 둥근 몸 + 종이 띠
    ctx.save();
    ctx.translate(this.x, d.y + d.h / 2);
    ctx.rotate(d.dir * 0.06);
    ctx.fillStyle = '#fbfbf8';
    ctx.strokeStyle = 'rgba(30,30,28,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-this.w / 2, -d.h / 2 - 10, this.w, d.h + 20, 18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#9e9d98';
    ctx.fillRect(-this.w / 2 + (d.dir > 0 ? 0 : this.w * 0.55), -d.h / 2 - 10, this.w * 0.45, d.h + 20);
    ctx.restore();
  }
  save() {
    return this.t;
  }
  load(s: unknown) {
    this.t = (s as number) ?? 0;
    this.sweeping = false;
  }
}

// ------------------------------------------------------------------
// 거대한 손 (내리치기)
// ------------------------------------------------------------------
interface Slam {
  x: number;
  t: number;
  warn: number;
  hit: boolean;
}
export class Hands extends Entity {
  readonly type = 'hands';
  slams: Slam[] = [];
  constructor(public def: Extract<EntityDef, { type: 'hands' }>) {
    super(def.id);
  }
  /** x 에 손을 내리친다 (warn 초 뒤) */
  slam(x: number, warn = 0.85) {
    this.slams.push({ x, t: 0, warn, hit: false });
  }
  update(g: GameAPI, dt: number) {
    const pb = g.player.body;
    for (const s of this.slams) {
      s.t += dt;
      if (!s.hit && s.t >= s.warn) {
        s.hit = true;
        audio.play('slam', { vol: 0.8, rate: 0.6 });
        audio.play('paper_crush', { vol: 0.7, rate: 0.6 });
        g.shake(0.35);
        g.parts.paper(s.x, -10, 12, 1.2);
      }
      // 내리친 뒤 0.45초 동안 그 자리에 있으면 지워진다
      if (s.hit && s.t < s.warn + 0.45 && Math.abs(pb.x - s.x) < 92 && !g.isDead()) g.kill('erase');
    }
    this.slams = this.slams.filter((s) => s.t < s.warn + 0.9);
  }
  drawFront(ctx: CanvasRenderingContext2D, g: GameAPI) {
    for (const s of this.slams) {
      // 그림자 (점점 짙어지며 좁아진다)
      const k = clamp(s.t / s.warn);
      ctx.save();
      ctx.globalAlpha = 0.15 + 0.45 * k;
      ctx.fillStyle = '#6e6d69';
      ctx.beginPath();
      ctx.ellipse(s.x, 2, lerp(170, 100, k), lerp(16, 10, k), 0, 0, TAU);
      ctx.fill();
      ctx.restore();
      // 손: 위에서 내려와 땅을 짚는다
      const after = s.t - s.warn;
      const y = after < 0 ? lerp(-1400, -700, ease.inQuad(k)) : after < 0.08 ? lerp(-700, 0, after / 0.08) : after < 0.55 ? 0 : lerp(0, -1400, ease.inQuad((after - 0.55) / 0.35));
      if (y < -1350) continue;
      // 활짝 편 손이 손끝부터 땅을 짚는다 (팔뚝은 위로)
      const size = 175;
      const len = size * 1.12;
      drawBlankHand(ctx, s.x, y - len, size, 0, g.t, { curl: after < 0 ? 0.15 : 0.05, spread: after < 0 ? 1.0 : 1.5, arm: 1300 });
    }
  }
  save() {
    return null;
  }
  load() {
    this.slams = [];
  }
}

// ------------------------------------------------------------------
// 시선: 앞을 막아선 여백이 훑어본다
// ------------------------------------------------------------------
export class Gaze extends Entity {
  readonly type = 'gaze';
  active = false;
  /** 0..1 나타남 */
  shown = 0;
  angle = 0;
  private t = 0;
  constructor(public def: Extract<EntityDef, { type: 'gaze' }>) {
    super(def.id);
    this.angle = def.mid;
  }
  update(g: GameAPI, dt: number) {
    const d = this.def;
    this.shown = clamp(this.shown + (this.active ? dt / 1.2 : -dt / 0.8));
    if (this.shown <= 0) return;
    this.t += dt;
    this.angle = d.mid + d.amp * Math.sin((this.t / d.period) * TAU);
    if (!this.active || this.shown < 0.95) return;
    const p = g.player;
    if (p.frozen || g.isDead()) return;
    for (const yy of [p.y - 20, p.y - 70, p.y - 125]) {
      const dx = p.x - d.x,
        dy = yy - d.y;
      let da = Math.atan2(dy, dx) - this.angle;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      if (Math.abs(da) < d.half) {
        audio.play('sting2', { vol: 0.8 });
        g.kill('erase');
        return;
      }
    }
  }
  /** 저 멀리 거대한 여백과 그 시선 */
  drawBack(_ctx: CanvasRenderingContext2D, g: GameAPI) {
    if (this.shown <= 0.01) return;
    const d = this.def;
    const s = app.screen;
    const L = app.fxLayer;
    s.clearLayer(L);
    g.cam.apply(L.ctx, s, 1);
    const P = rigidPose();
    P.turn = -0.6;
    P.headTilt = (this.angle - d.mid) * 1.2 + 0.25;
    P.lean = 0.12;
    P.arms[0].a = 0.3 + Math.sin(g.t * 0.8) * 0.05;
    P.arms[1].a = -0.2;
    P.arms[0].b = P.arms[1].b = 0.2;
    drawBlankFigure(L.ctx, P, d.x + 120, d.y + 1000, 1150, g.t, this.shown);
    s.composite(L);
  }
  drawFront(ctx: CanvasRenderingContext2D) {
    if (this.shown <= 0.01) return;
    const d = this.def;
    const len = 2600;
    ctx.save();
    ctx.globalAlpha = 0.35 * this.shown;
    const grad = ctx.createRadialGradient(d.x, d.y, 20, d.x, d.y, len);
    grad.addColorStop(0, 'rgba(120,120,116,0.9)');
    grad.addColorStop(1, 'rgba(120,120,116,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.arc(d.x, d.y, len, this.angle - d.half, this.angle + d.half);
    ctx.closePath();
    ctx.fill();
    // 연필 테두리
    ctx.globalAlpha = 0.5 * this.shown;
    ctx.strokeStyle = '#3a3a38';
    ctx.lineWidth = 2;
    for (const a of [this.angle - d.half, this.angle + d.half]) {
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + Math.cos(a) * len, d.y + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.restore();
    void hash1;
  }
  save() {
    return null;
  }
  load() {
    this.active = false;
    this.shown = 0;
    this.t = 0;
  }
}
