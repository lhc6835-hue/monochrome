/**
 * 표지의 바다 (+ 여백의 땅에서도 쓰는 "빛이 닿아야 존재하는 발판")
 *  - 조수 (Tide): 정해진 주기로 물이 차고 빠진다. 썰물 유지 → 밀물 → 만조 유지 → 썰물.
 *  - 부표 (Buoy): 파도에 맞춰 오르내린다. 무거운 부표는 밟으면 가라앉는다.
 *  - 등대 불빛 (Beacon): 레버로 켜면 바다를 천천히 훑는다.
 *  - 빛의 발판 (LitPlank): 등대 불빛(또는 꽃빛)이 닿는 동안만 단단해진다. 벗어나면 잠시 뒤 안개/연필 선으로 흐려진다.
 */
import { Entity } from './entities';
import { Water } from './entities2';
import type { EntityDef, GameAPI } from './types';
import { audio } from '../core/audio';
import { clamp, hash1, lerp, TAU } from '../core/math';
import { INK } from '../gfx/ground';

// ------------------------------------------------------------------
// 조수
// ------------------------------------------------------------------
export class Tide extends Water {
  t: number;
  private wasRising = false;
  constructor(public tdef: Extract<EntityDef, { type: 'tide' }>) {
    super({ type: 'water', id: tdef.id, x0: tdef.x0, x1: tdef.x1, floor: tdef.floor, low: tdef.low, high: tdef.high, swim: tdef.swim });
    this.t = tdef.offset ?? 0;
    this.level = this.levelAt(this.t);
  }
  get timing(): [number, number, number, number] {
    return this.tdef.timing ?? [7, 3, 7, 3];
  }
  get period() {
    const [a, b, c, d] = this.timing;
    return a + b + c + d;
  }
  /** 0 = 썰물, 1 = 만조 */
  amountAt(t: number) {
    const [L, R, H] = this.timing;
    const u = ((t % this.period) + this.period) % this.period;
    if (u < L) return 0;
    if (u < L + R) return 0.5 - 0.5 * Math.cos(((u - L) / R) * Math.PI);
    if (u < L + R + H) return 1;
    return 0.5 + 0.5 * Math.cos(((u - L - R - H) / (this.period - L - R - H)) * Math.PI);
  }
  levelAt(t: number) {
    return lerp(this.tdef.low, this.tdef.high, this.amountAt(t));
  }
  /** 지금부터 밀물이 시작되기까지 */
  untilRise() {
    const [L] = this.timing;
    const u = ((this.t % this.period) + this.period) % this.period;
    return u < L ? L - u : this.period - u + L;
  }
  update(g: GameAPI, dt: number) {
    this.t += dt;
    const prev = this.level;
    this.level = this.levelAt(this.t);
    const rising = this.level < prev - 0.01;
    const moving = Math.abs(this.level - prev) > 0.01;
    if (moving && !this.wasRising && Math.abs(g.player.x - (this.def.x0 + this.def.x1) / 2) < 2600) {
      audio.loop('tide_' + this.id, 'water_loop', 0.45, 0.8, 'sfx');
      if (rising) audio.play('amb_rumble', { vol: 0.4, rate: 1.3 });
    }
    if (!moving && this.wasRising) audio.stopLoop('tide_' + this.id, 1.2);
    this.wasRising = moving;
  }
  /** 동굴 벽의 밧줄 눈금: 만조 높이와 썰물 높이, 지금 물이 어디로 가는지 */
  drawBack(ctx: CanvasRenderingContext2D, g: GameAPI) {
    const d = this.tdef;
    if (d.post === undefined) return;
    const x = d.post;
    ctx.fillStyle = INK;
    ctx.fillRect(x - 6, d.high - 60, 12, d.floor - d.high + 60);
    // 눈금
    ctx.fillStyle = '#d8d8d4';
    for (let y = d.high; y < d.floor; y += 40) ctx.fillRect(x - 10, y, 20, 3);
    ctx.fillStyle = '#efefec';
    ctx.fillRect(x - 16, d.high - 2, 32, 5);
    // 다음 밀물까지 남은 시간: 기둥 위의 매듭이 차례로 하얘진다
    const left = this.untilRise();
    const knots = 5;
    for (let i = 0; i < knots; i++) {
      const on = left < (this.timing[0] * (i + 1)) / knots;
      ctx.fillStyle = on ? '#f2f2ee' : '#3a3a38';
      ctx.beginPath();
      ctx.arc(x, d.high - 80 - i * 22, 7, 0, TAU);
      ctx.fill();
    }
    void g;
  }
  save() {
    return this.t;
  }
  load(s: unknown) {
    this.t = s as number;
    this.level = this.levelAt(this.t);
    audio.stopLoop('tide_' + this.id, 0.2);
  }
}

