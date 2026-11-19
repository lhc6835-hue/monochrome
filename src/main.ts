import '@fontsource/jost/latin-300.css';
import '@fontsource/jost/latin-400.css';
import './style.css';
import { app } from './app';
import { BootScene } from './scenes/boot';

app.init(document.getElementById('game') as HTMLCanvasElement);
app.setScene(new BootScene());

let last = performance.now();
// 프레임이 계속 느리면 렌더 해상도를 한 단계씩 낮춘다 (저사양 폰에서 버벅이지 않게)
let slowT = 0;
let sampleT = 0;
function adaptQuality(dt: number) {
  if (document.hidden || dt > 0.05) return; // 탭 전환·순간 끊김은 세지 않는다
  sampleT += dt;
  if (sampleT < 4) return; // 시작 직후 로딩 끊김은 무시
  slowT = dt > 1 / 42 ? slowT + dt : Math.max(0, slowT - dt * 0.5);
  if (slowT > 2.5 && app.screen.quality > 0.66) {
    app.screen.quality = app.screen.quality > 0.9 ? 0.8 : 0.65;
    app.screen.resize();
    slowT = 0;
  }
}
function frame(now: number) {
  let dt = (now - last) / 1000;
  last = now;
  adaptQuality(dt);
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
