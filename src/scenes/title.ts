import { app, enterFullscreen, exitFullscreen, type Scene } from '../app';
import { audio } from '../core/audio';
import { Save } from '../core/save';
import { DEFAULT_BINDS, RESERVED, keyName, type Bindable } from '../core/input';
import { clamp, ease, type EaseFn } from '../core/math';
import { drawFlower, drawGlow, PETAL_COLORS } from '../gfx/flower';
import { GameScene } from './game';

type Item = { label: string; act: () => void; disabled?: boolean };

/** 타이틀 + 메뉴 (DOM 오버레이) */
export class TitleScene implements Scene {
  u: number;
  private menu: HTMLDivElement | null = null;
  private items: Item[] = [];
  private sel = 0;
  private shown = false;
  private leaving = -1;
  private onLeave: (() => void) | null = null;
  private mode: 'main' | 'settings' = 'main';

  constructor(_from?: unknown, u = 4.1) {
    this.u = u;
  }

  enter() {
    app.input.setTouchVisible(false);
    if (!audio.getLoop('music')) audio.loop('music', 'music_despair', 0.55, 2, 'music');
  }

  exit() {
    this.menu?.remove();
    this.menu = null;
  }

  private build() {
    this.menu?.remove();
    const m = document.createElement('div');
    m.className = 'menu title-menu';
    const save = Save.load();
    if (this.mode === 'main') {
      this.items = [
        ...(save ? [{ label: '이어하기', act: () => this.start(true) }] : []),
        { label: save ? '처음부터' : '시작하기', act: () => (save ? this.confirmNew() : this.start(false)) },
        { label: '설정', act: () => this.openSettings() },
      ];
    } else {
      this.items = [];
    }
    if (this.mode === 'settings') {
      m.appendChild(settingsPanel(() => {
        this.mode = 'main';
        this.build();
      }));
    } else {
      this.items.forEach((it, i) => {
        const b = document.createElement('button');
        b.textContent = it.label;
        b.onclick = () => {
          audio.play('click2', { vol: 0.4 });
          this.sel = i;
          it.act();
        };
        b.onmouseenter = () => {
          this.sel = i;
          this.refresh();
        };
        m.appendChild(b);
      });
      const hint = document.createElement('p');
      hint.className = 'menu-hint';
      hint.textContent = app.input.touchMode ? '' : '↑ ↓ 선택 · Enter 결정';
      m.appendChild(hint);
    }
    app.ui.appendChild(m);
    this.menu = m;
    requestAnimationFrame(() => m.classList.add('show'));
    this.refresh();
  }

  private confirmArmed = false;
  /** 처음부터: 한 번 더 눌러야 저장이 지워진다 (브라우저 대화상자 대신) */
  private confirmNew() {
    if (this.confirmArmed) {
      this.start(false);
      return;
    }
    this.confirmArmed = true;
    const btn = this.menu?.querySelectorAll(':scope > button')[this.sel] as HTMLButtonElement | undefined;
    if (btn) btn.textContent = '저장이 지워집니다 · 한 번 더 누르기';
    setTimeout(() => {
      this.confirmArmed = false;
      if (btn) btn.textContent = '처음부터';
    }, 3000);
  }

  private openSettings() {
    this.mode = 'settings';
    this.build();
  }

  private refresh() {
    if (!this.menu) return;
    [...this.menu.querySelectorAll(':scope > button')].forEach((b, i) => b.classList.toggle('sel', i === this.sel));
  }

  private start(cont: boolean) {
    if (this.leaving >= 0) return;
    if (!cont) Save.clear();
    audio.play('bell2', { vol: 0.4, rate: 0.9 });
    this.leaving = 0;
    this.menu?.classList.remove('show');
    audio.getLoop('music')?.setVol(0, 2.5);
    audio.stopLoop('music', 3);
    audio.getLoop('ghost')?.setVol(0.1, 2);
    this.onLeave = () => app.setScene(new GameScene(cont ? Save.load() : null));
  }

