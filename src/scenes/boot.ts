import { app, params, type Scene } from '../app';
import { audio } from '../core/audio';
import { Save } from '../core/save';
import { StoryScene } from './story';
import { TitleScene } from './title';
import { GameScene } from './game';

/** 첫 화면: 클릭/터치로 오디오를 깨우고 사운드를 불러온다 */
export class BootScene implements Scene {
  private state: 'wait' | 'loading' | 'ready' = 'wait';
  private t = 0;
  private progress = 0;
  private fontsReady = false;
  private readyT = 0;

  enter() {
    const go = () => {
      if (this.state !== 'wait') return;
      this.state = 'loading';
      audio.unlock();
      audio.loadAll((p) => (this.progress = p)).then(() => {
        this.state = 'ready';
      });
    };
    const once = () => {
      go();
      window.removeEventListener('pointerdown', once);
      window.removeEventListener('keydown', once);
    };
    window.addEventListener('pointerdown', once);
    window.addEventListener('keydown', once);
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts) {
      Promise.all([fonts.load('300 100px Jost'), fonts.load('400 100px Jost')])
        .catch(() => {})
        .then(() => (this.fontsReady = true));
    } else this.fontsReady = true;
  }

  update(dt: number) {
    this.t += dt;
    app.input.consumeAll();
    if (this.state === 'ready' && this.fontsReady) {
      this.readyT += dt;
      if (this.readyT > 0.6) {
        if (params.has('skip') || params.has('x')) app.setScene(new GameScene(params.has('continue') ? Save.load() : null));
        else if (params.has('title')) app.setScene(new TitleScene(undefined, 4.1));
        else app.setScene(new StoryScene());
      }
    }
  }

  render() {
    const s = app.screen;
    const ctx = s.ctx;
    s.base(ctx);
    ctx.fillStyle = '#000';
    ctx.fillRect(-10, -10, s.W + 20, s.H + 20);
    ctx.textAlign = 'center';
    ctx.font = '400 26px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
    const a = 0.55 + 0.35 * Math.sin(this.t * 2.2);
    if (this.state === 'wait') {
      ctx.fillStyle = `rgba(235,235,232,${a})`;
      ctx.fillText(app.input.isTouch ? '화면을 눌러 시작하세요' : '클릭하거나 아무 키나 눌러 시작하세요', s.W / 2, s.H / 2);
      ctx.fillStyle = 'rgba(150,150,147,0.8)';
      ctx.font = '400 19px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
      ctx.fillText('헤드폰 사용을 권장합니다', s.W / 2, s.H / 2 + 48);
    } else {
      const w = 260;
      ctx.fillStyle = '#333';
      ctx.fillRect(s.W / 2 - w / 2, s.H / 2, w, 2);
      ctx.fillStyle = '#ddd';
      ctx.fillRect(s.W / 2 - w / 2, s.H / 2, w * this.progress, 2);
      const fade = this.state === 'ready' ? 1 - Math.min(1, this.readyT / 0.5) : 1;
      ctx.globalAlpha = fade;
      ctx.globalAlpha = 1;
    }
  }
}
