import { drawIcon, type IconName } from './icons';
import { mulberry32 } from '../core/math';
import type { Camera, Screen } from './screen';

export interface BgItem {
  icon: IconName;
  x: number;
  h: number;
  y?: number;
  flip?: boolean;
  sx?: number;
}
export interface BgLayer {
  /** 패럴랙스 계수 */
  p: number;
  color: string;
  /** 레이어 바닥 y (화면 기준이 아니라 레이어 좌표) */
  ground: number;
  items: BgItem[];
  /** 레이어 바닥 띠 색 (없으면 생략) */
  band?: string;
  /** 이 레이어 위에 덮는 안개 */
  haze?: number;
}

export interface BgTheme {
  skyTop: string;
  skyMid: string;
  skyBot: string;
  layers: BgLayer[];
}

function scatter(rng: () => number, x0: number, x1: number, gapMin: number, gapMax: number, make: (x: number) => BgItem | BgItem[] | null) {
  const out: BgItem[] = [];
  let x = x0 + rng() * gapMin;
  while (x < x1) {
    const it = make(x);
    if (it) out.push(...(Array.isArray(it) ? it : [it]));
    x += gapMin + rng() * (gapMax - gapMin);
  }
  return out;
}

/** 표지의 마을 배경 */
export function townTheme(width: number, seed = 7): BgTheme {
  const rng = mulberry32(seed);
  const pick = <T>(a: T[]) => a[Math.floor(rng() * a.length)];
  const far: BgLayer = {
    p: 0.12,
    color: '#cfcfcc',
    ground: -40,
    band: '#cfcfcc',
    haze: 0.25,
    items: scatter(rng, -1200, width * 0.12 + 2600, 160, 380, (x) => ({
      icon: pick<IconName>(['office', 'tower', 'building', 'tower', 'office', 'radioTower']),
      x,
      h: 240 + rng() * 420,
      sx: 0.8 + rng() * 0.6,
    })),
  };
  const mid: BgLayer = {
    p: 0.35,
    color: '#afafac',
    ground: -10,
    band: '#afafac',
    haze: 0.2,
    items: scatter(rng, -1200, width * 0.35 + 2400, 230, 520, (x) => {
      const r = rng();
      if (r < 0.45) return { icon: pick<IconName>(['house', 'homeCity', 'building', 'townHall']), x, h: 180 + rng() * 200, flip: rng() < 0.5 };
      if (r < 0.8) return { icon: pick<IconName>(['tree', 'pine', 'tree2', 'pine2']), x, h: 150 + rng() * 120, flip: rng() < 0.5 };
      return { icon: 'lamp', x, h: 170 + rng() * 40 };
    }),
  };
  const near: BgLayer = {
    p: 0.62,
    color: '#7c7c7a',
    ground: 0,
    band: '#7c7c7a',
    haze: 0.12,
    items: scatter(rng, -1200, width * 0.62 + 2400, 380, 900, (x) => {
      const r = rng();
      if (r < 0.4) return { icon: pick<IconName>(['house', 'homeCity', 'office']), x, h: 260 + rng() * 160, flip: rng() < 0.5 };
      if (r < 0.75) return { icon: pick<IconName>(['tree', 'tree2', 'pine']), x, h: 220 + rng() * 120, flip: rng() < 0.5 };
      if (r < 0.88) return { icon: 'lamp', x, h: 230 };
      return { icon: pick<IconName>(['trafficLight', 'signpost', 'mailbox', 'bench']), x, h: 90 + rng() * 80 };
    }),
  };
  return { skyTop: '#c4c4c1', skyMid: '#e7e7e4', skyBot: '#efefec', layers: [far, mid, near] };
}

export function drawSky(ctx: CanvasRenderingContext2D, s: Screen, th: BgTheme, light = 1) {
  s.base(ctx);
  const g = ctx.createLinearGradient(0, 0, 0, s.H);
  g.addColorStop(0, th.skyTop);
  g.addColorStop(0.55, th.skyMid);
  g.addColorStop(1, th.skyBot);
  ctx.fillStyle = g;
  ctx.fillRect(-2, -2, s.W + 4, s.H + 4);
  if (light < 1) {
    ctx.fillStyle = `rgba(0,0,0,${1 - light})`;
    ctx.fillRect(-2, -2, s.W + 4, s.H + 4);
  }
}

