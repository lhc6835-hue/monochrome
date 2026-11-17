import { ICONS, type IconName } from './iconData';

const cache = new Map<IconName, { path: Path2D; rule: CanvasFillRule }[]>();

function paths(name: IconName) {
  let p = cache.get(name);
  if (!p) {
    const def = ICONS[name];
    p = def.p.map((e) => ({ path: new Path2D(e[0]), rule: (e.length > 1 ? 'evenodd' : 'nonzero') as CanvasFillRule }));
    cache.set(name, p);
  }
  return p;
}

export interface IconOpts {
  color?: string;
  flip?: boolean;
  /** 'bottom' = (x,y)가 아이콘 아래 중앙, 'center' = 중심 */
  anchor?: 'bottom' | 'center';
  rot?: number;
  alpha?: number;
  /** 가로 비율 */
  sx?: number;
}

/** 아이콘을 높이 h 로 그린다 */
export function drawIcon(ctx: CanvasRenderingContext2D, name: IconName, x: number, y: number, h: number, o: IconOpts = {}) {
  const def = ICONS[name];
  const s = h / def.h;
  const w = def.w * s * (o.sx ?? 1);
  ctx.save();
  ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  const ay = o.anchor === 'center' ? -h / 2 : -h;
  ctx.translate(o.flip ? w / 2 : -w / 2, ay);
  ctx.scale((o.flip ? -s : s) * (o.sx ?? 1), s);
  ctx.fillStyle = o.color ?? '#0e0e0e';
  for (const p of paths(name)) ctx.fill(p.path, p.rule);
  ctx.restore();
}

export function iconAspect(name: IconName) {
  const d = ICONS[name];
  return d.w / d.h;
}

export type { IconName };
