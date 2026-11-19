export type Action = 'left' | 'right' | 'up' | 'down' | 'jump' | 'interact' | 'pause' | 'confirm' | 'back';

/** 바꿀 수 있는 조작 */
export type Bindable = 'interact' | 'down' | 'jump' | 'left' | 'right';
export type Binds = Record<Bindable, string[]>;

export const DEFAULT_BINDS: Binds = {
  interact: ['KeyE', 'KeyX', 'ShiftLeft', 'ShiftRight'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyZ', 'ArrowUp', 'KeyW'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
};

/** 바꿀 수 없는 키 (메뉴용) */
export const RESERVED = ['Escape', 'Enter', 'Tab', 'KeyP', 'Backspace'];

const FIXED: Record<string, Action[]> = {
  ArrowUp: ['up'],
  KeyW: ['up'],
  Space: ['confirm'],
  KeyZ: ['confirm'],
  Enter: ['confirm', 'interact'],
  Escape: ['pause', 'back'],
  KeyP: ['pause'],
  Backspace: ['back'],
};

function buildKeymap(b: Binds): Record<string, Action[]> {
  const map: Record<string, Action[]> = {};
  const used = new Set<string>();
  for (const [a, codes] of Object.entries(b) as [Bindable, string[]][]) for (const c of codes) used.add(c);
  for (const [code, acts] of Object.entries(FIXED)) {
    // 다른 조작에 쓰인 키라면 사다리 '위' 기능은 빼고 메뉴 기능만 남긴다
    const keep = acts.filter((a) => !(a === 'up' && used.has(code) && !b.jump.includes(code)));
    if (keep.length) map[code] = [...keep];
  }
  for (const [a, codes] of Object.entries(b) as [Bindable, string[]][]) {
    for (const c of codes) (map[c] ??= []).push(a);
  }
  return map;
}

const KEY_NAMES: Record<string, string> = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space',
  ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
  AltLeft: 'Alt', AltRight: 'Alt', MetaLeft: 'Cmd', MetaRight: 'Cmd', CapsLock: 'CapsLock',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
};
export function keyName(code: string) {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

let KEYMAP: Record<string, Action[]> = buildKeymap(DEFAULT_BINDS);

/** 키보드 + 터치 통합 입력 */
export class Input {
  private held = new Map<Action, number>(); // action -> 눌린 소스 수
  private pressedSet = new Set<Action>();
  private releasedSet = new Set<Action>();
  private holdTime = new Map<Action, number>();
  anyPressedFlag = false;
  isTouch = false;
  private touchRoot: HTMLElement | null = null;
  touchVisible = false;
  /** 터치 기기에서 키보드를 쓰기 시작하면 터치 버튼을 숨긴다 */
  kbMode = false;
  binds: Binds = { ...DEFAULT_BINDS };

  get touchMode() {
    return this.isTouch && !this.kbMode;
  }

  setBinds(b: Partial<Binds> | undefined) {
    this.binds = { ...DEFAULT_BINDS, ...(b ?? {}) } as Binds;
    KEYMAP = buildKeymap(this.binds);
    for (const a of [...this.held.keys()]) this.releasedSet.add(a);
    this.held.clear();
  }

  /** 조작에 쓰이는 대표 키 이름 */
  label(a: Bindable) {
    const c = this.binds[a][0];
    return c ? keyName(c) : '?';
  }

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        if (KEYMAP[e.code]) e.preventDefault();
        return;
      }
      this.anyPressedFlag = true;
      if (this.isTouch && !this.kbMode) {
        this.kbMode = true;
        if (this.touchRoot) this.touchRoot.style.display = 'none';
      }
      const acts = KEYMAP[e.code];
      if (!acts) return;
      e.preventDefault();
      for (const a of acts) this.press(a);
    });
    window.addEventListener('keyup', (e) => {
      const acts = KEYMAP[e.code];
      if (!acts) return;
      for (const a of acts) this.release(a);
    });
    window.addEventListener('blur', () => {
      for (const a of [...this.held.keys()]) this.releasedSet.add(a);
      this.held.clear();
    });
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.enableTouch();
      // 화면 아무 곳이나 눌러도 '아무 키' (기억 그림 닫기, 엔딩 뒤 타이틀로 등)
      this.anyPressedFlag = true;
    });
    window.addEventListener('touchstart', () => {
      this.enableTouch();
      if (this.kbMode) {
        this.kbMode = false;
        if (this.touchRoot) this.touchRoot.style.display = this.touchVisible ? 'block' : 'none';
      }
    }, { passive: true });
    if (matchMedia('(pointer: coarse)').matches) this.enableTouch();
  }

  private press(a: Action) {
    const n = this.held.get(a) ?? 0;
    if (n === 0) {
      this.pressedSet.add(a);
      this.holdTime.set(a, 0);
    }
    this.held.set(a, n + 1);
  }
  private release(a: Action) {
    const n = this.held.get(a) ?? 0;
    if (n <= 1) {
      this.held.delete(a);
      this.releasedSet.add(a);
    } else this.held.set(a, n - 1);
  }

  down(a: Action) {
    return (this.held.get(a) ?? 0) > 0;
  }
  pressed(a: Action) {
    return this.pressedSet.has(a);
  }
  released(a: Action) {
    return this.releasedSet.has(a);
  }
  held_(a: Action) {
    return this.down(a) ? this.holdTime.get(a) ?? 0 : 0;
  }
  get axisX() {
    return (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
  }
  /** 키보드/터치 아무 입력이나 */
  anyPressed() {
    return this.anyPressedFlag;
  }
  /** 특정 입력을 소비 (같은 프레임에서 중복 처리 방지) */
  consume(a: Action) {
    this.pressedSet.delete(a);
  }
  consumeAll() {
    this.pressedSet.clear();
    this.anyPressedFlag = false;
  }

  endFrame(dt: number) {
    for (const a of this.held.keys()) this.holdTime.set(a, (this.holdTime.get(a) ?? 0) + dt);
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.anyPressedFlag = false;
  }

  // ---------------- 터치 컨트롤 ----------------
  enableTouch() {
    if (this.isTouch) return;
    this.isTouch = true;
    this.buildTouchUI();
  }

  setTouchVisible(v: boolean) {
    this.touchVisible = v;
    if (this.touchRoot) this.touchRoot.style.display = v && !this.kbMode ? 'block' : 'none';
  }

  private buildTouchUI() {
    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `
      <div class="tc-left">
        <button data-a="left" aria-label="왼쪽">◀</button>
        <button data-a="right" aria-label="오른쪽">▶</button>
      </div>
      <div class="tc-right">
        <button data-a="down" class="sm" aria-label="굳기">굳기</button>
        <button data-a="interact" class="sm" aria-label="행동">행동</button>
        <button data-a="jump" class="lg" aria-label="점프">점프</button>
      </div>
      <button data-a="pause" class="tc-pause" aria-label="일시정지">II</button>`;
    document.body.appendChild(root);
    this.touchRoot = root;
    root.style.display = this.touchVisible ? 'block' : 'none';
    const active = new Map<number, Action>();
    const btns = [...root.querySelectorAll<HTMLButtonElement>('button')];
    const hit = (x: number, y: number): Action | null => {
      for (const b of btns) {
        const r = b.getBoundingClientRect();
        const pad = 12;
        if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) return b.dataset.a as Action;
      }
      return null;
    };
    const setActive = (id: number, a: Action | null) => {
      const prev = active.get(id) ?? null;
      if (prev === a) return;
      if (prev) {
        this.release(prev);
        if (prev === 'jump') this.release('confirm');
        btns.find((b) => b.dataset.a === prev)?.classList.remove('on');
      }
      if (a) {
        active.set(id, a);
        this.press(a);
        this.anyPressedFlag = true;
        if (a === 'jump') this.press('confirm');
        btns.find((b) => b.dataset.a === a)?.classList.add('on');
      } else active.delete(id);
    };
    root.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      setActive(e.pointerId, hit(e.clientX, e.clientY));
    });
    root.addEventListener('pointermove', (e) => {
      if (!active.has(e.pointerId)) return;
      const a = hit(e.clientX, e.clientY);
      // 이동 버튼끼리는 미끄러지듯 전환 허용
      setActive(e.pointerId, a);
    });
    const end = (e: PointerEvent) => setActive(e.pointerId, null);
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    root.addEventListener('pointerleave', end);
  }
}
