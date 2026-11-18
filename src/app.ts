import { Screen, type Layer } from './gfx/screen';
import { Input } from './core/input';
import { Post } from './gfx/post';
import { audio } from './core/audio';
import { Save, type Settings } from './core/save';

export interface Scene {
  enter?(): void;
  exit?(): void;
  update(dt: number): void;
  render(dt: number): void;
}

export const params = new URLSearchParams(location.search);
export const DEBUG = params.has('debug');

class App {
  screen!: Screen;
  input!: Input;
  post!: Post;
  /** 인물(픽토그램) 합성용 투명 레이어 */
  figLayer!: Layer;
  /** 보조 레이어 (여백 등) */
  fxLayer!: Layer;
  scene: Scene | null = null;
  settings: Settings = Save.loadSettings();
  time = 0;
  ui!: HTMLElement;

  init(canvas: HTMLCanvasElement) {
    this.screen = new Screen(canvas);
    this.input = new Input();
    this.post = new Post();
    this.figLayer = this.screen.makeLayer();
    this.fxLayer = this.screen.makeLayer();
    this.ui = document.getElementById('ui')!;
    this.applySettings();
  }

  applySettings() {
    const s = this.settings;
    audio.volumes = { master: s.master, sfx: s.sfx, amb: s.amb, music: s.music };
    audio.applyVolumes();
    this.post.enabled = s.grain;
    this.input?.setBinds(s.keys);
    Save.storeSettings(s);
  }

  setScene(s: Scene) {
    this.scene?.exit?.();
    this.scene = s;
    s.enter?.();
  }
}

export const app = new App();

// ------------------------------------------------------------------
// 전체 화면: 브라우저는 사용자가 누르기 전에는 허락하지 않으므로, 첫 클릭·터치·키 입력에서 바로 들어간다.
// 나갔다면(Esc 등) 다음 입력에서 다시 들어간다. 설정에서 끌 수 있다.
// ------------------------------------------------------------------
type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

export function isFullscreen() {
  const d = document as FsDoc;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

export function enterFullscreen() {
  if (isFullscreen()) return;
  const el = document.documentElement as FsEl;
  try {
    if (el.requestFullscreen) {
      el.requestFullscreen({ navigationUI: 'hide' }).then(lockLandscape, () => {});
    } else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch {
    /* 허락되지 않는 곳(일부 미리보기 창 등)에서는 그냥 창 크기로 */
  }
}

export function exitFullscreen() {
  if (!isFullscreen()) return;
  const d = document as FsDoc;
  try {
    if (d.exitFullscreen) d.exitFullscreen().catch(() => {});
    else d.webkitExitFullscreen?.();
  } catch {
    /* 무시 */
  }
}

function lockLandscape() {
  const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  try {
    o?.lock?.('landscape').catch(() => {});
  } catch {
    /* 지원하지 않는 기기 */
  }
}

function onGesture() {
  if (app.settings.fullscreen === false) return;
  enterFullscreen();
}
window.addEventListener('pointerdown', onGesture, true);
window.addEventListener('touchend', onGesture, true);
window.addEventListener('keydown', (e) => {
  // Esc 는 전체 화면을 나가는 키이므로 다시 들어가지 않는다
  if (e.key !== 'Escape') onGesture();
}, true);
