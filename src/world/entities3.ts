/**
 * 아이콘 공장 엔티티: 컨베이어, 프레스, 검수대, 승강 발판, 거대한 도장, 화물열차
 */
import { Entity } from './entities';
import { Box, Resident } from './entities';
import type { Solid } from './physics';
import type { EntityDef, GameAPI } from './types';
import type { Light } from './entities2';
import { audio } from '../core/audio';
import { clamp, ease, lerp, TAU } from '../core/math';
import { INK } from '../gfx/ground';
import { drawFigure, rigidPose, defaultStyle } from '../gfx/figure';

const near = (g: GameAPI, x: number, r = 1100) => clamp(1 - Math.abs(x - g.player.x) / r);

// ------------------------------------------------------------------
// 컨베이어
// ------------------------------------------------------------------
export class Conveyor extends Entity {
  readonly type = 'conveyor';
  started: boolean;
  private off = 0;
  constructor(public def: Extract<EntityDef, { type: 'conveyor' }>) {
    super(def.id);
    this.started = def.auto !== false;
    this.solid = { x: def.x0, y: def.y, w: def.x1 - def.x0, h: Math.max(30, -def.y), owner: this, look: 'conveyor', belt: 0 };
  }
  start() {
    if (this.started) return;
    this.started = true;
    audio.play('machine', { vol: 0.7, rate: 0.7 });
    audio.play('clank', { vol: 0.6 });
  }
  update(g: GameAPI, dt: number) {
    const sp = this.started ? this.def.speed : 0;
    this.solid!.belt = sp;
    this.off += sp * dt;
    // 기계 속으로 들어간 굳은 주민
    const sink = this.def.sink;
    if (sink !== undefined && this.started) {
      for (const e of (g as unknown as { ents: Entity[] }).ents) {
        if (e instanceof Resident && e.state === 'frozen' && Math.abs(e.body.y - this.def.y) < 4 && e.body.x > sink && e.body.x < this.def.x1 + 40) {
          e.lose(g);
          audio.play('slam', { vol: 0.8 * near(g, e.body.x, 1600) + 0.2 });
          audio.play('paper_crush', { vol: 0.6 });
          g.shake(0.3);
        }
      }
    }
    const v = this.started ? near(g, (this.def.x0 + this.def.x1) / 2, 900 + (this.def.x1 - this.def.x0) / 2) * 0.45 : 0;
    const l = audio.getLoop('belt_' + this.id);
    if (v > 0.01 && !l) audio.loop('belt_' + this.id, 'conveyor', v, 0.5, 'sfx');
    else if (l) l.setVol(v, 0.3);
  }
  drawBack(ctx: CanvasRenderingContext2D) {
    const s = this.solid!;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, s.w, Math.min(s.h, 46), 23);
    ctx.fill();
    if (s.h > 46) ctx.fillRect(s.x + 20, s.y + 30, s.w - 40, s.h - 30);
    // 움직이는 벨트 무늬
    ctx.fillStyle = '#9a9a96';
    const step = 46;
    const o = ((this.off % step) + step) % step;
    for (let x = s.x + 14 + o; x < s.x + s.w - 14; x += step) ctx.fillRect(x, s.y + 3, 18, 4);
    // 롤러
    ctx.fillStyle = '#3c3c3a';
    for (let x = s.x + 23; x < s.x + s.w - 10; x += 70) {
      ctx.beginPath();
      ctx.arc(x, s.y + 23, 9, 0, TAU);
      ctx.fill();
    }
  }
  save() {
    return this.started;
  }
  load(s: boolean) {
    this.started = s;
    audio.stopLoop('belt_' + this.id, 0.2);
  }
}

