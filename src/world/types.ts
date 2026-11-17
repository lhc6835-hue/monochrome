import type { IconName } from '../gfx/icons';
import type { BgTheme } from '../gfx/background';
import type { Co } from '../core/co';
import type { Solid } from './physics';
import type { Particles } from '../gfx/particles';
import type { Camera } from '../gfx/screen';
import type { CoRunner } from '../core/co';

export interface SolidDef {
  x: number;
  y: number;
  w: number;
  h: number;
  oneway?: boolean;
  kidPass?: boolean;
  /** 그리는 방식: block(기본) | ground | fence | car | bus | bench | crate | invisible | platform | wall */
  look?: string;
}

export interface DecorDef {
  icon: IconName;
  x: number;
  /** 바닥 y (기본 0) */
  y?: number;
  h: number;
  flip?: boolean;
  /** back(기본) | front */
  layer?: 'back' | 'front';
  color?: string;
  rot?: number;
}

export type EntityDef =
  | { type: 'box'; id: string; x: number; y?: number; size?: number }
  | { type: 'plate'; id: string; x: number; y?: number; w?: number; signal: string }
  | { type: 'gate'; id: string; x: number; y?: number; h?: number; w?: number; signal: string }
  | {
      type: 'resident';
      id: string;
      x: number;
      y?: number;
      kind?: 'adult' | 'child' | 'tall';
      savable?: boolean;
      /** 깨어난 뒤 행동: leave(기본: 왼쪽으로 떠남) | follow */
      after?: 'leave' | 'follow' | 'stay';
      leaveTo?: number;
    }
  | { type: 'petal'; id: string; x: number; y: number; color: string }
  | { type: 'memory'; id: string; x: number; y?: number; art: string }
  | { type: 'cctv'; id: string; x: number; y: number; mid: number; amp: number; period: number; phase?: number; len?: number; half?: number; pole?: boolean }
  | { type: 'faller'; id: string; x: number; h: number; dir: 1 | -1; trigger: number; icon?: IconName };

export interface TriggerDef {
  id: string;
  x: number;
  w: number;
  y?: number;
  h?: number;
  once?: boolean;
  checkpoint?: boolean;
  /** 체크포인트 부활 위치 (기본: 트리거 중앙) */
  spawnX?: number;
  hint?: { kb: string; touch?: string; dur?: number };
  script?: string;
}

export interface CamZone {
  x0: number;
  x1: number;
  zoom?: number;
  yOff?: number;
  lead?: number;
}

export interface LevelDef {
  id: string;
  width: number;
  killY: number;
  spawn: { x: number; y: number };
  theme: () => BgTheme;
  solids: SolidDef[];
  decor: DecorDef[];
  entities: EntityDef[];
  triggers: TriggerDef[];
  camZones: CamZone[];
  scripts: Record<string, (g: GameAPI) => Co>;
  ambience: () => void;
}

/** 엔티티/스크립트가 사용하는 게임 인터페이스 */
export interface GameAPI {
  t: number;
  dt: number;
  parts: Particles;
  cam: Camera;
  co: CoRunner;
  signals: Map<string, boolean>;
  petals: string[];
  saved: Set<string>;
  memories: Set<string>;
  flags: Set<string>;
  player: PlayerLike;
  solids(): Solid[];
  entity<T = unknown>(id: string): T | undefined;
  hint(kb: string, touch?: string, dur?: number): void;
  kill(cause: 'erase' | 'fall' | 'crush'): void;
  shake(v: number): void;
  startChase(opts?: { speed?: number; startOffset?: number }): void;
  stopChase(): void;
  chaseActive(): boolean;
  setControl(on: boolean): void;
  showMemory(art: string): void;
  endSlice(): void;
  isDead(): boolean;
}

export interface PlayerLike {
  x: number;
  y: number;
  facing: number;
  frozen: boolean;
  body: { x: number; y: number; w: number; h: number; vx: number; vy: number; onGround: boolean };
}
