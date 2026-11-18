/**
 * 끊긴 철로: 열차 칸 그림과 열차를 스쳐 지나가는 장애물
 * 열차는 세계 좌표에 가만히 있고, 바깥 세상이 trainSpeed 로 뒤로 흘러간다.
 */
import { Entity } from './entities';
import type { EntityDef, GameAPI } from './types';
import type { Light } from './entities2';
import { audio } from '../core/audio';
import { clamp, hash1, rand, TAU } from '../core/math';
import { INK } from '../gfx/ground';

export const ROOF = -330;

// ------------------------------------------------------------------
// 열차 칸
// ------------------------------------------------------------------
export class TrainCar extends Entity {
  readonly type = 'car';
  private smokeT = 0;
  constructor(public def: Extract<EntityDef, { type: 'car' }>) {
    super(def.id);
  }
  update(g: GameAPI, dt: number) {
    if (this.def.kind !== 'loco') return;
    this.smokeT += dt;
    if (this.smokeT > 0.09) {
      this.smokeT = 0;
      const x = this.def.x + this.def.w - 230;
      g.parts.add({ t: 'puff', x, y: -500, vx: -g.trainSpeed * 0.55 + rand(-30, 30), vy: rand(-90, -40), life: rand(1.2, 2), size: rand(14, 26), color: '#4a4a47', drag: 0.6, g: -20 });
    }
  }
  drawBack(ctx: CanvasRenderingContext2D, g: GameAPI) {
    const { x, w, kind } = this.def;
    const travel = (g as unknown as { travel: number }).travel;
    // 바퀴 (굴러간다)
    const wheelR = 26;
    const rot = travel / wheelR;
    for (const wx of [x + 90, x + 170, x + w - 170, x + w - 90]) {
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(wx, 58, wheelR, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#6a6a66';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = rot + (k * TAU) / 3;
        ctx.moveTo(wx, 58);
        ctx.lineTo(wx + Math.cos(a) * (wheelR - 6), 58 + Math.sin(a) * (wheelR - 6));
      }
      ctx.stroke();
    }
    ctx.fillStyle = INK;
    ctx.fillRect(x + 50, 26, w - 100, 18);
    // 바닥판
    ctx.fillRect(x, 0, w, 30);
    if (kind === 'box' || kind === 'passenger') {
      // 안쪽 벽 (뒤판)
      ctx.fillStyle = kind === 'passenger' ? '#5f5e5a' : '#454441';
      ctx.fillRect(x + 22, ROOF + 22, w - 44, -ROOF - 22);
      if (kind === 'box') {
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 2;
        for (let px = x + 70; px < x + w - 40; px += 70) {
          ctx.beginPath();
          ctx.moveTo(px, ROOF + 22);
          ctx.lineTo(px, 0);
          ctx.stroke();
        }
      } else {
        // 창문 너머로 흘러가는 바깥
        for (let px = x + 90; px < x + w - 120; px += 170) {
          ctx.fillStyle = '#c9c8c3';
          ctx.fillRect(px, ROOF + 70, 110, 90);
          ctx.fillStyle = '#9a9994';
          const o = ((travel * 0.6) % 220) - 110;
          ctx.fillRect(px + ((o + 220) % 220) - 50, ROOF + 130, 30, 30);
          ctx.fillStyle = INK;
          ctx.fillRect(px + 52, ROOF + 70, 6, 90);
        }
        // 좌석
        ctx.fillStyle = '#2a2a28';
        for (let px = x + 60; px < x + w - 60; px += 170) ctx.fillRect(px, -70, 90, 70);
      }
      // 지붕과 양 끝 벽 (문 위쪽)
      ctx.fillStyle = INK;
      ctx.fillRect(x - 4, ROOF, w + 8, 24);
      ctx.fillRect(x, ROOF, 22, 160);
      ctx.fillRect(x + w - 22, ROOF, 22, 160);
    } else if (kind === 'flat') {
      ctx.fillStyle = INK;
      for (const px of [x + 4, x + w - 18]) ctx.fillRect(px, -60, 14, 60);
    } else if (kind === 'container') {
      ctx.fillStyle = INK;
      ctx.fillRect(x + 40, -420, w - 80, 420);
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 3;
      for (let px = x + 70; px < x + w - 60; px += 30) {
        ctx.beginPath();
        ctx.moveTo(px, -400);
        ctx.lineTo(px, -20);
        ctx.stroke();
      }
    } else if (kind === 'tender') {
      ctx.fillStyle = INK;
      ctx.fillRect(x + 20, -140, w - 40, 140);
      ctx.beginPath();
      ctx.moveTo(x + 60, -140);
      ctx.quadraticCurveTo(x + w / 2, -330, x + w - 60, -140);
      ctx.fill();
    } else if (kind === 'loco') {
      ctx.fillStyle = INK;
      // 운전실 (뒤쪽)
      ctx.fillRect(x, -380, 300, 380);
      ctx.fillStyle = '#5f5e5a';
      ctx.fillRect(x + 22, -340, 256, 340);
      ctx.fillStyle = '#c9c8c3';
      ctx.fillRect(x + 180, -320, 80, 70);
      ctx.fillStyle = INK;
      ctx.fillRect(x - 10, -390, 310, 26);
      ctx.fillRect(x, -380, 22, 200);
      // 보일러
      ctx.beginPath();
      ctx.roundRect(x + 300, -300, w - 330, 300, [0, 90, 20, 0]);
      ctx.fill();
      ctx.fillRect(x + w - 260, -440, 64, 150);
      ctx.fillRect(x + w - 272, -450, 88, 20);
      ctx.fillRect(x + w - 470, -350, 70, 60);
      // 배장기
      ctx.beginPath();
      ctx.moveTo(x + w - 30, 0);
      ctx.lineTo(x + w + 50, 60);
      ctx.lineTo(x + w - 30, 60);
      ctx.fill();
      ctx.fillStyle = '#e8e8e4';
      ctx.beginPath();
      ctx.arc(x + w - 30, -220, 16, 0, TAU);
      ctx.fill();
    }
  }
  lights(): Light[] {
    const { x, w, kind } = this.def;
    if (kind === 'passenger') return [{ kind: 'circle', x: x + w / 2, y: -160, r: 420, a: 0.55 }];
    if (kind === 'loco') return [{ kind: 'beam', x: x + w + 200, top: -240, bottom: -200, w: 300, a: 0 }, { kind: 'circle', x: x + 150, y: -200, r: 220, a: 0.5 }];
    return [];
  }
}