// ------------------------------------------------------------------
// 프레스
// ------------------------------------------------------------------
export class Press extends Entity {
  readonly type = 'press';
  bottom: number;
  jammed: number | null = null;
  private shakeX = 0;
  private wasDown = false;
  private hissed = false;
  constructor(public def: Extract<EntityDef, { type: 'press' }>) {
    super(def.id);
    this.bottom = def.upY;
    this.solid = { x: def.x - def.w / 2, y: 0, w: def.w, h: this.H, owner: this, look: 'press' };
    this.sync();
  }
  get H() {
    return this.def.head ?? 200;
  }
  private sync() {
    const s = this.solid!;
    s.x = this.def.x - this.def.w / 2 + this.shakeX;
    s.y = this.bottom - this.H;
  }
  update(g: GameAPI, dt: number) {
    const d = this.def;
    if (this.jammed !== null) {
      this.bottom = this.jammed;
      this.shakeX = Math.sin(g.t * 50) * 1.2;
      this.sync();
      return;
    }
    const T = d.period;
    const u = (((g.t + (d.phase ?? 0)) % T) + T) % T;
    const rise = 0.6,
      hold = 0.3,
      slam = 0.11;
    const wait = T - rise - hold - slam;
    let k = 0;
    this.shakeX = 0;
    if (u < wait) {
      if (u > wait - 0.45) {
        const q = (u - (wait - 0.45)) / 0.45;
        this.shakeX = Math.sin(g.t * 70) * 2.5 * q;
        if (!this.hissed) {
          this.hissed = true;
          const v = near(g, d.x, 900);
          if (v > 0.05) audio.play(Math.random() < 0.5 ? 'hiss1' : 'hiss2', { vol: 0.35 * v, rate: 1.3 });
        }
      }
    } else if (u < wait + slam) k = ease.inQuad((u - wait) / slam);
    else if (u < wait + slam + hold) k = 1;
    else k = 1 - ease.inOutSine((u - wait - slam - hold) / rise);
    if (u < wait - 0.45) this.hissed = false;
    const prev = this.bottom;
    let target = lerp(d.upY, d.floor, k);
    // 밑에 상자가 있으면 걸려서 멈춘다
    for (const e of (g as unknown as { ents: Entity[] }).ents) {
      if (!(e instanceof Box)) continue;
      const bs = e.solid!;
      if (bs.x + bs.w > d.x - d.w / 2 + 6 && bs.x < d.x + d.w / 2 - 6 && target > bs.y && prev <= bs.y + 3) {
        this.jammed = bs.y;
        target = bs.y;
        audio.play('clank', { vol: 0.9 });
        audio.play('metal_fall', { vol: 0.5, rate: 1.4 });
        g.shake(0.35);
        g.noise(d.x, d.floor, 800);
      }
    }
    this.bottom = target;
    this.sync();
    const down = k > 0.97;
    if (down && !this.wasDown) {
      const v = near(g, d.x, 1200);
      audio.play('slam', { vol: 0.25 + 0.65 * v, rate: d.big ? 0.7 : 1 });
      if (v > 0.3) audio.play('land_hard', { vol: 0.5 * v, rate: d.big ? 0.6 : 0.9 });
      g.shake(0.35 * v * (d.big ? 1.6 : 1));
      g.noise(d.x, d.floor, 700);
      if (v > 0.2) g.parts.puff(d.x, d.floor, 10, d.big ? 1.6 : 1.1);
    }
    this.wasDown = down;
    // 깔림
    const p = g.player.body;
    if (this.bottom > prev + 0.5 || down) {
      const ox = Math.abs(p.x - d.x) < d.w / 2 + p.w / 2 - 8;
      if (ox && p.y - p.h + 8 < this.bottom && p.y > this.bottom - this.H) g.kill('crush');
    }
  }
  drawBack(ctx: CanvasRenderingContext2D) {
    const d = this.def;
    const s = this.solid!;
    // 피스톤 기둥 (천장까지)
    ctx.fillStyle = INK;
    ctx.fillRect(d.x - 14 + this.shakeX, s.y - 2000, 28, 2000);
    ctx.fillRect(d.x - d.w / 2 - 20, d.upY - this.H - 140, d.w + 40, 60);
    // 머리
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, s.w, s.h, 8);
    ctx.fill();
    ctx.fillStyle = '#4b4b48';
    for (let i = 0; i < 3; i++) ctx.fillRect(s.x + 14, s.y + 22 + i * 18, s.w - 28, 6);
    // 경고 줄무늬
    ctx.fillStyle = '#d4d4d0';
    for (let x = s.x + 6; x < s.x + s.w - 14; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, s.y + s.h - 4);
      ctx.lineTo(x + 12, s.y + s.h - 4);
      ctx.lineTo(x + 22, s.y + s.h - 16);
      ctx.lineTo(x + 10, s.y + s.h - 16);
      ctx.closePath();
      ctx.fill();
    }
    if (d.big) {
      // 도장 면: 사람 픽토그램이 새겨져 있다
      ctx.save();
      ctx.globalAlpha = 0.9;
      const L = rigidPose();
      drawFigure(ctx, L, d.x, s.y + s.h - 26, s.h * 0.6, { ...defaultStyle(), color: '#5a5a57', farColor: '#5a5a57' });
      ctx.restore();
    }
  }
  save() {
    return this.jammed;
  }
  load(s: number | null) {
    this.jammed = s;
  }
}

