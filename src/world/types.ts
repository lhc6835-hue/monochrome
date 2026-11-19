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
  /** back(기본) | front (인물 앞에 그린다) */
  layer?: 'back' | 'front';
  /** 아이콘 대신 그리는 모양 */
  shape?: 'bush';
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
      /** 반쯤 지워진 채 굳어 있다 (여백의 땅). 꽃잎을 받으면 다시 그려진다 */
      half?: boolean;
    }
  | { type: 'petal'; id: string; x: number; y: number; color: string }
  | { type: 'memory'; id: string; x: number; y?: number; art: string }
  | { type: 'cctv'; id: string; x: number; y: number; mid: number; amp: number; period: number; phase?: number; len?: number; half?: number; pole?: boolean }
  | { type: 'faller'; id: string; x: number; h: number; dir: 1 | -1; trigger: number; icon?: IconName }
  /** 물: x0~x1, 바닥 floor, 수면 low/high (신호가 켜지면 high) */
  | { type: 'water'; id: string; x0: number; x1: number; floor: number; low: number; high?: number; signal?: string; speed?: number; start?: number; swim?: boolean }
  | { type: 'lever'; id: string; x: number; y?: number; signal: string; on?: boolean }
  | { type: 'ladder'; id: string; x: number; top: number; bottom: number }
  /** 메아리: 소리로 사냥하는 하얀 존재 */
  | { type: 'echo'; id: string; x: number; y?: number; x0: number; x1: number; hunt?: boolean; dormant?: boolean }
  /** 천장 격자로 들어오는 빛줄기 */
  | { type: 'shaft'; id: string; x: number; w?: number; top?: number; bright?: number }
  /** 컨베이어 벨트 (윗면 y). sink 를 넘어간 굳은 주민은 기계 속으로 사라진다 */
  | { type: 'conveyor'; id: string; x0: number; x1: number; y: number; speed: number; auto?: boolean; sink?: number }
  /** 프레스: 머리가 floor 까지 내려찍는다. upY = 올라갔을 때 머리 아랫면 */
  | { type: 'press'; id: string; x: number; w: number; floor: number; upY: number; period: number; phase?: number; head?: number; big?: boolean }
  /** 검수대: 굳어 있지 않으면 통과할 수 없는 빛의 막 */
  | { type: 'scanner'; id: string; x: number; top: number; bottom: number }
  /** 위아래로 오가는 승강 발판 */
  | { type: 'lift'; id: string; x: number; w: number; y0: number; y1: number; period: number; phase?: number }
  /** 추격전: 천장 레일을 타고 쫓아오는 거대한 도장 */
  | { type: 'giant'; id: string; x: number; rail: number; floor: number }
  /** 화물열차 (마지막에 뛰어오른다) */
  | { type: 'train'; id: string; x: number; y: number }
  /** 열차 칸 (그림만, 충돌은 레벨의 solids 로) */
  | { type: 'car'; id: string; x: number; w: number; kind: 'box' | 'flat' | 'container' | 'passenger' | 'tender' | 'loco' }
  /** 열차를 스쳐 지나가는 것들: 머리 높이 빔, 철교 하단 철골, 터널, 끊긴 다리 */
  | { type: 'hazard'; id: string; kind: 'beam' | 'bar' | 'tunnel' | 'cliff'; w?: number }
  /** 기록대: 움직임을 기록했다가 '과거의 나'로 되풀이한다 */
  | { type: 'recorder'; id: string; x: number; y?: number; dur?: number }
  /** 새 떼 (n 마리, 중심 x 에서 ±spread) */
  | { type: 'flock'; id: string; x: number; y?: number; n?: number; spread?: number; size?: number }
  /** 술래: 나무 앞 x 에 선 아이(child = 주민 id)가 x0 ~ x 구역을 지켜본다 */
  | { type: 'seeker'; id: string; x: number; x0: number; child: string }
  /** 조수: low(썰물 수면 y) ↔ high(만조 수면 y). timing = [썰물 유지, 밀물, 만조 유지, 썰물] 초. post = 눈금 기둥 x */
  | { type: 'tide'; id: string; x0: number; x1: number; floor: number; low: number; high: number; timing?: [number, number, number, number]; offset?: number; swim?: boolean; post?: number }
  /** 부표: y = 윗면, heavy = 밟으면 가라앉음 */
  | { type: 'buoy'; id: string; x: number; y: number; w?: number; amp?: number; period?: number; phase?: number; heavy?: boolean }
  /** 등대 불빛: (x, y) 에서 mid ± amp 로 훑는다. signal 이 켜지면 (한 번 켜지면 계속) */
  | { type: 'beacon'; id: string; x: number; y: number; mid: number; amp: number; period: number; len?: number; half?: number; signal?: string; sweep?: [number, number] }
  /** 빛이 닿을 때만 단단한 발판. by = 등대 id 또는 'flower'(꽃빛). h 가 없으면 위로만 막는 판자 */
  | { type: 'litplank'; id: string; x: number; y: number; w: number; h?: number; by: string; hold?: number }
  /** 지우개: y ~ y+h 띠를 x0 ~ x1 로 dir 방향으로 가로지른다 (period 마다) */
  | { type: 'eraser'; id: string; x0: number; x1: number; y: number; h: number; period: number; phase?: number; dir: 1 | -1 }
  /** 거대한 손 (연출이 slam 을 부른다) */
  | { type: 'hands'; id: string }
  /** 여백의 시선: (x, y) 에서 mid ± amp 로 훑는다. 연출이 active 를 켠다 */
  | { type: 'gaze'; id: string; x: number; y: number; mid: number; amp: number; period: number; half: number };

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
  spawnY?: number;
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
  /** 어둠 정도 (0 = 밝음, 1 = 완전한 어둠). 꽃이 빛을 낸다 */
  dark?: number;
  /** 이 구간을 처음 시작할 때의 위치 (기본 spawn) */
  startScript?: string;
  /** 천장에서 물방울이 떨어진다 */
  drips?: boolean;
  /** 달리는 열차 위: 배경이 trainSpeed 로 흘러간다 */
  moving?: boolean;
  /** 장식 뒤, 고체 앞에 그리는 구간 고유 그림 (선로 등) */
  drawBack?: (ctx: CanvasRenderingContext2D, g: GameAPI, v: { x0: number; x1: number; y0: number; y1: number }) => void;
  /** 장식·고체·엔티티 뒤 그림 다음, 인물 앞에 그리는 구간 고유 그림 (지나간 사람의 흔적 등) */
  drawMid?: (ctx: CanvasRenderingContext2D, g: GameAPI, v: { x0: number; x1: number; y0: number; y1: number }) => void;
  /** 바람/위험을 피할 수 있는 곳 (열차 칸 안 등) */
  sheltered?: (x: number, y: number) => boolean;
  /** 체크포인트에서 다시 시작할 때 */
  onRestore?: (g: GameAPI) => void;
  /** 떨어졌을 때의 죽음 (기본 fall). 여백의 땅에서는 하얗게 지워진다 */
  fallCause?: 'fall' | 'erase';
  /** 여백이 지운 자리의 색 (기본 흰 종이). 흰 땅에서는 회색 빈칸 */
  eraseColor?: string;
  customPrompt?: (g: GameAPI) => { text: string; x: number; y: number; act: () => void; hold?: number } | null;
  /** 화면 위에 덧그리기 (크레딧 등, 화면 좌표) */
  drawOverlay?: (ctx: CanvasRenderingContext2D, g: GameAPI, W: number, H: number) => void;
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
  kill(cause: 'erase' | 'fall' | 'crush' | 'drown' | 'grab'): void;
  /** 소리를 낸다 (메아리가 듣는다) */
  noise(x: number, y: number, r: number): void;
  /** 해당 위치의 물 (없으면 null) */
  waterAt(x: number, y?: number): { level: number; floor: number; x0: number; x1: number } | null;
  goToLevel(id: string): void;
  /** 달리는 열차 속도 (배경과 지나가는 장애물이 이 속도로 흐른다) */
  trainSpeed: number;
  /** 바람 (x 방향 속도, 음수 = 뒤로 밀림) */
  wind: number;
  windAt(x: number, y: number): number;
  /** 잠깐 어두워지기 (터널) 0..1 */
  darkBoost: number;
  sheltered(x: number, y: number): boolean;
  shake(v: number): void;
  startChase(opts?: { speed?: number; startOffset?: number; max?: number }): void;
  /** 아래에서 차오르는 여백 (수직 추격) */
  startFlood(opts?: { startOffset?: number; max?: number }): void;
  stopFlood(): void;
  stopChase(): void;
  chaseActive(): boolean;
  setControl(on: boolean): void;
  showMemory(art: string): void;
  /** 기억 조각을 처음 봤을 때: 꽃잎이 하나 돋는다 */
  budPetal(): void;
  endSlice(): void;
  isDead(): boolean;
  // ---- 연출 (명장면) ----
  /** 느린 화면 배율 (1 = 보통) */
  timeScale: number;
  /** 느린 화면과 상관없는 실제 프레임 시간 */
  realDt: number;
  camFocus: CamFocus | null;
  /** 영화처럼 위아래 검은 띠 */
  letterbox(on: boolean): void;
  /** 화면 아래의 한 줄 (이야기 글씨체) */
  caption(text: string, dur?: number, ink?: boolean): void;
  /** 색이 물결처럼 번져 나간다 (회색 세상에 잠깐 색이 든다) */
  colorWave(x: number, y: number, o?: { dur?: number; r?: number }): void;
  /** 꽃빛 말고도 스케치를 그리는 빛 (여백의 땅: 이웃들이 비추는 색) */
  extraLights: { x: number; y: number; r: number; color: string }[];
}

