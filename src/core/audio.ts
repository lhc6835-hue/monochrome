import { rand } from './math';

const SOUND_FILES = [
  'step1', 'step2', 'step3', 'step4', 'land', 'land_hard', 'thud', 'metal_fall', 'glass_break',
  'scrape', 'scrape2', 'click1', 'click2', 'click3', 'click4', 'click5', 'swish1', 'swish2', 'swish3',
  'bell1', 'bell2', 'bell3', 'bell4', 'chime', 'gong', 'erase', 'paper_rip', 'paper_crush', 'whoosh',
  'ghost_breath', 'heart_slow', 'heart_fast', 'elevator_door', 'door_open', 'door_close', 'slam', 'switch',
  'lever', 'clank', 'clunk', 'weird1', 'weird2', 'sting1', 'sting2', 'sting3', 'sting4', 'sting5',
  'amb_town', 'amb_ghost', 'amb_wind', 'chase_bed', 'horror_long', 'time_loop', 'music_despair',
  'splash1', 'splash2', 'splash3', 'bubble1', 'bubble2', 'drip1', 'drip2', 'amb_drain', 'amb_dungeon', 'amb_rumble',
  'water_loop', 'mstep1', 'mstep2', 'mstep3', 'mstep4', 'machine', 'valve', 'rattle',
  'amb_factory', 'conveyor', 'machine_loop', 'alarm_loop', 'train_engine', 'whistle', 'hiss1', 'hiss2',
  'flip1', 'flip2', 'flip3', 'typewriter', 'squeak',
  // 칼림바 한 음 (G4, OpenGameArt 'Kalimba Two-Notes' by railkill, CC0) — 주제 선율은 이 음의 높이를 바꿔 연주한다
  'kalimba',
] as const;
export type SoundName = (typeof SOUND_FILES)[number];
/** 칼림바 표본의 실제 음높이 (G4 조금 높게) */
const KALIMBA_HZ = 396.3;

export interface PlayOpts {
  vol?: number;
  rate?: number;
  /** 피치 랜덤 폭 (0.05 = ±5%) */
  vary?: number;
  pan?: number;
  delay?: number;
  bus?: 'sfx' | 'amb' | 'music';
}

export interface LoopHandle {
  name: SoundName;
  gain: GainNode;
  src: AudioBufferSourceNode;
  stop(fade?: number): void;
  setVol(v: number, fade?: number): void;
  setRate(r: number, fade?: number): void;
}

/** WebAudio 기반 사운드 시스템. 버스: sfx / amb / music → 필터 → 컴프레서 → 출력 */
export class Audio {
  ctx: AudioContext | null = null;
  private buffers = new Map<SoundName, AudioBuffer>();
  master!: GainNode;
  buses!: Record<'sfx' | 'amb' | 'music', GainNode>;
  lowpass!: BiquadFilterNode;
  loaded = 0;
  total = SOUND_FILES.length;
  private loops = new Map<string, LoopHandle>();
  volumes = { master: 0.9, sfx: 1, amb: 0.8, music: 0.7 };

