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
  /** 반복 간격 (끝없이 흘러가는 배경) */
  wrap?: number;
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
    const reps = L.wrap ? [Math.floor(v.x0 / L.wrap) * L.wrap, (Math.floor(v.x0 / L.wrap) + 1) * L.wrap] : [0];
    for (const off of reps) {
      for (const it of L.items) {
        const ix = it.x + off;
        if (ix + it.h < v.x0 || ix - it.h > v.x1) continue;
        drawIcon(ctx, it.icon, ix, L.ground + (it.y ?? 0), it.h, { color: L.color, flip: it.flip, sx: it.sx });
      }
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

/** 회색 들판 (달리는 열차에서 본 풍경, 끝없이 반복) */
export function fieldTheme(seed = 44): BgTheme {
  const rng = mulberry32(seed);
  const pick = <T>(a: T[]) => a[Math.floor(rng() * a.length)];
  const span = 6000;
  const far: BgLayer = {
    p: 0.06,
    color: '#bdbcb7',
    ground: 20,
    band: '#bdbcb7',
    wrap: span,
    items: scatter(rng, 0, span, 300, 900, (x) => ({ icon: pick<IconName>(['radioTower', 'industry', 'pine2', 'radioTower']), x, h: 160 + rng() * 260 })),
  };
  const mid: BgLayer = {
    p: 0.25,
    color: '#9a9994',
    ground: 60,
    band: '#9a9994',
    wrap: span,
    items: scatter(rng, 0, span, 260, 800, (x) => {
      const r = rng();
      if (r < 0.5) return { icon: pick<IconName>(['tree', 'pine', 'tree2']), x, h: 140 + rng() * 120, flip: rng() < 0.5 };
      if (r < 0.75) return { icon: 'house', x, h: 120 + rng() * 80 };
      return { icon: 'radioTower', x, h: 260 + rng() * 120 };
    }),
  };
  const near: BgLayer = {
    p: 0.6,
    color: '#6f6e6a',
    ground: 110,
    band: '#5d5c58',
    wrap: span,
    items: scatter(rng, 0, span, 500, 1400, (x) => ({ icon: pick<IconName>(['pine', 'tree', 'signpost', 'lamp']), x, h: 160 + rng() * 140 })),
  };
  return { skyTop: '#a9a9a5', skyMid: '#d2d1cc', skyBot: '#c8c7c2', layers: [far, mid, near] };
}

/** 기록 보관소: 끝없이 겹쳐진 서가 */
export function archiveTheme(width: number, seed = 55): BgTheme {
  const rng = mulberry32(seed);
  const far: BgLayer = {
    p: 0.2,
    color: '#5a5955',
    ground: 200,
    band: '#4a4945',
    items: scatter(rng, -1200, width * 0.2 + 2600, 150, 180, (x) => [
      { icon: 'bookshelf', x, h: 300, y: 0 },
      { icon: 'bookshelf', x, h: 300, y: -300 },
      { icon: 'bookshelf', x, h: 300, y: -600 },
      { icon: 'bookshelf', x, h: 300, y: -900 },
      { icon: 'bookshelf', x, h: 300, y: -1200 },
    ]),
  };
  const mid: BgLayer = {
    p: 0.5,
    color: '#3e3d3a',
    ground: 100,
    band: '#353431',
    items: scatter(rng, -1200, width * 0.5 + 2400, 420, 900, (x) => {
      const r = rng();
      if (r < 0.6) return [{ icon: 'bookshelf' as IconName, x, h: 420 }, { icon: 'bookshelf' as IconName, x, h: 420, y: -420 }];
      if (r < 0.8) return { icon: 'ladder' as IconName, x, h: 700 };
      return { icon: 'bulb' as IconName, x, h: 80, y: -620 };
    }),
  };
  return { skyTop: '#2c2b29', skyMid: '#403f3b', skyBot: '#3a3935', layers: [far, mid] };
}

/** 회색 숲: 안개 속에 겹겹이 선 침엽수와 활엽수 */
export function forestTheme(width: number, seed = 66): BgTheme {
  const rng = mulberry32(seed);
  const tree = (): IconName => (rng() < 0.55 ? 'pine' : rng() < 0.5 ? 'tree2' : 'pine2');
  const far: BgLayer = {
    p: 0.12,
    color: '#c9c9c5',
    ground: -20,
    band: '#c9c9c5',
    haze: 0.3,
    items: scatter(rng, -1200, width * 0.12 + 2600, 50, 120, (x) => ({ icon: tree(), x, h: 260 + rng() * 260, sx: 0.8 + rng() * 0.5 })),
  };
  const mid: BgLayer = {
    p: 0.32,
    color: '#a7a7a3',
    ground: 30,
    band: '#a7a7a3',
    haze: 0.18,
    items: scatter(rng, -1200, width * 0.32 + 2600, 90, 220, (x) => ({ icon: tree(), x, h: 380 + rng() * 360, sx: 0.8 + rng() * 0.6, flip: rng() < 0.5 })),
  };
  const near: BgLayer = {
    p: 0.6,
    color: '#7a7a76',
    ground: 60,
    band: '#6f6f6b',
    items: scatter(rng, -1200, width * 0.6 + 2400, 260, 620, (x) => ({ icon: tree(), x, h: 560 + rng() * 420, sx: 0.9 + rng() * 0.5, flip: rng() < 0.5 })),
  };
  return { skyTop: '#d9d9d5', skyMid: '#e4e4e0', skyBot: '#cfcfcb', layers: [far, mid, near] };
}

/** 표지의 바다: 낮은 수평선, 먼 등대와 항구 기중기, 바다에 꽂힌 표지판들 */
export function seaTheme(width: number, seed = 77): BgTheme {
  const rng = mulberry32(seed);
  const far: BgLayer = {
    p: 0.1,
    color: '#bdbdb9',
    ground: 60,
    band: '#a9a9a5',
    haze: 0.3,
    items: scatter(rng, -1200, width * 0.1 + 2600, 500, 1200, (x) => (rng() < 0.4 ? { icon: 'lighthouse' as IconName, x, h: 160 + rng() * 60 } : { icon: 'crane' as IconName, x, h: 180 + rng() * 120, flip: rng() < 0.5 })),
  };
  const mid: BgLayer = {
    p: 0.3,
    color: '#8f8f8b',
    ground: 120,
    band: '#858581',
    haze: 0.12,
    items: scatter(rng, -1200, width * 0.3 + 2400, 260, 700, (x) => {
      const r = rng();
      if (r < 0.35) return { icon: 'warning' as IconName, x, h: 70 + rng() * 40, y: -10 };
      if (r < 0.6) return { icon: 'signpost' as IconName, x, h: 110 + rng() * 60 };
      if (r < 0.8) return { icon: 'crane' as IconName, x, h: 300 + rng() * 200, flip: rng() < 0.5 };
      return { icon: 'lighthouse' as IconName, x, h: 260 + rng() * 120 };
    }),
  };
  return { skyTop: '#c9c9c6', skyMid: '#d6d6d2', skyBot: '#b9b9b5', layers: [far, mid] };
}

/** 여백의 땅: 흰 종이. 저 멀리 지워지다 만 세상의 연필 자국 */
export function blankTheme(width: number, seed = 88): BgTheme {
  const rng = mulberry32(seed);
  const pick = <T>(a: T[]) => a[Math.floor(rng() * a.length)];
  const icons: IconName[] = ['house', 'tree2', 'pine', 'lamp', 'lighthouse', 'factory', 'train', 'bookshelf', 'bench', 'signpost', 'crane', 'tower'];
  const far: BgLayer = {
    p: 0.12,
    color: '#ecebe7',
    ground: 0,
    items: scatter(rng, -1200, width * 0.12 + 2600, 260, 640, (x) => ({ icon: pick(icons), x, h: 140 + rng() * 200, sx: 0.8 + rng() * 0.5 })),
  };
  const mid: BgLayer = {
    p: 0.34,
    color: '#e5e4df',
    ground: 40,
    items: scatter(rng, -1200, width * 0.34 + 2400, 700, 1600, (x) => ({ icon: pick(icons), x, h: 220 + rng() * 240, flip: rng() < 0.5 })),
  };
  return { skyTop: '#f4f3ef', skyMid: '#f2f1ed', skyBot: '#ecebe6', layers: [far, mid] };
}