/** 연출이 여백(거대한 흰 인물)을 직접 움직일 때 */
export interface BlankCtl {
  bx: number;
  by: number;
  lean: number;
  crouch?: number;
  head: number;
  /** 앞쪽 손이 뻗을 세계 좌표 (null = 평소 팔) */
  hand: [number, number] | null;
  /** 다른 팔 [a, b] */
  hand2?: [number, number];
  /** 발끝부터 지워진 정도 (0..1) */
  erase?: number;
  /** 끓던 연필 윤곽이 멈춘다 */
  still?: boolean;
  /** 가슴에 차오르는 색 (0..1) */
  glow?: number;
  alpha?: number;
  /** 크기 (기본 430) */
  scale?: number;
  /** 바라보는 쪽 (1 = 오른쪽, -1 = 왼쪽, 사이 값은 돌아서는 중) */
  face?: number;
  /** 두 팔로 눈을 가린 정도 (술래처럼, 0..1) */
  cover?: number;
  /** 가슴에 차오르는 색 (없으면 무지개) */
  glowColor?: string;
  /** 인물들 뒤에 그린다 (주인공이 여백 앞에 서 있을 때) */
  behind?: boolean;
  /** 앞쪽 손에 손가락을 그린다: 0 = 활짝 편 손 ~ 1 = 움켜쥔 주먹 (없으면 둥근 손끝) */
  grip?: number;
}
export interface CamFocus {
  x: number;
  y: number;
  zoom: number;
  smooth?: number;
}

export interface PlayerLike {
  x: number;
  y: number;
  facing: number;
  frozen: boolean;
  body: { x: number; y: number; w: number; h: number; vx: number; vy: number; onGround: boolean };
}