// ------------------------------------------------------------------
// 부표
// ------------------------------------------------------------------
export class Buoy extends Entity {
  readonly type = 'buoy';
  y: number;
  private sink = 0;
  private t = 0;
  constructor(public def: Extract<EntityDef, { type: 'buoy' }>) {
    super(def.id);
    this.y = def.y;
    const w = def.w ?? 110;
    this.solid = { x: def.x - w / 2, y: def.y, w, h: 26, oneway: true, owner: this, carry: true, look: 'buoy' };
  }
  update(g: GameAPI, dt: number) {
    const d = this.def;
    this.t += dt;
    const amp = d.amp ?? 22;
    const per = d.period ?? 2.6;
    // 위에 서 있는가
    const p = g.player.body;
    const w = d.w ?? 110;
    const on = p.onGround && Math.abs(p.y - this.y) < 6 && Math.abs(p.x - d.x) < w / 2 + 10;
    if (d.heavy) this.sink = clamp(this.sink + (on ? dt * 80 : -dt * 50), 0, 170);
    this.y = d.y + Math.sin((this.t / per) * TAU + (d.phase ?? 0)) * amp + this.sink;
    this.solid!.y = this.y;
  }
  drawBack(ctx: CanvasRenderingContext2D, g: GameAPI) {
    const d = this.def;
    const w = d.w ?? 110;
    const tilt = Math.sin((this.t / (d.period ?? 2.6)) * TAU + (d.phase ?? 0) + 1) * 0.06;
    ctx.save();
    ctx.translate(d.x, this.y);
    ctx.rotate(tilt);
    ctx.fillStyle = INK;
    // 몸통 (반쯤 잠긴 둥근 통) + 꼭대기 표지
    ctx.beginPath();
    ctx.roundRect(-w / 2, 0, w, 60, [6, 6, 30, 30]);
    ctx.fill();
    ctx.fillRect(-4, -70, 8, 70);
    ctx.beginPath();
    ctx.moveTo(-22, -70);
    ctx.lineTo(22, -70);
    ctx.lineTo(0, -102);
    ctx.closePath();
    ctx.fill();
    // 띠
    ctx.fillStyle = d.heavy ? '#6a6a67' : '#d8d8d4';
    ctx.fillRect(-w / 2 + 4, 14, w - 8, 8);
    ctx.restore();
    void g;
  }
  save() {
    return this.sink;
  }
  load(s: unknown) {
    this.sink = (s as number) ?? 0;
  }
}