  /** 사용자 제스처 안에서 호출 */
  unlock() {
    if (this.ctx) {
      if ((this.ctx.state as string) !== 'running' && !document.hidden) this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    // 폰에서 다른 앱으로 나갔다 오면 소리가 멈춘 채로 남는다 (iOS: interrupted).
    // 다음 터치·키 입력 때 다시 켜고, 보이지 않는 동안에는 소리를 끈다
    const wake = () => this.unlock();
    for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, wake, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend().catch(() => {});
      else ctx.resume().catch(() => {});
    });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    this.master = ctx.createGain();
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 20000;
    this.lowpass.Q.value = 0.5;
    this.buses = { sfx: ctx.createGain(), amb: ctx.createGain(), music: ctx.createGain() };
    for (const b of Object.values(this.buses)) b.connect(this.lowpass);
    // 음악에만 옅은 잔향 (방 안에서 울리는 것처럼): 짧은 되울림 + 높은 소리는 조금 깎는다
    const echo = ctx.createDelay(1);
    echo.delayTime.value = 0.21;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    const send = ctx.createGain();
    send.gain.value = 0.38;
    this.buses.music.connect(send);
    send.connect(echo);
    echo.connect(tone);
    tone.connect(fb);
    fb.connect(echo);
    tone.connect(this.lowpass);
    this.lowpass.connect(this.master);
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.buses.sfx.gain.value = this.volumes.sfx;
    this.buses.amb.gain.value = this.volumes.amb;
    this.buses.music.gain.value = this.volumes.music;
  }

  async loadAll(onProgress?: (p: number) => void) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const base = import.meta.env.BASE_URL + 'audio/';
    await Promise.all(
      SOUND_FILES.map(async (n) => {
        try {
          // 단일 HTML 빌드: 소리가 base64 로 페이지 안에 들어 있다
          const embedded = (window as unknown as { __MONO_AUDIO?: Record<string, string> }).__MONO_AUDIO?.[n];
          let arr: ArrayBuffer;
          if (embedded) {
            const bin = atob(embedded);
            const u8 = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
            arr = u8.buffer;
          } else {
            const res = await fetch(base + n + '.mp3');
            arr = await res.arrayBuffer();
          }
          const buf = await new Promise<AudioBuffer>((ok, err) => ctx.decodeAudioData(arr, ok, err));
          this.buffers.set(n, buf);
        } catch (e) {
          console.warn('sound load failed', n, e);
        }
        this.loaded++;
        onProgress?.(this.loaded / this.total);
      }),
    );
  }

  get now() {
    return this.ctx?.currentTime ?? 0;
  }

  play(name: SoundName, o: PlayOpts = {}) {
    const ctx = this.ctx;
    const buf = this.buffers.get(name);
    if (!ctx || !buf) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const vary = o.vary ?? 0;
    src.playbackRate.value = (o.rate ?? 1) * (1 + rand(-vary, vary));
    const g = ctx.createGain();
    g.gain.value = o.vol ?? 1;
    let node: AudioNode = g;
    if (o.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      g.connect(p);
      node = p;
    }
    src.connect(g);
    node.connect(this.buses[o.bus ?? 'sfx']);
    src.start(ctx.currentTime + (o.delay ?? 0));
    return src;
  }

  // ------------------------------------------------------------------
  // 합성 음악: 명장면에서만 쓰는 오르골 음과 부드러운 화음 (음원 없이 코드로)
  // ------------------------------------------------------------------
  /** 반음 → 주파수 (0 = 라 바로 위 레, D4) */
  static note(semi: number) {
    return 293.66 * Math.pow(2, semi / 12);
  }
  /**
   * 주제 선율의 한 음: 녹음된 칼림바 한 음(G4)의 높이를 바꿔 연주한다.
   * semi 는 D4 기준 반음. 칼림바의 따뜻한 음역에 맞춰 한 옥타브 낮춰 탄다.
   */
  musicBox(semi: number, o: { vol?: number; delay?: number; decay?: number; pan?: number } = {}) {
    const rate = Audio.note(semi - 12) / KALIMBA_HZ;
    this.play('kalimba', { rate, vol: (o.vol ?? 0.2) * 3.6, delay: o.delay, pan: o.pan, bus: 'music' });
  }
  /** 화음: 칼림바로 아래에서 위로 살짝 퉁기듯 (따로 끄는 소리 없이, 저절로 사라진다) */
  pad(semis: number[], o: { vol?: number; delay?: number; attack?: number; hold?: number; release?: number } = {}) {
    // 칼림바가 탁해지지 않는 음역(대략 G3 ~ D5)으로 옮겨 탄다
    const notes = [...new Set(semis.map((n) => {
      let m = n;
      while (m < -7) m += 12;
      while (m > 12) m -= 12;
      return m;
    }))].sort((a, b) => a - b);
    notes.forEach((n, i) => {
      const rate = Audio.note(n) / KALIMBA_HZ;
      this.play('kalimba', { rate, vol: (o.vol ?? 0.09) * 4, delay: (o.delay ?? 0) + i * 0.07, pan: (i - (notes.length - 1) / 2) * 0.18, bus: 'music' });
    });
  }

  /** 이름 붙은 루프. 같은 id가 이미 있으면 볼륨만 조정 */
  loop(id: string, name: SoundName, vol = 1, fade = 1, bus: 'sfx' | 'amb' | 'music' = 'amb', rate = 1): LoopHandle | null {
    const ctx = this.ctx;
    const buf = this.buffers.get(name);
    if (!ctx || !buf) return null;
    const ex = this.loops.get(id);
    if (ex && ex.name === name) {
      ex.setVol(vol, fade);
      return ex;
    }
    if (ex) ex.stop(fade);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(vol, ctx.currentTime, Math.max(0.01, fade / 4));
    src.connect(g);
    g.connect(this.buses[bus]);
    src.start(ctx.currentTime, rand(0, buf.duration * 0.5));
    const h: LoopHandle = {
      name,
      gain: g,
      src,
      stop: (f = 1) => {
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.setTargetAtTime(0, t, Math.max(0.01, f / 4));
        src.stop(t + f + 0.1);
        if (this.loops.get(id) === h) this.loops.delete(id);
      },
      setVol: (v, f = 0.5) => {
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.setTargetAtTime(v, t, Math.max(0.01, f / 4));
      },
      setRate: (r, f = 0.5) => {
        src.playbackRate.setTargetAtTime(r, ctx.currentTime, Math.max(0.01, f / 4));
      },
    };
    this.loops.set(id, h);
    return h;
  }

  getLoop(id: string) {
    return this.loops.get(id);
  }
  stopLoop(id: string, fade = 1) {
    this.loops.get(id)?.stop(fade);
  }
  stopAllLoops(fade = 1) {
    for (const l of [...this.loops.values()]) l.stop(fade);
  }

  /** 먹먹한 소리 (0 = 정상, 1 = 아주 먹먹) */
  muffle(amount: number, time = 0.4) {
    if (!this.ctx) return;
    const f = 20000 * Math.pow(250 / 20000, amount);
    this.lowpass.frequency.setTargetAtTime(f, this.ctx.currentTime, time / 3);
  }

  step(i: number, vol = 0.5, metal = false) {
    const n = (metal ? (['mstep1', 'mstep2', 'mstep3', 'mstep4'] as const) : (['step1', 'step2', 'step3', 'step4'] as const))[i % 4];
    this.play(n, { vol, vary: 0.08 });
  }
}

export const audio = new Audio();