  update(dt: number) {
    this.u += dt;
    const inp = app.input;
    if (!this.shown && (this.u > 4 || inp.anyPressed())) {
      this.shown = true;
      if (this.u < 4) this.u = 4;
      inp.consumeAll();
      this.build();
      return;
    }
    if (this.leaving >= 0) {
      this.leaving += dt;
      if (this.leaving > 1.6 && this.onLeave) {
        const f = this.onLeave;
        this.onLeave = null;
        f();
      }
      return;
    }
    if (this.shown && this.mode === 'main' && this.items.length) {
      if (inp.pressed('up')) {
        this.sel = (this.sel + this.items.length - 1) % this.items.length;
        audio.play('click4', { vol: 0.3 });
        this.refresh();
      }
      if (inp.pressed('down')) {
        this.sel = (this.sel + 1) % this.items.length;
        audio.play('click4', { vol: 0.3 });
        this.refresh();
      }
      if (inp.pressed('confirm') || inp.pressed('interact')) {
        audio.play('click2', { vol: 0.4 });
        this.items[this.sel].act();
      }
    } else if (this.mode === 'settings' && inp.pressed('back')) {
      this.mode = 'main';
      this.build();
    }
  }

  render(dt: number) {
    const shift = Math.min(1, Math.max(0, (this.u - 4) / 0.8));
    renderTitle(this.u, dt, this.shown ? easeShift(shift) : 0);
    if (this.leaving >= 0) app.post.fill(app.screen, '#000', Math.min(1, this.leaving / 1.4));
  }
}

const easeShift = (k: number) => 1 - Math.pow(1 - k, 3);

/** 설정 패널 (타이틀/일시정지 공용) */
export function settingsPanel(onBack: () => void) {
  const wrap = document.createElement('div');
  wrap.className = 'settings';
  const s = app.settings;
  const row = (label: string, key: 'master' | 'sfx' | 'amb' | 'music') => {
    const r = document.createElement('label');
    r.className = 'row';
    r.innerHTML = `<span>${label}</span>`;
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = '0';
    inp.max = '1';
    inp.step = '0.05';
    inp.value = String(s[key]);
    inp.oninput = () => {
      s[key] = parseFloat(inp.value);
      app.applySettings();
    };
    r.appendChild(inp);
    wrap.appendChild(r);
  };
  const toggle = (label: string, key: 'grain' | 'shake' | 'fullscreen') => {
    const r = document.createElement('label');
    r.className = 'row';
    r.innerHTML = `<span>${label}</span>`;
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.checked = s[key] !== false;
    inp.onchange = () => {
      s[key] = inp.checked;
      app.applySettings();
      if (key === 'fullscreen') {
        if (inp.checked) enterFullscreen();
        else exitFullscreen();
      }
    };
    r.appendChild(inp);
    wrap.appendChild(r);
  };
  row('전체 음량', 'master');
  row('효과음', 'sfx');
  row('환경음', 'amb');
  row('음악', 'music');
  toggle('필름 노이즈', 'grain');
  toggle('화면 흔들림', 'shake');
  toggle('전체 화면', 'fullscreen');
  wrap.appendChild(keyBindSection());
  const back = document.createElement('button');
  back.textContent = '돌아가기';
  back.onclick = () => {
    audio.play('click2', { vol: 0.4 });
    onBack();
  };
  wrap.appendChild(back);
  return wrap;
}

// ------------------------------------------------------------------
// 타이틀 그림. u = 타이틀 시작 후 경과 시간
// ------------------------------------------------------------------
const TITLE_FONT = '"Jost", "Futura", "Century Gothic", "Helvetica Neue", Arial, sans-serif';
const KR_FONT = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
const seg = (t: number, a: number, b: number, e: EaseFn = ease.inOutCubic) => e(clamp((t - a) / (b - a)));

export function renderTitle(u: number, dt: number, menuShift = 0) {
  const s = app.screen;
  const ctx = s.ctx;
  s.base(ctx);
  ctx.fillStyle = '#000';
  ctx.fillRect(-10, -10, s.W + 20, s.H + 20);
  const cx = s.W / 2;
  const cy = s.H * 0.42 - menuShift * 90;
  const word = 'MONOCHROME';
  const size = Math.min(150, s.W / 11);
  ctx.font = `300 ${size}px ${TITLE_FONT}`;
  const spacing = size * 0.24;
  const widths = [...word].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (word.length - 1);
  let x = cx - total / 2;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const baseY = cy + size * 0.35;
  for (let i = 0; i < word.length; i++) {
    const k = seg(u, 0.4 + i * 0.12, 1.6 + i * 0.12, ease.outCubic);
    if (i === 1) {
      // 첫 번째 O 자리에 꽃 한 송이 — 이 세계의 유일한 색
      const fx = x + widths[i] / 2;
      const fy = baseY - size * 0.36;
      const b = seg(u, 1.0, 2.6, ease.outBack);
      drawGlow(ctx, fx, fy, size * 0.9, PETAL_COLORS, 0.55 * b);
      drawFlower(ctx, fx, fy, size * 0.82, PETAL_COLORS, { stem: 0.0001, leaves: false, bloom: Math.max(0.01, b), spin: u * 0.15, alpha: clamp(b * 2) });
    } else {
      ctx.globalAlpha = k;
      ctx.fillStyle = '#f2f2ef';
      ctx.fillText(word[i], x, baseY + (1 - k) * 14);
    }
    x += widths[i] + spacing;
  }
  ctx.globalAlpha = seg(u, 1.6, 2.6);
  ctx.fillStyle = '#9a9a97';
  ctx.font = `400 ${size * 0.22}px ${TITLE_FONT}`;
  drawSpaced(ctx, 'THE', cx, cy - size * 0.68, size * 0.12);
  ctx.globalAlpha = seg(u, 2.4, 3.6);
  ctx.fillStyle = '#7c7c79';
  ctx.font = `300 ${size * 0.2}px ${KR_FONT}`;
  drawSpaced(ctx, '더 모노크롬', cx, baseY + size * 0.62, size * 0.09);
  ctx.globalAlpha = 1;
  app.post.apply(s, dt, 0.4, 0.06);
}