// ------------------------------------------------------------------
// 스쳐 지나가는 장애물
// ------------------------------------------------------------------
export class Hazard extends Entity {
  readonly type = 'hazard';
  x = -1e6;
  active = false;
  private warned = false;
  private passed = false;
  constructor(public def: Extract<EntityDef, { type: 'hazard' }>) {
    super(def.id);
  }
  get w() {
    return this.def.w ?? (this.def.kind === 'beam' ? 70 : this.def.kind === 'bar' ? 46 : this.def.kind === 'tunnel' ? 2600 : 4000);
  }
  spawn(x: number) {
    this.active = true;
    this.x = x;
    this.warned = false;
    this.passed = false;
  }
  update(g: GameAPI, dt: number) {
    if (!this.active) return;
    this.x -= g.trainSpeed * dt;
    const kind = this.def.kind;
    const p = g.player.body;
    const camR = g.cam.x + 1300;
    if (!this.warned && this.x < camR + 900 && kind !== 'cliff') {
      this.warned = true;
      if (kind === 'beam') {
        audio.play('bell4', { vol: 0.5, rate: 1.6 });
        audio.play('bell4', { vol: 0.5, rate: 1.6, delay: 0.22 });
      } else if (kind === 'tunnel') audio.play('whistle', { vol: 0.8 });
    }
    if (!this.passed && this.x + this.w / 2 < p.x) {
      this.passed = true;
      if (kind === 'beam' || kind === 'bar') audio.play('whoosh', { vol: kind === 'beam' ? 0.35 : 0.18, rate: 1.8 });
    }
    const ox = p.x + p.w / 2 > this.x + 4 && p.x - p.w / 2 < this.x + this.w - 4;
    if (ox && !g.isDead()) {
      if (kind === 'beam' && p.y - p.h < -395) g.kill('crush');
      if (kind === 'tunnel' && p.y - p.h < -352) g.kill('crush');
      if (kind === 'bar' && p.y > -66 && !g.sheltered(p.x, p.y - 60)) g.kill('crush');
    }
    if (kind === 'tunnel') {
      const inside = g.cam.x > this.x + 200 && g.cam.x < this.x + this.w - 200;
      g.darkBoost = inside ? 0.93 : 0;
    }
    if (this.x + this.w < g.cam.x - 4000) {
      this.active = false;
      if (kind === 'tunnel') g.darkBoost = 0;
    }
  }
  drawBack(ctx: CanvasRenderingContext2D, g: GameAPI) {
    if (!this.active) return;
    const kind = this.def.kind;
    const x = this.x,
      w = this.w;
    if (kind === 'beam') {
      // 머리 위를 가로지르는 신호 철골
      ctx.fillStyle = '#2b2b29';
      ctx.fillRect(x + w / 2 - 8, -1600, 16, 1800);
      ctx.fillStyle = INK;
      ctx.fillRect(x, -1600, w, 1600 - 395);
      ctx.fillRect(x - 20, -470, w + 40, 26);
      const on = Math.sin(g.t * 14) > 0;
      ctx.fillStyle = on ? '#f4f4f0' : '#555';
      ctx.beginPath();
      ctx.arc(x + w / 2, -420, 9, 0, TAU);
      ctx.fill();
    } else if (kind === 'bar') {
      // 철교 아래쪽 가로재와 사선 트러스
      ctx.strokeStyle = '#1b1b1a';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, -60);
      ctx.lineTo(x + w / 2 + 420, -760);
      ctx.moveTo(x + w / 2, -60);
      ctx.lineTo(x + w / 2 - 420, -760);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.fillRect(x, -66, w, 106);
    } else if (kind === 'cliff') {
      // 끊긴 다리: 선로가 허공에서 끝난다
      ctx.fillStyle = '#c8c7c2';
      ctx.fillRect(x, 40, w, 2000);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.moveTo(x, 40);
      for (let k = 0; k <= 8; k++) ctx.lineTo(x + k * 14, 40 + hash1(k) * 30 + k * 6);
      ctx.lineTo(x, 300);
      ctx.fill();
    }
  }
  drawFront(ctx: CanvasRenderingContext2D) {
    if (!this.active || this.def.kind !== 'tunnel') return;
    const x = this.x,
      w = this.w;
    // 터널: 열차 지붕 바로 위까지 내려온 어둠
    ctx.fillStyle = INK;
    ctx.fillRect(x, -2400, w, 2400 - 360);
    ctx.fillStyle = '#262624';
    ctx.beginPath();
    ctx.moveTo(x + w, -360);
    ctx.lineTo(x + w + 60, -360);
    ctx.lineTo(x + w + 60, -1400);
    ctx.lineTo(x + w, -1400);
    ctx.fill();
  }
  save() {
    return null;
  }
  load() {
    this.active = false;
    this.x = -1e6;
  }
}

export const clampUse = clamp;
