import { rand, TAU } from '../core/math';
import { drawPetal } from './flower';
import { drawPaperBit } from './blank';

export type PType = 'dust' | 'ash' | 'petal' | 'paper' | 'ring' | 'puff' | 'spark' | 'shard' | 'ink';

export interface Particle {
  t: PType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  g: number;
  drag: number;
  /** 조각 두께 (shard) */
  w?: number;
  /** 이 높이에서 튕긴다 */
  floor?: number;
}

export class Particles {
  list: Particle[] = [];

  add(p: Partial<Particle> & { t: PType; x: number; y: number }) {
    const q: Particle = {
      vx: 0,
      vy: 0,
      life: 1,
      max: 1,
      size: 4,
      rot: rand(0, TAU),
      vr: rand(-2, 2),
      color: '#888',
      g: 0,
      drag: 0.5,
      ...p,
    };
    q.max = q.life;
    this.list.push(q);
    return q;
  }

  /** 착지 먼지 */
  puff(x: number, y: number, n = 8, power = 1) {
    for (let i = 0; i < n; i++) {
      this.add({
        t: 'puff',
        x: x + rand(-14, 14),
        y: y - rand(0, 6),
        vx: rand(-160, 160) * power,
        vy: rand(-90, -10) * power,
        life: rand(0.35, 0.7),
        size: rand(5, 12) * power,
        color: '#8a8a88',
        drag: 4,
        g: 120,
      });
    }
  }

  /** 꽃잎 색 폭발 */
  burst(x: number, y: number, colors: readonly string[], n = 18, speed = 300) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const sp = rand(0.3, 1) * speed;
      this.add({
        t: i % 3 === 0 ? 'petal' : 'spark',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        life: rand(0.6, 1.4),
        size: rand(5, 11),
        color: colors[i % colors.length],
        drag: 2.2,
        g: 80,
      });
    }
  }

  ring(x: number, y: number, color: string, size = 120, life = 0.9) {
    this.add({ t: 'ring', x, y, life, size, color, vr: 0 });
  }

  paper(x: number, y: number, n = 6, power = 1) {
    for (let i = 0; i < n; i++) {
      this.add({
        t: 'paper',
        x: x + rand(-20, 20),
        y: y + rand(-60, 60),
        vx: rand(40, 260) * power,
        vy: rand(-180, 40) * power,
        life: rand(0.8, 1.8),
        size: rand(4, 9),
        vr: rand(-8, 8),
        drag: 1.2,
        g: 140,
      });
    }
  }

  update(dt: number) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) {
        L[i] = L[L.length - 1];
        L.pop();
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy = p.vy * d + p.g * dt;
      if (p.t === 'ash' || p.t === 'dust') {
        p.vx += Math.sin(p.life * 2 + p.rot) * 8 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.floor !== undefined && p.y > p.floor) {
        p.y = p.floor;
        if (Math.abs(p.vy) > 80) {
          p.vy *= -0.32;
          p.vx *= 0.6;
          p.vr *= 0.55;
        } else {
          p.vy = 0;
          p.vx *= 0.85;
          p.vr *= 0.8;
        }
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, filter?: (p: Particle) => boolean) {
    for (const p of this.list) {
      if (filter && !filter(p)) continue;
      const k = p.life / p.max;
      switch (p.t) {
        case 'dust':
        case 'ash': {
          const fade = Math.min(1, k * 3, (1 - k) * 4);
          ctx.globalAlpha = fade * 0.55;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.fill();
          break;
        }
        case 'puff':
          ctx.globalAlpha = k * 0.45;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, TAU);
          ctx.fill();
          break;
        case 'petal':
          ctx.globalAlpha = 1;
          drawPetal(ctx, p.x, p.y, p.size * 1.6, p.color, p.rot, Math.min(1, k * 2));
          break;
        case 'spark':
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.5 * (0.4 + k), 0, TAU);
          ctx.fill();
          break;
        case 'ring': {
          const e = 1 - k;
          const r = p.size * (1 - Math.pow(1 - e, 3));
          ctx.globalAlpha = k * 0.85;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 6 * k + 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, TAU);
          ctx.stroke();
          break;
        }
        case 'paper':
          ctx.globalAlpha = 1;
          drawPaperBit(ctx, p.x, p.y, p.size, p.rot, Math.min(1, k * 2));
          break;
        case 'shard': {
          // 픽토그램 조각 (머리 = 원, 팔다리/몸통 = 둥근 막대)
          ctx.globalAlpha = Math.min(1, k * 3.5);
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          const w = p.w ?? p.size;
          ctx.beginPath();
          ctx.roundRect(-p.size / 2, -w / 2, p.size, w, Math.min(w, p.size) / 2);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'ink':
          ctx.globalAlpha = Math.min(1, k * 2.5);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size * (1 + Math.min(1.5, Math.abs(p.vx) / 600)), p.size, Math.atan2(p.vy, p.vx), 0, TAU);
          ctx.fill();
          break;
      }
    }
    ctx.globalAlpha = 1;
  }
}