// ------------------------------------------------------------------
// 검수대
// ------------------------------------------------------------------
export class Scanner extends Entity {
  readonly type = 'scanner';
  private alarmT = 0;
  constructor(public def: Extract<EntityDef, { type: 'scanner' }>) {
    super(def.id);
  }
  update(g: GameAPI, dt: number) {
    const d = this.def;
    const p = g.player;
    const b = p.body;
    this.alarmT = Math.max(0, this.alarmT - dt);
    if (g.isDead()) return;
    const inside = Math.abs(b.x - d.x) < 16 + b.w / 2 && b.y > d.top && b.y - b.h < d.bottom;
    if (inside && !p.frozen) {
      this.alarmT = 1.5;
      audio.play('sting2', { vol: 0.8 });
      audio.loop('alarm', 'alarm_loop', 0.6, 0.1, 'sfx');
      setTimeout(() => audio.stopLoop('alarm', 1.5), 1600);
      g.kill('erase');
    }
  }
  drawBack(ctx: CanvasRenderingContext2D, g: GameAPI) {
    const d = this.def;
    const a = 0.32 + Math.sin(g.t * 9) * 0.06 + this.alarmT * 0.3;
    const grad = ctx.createLinearGradient(d.x - 22, 0, d.x + 22, 0);
    grad.addColorStop(0, 'rgba(255,255,250,0)');
    grad.addColorStop(0.5, `rgba(255,255,250,${a})`);
    grad.addColorStop(1, 'rgba(255,255,250,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(d.x - 22, d.top, 44, d.bottom - d.top);
    // 내려가는 주사선
    ctx.fillStyle = `rgba(255,255,250,${0.55 + this.alarmT * 0.3})`;
    const h = d.bottom - d.top;
    for (let i = 0; i < 4; i++) {
      const y = d.top + (((g.t * 260 + (i * h) / 4) % h) + h) % h;
      ctx.fillRect(d.x - 18, y, 36, 2);
    }
    // 위아래 발광기
    ctx.fillStyle = INK;
    ctx.fillRect(d.x - 30, d.top - 30, 60, 30);
    ctx.fillRect(d.x - 30, d.bottom, 60, 14);
    ctx.fillStyle = '#e8e8e4';
    ctx.fillRect(d.x - 18, d.top - 6, 36, 4);
  }
  lights(): Light[] {
    const d = this.def;
    return [{ kind: 'beam', x: d.x, top: d.top, bottom: d.bottom, w: 30, a: 0.7 }];
  }
}

// ------------------------------------------------------------------
// 승강 발판
// ------------------------------------------------------------------
export class Lift extends Entity {
  readonly type = 'lift';
  y: number;
  constructor(public def: Extract<EntityDef, { type: 'lift' }>) {
    super(def.id);
    this.y = def.y0;
    this.solid = { x: def.x - def.w / 2, y: def.y0, w: def.w, h: 22, oneway: true, owner: this, carry: true, look: 'lift' };
  }
  update(g: GameAPI) {
    const d = this.def;
    const k = 0.5 - 0.5 * Math.cos(((g.t + (d.phase ?? 0)) / d.period) * TAU);
    this.y = lerp(d.y0, d.y1, k);
    this.solid!.y = this.y;
  }
  drawBack(ctx: CanvasRenderingContext2D) {
    const d = this.def;
    ctx.fillStyle = INK;
    ctx.fillRect(d.x - d.w / 2 + 10, this.y - 2000, 4, 2000);
    ctx.fillRect(d.x + d.w / 2 - 14, this.y - 2000, 4, 2000);
    ctx.beginPath();
    ctx.roundRect(d.x - d.w / 2, this.y, d.w, 22, 4);
    ctx.fill();
    ctx.fillRect(d.x - d.w / 2, this.y - 70, 6, 70);
    ctx.fillRect(d.x + d.w / 2 - 6, this.y - 70, 6, 70);
    ctx.fillRect(d.x - d.w / 2, this.y - 72, d.w, 5);
  }
}

// ------------------------------------------------------------------
// 거대한 도장 (추격자)
// ------------------------------------------------------------------
export class GiantStamp extends Entity {
  readonly type = 'giant';
  x: number;
  active = false;
  private t = 0;
  private cycle = 0;
  k = 0;
  private wasDown = false;
  readonly W = 330;
  readonly HH = 250;
  constructor(public def: Extract<EntityDef, { type: 'giant' }>) {
    super(def.id);
    this.x = def.x;
  }
  activate(x?: number) {
    this.active = true;
    this.t = 0;
    this.cycle = 0.3;
    if (x !== undefined) this.x = x;
  }
  get bottom() {
    return lerp(this.def.rail + 420, this.def.floor, this.k);
  }
  update(g: GameAPI, dt: number) {
    if (!this.active) return;
    this.t += dt;
    const p = g.player;
    const gap = p.x - this.x;
    const base = Math.min(305, 110 + this.t * 80);
    const sp = gap > 1000 ? 560 : gap > 720 ? base * 1.3 : base;
    if (this.k < 0.2) this.x += sp * dt;
    const T = 1.25;
    this.cycle += dt;
    const u = this.cycle % T;
    if (u < 0.42) this.k = 1 - ease.inOutSine(u / 0.42);
    else if (u < 0.8) this.k = 0;
    else if (u < 0.92) this.k = ease.inQuad((u - 0.8) / 0.12);
    else this.k = 1;
    const down = this.k > 0.97;
    if (down && !this.wasDown) {
      const v = near(g, this.x, 1400);
      audio.play('slam', { vol: 0.5 + 0.5 * v, rate: 0.55 });
      audio.play('land_hard', { vol: 0.8 * v, rate: 0.5 });
      g.shake(0.25 + 0.5 * v);
      g.parts.puff(this.x, this.def.floor, 20, 2);
    }
    this.wasDown = down;
    if (this.k > 0.5 && !g.isDead()) {
      const b = p.body;
      if (Math.abs(b.x - this.x) < this.W / 2 + b.w / 2 - 10 && b.y - b.h < this.bottom) g.kill('crush');
    }
  }
  drawBack(ctx: CanvasRenderingContext2D, g: GameAPI) {
    if (!this.active) return;
    const rail = this.def.rail;
    const x = this.x;
    const bot = this.bottom;
    const top = bot - this.HH;
    ctx.fillStyle = INK;
    // 레일과 대차
    ctx.fillRect(x - 220, rail - 20, 440, 40);
    ctx.fillRect(x - 40, rail, 80, top - rail + 10);
    for (const wx of [x - 160, x - 60, x + 60, x + 160]) {
      ctx.beginPath();
      ctx.arc(wx, rail - 20, 16, 0, TAU);
      ctx.fill();
    }
    // 도장 머리
    ctx.beginPath();
    ctx.roundRect(x - this.W / 2, top, this.W, this.HH, 12);
    ctx.fill();
    ctx.fillStyle = '#454542';
    ctx.fillRect(x - this.W / 2 + 18, top + 18, this.W - 36, 10);
    ctx.fillRect(x - this.W / 2 + 18, top + 40, this.W - 36, 10);
    // 새겨진 사람 모양
    drawFigure(ctx, rigidPose(), x, bot - 20, this.HH * 0.66, { ...defaultStyle(), color: '#6b6b67', farColor: '#6b6b67' });
    void g;
  }
  save() {
    return null;
  }
  load() {
    this.active = false;
    this.x = this.def.x;
    this.k = 0;
  }
}

// ------------------------------------------------------------------
// 화물열차
// ------------------------------------------------------------------
export class Train extends Entity {
  readonly type = 'train';
  x: number;
  vx = 0;
  dx = 0;
  moving = false;
  solidList: Solid[];
  constructor(public def: Extract<EntityDef, { type: 'train' }>) {
    super(def.id);
    this.x = def.x;
    this.solidList = [
      { x: 0, y: 0, w: 380, h: 30, owner: this, carry: true, look: 'invisible' },
      { x: 0, y: 0, w: 24, h: 300, owner: this, look: 'invisible' },
    ];
    this.sync();
  }
  private sync() {
    const y = this.def.y;
    this.solidList[0].x = this.x + 20;
    this.solidList[0].y = y;
    this.solidList[1].x = this.x + 400;
    this.solidList[1].y = y - 300;
  }
  depart() {
    this.moving = true;
  }
  update(_g: GameAPI, dt: number) {
    this.dx = 0;
    if (!this.moving) return;
    this.vx = Math.min(700, this.vx + 90 * dt);
    this.dx = this.vx * dt;
    this.x += this.dx;
    this.sync();
  }
  drawBack(ctx: CanvasRenderingContext2D) {
    const y = this.def.y;
    const x = this.x;
    ctx.fillStyle = INK;
    // 화차 1 (문이 열려 있다): 안쪽은 어둡지 않은 회색
    ctx.fillRect(x, y - 320, 424, 330);
    ctx.fillStyle = '#6e6e6a';
    ctx.fillRect(x + 24, y - 290, 376, 290);
    ctx.fillStyle = INK;
    // 화차 2, 기관차
    ctx.fillRect(x + 450, y - 320, 424, 330);
    ctx.fillRect(x + 900, y - 360, 360, 370);
    ctx.fillRect(x + 1180, y - 470, 60, 120);
    ctx.fillStyle = '#d4d4d0';
    ctx.fillRect(x + 940, y - 320, 70, 60);
    // 바퀴
    ctx.fillStyle = INK;
    for (let i = 0; i < 8; i++) {
      const wx = x + 60 + i * 150;
      ctx.beginPath();
      ctx.arc(wx, y + 40, 30, 0, TAU);
      ctx.fill();
    }
    ctx.fillRect(x - 10, y + 10, 1280, 20);
  }
  drawFront(ctx: CanvasRenderingContext2D) {
    // 화차 문틀 (플레이어 앞쪽 기둥)
    const y = this.def.y;
    ctx.fillStyle = INK;
    ctx.fillRect(this.x, y - 320, 20, 330);
    ctx.fillRect(this.x, y - 320, 424, 26);
  }
  save() {
    return null;
  }
  load() {
    this.moving = false;
    this.vx = 0;
    this.x = this.def.x;
    this.sync();
  }
}
