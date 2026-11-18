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
