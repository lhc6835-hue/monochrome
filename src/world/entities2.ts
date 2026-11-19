/**
 * 지하 배수로에서 등장하는 엔티티: 물, 레버, 사다리, 메아리, 빛줄기
 */
import { Entity, type Prompt } from './entities';
import { Body, moveBody } from './physics';
import type { EntityDef, GameAPI } from './types';
import { audio } from '../core/audio';
import { clamp, damp, hash1, noise1, rand, TAU } from '../core/math';
import { INK } from '../gfx/ground';
import { drawBlankFigure } from '../gfx/blank';
import { applyRunCycle, rigidPose, type Pose } from '../gfx/figure';

export type Light = { kind: 'circle'; x: number; y: number; r: number; a: number } | { kind: 'beam'; x: number; top: number; bottom: number; w: number; a: number };

// ------------------------------------------------------------------
// 물
// ------------------------------------------------------------------
export class Water extends Entity {
  readonly type = 'water';
  level: number;
  /** 큰 파도: 수면이 x 근처에서 amp 만큼 부풀어 오른 물마루 (그림만, 폭 w) */
  surge: { x: number; amp: number; w: number } | null = null;
  private moving = false;
  constructor(public def: Extract<EntityDef, { type: 'water' }>) {
    super(def.id);
    this.level = def.start ?? def.low;
  }
  get x0() {
    return this.def.x0;
  }
  get x1() {
    return this.def.x1;
  }
  get floor() {
    return this.def.floor;
  }
  update(g: GameAPI, dt: number) {
    const d = this.def;
    const target = d.signal && g.signals.get(d.signal) && d.high !== undefined ? d.high : d.low;
    const sp = (d.speed ?? 55) * dt;
    const was = this.moving;
    this.moving = Math.abs(target - this.level) > 1;
    this.level += clamp(target - this.level, -sp, sp);
    if (this.moving && !was) {
      audio.loop('water_' + this.id, 'water_loop', 0.5, 0.6, 'sfx');
      audio.play('machine', { vol: 0.4, rate: 0.8 });
    }
    if (!this.moving && was) audio.stopLoop('water_' + this.id, 1);
  }
  drawFront(ctx: CanvasRenderingContext2D, g: GameAPI) {
    const d = this.def;
    const L = this.level;
    if (L >= d.floor) return;
    ctx.save();
    // 물 몸통
    const grad = ctx.createLinearGradient(0, L, 0, d.floor);
    grad.addColorStop(0, 'rgba(38,40,42,0.80)');
    grad.addColorStop(1, 'rgba(8,9,10,0.95)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(d.x0, d.floor);
    const step = 24;
    const sg = this.surge && this.surge.amp > 1 ? this.surge : null;
    const surf = (x: number) => this.surfaceY(x, g.t);
    for (let x = d.x0; x <= d.x1 + 0.1; x += step) ctx.lineTo(Math.min(x, d.x1), surf(x));
    ctx.lineTo(d.x1, d.floor);
    ctx.closePath();
    ctx.fill();
    // 수면 하이라이트
    ctx.strokeStyle = 'rgba(200,200,196,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = d.x0; x <= d.x1 + 0.1; x += step) {
      const y = surf(x);
      if (x === d.x0) ctx.moveTo(x, y);
      else ctx.lineTo(Math.min(x, d.x1), y);
    }
    ctx.stroke();
    // 물마루의 하얀 거품
    if (sg && sg.amp > 30) {
      ctx.strokeStyle = `rgba(244,244,240,${Math.min(0.95, sg.amp / 150)})`;
      ctx.lineCap = 'round';
      ctx.lineWidth = 7;
      ctx.beginPath();
      let on = false;
      for (let x = sg.x - sg.w * 1.1; x <= sg.x + sg.w * 1.6; x += 12) {
        if (x < d.x0 || x > d.x1) continue;
        const y = surf(x);
        if (!on) {
          ctx.moveTo(x, y);
          on = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(244,244,240,0.8)';
      for (let i = 0; i < 18; i++) {
        const x = sg.x - sg.w * 0.4 + noise1(i * 7.1 + g.t * 3) * sg.w * 0.9;
        ctx.beginPath();
        ctx.arc(x, surf(x) - 6 - Math.abs(noise1(i * 3.3 + g.t * 5)) * 30, 3 + (i % 3) * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  /** 수면 높이 (잔물결 + 큰 파도 물마루) */
  surfaceY(x: number, t: number) {
    let y = this.level + Math.sin(x * 0.03 + t * 2.2) * 2.5 + noise1(x * 0.01 + t * 0.6) * 2;
    const sg = this.surge;
    if (sg && sg.amp > 1) {
      // 물마루: 앞(왼쪽)은 가파르고 뒤는 완만하게
      const u = (x - sg.x) / sg.w;
      const bump = u < 0 ? Math.exp(-u * u * 2.2) : Math.exp(-u * u * 0.45);
      y -= sg.amp * bump * (1 + 0.06 * Math.sin(x * 0.05 + t * 9));
    }
    return y;
  }
  save() {
    return this.level;
  }
  load(s: number) {
    this.level = s;
    this.moving = false;
    audio.stopLoop('water_' + this.id, 0.2);
  }
}

// ------------------------------------------------------------------
// 레버
// ------------------------------------------------------------------
export class Lever extends Entity {
  readonly type = 'lever';
  on: boolean;
  private ang: number;
  constructor(public def: Extract<EntityDef, { type: 'lever' }>) {
    super(def.id);
    this.on = !!def.on;
    this.ang = this.on ? 0.6 : -0.6;
    this.interactRange = 125;
  }
  get y() {
    return this.def.y ?? 0;
  }
  interactPos(): [number, number] {
    return [this.def.x, this.y - 110];
  }
  prompt(): Prompt {
    return { text: '레버 당기기', hold: 0 };
  }
  interact(g: GameAPI) {
    this.on = !this.on;
    audio.play('lever', { vol: 0.7 });
    audio.play('clank', { vol: 0.5, delay: 0.12 });
    g.noise(this.def.x, this.y, 750);
    g.shake(0.12);
  }
  update(g: GameAPI, dt: number) {
    if (this.on) g.signals.set(this.def.signal, true);
    this.ang = damp(this.ang, this.on ? 0.6 : -0.6, 14, dt);
  }
  drawBack(ctx: CanvasRenderingContext2D) {
    const x = this.def.x,
      y = this.y;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.roundRect(x - 30, y - 26, 60, 26, 6);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y - 20);
    ctx.rotate(this.ang);
    ctx.fillRect(-5, -76, 10, 76);
    ctx.beginPath();
    ctx.arc(0, -80, 13, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = this.on ? '#d8d8d5' : '#4a4a48';
    ctx.fillRect(x - 18, y - 16, 36, 4);
  }
  lights(): Light[] {
    return [{ kind: 'circle', x: this.def.x, y: this.y - 60, r: 70, a: 0.35 }];
  }
  save() {
    return this.on;
  }
  load(s: boolean) {
    this.on = s;
  }
}

// ------------------------------------------------------------------
// 사다리
// ------------------------------------------------------------------
export class Ladder extends Entity {
  readonly type = 'ladder';
  constructor(public def: Extract<EntityDef, { type: 'ladder' }>) {
    super(def.id);
  }
  get x() {
    return this.def.x;
  }
  get top() {
    return this.def.top;
  }
  get bottom() {
    return this.def.bottom;
  }
  drawBack(ctx: CanvasRenderingContext2D) {
    const { x, top, bottom } = this.def;
    ctx.fillStyle = INK;
    ctx.fillRect(x - 30, top - 30, 8, bottom - top + 30);
    ctx.fillRect(x + 22, top - 30, 8, bottom - top + 30);
    // 가로대: 바닥에서 34px 마다 (플레이어가 한 칸씩 딛는 간격과 같다)
    for (let y = bottom - 34; y > top - 30; y -= 34) ctx.fillRect(x - 26, y - 3, 52, 7);
  }
  lights(): Light[] {
    return [];
  }
}

// ------------------------------------------------------------------
// 빛줄기
// ------------------------------------------------------------------
export class Shaft extends Entity {
  readonly type = 'shaft';
  constructor(public def: Extract<EntityDef, { type: 'shaft' }>) {
    super(def.id);
  }
  lights(): Light[] {
    const d = this.def;
    return [{ kind: 'beam', x: d.x, top: d.top ?? -700, bottom: 60, w: d.w ?? 130, a: d.bright ?? 0.85 }];
  }
  /** 어둠 위에 그려지는 빛줄기 자체 (먼지가 보이는 빛) */
  drawBeam(ctx: CanvasRenderingContext2D, g: GameAPI) {
    const d = this.def;
    const top = d.top ?? -700;
    const w = d.w ?? 130;
    const a = (d.bright ?? 0.85) * (0.85 + Math.sin(g.t * 0.7 + d.x) * 0.1);
    const grad = ctx.createLinearGradient(0, top, 0, 40);
    grad.addColorStop(0, `rgba(235,235,228,${0.22 * a})`);
    grad.addColorStop(1, 'rgba(235,235,228,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(d.x - w / 2, top);
    ctx.lineTo(d.x + w / 2, top);
    ctx.lineTo(d.x + w * 0.95, 40);
    ctx.lineTo(d.x - w * 0.95, 40);
    ctx.closePath();
    ctx.fill();
    // 떠다니는 먼지
    ctx.fillStyle = `rgba(240,240,235,${0.5 * a})`;
    for (let i = 0; i < 14; i++) {
      const k = (hash1(i * 7.3 + d.x) + g.t * 0.03 * (0.5 + hash1(i))) % 1;
      const yy = top + k * (40 - top);
      const spread = w / 2 + (w * 0.45 * (yy - top)) / (40 - top);
      const xx = d.x + (hash1(i * 3.1 + d.x) - 0.5) * 2 * spread * 0.9 + Math.sin(g.t + i) * 4;
      ctx.beginPath();
      ctx.arc(xx, yy, 1.4 + hash1(i * 5) * 1.2, 0, TAU);
      ctx.fill();
    }
  }
  drawBack(ctx: CanvasRenderingContext2D) {
    // 천장 격자
    const d = this.def;
    const top = d.top ?? -700;
    const w = d.w ?? 130;
    ctx.fillStyle = '#d9d9d4';
    ctx.fillRect(d.x - w / 2, top - 14, w, 14);
    ctx.fillStyle = INK;
    for (let x = d.x - w / 2 + 8; x < d.x + w / 2; x += 16) ctx.fillRect(x, top - 14, 6, 14);
  }
}

// ------------------------------------------------------------------
// 메아리 — 눈이 없다. 소리만 듣는다.
// ------------------------------------------------------------------
type EState = 'patrol' | 'alert' | 'search' | 'hunt' | 'dissolve' | 'gone' | 'dormant';

export class Echo extends Entity {
  readonly type = 'echo';
  body: Body;
  state: EState;
  dir = 1;
  target = 0;
  private listenT = 0;
  private searchT = 0;
  private phase = 0;
  alpha = 1;
  private lastHeard = 0;
  private stepI = 0;
  huntSpeed = 322;
  private hopCd = 0;
  pose: Pose = rigidPose();
  constructor(public def: Extract<EntityDef, { type: 'echo' }>) {
    super(def.id);
    this.body = new Body(def.x, def.y ?? 0, 34, 138);
    this.state = def.dormant ? 'dormant' : def.hunt ? 'hunt' : 'patrol';
    this.dir = hash1(def.x) < 0.5 ? -1 : 1;
  }
  get alive() {
    return this.state !== 'gone' && this.state !== 'dissolve' && this.state !== 'dormant';
  }
  wake(hunt: boolean, x?: number) {
    this.state = hunt ? 'hunt' : 'alert';
    this.alpha = 1;
    if (x !== undefined) this.target = x;
  }
  hear(x: number, y: number, r: number, t: number) {
    if (!this.alive) return;
    const b = this.body;
    if (Math.abs(x - b.x) > r || Math.abs(y - b.y) > 300) return;
    this.lastHeard = t;
    if (this.state === 'hunt') {
      this.target = x;
      return;
    }
    if (this.state === 'patrol') {
      this.listenT = 0.4;
      audio.play('weird1', { vol: 0.35, rate: 1.4 + Math.random() * 0.3 });
    }
    this.state = 'alert';
    this.target = x;
  }
  update(g: GameAPI, dt: number) {
    const b = this.body;
    if (this.state === 'gone' || this.state === 'dormant') return;
    if (this.state === 'dissolve') {
      this.alpha -= dt * 1.4;
      if (Math.random() < 0.5) g.parts.paper(b.x, b.y - 70 + rand(-40, 40), 1, 0.4);
      if (this.alpha <= 0) this.state = 'gone';
      return;
    }
    let vx = 0;
    switch (this.state) {
      case 'patrol':
        if (b.x > this.def.x1) this.dir = -1;
        if (b.x < this.def.x0) this.dir = 1;
        vx = this.dir * 68;
        break;
      case 'alert':
        this.listenT -= dt;
        if (this.listenT <= 0) {
          const d = this.target - b.x;
          if (Math.abs(d) < 16 || b.hitL || b.hitR) {
            this.state = 'search';
            this.searchT = 1.8;
          } else vx = Math.sign(d) * 390;
        }
        break;
      case 'search':
        this.searchT -= dt;
        if (this.searchT <= 0) this.state = 'patrol';
        break;
      case 'hunt': {
        const d = this.target - b.x;
        const quiet = g.t - this.lastHeard > 1.5;
        if (Math.abs(d) > 12) vx = Math.sign(d) * (quiet ? 150 : this.huntSpeed);
        break;
      }
    }
    if (vx) this.dir = Math.sign(vx);
    b.vx = damp(b.vx, vx, 12, dt);
    b.vy = Math.min(1400, b.vy + 2500 * dt);
    moveBody(b, b.vx * dt, b.vy * dt, g.solids(), { ignore: this });
    if (b.onGround) b.vy = 0;
    // 낮은 턱은 넘는다 (뛰지는 못한다)
    this.hopCd = Math.max(0, this.hopCd - dt);
    if ((b.hitL || b.hitR) && b.onGround && this.hopCd <= 0 && Math.abs(vx) > 100) {
      b.vy = -620;
      this.hopCd = 0.7;
    }
    // 물에 잠기면 녹아 사라진다
    const w = g.waterAt(b.x);
    if (w && b.y - b.h * 0.45 > w.level) {
      this.state = 'dissolve';
      audio.play('erase', { vol: 0.6, rate: 1.2 });
      audio.play('splash2', { vol: 0.5 });
      g.parts.paper(b.x, w.level, 10, 0.8);
      return;
    }
    if (b.y > 1200) this.state = 'gone';
    // 발소리 (아주 조용한, 젖은 소리)
    const ph0 = this.phase;
    this.phase += (Math.abs(b.vx) * dt * Math.PI) / 110;
    if (Math.floor(ph0 / Math.PI) !== Math.floor(this.phase / Math.PI) && Math.abs(b.vx) > 40) {
      const dist = Math.abs(b.x - g.player.x);
      if (dist < 1000) audio.play(this.stepI++ % 2 ? 'drip1' : 'drip2', { vol: 0.25 * (1 - dist / 1000), rate: 1.6, vary: 0.1, pan: clamp((b.x - g.player.x) / 800, -1, 1) });
    }
    // 닿으면 지워진다 (굳어 있으면 지나친다)
    const p = g.player.body;
    if (!g.player.frozen && Math.abs(p.x - b.x) < (p.w + b.w) / 2 - 6 && p.y - p.h < b.y - 10 && p.y > b.y - b.h + 10) g.kill('erase');
  }
  computePose(t: number): Pose {
    const P = rigidPose();
    const sp = Math.abs(this.body.vx);
    P.turn = this.dir * 0.9;
    if (sp > 20) applyRunCycle(P, this.phase, clamp(sp / 330), this.dir);
    if (this.state === 'alert' && this.listenT > 0) {
      P.headTilt = Math.sin(t * 30) * 0.15;
      P.turn = 0;
    }
    if (this.state === 'search') {
      P.turn = Math.sin(t * 3) * 0.9;
      P.headTilt = Math.sin(t * 7) * 0.2;
      P.lean = 0.15;
    }
    if (this.state === 'patrol') P.headTilt = Math.sin(t * 1.3 + this.body.x * 0.01) * 0.12;
    return P;
  }
  drawEcho(ctx: CanvasRenderingContext2D, g: GameAPI) {
    if (this.state === 'gone' || this.state === 'dormant') return;
    this.pose = this.computePose(g.t);
    const b = this.body;
    drawBlankFigure(ctx, this.pose, b.x, b.y, 150, g.t + b.x, clamp(this.alpha) * 0.92);
  }
  lights(): Light[] {
    if (!this.alive && this.state !== 'dissolve') return [];
    return [{ kind: 'circle', x: this.body.x, y: this.body.y - 80, r: 110, a: 0.25 * clamp(this.alpha) }];
  }
  save() {
    return { x: this.body.x, y: this.body.y, s: this.state === 'alert' || this.state === 'search' ? 'patrol' : this.state };
  }
  load(s: { x: number; y: number; s: EState }) {
    this.body.x = s.x;
    this.body.y = s.y;
    this.body.vx = this.body.vy = 0;
    this.state = s.s;
    this.alpha = s.s === 'gone' ? 0 : 1;
  }
}
