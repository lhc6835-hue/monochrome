/**
 * 기록 보관소: 기록대 (8초 동안 움직임을 기록 → 되감기 → '과거의 나'가 그대로 움직인다)
 */
import { Entity, type Prompt } from './entities';
import type { EntityDef, GameAPI } from './types';
import type { Light } from './entities2';
import { INK } from '../gfx/ground';
import { TAU } from '../core/math';

export class Recorder extends Entity {
  readonly type = 'recorder';
  constructor(public def: Extract<EntityDef, { type: 'recorder' }>) {
    super(def.id);
    this.interactRange = 95;
  }
  get dur() {
    return this.def.dur ?? 8;
  }
  interactPos(): [number, number] {
    return [this.def.x, (this.def.y ?? 0) - 150];
  }
  prompt(g: GameAPI): Prompt | null {
    const rec = (g as unknown as { recording: boolean }).recording;
    if (rec) return null;
    return { text: `기록하기 (${this.dur}초)`, hold: 0 };
  }
  interact(g: GameAPI) {
    (g as unknown as { startRecording(r: Recorder): void }).startRecording(this);
  }
  drawBack(ctx: CanvasRenderingContext2D, g: GameAPI) {
    const x = this.def.x,
      y = this.def.y ?? 0;
    const rec = (g as unknown as { recording: boolean; recordK: number }).recording;
    const k = (g as unknown as { recordK: number }).recordK ?? 0;
    // 책상 위 축음기 모양 기록대
    ctx.fillStyle = INK;
    ctx.fillRect(x - 60, y - 70, 120, 70);
    ctx.fillRect(x - 70, y - 82, 140, 14);
    ctx.fillRect(x - 6, y - 140, 12, 60);
    ctx.beginPath();
    ctx.moveTo(x, y - 140);
    ctx.lineTo(x + 70, y - 200);
    ctx.lineTo(x + 70, y - 120);
    ctx.closePath();
    ctx.fill();
    // 원판
    ctx.fillStyle = '#2a2a28';
    ctx.beginPath();
    ctx.ellipse(x - 20, y - 88, 44, 8, 0, 0, TAU);
    ctx.fill();
    if (rec) {
      ctx.strokeStyle = 'rgba(240,240,236,0.85)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y - 250, 22, -Math.PI / 2, -Math.PI / 2 + TAU * k);
      ctx.stroke();
      ctx.fillStyle = Math.sin(g.t * 10) > 0 ? '#f0f0ec' : '#777';
      ctx.beginPath();
      ctx.arc(x, y - 250, 7, 0, TAU);
      ctx.fill();
    }
  }
  lights(): Light[] {
    return [{ kind: 'circle', x: this.def.x, y: (this.def.y ?? 0) - 130, r: 150, a: 0.55 }];
  }
}
