import type { Screen } from './screen';

/** 필름 그레인 / 비네트 / 레터박스 / 페이드 */
export class Post {
  private grain: HTMLCanvasElement[] = [];
  private vign: HTMLCanvasElement | null = null;
  private vignKey = '';
  private gi = 0;
  private gt = 0;
  grainAmt = 0.07;
  vignAmt = 0.55;
  enabled = true;

  constructor() {
    for (let n = 0; n < 4; n++) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const x = c.getContext('2d')!;
      const img = x.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      this.grain.push(c);
    }
  }

  private vignette(s: Screen) {
    const key = s.pw + 'x' + s.ph;
    if (this.vign && this.vignKey === key) return this.vign;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(s.pw / 4));
    c.height = Math.max(1, Math.round(s.ph / 4));
    const x = c.getContext('2d')!;
    const r = Math.hypot(c.width, c.height) / 2;
    const g = x.createRadialGradient(c.width / 2, c.height / 2, r * 0.35, c.width / 2, c.height / 2, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0.85)');
    x.fillStyle = g;
    x.fillRect(0, 0, c.width, c.height);
    this.vign = c;
    this.vignKey = key;
    return c;
  }

  apply(s: Screen, dt: number, vign = this.vignAmt, grain = this.grainAmt) {
    const c = s.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (vign > 0) {
      c.globalAlpha = vign;
      c.drawImage(this.vignette(s), 0, 0, s.pw, s.ph);
    }
    if (this.enabled && grain > 0) {
      this.gt += dt;
      if (this.gt > 1 / 24) {
        this.gt = 0;
        this.gi = (this.gi + 1) % this.grain.length;
      }
      const pat = c.createPattern(this.grain[this.gi], 'repeat')!;
      const ox = Math.floor(Math.random() * 256),
        oy = Math.floor(Math.random() * 256);
      pat.setTransform(new DOMMatrix([1, 0, 0, 1, ox, oy]));
      c.globalAlpha = grain;
      c.globalCompositeOperation = 'overlay';
      c.fillStyle = pat;
      c.fillRect(0, 0, s.pw, s.ph);
    }
    c.restore();
  }

  /** 시네마 레터박스 (amt 0..1) */
  letterbox(s: Screen, amt: number) {
    if (amt <= 0) return;
    const c = s.ctx;
    const h = s.H * 0.11 * amt;
    s.base(c);
    c.fillStyle = '#000';
    c.fillRect(-10, -10, s.W + 20, h + 10);
    c.fillRect(-10, s.H - h, s.W + 20, h + 10);
  }

  fill(s: Screen, color: string, a: number) {
    if (a <= 0) return;
    const c = s.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = Math.min(1, a);
    c.fillStyle = color;
    c.fillRect(0, 0, s.pw, s.ph);
    c.restore();
  }
}