function drawSpaced(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, sp: number) {
  const ws = [...text].map((c) => ctx.measureText(c).width);
  const tot = ws.reduce((a, b) => a + b, 0) + sp * (text.length - 1);
  let x = cx - tot / 2;
  const al = ctx.textAlign;
  ctx.textAlign = 'left';
  [...text].forEach((c, i) => {
    ctx.fillText(c, x, y);
    x += ws[i] + sp;
  });
  ctx.textAlign = al;
}

// ------------------------------------------------------------------
// 조작 키 설정
// ------------------------------------------------------------------
const BIND_ROWS: [Bindable, string][] = [
  ['interact', '행동 · 꽃잎 건네기 · 잡기'],
  ['down', '굳기 · 구르기'],
  ['jump', '점프'],
  ['left', '왼쪽'],
  ['right', '오른쪽'],
];

function keyBindSection() {
  const box = document.createElement('div');
  box.className = 'keybinds';
  const title = document.createElement('p');
  title.className = 'kb-title';
  title.textContent = '조작 키  ·  버튼을 누른 뒤 원하는 키를 누르세요';
  box.appendChild(title);
  const btns = new Map<Bindable, HTMLButtonElement>();
  const current = () => ({ ...DEFAULT_BINDS, ...(app.settings.keys ?? {}) });
  const refresh = () => {
    const b = current();
    for (const [a, el] of btns) el.textContent = [...new Set(b[a].map(keyName))].join('  ·  ') || '없음';
  };
  let cancelCapture: (() => void) | null = null;
  for (const [act, label] of BIND_ROWS) {
    const row = document.createElement('div');
    row.className = 'row';
    const span = document.createElement('span');
    span.textContent = label;
    const btn = document.createElement('button');
    btn.className = 'keycap';
    btn.onclick = () => {
      cancelCapture?.();
      btn.textContent = '키를 누르세요…';
      btn.classList.add('wait');
      const onKey = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.code === 'Escape') return finish();
        if (RESERVED.includes(e.code)) {
          btn.textContent = `${keyName(e.code)} 는 쓸 수 없어요`;
          return;
        }
        const b = current();
        // 다른 조작에서 같은 키를 빼고, 비면 기본값으로 되돌린다
        for (const k of Object.keys(b) as Bindable[]) {
          if (k === act) continue;
          const rest = b[k].filter((c) => c !== e.code);
          b[k] = rest.length ? rest : DEFAULT_BINDS[k].filter((c) => c !== e.code);
        }
        b[act] = [e.code];
        app.settings.keys = b;
        app.applySettings();
        audio.play('click2', { vol: 0.4 });
        finish();
      };
      const finish = () => {
        window.removeEventListener('keydown', onKey, true);
        btn.classList.remove('wait');
        cancelCapture = null;
        refresh();
      };
      cancelCapture = finish;
      setTimeout(() => window.addEventListener('keydown', onKey, true), 0);
    };
    btns.set(act, btn);
    row.append(span, btn);
    box.appendChild(row);
  }
  const reset = document.createElement('button');
  reset.className = 'kb-reset';
  reset.textContent = '기본 키로 되돌리기';
  reset.onclick = () => {
    cancelCapture?.();
    app.settings.keys = undefined;
    app.applySettings();
    audio.play('click2', { vol: 0.4 });
    refresh();
  };
  box.appendChild(reset);
  refresh();
  return box;
}
