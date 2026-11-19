import { clamp, noise1 } from '../core/math';

export const VIEW_H = 1080;

export interface Layer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

/** 논리 해상도: 높이 1080 고정, 가로는 화면비에 맞춰 (4:3 ~ 21:9) */
export class Screen {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  W = 1920;
  H = VIEW_H;
  /** 논리 1단위당 픽셀 */
  k = 1;
  ox = 0;
  oy = 0;
  pw = 0;
  ph = 0;
  private layers: Layer[] = [];
  /** 렌더 해상도 배율: 기기가 버거워하면 자동으로 낮춘다 (1 → 0.8 → 0.65) */
  quality = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.quality;
    const cw = window.innerWidth;
    const ch = window.innerHeight;
    this.pw = Math.round(cw * dpr);
    this.ph = Math.round(ch * dpr);
    this.canvas.width = this.pw;
    this.canvas.height = this.ph;
    this.canvas.style.width = cw + 'px';
    this.canvas.style.height = ch + 'px';
    const aspect = clamp(cw / ch, 4 / 3, 21 / 9);
    this.W = Math.round(VIEW_H * aspect);
    this.k = Math.min(this.pw / this.W, this.ph / this.H);
    this.ox = (this.pw - this.W * this.k) / 2;
    this.oy = (this.ph - this.H * this.k) / 2;
    for (const l of this.layers) this.sizeLayer(l);
  }

  private sizeLayer(l: Layer) {
    l.canvas.width = this.pw;
    l.canvas.height = this.ph;
  }

  makeLayer(): Layer {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const l = { canvas, ctx };
    this.sizeLayer(l);
    this.layers.push(l);
    return l;
  }

  /**
   * 글자·안내 UI 배율: 논리 해상도(높이 1080)를 작은 화면(폰)에 줄여 그리면 글자가 읽을 수 없게 작아진다.
   * 실제 화면에서 글자가 일정 크기 아래로 내려가지 않도록 키우는 배율 (데스크톱 ≈ 1, 폰 ≈ 2).
   */
  get ui() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.quality;
    const cssPerUnit = this.k / dpr;
    return clamp(0.68 / cssPerUnit, 1, 2.1);
  }

  /** 논리 좌표계 변환 설정 */
  base(ctx: CanvasRenderingContext2D = this.ctx) {
    ctx.setTransform(this.k, 0, 0, this.k, this.ox, this.oy);
  }

  clearLayer(l: Layer) {
    l.ctx.setTransform(1, 0, 0, 1, 0, 0);
    l.ctx.globalCompositeOperation = 'source-over';
    l.ctx.globalAlpha = 1;
    l.ctx.clearRect(0, 0, this.pw, this.ph);
  }

  /** 레이어를 메인 캔버스에 합성 */
  composite(l: Layer, alpha = 1, op: GlobalCompositeOperation = 'source-over') {
    const c = this.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = alpha;
    c.globalCompositeOperation = op;
    c.drawImage(l.canvas, 0, 0);
    c.restore();
  }
}

export class Camera {
  x = 0;
  y = -380;
  zoom = 1;
  rot = 0;
  shake = 0;
  private shakeT = 0;
  sx = 0;
  sy = 0;
  shakeEnabled = true;

  update(dt: number) {
    this.shakeT += dt;
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const a = this.shakeEnabled ? this.shake * this.shake * 26 : 0;
    this.sx = noise1(this.shakeT * 23) * a;
    this.sy = noise1(this.shakeT * 23 + 100) * a;
  }
  addShake(v: number) {
    this.shake = Math.min(1.2, this.shake + v);
  }

  /** parallax: 1 = 월드, <1 = 원경, >1 = 근경 */
  apply(ctx: CanvasRenderingContext2D, s: Screen, parallax = 1) {
    s.base(ctx);
    ctx.translate(s.W / 2, s.H / 2);
    if (this.rot) ctx.rotate(this.rot);
    const z = 1 + (this.zoom - 1) * parallax;
    ctx.scale(z, z);
    ctx.translate(-(this.x + this.sx) * parallax, -(this.y + this.sy) * Math.min(1, parallax) - (parallax < 1 ? 0 : 0));
  }

  toScreen(s: Screen, wx: number, wy: number): [number, number] {
    return [s.W / 2 + (wx - this.x - this.sx) * this.zoom, s.H / 2 + (wy - this.y - this.sy) * this.zoom];
  }

  /** 보이는 월드 영역 */
  view(s: Screen, parallax = 1) {
    const z = 1 + (this.zoom - 1) * parallax;
    const hw = s.W / 2 / z;
    const hh = s.H / 2 / z;
    const cx = this.x * parallax;
    const cy = this.y * Math.min(1, parallax);
    return { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
  }
}