// ------------------------------------------------------------------
// 등대 불빛
// ------------------------------------------------------------------
export class Beacon extends Entity {
  readonly type = 'beacon';
  angle = 0;
  on = false;
  private t = 0;
  private wasOn = false;
  constructor(public def: Extract<EntityDef, { type: 'beacon' }>) {
    super(def.id);
    this.angle = def.mid;
  }
  get len() {
    return this.def.len ?? 1800;
  }
  get half() {
    return this.def.half ?? 0.13;
  }
  update(g: GameAPI, dt: number) {
    const d = this.def;
    this.on = !d.signal || !!g.signals.get(d.signal) || g.flags.has('beacon:' + this.id);
    if (this.on && !this.wasOn) {
      g.flags.add('beacon:' + this.id);
      audio.play('switch', { vol: 0.7, rate: 0.7 });
      audio.play('machine', { vol: 0.5, rate: 0.6, delay: 0.2 });
    }
    this.wasOn = this.on;
    if (!this.on) return;
    this.t += dt;
    if (d.sweep) {
      // 앞으로는 천천히 일정하게 (따라 걸을 수 있게), 돌아올 때는 빠르게
      const [f, b] = d.sweep;
      const u = this.t % (f + b);
      const k = u < f ? u / f : 1 - (u - f) / b;
      const e = k * k * (3 - 2 * k) * 0.25 + k * 0.75;
      this.angle = d.mid + d.amp - 2 * d.amp * e;
    } else this.angle = d.mid + d.amp * Math.sin((this.t / d.period) * TAU);
  }
  /** 0 = 앞으로 훑기 시작, 1 = 끝 (sweep 일 때만) */
  get sweepK() {
    const d = this.def;
    if (!d.sweep) return 0;
    const [f, b] = d.sweep;
    const u = this.t % (f + b);
    return u < f ? u / f : 1 - (u - f) / b;
  }
  /** 이 점에 지금 불빛이 닿는가 */
  illuminates(x: number, y: number) {
    if (!this.on) return false;
    const dx = x - this.def.x,
      dy = y - this.def.y;
    const dist = Math.hypot(dx, dy);
    if (dist > this.len) return false;
    let da = Math.atan2(dy, dx) - this.angle;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    // 멀수록 빛줄기가 넓어 보이도록 약간 여유
    return Math.abs(da) < this.half + 30 / Math.max(200, dist);
  }
  drawFront(ctx: CanvasRenderingContext2D) {
    const d = this.def;
    // 등불
    ctx.save();
    const g0 = ctx.createRadialGradient(d.x, d.y, 4, d.x, d.y, 90);
    g0.addColorStop(0, this.on ? 'rgba(255,255,250,0.95)' : 'rgba(120,120,116,0.6)');
    g0.addColorStop(1, 'rgba(255,255,250,0)');
    ctx.fillStyle = g0;
    ctx.fillRect(d.x - 90, d.y - 90, 180, 180);
    if (this.on) {
      // 빛줄기
      const L = this.len;
      const a0 = this.angle - this.half,
        a1 = this.angle + this.half;
      const grad = ctx.createRadialGradient(d.x, d.y, 10, d.x, d.y, L);
      grad.addColorStop(0, 'rgba(250,250,244,0.55)');
      grad.addColorStop(1, 'rgba(250,250,244,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.arc(d.x, d.y, L, a0, a1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------
// 빛이 닿아야 존재하는 발판
// ------------------------------------------------------------------
export class LitPlank extends Entity {
  readonly type = 'litplank';
  /** 0 = 흐릿한 선, 1 = 단단함 */
  solidity = 0;
  private litT = 0;
  private wasSolid = false;
  constructor(public def: Extract<EntityDef, { type: 'litplank' }>) {
    super(def.id);
  }
  private plank() {
    const d = this.def;
    return { x: d.x, y: d.y, w: d.w, h: d.h ?? 22, oneway: d.h === undefined, owner: this, look: 'litplank' };
  }
  update(g: GameAPI, dt: number) {
    const d = this.def;
    let lit = false;
    if (d.by === 'flower') {
      // 꽃빛의 반지름 안 (꽃잎 수에 비례)
      const p = g.player;
      const r = (g as unknown as { lightRadius(): number }).lightRadius();
      const cx = clamp(p.x, d.x, d.x + d.w);
      const cy = clamp(p.y - 70, d.y, d.y + (d.h ?? 22));
      lit = Math.hypot(cx - p.x, cy - (p.y - 70)) < r && !g.isDead();
    } else {
      const b = g.entity<Beacon>(d.by);
      if (b) for (let k = 0; k <= 4 && !lit; k++) lit = b.illuminates(d.x + (d.w * k) / 4, d.y);
    }
    if (lit) this.litT = d.hold ?? 0.6;
    else this.litT -= dt;
    const target = this.litT > 0 ? 1 : 0;
    // 단단해지는 데 0.3초, 흐려지는 데 0.25초
    this.solidity = clamp(this.solidity + (target ? dt / 0.3 : -dt / 0.25), 0, 1);
    const solid = this.solidity > 0.85;
    this.solid = solid ? this.plank() : null;
    if (solid !== this.wasSolid && Math.abs(g.player.x - d.x) < 1400) {
      if (solid) audio.play('click3', { vol: 0.25, rate: 1.6 + hash1(d.x) * 0.3 });
      else audio.play('paper_rip', { vol: 0.15, rate: 1.8 });
    }
    this.wasSolid = solid;
  }
  drawBack(ctx: CanvasRenderingContext2D, g: GameAPI) {
    const d = this.def;
    const h = d.h ?? 22;
    const k = this.solidity;
    const sketch = d.by === 'flower';
    ctx.save();
    // 흐릿한 선 (안개 속 윤곽 / 연필 스케치)
    ctx.globalAlpha = 0.55 * (1 - k) + 0.15;
    ctx.strokeStyle = sketch ? '#5a5a57' : '#bdbdb9';
    ctx.lineWidth = 2;
    ctx.setLineDash(sketch ? [10, 7] : [16, 10]);
    const jit = sketch ? Math.sin(g.t * 9 + d.x) * 1.2 : 0;
    ctx.strokeRect(d.x + jit, d.y - jit, d.w, h);
    ctx.setLineDash([]);
    // 먹선으로 굳은 몸
    if (k > 0.01) {
      ctx.globalAlpha = k;
      ctx.fillStyle = INK;
      ctx.fillRect(d.x, d.y + (1 - k) * 4, d.w, h * (0.4 + 0.6 * k));
      if (!sketch) {
        // 판자 결
        ctx.fillStyle = '#2b2b29';
        for (let x = d.x + 30; x < d.x + d.w - 10; x += 34) ctx.fillRect(x, d.y + 2, 3, h - 4);
      }
    }
    ctx.restore();
  }
  save() {
    return null;
  }
  load() {
    this.solidity = 0;
    this.litT = 0;
    this.solid = null;
  }
}
