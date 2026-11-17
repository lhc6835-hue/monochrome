import '@fontsource/jost/latin-300.css';
import '@fontsource/jost/latin-400.css';
import './style.css';
import { app } from './app';
import { BootScene } from './scenes/boot';

app.init(document.getElementById('game') as HTMLCanvasElement);
app.setScene(new BootScene());

let last = performance.now();
function frame(now: number) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1; // 탭 전환 등으로 긴 프레임
  app.time += dt;
  const sc = app.scene;
  if (sc) {
    sc.update(dt);
    app.scene?.render(dt);
  }
  app.input.endFrame(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 디버그/테스트용 접근
(window as unknown as { __app: typeof app }).__app = app;
