const KEY = 'the-monochrome/save/v1';
const SETTINGS_KEY = 'the-monochrome/settings/v1';

export interface SaveData {
  version: 1;
  region: string;
  checkpoint: string;
  /** 체크포인트 시점의 엔티티 상태 스냅샷 */
  snapshot: Record<string, unknown>;
  petals: string[];
  saved: string[];
  memories: string[];
  flags: string[];
  playTime: number;
  deaths: number;
}

export interface Settings {
  master: number;
  sfx: number;
  amb: number;
  music: number;
  shake: boolean;
  grain: boolean;
  /** 바꾼 조작 키 (없으면 기본값) */
  keys?: Partial<Record<'interact' | 'down' | 'jump' | 'left' | 'right', string[]>>;
}

export const defaultSettings: Settings = { master: 0.9, sfx: 1, amb: 0.8, music: 0.7, shake: true, grain: true };

function read<T>(k: string): T | null {
  try {
    const s = localStorage.getItem(k);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* 저장 불가 환경 (사생활 보호 모드 등) */
  }
}

export const Save = {
  load: () => read<SaveData>(KEY),
  store: (d: SaveData) => write(KEY, d),
  clear: () => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* noop */
    }
  },
  loadSettings: (): Settings => ({ ...defaultSettings, ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}) }),
  storeSettings: (s: Settings) => write(SETTINGS_KEY, s),
};