/** 원경 레이어들 그리기. 각 레이어 사이에 안개를 깔아 깊이감을 준다 */
export function drawLayers(ctx: CanvasRenderingContext2D, s: Screen, cam: Camera, th: BgTheme, skyHaze = '#ecece9') {
  for (const L of th.layers) {
    cam.apply(ctx, s, L.p);
    const v = cam.view(s, L.p);
    for (const it of L.items) {
      if (it.x + it.h < v.x0 || it.x - it.h > v.x1) continue;
      drawIcon(ctx, it.icon, it.x, L.ground + (it.y ?? 0), it.h, { color: L.color, flip: it.flip, sx: it.sx });
    }
    if (L.band) {
      ctx.fillStyle = L.band;
      ctx.fillRect(v.x0 - 10, L.ground - 1, v.x1 - v.x0 + 20, 2000);
    }
    if (L.haze) {
      // 바닥 근처 안개
      s.base(ctx);
      const g = ctx.createLinearGradient(0, s.H * 0.35, 0, s.H);
      g.addColorStop(0, hazeA(skyHaze, 0));
      g.addColorStop(0.6, hazeA(skyHaze, L.haze));
      g.addColorStop(1, hazeA(skyHaze, L.haze * 0.6));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s.W, s.H);
    }
  }
}

function hazeA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 지하 배수로 배경: 아치형 터널과 매달린 파이프 */
export function drainTheme(width: number, seed = 21): BgTheme {
  const rng = mulberry32(seed);
  const pick = <T>(a: T[]) => a[Math.floor(rng() * a.length)];
  const arches: BgLayer = {
    p: 0.3,
    color: '#4c4c47',
    ground: -60,
    band: '#3e3e3a',
    items: scatter(rng, -1200, width * 0.3 + 2400, 520, 640, (x) => ({ icon: 'bridge', x, h: 520, sx: 1.6 })),
  };
  const pipes: BgLayer = {
    p: 0.6,
    color: '#33332f',
    ground: -20,
    band: '#2c2c29',
    items: scatter(rng, -1200, width * 0.6 + 2400, 260, 620, (x) => {
      const r = rng();
      if (r < 0.45) return { icon: 'pipe', x, h: 200 + rng() * 120, y: -380 - rng() * 120, flip: rng() < 0.5 };
      if (r < 0.7) return { icon: 'fan', x, h: 120, y: -420 };
      return { icon: pick<IconName>(['wall', 'wall', 'ladder']), x, h: 220 + rng() * 80 };
    }),
  };
  return { skyTop: '#2f2f2c', skyMid: '#3d3d39', skyBot: '#363632', layers: [arches, pipes] };
}

/** 아이콘 공장 배경: 굴뚝, 톱니, 크레인 */
export function factoryTheme(width: number, seed = 33): BgTheme {
  const rng = mulberry32(seed);
  const pick = <T>(a: T[]) => a[Math.floor(rng() * a.length)];
  const far: BgLayer = {
    p: 0.15,
    color: '#9c9b96',
    ground: -40,
    band: '#9c9b96',
    haze: 0.12,
    items: scatter(rng, -1200, width * 0.15 + 2600, 180, 420, (x) => ({
      icon: pick<IconName>(['factory', 'industry', 'factory', 'radioTower']),
      x,
      h: 300 + rng() * 360,
      sx: 0.9 + rng() * 0.5,
    })),
  };
  const mid: BgLayer = {
    p: 0.45,
    color: '#6f6e6a',
    ground: -10,
    band: '#6f6e6a',
    items: scatter(rng, -1200, width * 0.45 + 2400, 300, 700, (x) => {
      const r = rng();
      if (r < 0.35) return { icon: 'fan', x, h: 160 + rng() * 140, y: -260 - rng() * 200 };
      if (r < 0.6) return { icon: 'crane', x, h: 360 + rng() * 160 };
      if (r < 0.8) return { icon: 'pipe', x, h: 220, y: -300, flip: rng() < 0.5 };
      return { icon: 'crate', x, h: 120 + rng() * 80 };
    }),
  };
  return { skyTop: '#8a8985', skyMid: '#a9a8a3', skyBot: '#9f9e99', layers: [far, mid] };
}
