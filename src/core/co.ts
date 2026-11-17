/**
 * 코루틴: 스크립트 연출용.
 *   yield 0.5        → 0.5초 대기
 *   yield () => cond → 조건이 참이 될 때까지 대기
 *   yield            → 한 프레임 대기
 */
export type CoYield = number | (() => boolean) | undefined | void;
export type Co = Generator<CoYield, void, unknown>;

interface Task {
  gen: Co;
  wait: number;
  until: (() => boolean) | null;
  tag: string;
}

export class CoRunner {
  private tasks: Task[] = [];

  run(gen: Co, tag = '') {
    const t: Task = { gen, wait: 0, until: null, tag };
    this.tasks.push(t);
    this.step(t, 0);
    return t;
  }

  stop(tag: string) {
    this.tasks = this.tasks.filter((t) => t.tag !== tag);
  }
  stopAll() {
    this.tasks = [];
  }
  running(tag: string) {
    return this.tasks.some((t) => t.tag === tag);
  }

  private step(t: Task, dt: number): boolean {
    if (t.wait > 0) {
      t.wait -= dt;
      if (t.wait > 0) return true;
    }
    if (t.until) {
      if (!t.until()) return true;
      t.until = null;
    }
    const r = t.gen.next();
    if (r.done) return false;
    const v = r.value;
    if (typeof v === 'number') t.wait = v;
    else if (typeof v === 'function') t.until = v;
    return true;
  }

  update(dt: number) {
    const list = this.tasks.slice();
    for (const t of list) {
      if (!this.tasks.includes(t)) continue;
      if (!this.step(t, dt)) this.tasks = this.tasks.filter((x) => x !== t);
    }
  }
}

/** 시간 동안 매 프레임 f(진행도 0..1) 호출 */
export function* tween(dur: number, f: (k: number) => void, getDt: () => number): Co {
  let t = 0;
  f(0);
  while (t < dur) {
    yield;
    t += getDt();
    f(Math.min(1, t / dur));
  }
}
