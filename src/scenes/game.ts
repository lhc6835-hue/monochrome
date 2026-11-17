import { app, DEBUG, params, type Scene } from '../app';
import { audio } from '../core/audio';
import { CoRunner } from '../core/co';
import { clamp, damp, ease, lerp, mulberry32, rand, TAU } from '../core/math';
import { Save, type SaveData } from '../core/save';
import { Camera } from '../gfx/screen';
import { Particles } from '../gfx/particles';
import { drawSky, drawLayers, type BgTheme } from '../gfx/background';
import { drawIcon, type IconName } from '../gfx/icons';
import { drawBlock, drawGroundSlab, drawCrack, INK } from '../gfx/ground';
import { drawFlower, drawGlow, drawPetal, PETAL_COLORS } from '../gfx/flower';
import { drawBlankFigure, drawErasedRegion, PAPER } from '../gfx/blank';
import { drawMemory } from '../gfx/memoryArt';
import { rigidPose } from '../gfx/figure';
import { Player, PH } from '../world/player';
import { Box, Entity, Resident, createEntity, type Prompt } from '../world/entities';
import type { Solid } from '../world/physics';
import type { GameAPI, LevelDef, TriggerDef } from '../world/types';
import { town, townCustomPrompt } from '../world/levels/town';
import { settingsPanel } from './title';

type Mode = 'play' | 'dying' | 'memory' | 'paused' | 'ending';

interface Flight {
  color: string;
  x0: number;
  y0: number;
  target: Resident;
  t: number;
  dur: number;
}

interface Snap {
  ents: Record<string, unknown>;
  fired: string[];
  spawn: { x: number; y: number };
}

const KR = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

export class GameScene implements Scene, GameAPI {
  level: LevelDef = town;
  t = 0;
  dt = 0;
  cam = new Camera();
  parts = new Particles();
  co = new CoRunner();
  signals = new Map<string, boolean>();
  petals: string[] = [...PETAL_COLORS];
  saved = new Set<string>();
  memories = new Set<string>();
  flags = new Set<string>();
  player = new Player();
  ents: Entity[] = [];
  byId = new Map<string, Entity>();
  staticSolids: Solid[] = [];
  private solidCache: Solid[] | null = null;
  theme: BgTheme;
  control = true;
  fired = new Set<string>();
  mode: Mode = 'play';
  private fadeA = 1;
  private fadeColor = '#000';
  private hintText = '';
  private hintT = 0;
  private hintDur = 0;
  chase = { active: false, front: 0, speed: 0, t: 0 };
  promptActive = false;
  private prompt: { p: Prompt; x: number; y: number; act: () => void } | null = null;
  private holdT = 0;
  private holdLock = false;
  private flights: Flight[] = [];
  private snap: Snap | null = null;
  private cpId = 'start';
  private dieT = 0;
  private memArt = '';
  private memT = 0;
  private endT = 0;
  private pauseEl: HTMLElement | null = null;
  private hudT = 3;
  private lastPetals = 7;
  private cpFlash = 0;
  playTime = 0;
  deaths = 0;
  private fg: { icon: IconName; x: number; h: number }[] = [];
  private dustT = 0;
  private erased = new Set<string>();
  private camLead = 0;
  private camY = -330;
  private fps = 60;

  constructor(private save: SaveData | null) {
    this.theme = this.level.theme();
    for (const s of this.level.solids) this.staticSolids.push({ ...s });
    for (const d of this.level.entities) {
      const e = createEntity(d);
      this.ents.push(e);
      this.byId.set(e.id, e);
    }
    // 근경 실루엣
    const rng = mulberry32(5);
    for (let x = -1200; x < 0; x += 900 + rng() * 1300) {
      this.fg.push({ icon: rng() < 0.5 ? 'lamp' : rng() < 0.5 ? 'tree' : 'pine', x, h: 420 + rng() * 200 });
    }
  }

  enter() {
    app.input.setTouchVisible(true);
    audio.muffle(0);
    this.level.ambience();
    if (this.save) {
      this.applySave(this.save);
    } else {
      const sx = params.has('x') ? parseFloat(params.get('x')!) : this.level.spawn.x;
      this.player.place(sx, this.level.spawn.y);
      this.snap = this.makeSnap(sx);
      if (!params.has('x')) this.co.run(this.level.scripts.opening(this), 'opening');
      // ?x 로 시작하면 지나온 트리거는 발동된 것으로
      if (params.has('x')) for (const tr of this.level.triggers) if (tr.x + tr.w < sx && tr.once) this.fired.add(tr.id);
    }
    this.snapCamera();
    this.fadeA = 1;
    this.fadeColor = '#000';
  }

  exit() {
    app.input.setTouchVisible(false);
    this.pauseEl?.remove();
    audio.stopAllLoops(1.2);
  }

  // ------------------------------------------------------------------
  // GameAPI
  // ------------------------------------------------------------------
  solids(): Solid[] {
    if (this.solidCache) return this.solidCache;
    const out = this.staticSolids.slice();
    for (const e of this.ents) if (e.solid) out.push(e.solid);
    this.solidCache = out;
    return out;
  }
  boxes(): Box[] {
    return this.ents.filter((e): e is Box => e instanceof Box);
  }
  entity<T = unknown>(id: string): T | undefined {
    return this.byId.get(id) as T | undefined;
  }
  hint(kb: string, touch?: string, dur = 4) {
    this.hintText = app.input.isTouch && touch ? touch : kb;
    this.hintT = 0;
    this.hintDur = dur;
  }
  kill(cause: 'erase' | 'fall' | 'crush') {
    if (this.mode !== 'play' || this.player.state === 'dead' || this.co.running('end')) return;
    this.player.die(cause);
    this.mode = 'dying';
    this.dieT = 0;
    this.deaths++;
    this.fadeColor = cause === 'erase' ? PAPER : '#000';
    if (cause === 'erase') {
      audio.play('paper_rip', { vol: 0.9 });
      audio.play('erase', { vol: 0.9, rate: 0.8 });
      this.parts.paper(this.player.x, this.player.y - 70, 22, 1.4);
    } else if (cause === 'crush') {
      audio.play('land_hard', { vol: 1 });
      audio.play('sting3', { vol: 0.6 });
      this.shake(0.7);
    } else {
      audio.play('sting4', { vol: 0.5 });
    }
    audio.muffle(0.6, 0.4);
  }
  shake(v: number) {
    this.cam.addShake(v);
  }
  startChase(o: { speed?: number; startOffset?: number } = {}) {
    this.chase = { active: true, front: this.player.x + (o.startOffset ?? -900), speed: o.speed ?? 0, t: 0 };
  }
  stopChase() {
    if (!this.chase.active) return;
    this.chase.active = false;
    audio.stopLoop('heart', 2);
    audio.stopLoop('chasebed', 2);
    audio.stopLoop('timeloop', 2);
  }
  chaseActive() {
    return this.chase.active;
  }
  setControl(on: boolean) {
    this.control = on;
  }
  showMemory(art: string) {
    this.mode = 'memory';
    this.memArt = art;
    this.memT = 0;
    audio.muffle(0.5, 0.6);
    audio.play('bell1', { vol: 0.35, rate: 0.8 });
  }
  endSlice() {
    this.mode = 'ending';
    this.endT = 0;
    this.flags.add('town_done');
    this.persist();
  }
  isDead() {
    return this.player.state === 'dead';
  }
  /** 발판 위에 무게가 있는지 */
  weightOn(x0: number, x1: number, y: number) {
    const on = (bx: number, by: number, w: number, grounded: boolean) => grounded && Math.abs(by - y) < 4 && bx + w / 2 > x0 + 8 && bx - w / 2 < x1 - 8;
    const p = this.player.body;
    if (this.player.state !== 'dead' && on(p.x, p.y, p.w, p.onGround)) return true;
    for (const e of this.ents) {
      if (e instanceof Box && on(e.body.x, e.body.y, e.body.w, e.body.onGround)) return true;
      if (e instanceof Resident && e.state !== 'gone' && e.state !== 'frozen' && on(e.body.x, e.body.y, e.body.w, true)) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------
  // 저장 / 체크포인트
  // ------------------------------------------------------------------
  private makeSnap(spawnX: number): Snap {
    const ents: Record<string, unknown> = {};
    for (const e of this.ents) ents[e.id] = e.save();
    return { ents, fired: [...this.fired], spawn: { x: spawnX, y: 0 } };
  }

  private persist() {
    if (!this.snap) return;
    const d: SaveData = {
      version: 1,
      region: this.level.id,
      checkpoint: this.cpId,
      snapshot: this.snap as unknown as Record<string, unknown>,
      petals: [...this.snapPetals],
      saved: [...this.snapSaved],
      memories: [...this.snapMem],
      flags: [...this.flags],
      playTime: this.playTime,
      deaths: this.deaths,
    };
    Save.store(d);
  }
  private snapPetals: string[] = [...PETAL_COLORS];
  private snapSaved: string[] = [];
  private snapMem: string[] = [];

  private checkpoint(tr: TriggerDef) {
    if (this.cpId === tr.id) return;
    this.cpId = tr.id;
    const sx = tr.spawnX ?? tr.x + tr.w / 2;
    this.snap = this.makeSnap(sx);
    this.snapPetals = [...this.petals];
    this.snapSaved = [...this.saved];
    this.snapMem = [...this.memories];
    this.persist();
    this.cpFlash = 1;
    audio.play('bell4', { vol: 0.25, rate: 1.6 });
  }

  private applySave(d: SaveData) {
    this.cpId = d.checkpoint;
    this.snap = d.snapshot as unknown as Snap;
    this.snapPetals = d.petals;
    this.snapSaved = d.saved;
    this.snapMem = d.memories;
    this.flags = new Set(d.flags);
    this.playTime = d.playTime;
    this.deaths = d.deaths;
    this.restore();
  }

  private restore() {
    const sn = this.snap;
    if (!sn) return;
    for (const e of this.ents) if (e.id in sn.ents) e.load(sn.ents[e.id] as never);
    this.fired = new Set(sn.fired);
    this.petals = [...this.snapPetals];
    this.saved = new Set(this.snapSaved);
    this.memories = new Set(this.snapMem);
    this.player.place(sn.spawn.x, sn.spawn.y);
    this.player.facing = 1;
    this.stopChase();
    this.co.stopAll();
    this.flights = [];
    this.erased.clear();
    this.control = true;
    this.solidCache = null;
    this.level.ambience();
    audio.muffle(0, 0.8);
    this.snapCamera();
  }

  private snapCamera() {
    this.camLead = this.player.facing * 140;
    this.cam.x = this.player.x + this.camLead;
    this.camY = this.player.y - 330;
    this.cam.y = this.camY;
    this.cam.zoom = 1;
  }

  // ------------------------------------------------------------------
  // 업데이트
  // ------------------------------------------------------------------
  update(dt: number) {
    this.fps = lerp(this.fps, 1 / Math.max(dt, 1e-3), 0.05);
    const inp = app.input;
    this.cam.shakeEnabled = app.settings.shake;
    if (this.mode === 'paused') return;
    if (this.mode === 'memory') {
      this.memT += dt;
      if (this.memT > 1.2 && (inp.pressed('confirm') || inp.pressed('interact') || inp.pressed('back') || inp.pressed('jump') || inp.anyPressed())) {
        this.mode = 'play';
        audio.muffle(0, 0.5);
        inp.consumeAll();
        this.holdLock = true;
      }
      return;
    }
    if (this.mode === 'ending') {
      this.endT += dt;
      if (this.endT > 8 && inp.anyPressed()) {
        audio.stopAllLoops(1.5);
        import('./title').then((m) => app.setScene(new m.TitleScene(undefined, 4.1)));
        this.endT = -999;
      }
      return;
    }
    if (inp.pressed('pause') && this.mode === 'play') {
      this.openPause();
      return;
    }

    this.dt = dt;
    this.t += dt;
    this.playTime += dt;
    this.fadeA = Math.max(0, this.fadeA - dt / (this.fadeColor === '#000' ? 1.4 : 0.9));
    this.hintT += dt;
    this.cpFlash = Math.max(0, this.cpFlash - dt);

    // 고정 간격 물리
    const steps = Math.ceil(dt / (1 / 120));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.physicsStep(h, i === 0);

    this.interactions(dt);
    this.triggers();
    this.updateChase(dt);
    this.updateFlights(dt);
    this.co.update(dt);

    // 떨어짐
    if (this.player.y > this.level.killY && this.player.state !== 'dead') this.kill('fall');

    if (this.mode === 'dying') {
      this.dieT += dt;
      if (this.dieT > 1.55) {
        this.restore();
        this.mode = 'play';
        this.fadeA = 1;
      }
    }

    // 꽃잎 수 변화 표시
    if (this.petals.length !== this.lastPetals) {
      this.hudT = 3.5;
      this.lastPetals = this.petals.length;
    }
    this.hudT = Math.max(0, this.hudT - dt);

    // 굳기: 세상이 먹먹해진다
    if (this.mode === 'play' && !this.chase.active) audio.muffle(this.player.freezeAmt * 0.45, 0.2);

    this.updateCamera(dt);
    this.parts.update(dt);
    this.ambientDust(dt);
  }

  private physicsStep(h: number, first: boolean) {
    this.solidCache = null;
    this.signals.clear();
    // 발판 먼저 (신호), 그 다음 나머지
    for (const e of this.ents) if (e.type === 'plate') e.update(this, h);
    for (const e of this.ents) if (e.type !== 'plate') e.update(this, h);
    this.solidCache = null;
    const inp = app.input;
    this.player.update(this, inp, this.control && this.mode === 'play', h);
    // 입력의 pressed 는 첫 서브스텝에서만 유효하도록
    if (first) {
      inp.consume('jump');
      inp.consume('down');
    }
  }

  private interactions(dt: number) {
    const p = this.player;
    const inp = app.input;
    let best: { p: Prompt; x: number; y: number; act: () => void } | null = null;
    let bestD = 1e9;
    if (this.mode === 'play' && this.control && p.state === 'normal' && p.body.onGround) {
      for (const e of this.ents) {
        const pos = e.interactPos();
        if (!pos) continue;
        const dx = Math.abs(p.x - pos[0]);
        if (dx > e.interactRange || Math.abs(p.y - (e instanceof Resident ? e.body.y : pos[1] + 150)) > 160) continue;
        const pr = e.prompt(this);
        if (!pr) continue;
        if (dx < bestD) {
          bestD = dx;
          best = { p: pr, x: pos[0], y: pos[1], act: () => this.doInteract(e) };
        }
      }
      const cp = townCustomPrompt(this);
      if (cp && !best) best = { p: { text: cp.text, hold: 0 }, x: cp.x, y: cp.y, act: cp.act };
    }
    this.prompt = best;
    this.promptActive = !!best && !best.p.disabled;
    if (!inp.down('interact')) this.holdLock = false;
    if (!best || best.p.disabled) {
      this.holdT = 0;
      return;
    }
    if (best.p.hold <= 0) {
      if (inp.pressed('interact') && !this.holdLock) {
        best.act();
        this.holdLock = true;
      }
    } else if (inp.down('interact') && !this.holdLock) {
      this.holdT += dt;
      if (this.holdT >= best.p.hold) {
        this.holdT = 0;
        this.holdLock = true;
        best.act();
      }
    } else this.holdT = Math.max(0, this.holdT - dt * 2);
  }

  private doInteract(e: Entity) {
    if (e instanceof Resident) {
      if (this.petals.length <= 1) return;
      const dir = e.body.x > this.player.x ? 1 : -1;
      this.player.startGive(dir);
      const color = this.petals.pop()!;
      audio.play('swish2', { vol: 0.3, rate: 0.8 });
      this.co.run(
        (function* (g: GameScene) {
          yield 0.32;
          const j = g.player.joints;
          const hand = j ? j.hand[j.near] : [g.player.x, g.player.y - 80];
          g.flights.push({ color, x0: hand[0], y0: hand[1] - 30, target: e, t: 0, dur: 0.75 });
          audio.play('bell3', { vol: 0.25, rate: 1.5 });
        })(this),
      );
    } else e.interact(this);
  }

  private updateFlights(dt: number) {
    for (const f of this.flights) {
      f.t += dt;
      if (f.t >= f.dur) f.target.awaken(this, f.color);
      else if (Math.random() < 0.6) {
        const [x, y] = this.flightPos(f);
        this.parts.add({ t: 'spark', x, y, vx: rand(-30, 30), vy: rand(-30, 30), life: 0.5, size: 5, color: f.color, drag: 2 });
      }
    }
    this.flights = this.flights.filter((f) => f.t < f.dur);
  }
  private flightPos(f: Flight): [number, number] {
    const k = ease.inOutSine(clamp(f.t / f.dur));
    const tx = f.target.body.x;
    const ty = f.target.body.y - f.target.scale * 0.9;
    const mx = (f.x0 + tx) / 2;
    const my = Math.min(f.y0, ty) - 120;
    const x = (1 - k) * (1 - k) * f.x0 + 2 * (1 - k) * k * mx + k * k * tx;
    const y = (1 - k) * (1 - k) * f.y0 + 2 * (1 - k) * k * my + k * k * ty;
    return [x, y];
  }

  private triggers() {
    if (this.mode !== 'play') return;
    const p = this.player;
    for (const tr of this.level.triggers) {
      if (this.fired.has(tr.id)) continue;
      const y0 = tr.y ?? -3000;
      const y1 = y0 + (tr.h ?? 6000);
      const py = p.y - 40;
      if (p.x < tr.x || p.x > tr.x + tr.w || py < y0 || py > y1) continue;
      if (tr.checkpoint) {
        this.checkpoint(tr);
        continue;
      }
      if (tr.once) this.fired.add(tr.id);
      if (tr.hint) this.hint(tr.hint.kb, tr.hint.touch, tr.hint.dur);
      if (tr.script) this.co.run(this.level.scripts[tr.script](this), tr.script);
    }
  }

  private updateChase(dt: number) {
    const c = this.chase;
    if (!c.active) return;
    c.t += dt;
    const p = this.player;
    const base = c.t < 1.7 ? 70 : Math.min(318, 140 + (c.t - 1.7) * 160);
    const gap = p.x - c.front;
    let sp = base;
    if (gap > 1000) sp = 560;
    else if (gap > 780) sp = base * 1.25;
    if (this.mode === 'dying') sp = 160;
    c.front += sp * dt;
    if (gap < 26 && p.state !== 'dead') this.kill('erase');
    // 지워지는 주민들
    for (const e of this.ents) {
      if (e instanceof Resident && !this.erased.has(e.id) && e.body.x < c.front + 20 && e.state !== 'gone') {
        this.erased.add(e.id);
        this.parts.paper(e.body.x, e.body.y - e.scale * 0.5, 12, 1);
        audio.play('erase', { vol: 0.5, rate: 0.9 + Math.random() * 0.3 });
      }
    }
    if (Math.random() < dt * 14) this.parts.paper(c.front + rand(-10, 30), rand(-700, -20), 1, 0.8);
    const hb = audio.getLoop('heart');
    if (hb) hb.setVol(clamp(1.1 - gap / 1000, 0.25, 1), 0.3);
  }

  private updateCamera(dt: number) {
    const p = this.player;
    const cam = this.cam;
    let zoom = 1,
      yOff = 0,
      lead = 150;
    for (const z of this.level.camZones) {
      if (p.x >= z.x0 && p.x <= z.x1) {
        zoom = z.zoom ?? zoom;
        yOff = z.yOff ?? yOff;
        lead = z.lead ?? lead;
      }
    }
    if (this.chase.active) {
      lead = 330;
      zoom = Math.min(zoom, 0.86);
    }
    this.camLead = damp(this.camLead, p.facing * lead, 1.6, dt);
    const ty = p.y - 330 + yOff;
    // 세로는 착지했을 때 위주로 따라간다
    this.camY = damp(this.camY, p.body.onGround || p.y > this.camY + 500 || p.y < this.camY + 120 ? ty : this.camY, p.body.onGround ? 3 : 2, dt);
    let tx = p.x + this.camLead;
    // 여백이 처음 나타날 때는 그쪽을 비춘다
    if (this.chase.active && this.chase.t < 2.3) {
      tx = (p.x + this.chase.front) / 2 - 80;
      this.camLead = tx - p.x;
    }
    cam.x = damp(cam.x, tx, this.chase.active && this.chase.t < 2.3 ? 2.5 : 6, dt);
    cam.y = this.camY;
    cam.zoom = damp(cam.zoom, zoom, 1.5, dt);
    // 레벨 경계
    const hw = app.screen.W / 2 / cam.zoom;
    cam.x = clamp(cam.x, -1600 + hw, this.level.width - 100 - hw);
    cam.update(dt);
  }

  private ambientDust(dt: number) {
    this.dustT += dt;
    const v = this.cam.view(app.screen);
    while (this.dustT > 0.09) {
      this.dustT -= 0.09;
      this.parts.add({
        t: 'ash',
        x: v.x0 + Math.random() * (v.x1 - v.x0),
        y: v.y0 - 10,
        vx: rand(-10, 30),
        vy: rand(25, 55),
        life: rand(8, 14),
        size: rand(1.2, 2.8),
        color: '#6a6a68',
        drag: 0,
      });
    }
  }

  // ------------------------------------------------------------------
  // 일시정지
  // ------------------------------------------------------------------
  private openPause() {
    this.mode = 'paused';
    audio.muffle(0.8, 0.2);
    const el = document.createElement('div');
    el.className = 'pause';
    const build = (settings = false) => {
      el.innerHTML = '';
      if (settings) {
        el.appendChild(settingsPanel(() => build(false)));
        return;
      }
      const h = document.createElement('h2');
      h.textContent = '일시정지';
      el.appendChild(h);
      const m = document.createElement('div');
      m.className = 'menu show';
      const items: [string, () => void][] = [
        ['계속하기', () => this.closePause()],
        [
          '마지막 체크포인트에서 다시',
          () => {
            this.closePause();
            this.kill('erase');
          },
        ],
        ['설정', () => build(true)],
        [
          '타이틀로',
          () => {
            this.closePause();
            this.mode = 'ending';
            this.endT = -999;
            import('./title').then((mm) => app.setScene(new mm.TitleScene(undefined, 4.1)));
          },
        ],
      ];
      let sel = 0;
      const btns = items.map(([label, act], i) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.onclick = () => {
          audio.play('click2', { vol: 0.4 });
          act();
        };
        b.onmouseenter = () => {
          sel = i;
          upd();
        };
        m.appendChild(b);
        return b;
      });
      const upd = () => btns.forEach((b, i) => b.classList.toggle('sel', i === sel));
      upd();
      el.appendChild(m);
      (el as HTMLElement & { _nav?: (d: number | 'go') => void })._nav = (d) => {
        if (d === 'go') btns[sel].click();
        else {
          sel = (sel + d + btns.length) % btns.length;
          upd();
          audio.play('click4', { vol: 0.3 });
        }
      };
    };
    build();
    app.ui.appendChild(el);
    this.pauseEl = el;
    const onKey = (e: KeyboardEvent) => {
      if (!this.pauseEl) {
        window.removeEventListener('keydown', onKey);
        return;
      }
      const nav = (el as HTMLElement & { _nav?: (d: number | 'go') => void })._nav;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (!e.repeat) this.closePause();
      } else if (nav && (e.code === 'ArrowDown' || e.code === 'KeyS')) nav(1);
      else if (nav && (e.code === 'ArrowUp' || e.code === 'KeyW')) nav(-1);
      else if (nav && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE')) nav('go');
    };
    setTimeout(() => window.addEventListener('keydown', onKey), 0);
  }

  private closePause() {
    this.pauseEl?.remove();
    this.pauseEl = null;
    if (this.mode === 'paused') this.mode = 'play';
    audio.muffle(0, 0.3);
    app.input.consumeAll();
  }

  // ------------------------------------------------------------------
  // 렌더
  // ------------------------------------------------------------------
  render(dt: number) {
    const s = app.screen;
    const ctx = s.ctx;
    const cam = this.cam;
    drawSky(ctx, s, this.theme);
    drawLayers(ctx, s, cam, this.theme);

    cam.apply(ctx, s, 1);
    const v = cam.view(s);
    // 장식 (뒤)
    for (const d of this.level.decor) {
      if (d.layer === 'front') continue;
      if (d.x + d.h < v.x0 || d.x - d.h > v.x1) continue;
      drawIcon(ctx, d.icon, d.x, d.y ?? 0, d.h, { flip: d.flip, color: d.color ?? '#262625', rot: d.rot });
    }
    drawCrack(ctx, 74, 0, 60, 3);
    drawCrack(ctx, -820, 0, 90, 8);
    // 고체
    for (const so of this.staticSolids) {
      if (so.x > v.x1 + 50 || so.x + so.w < v.x0 - 50) continue;
      this.drawSolid(ctx, so, v);
    }
    // 엔티티 (뒤)
    for (const e of this.ents) e.drawBack(ctx, this);
    // 꽃 빛
    this.player.drawGlow(ctx, this.petals);

    // 인물 레이어
    const L = app.figLayer;
    s.clearLayer(L);
    cam.apply(L.ctx, s, 1);
    for (const e of this.ents) {
      if (this.erased.has(e.id)) continue;
      e.drawFig(L.ctx, this);
    }
    this.player.draw(L.ctx, this, this.petals);
    s.composite(L);

    cam.apply(ctx, s, 1);
    for (const e of this.ents) e.drawFront(ctx, this);
    // 날아가는 꽃잎
    for (const f of this.flights) {
      const [x, y] = this.flightPos(f);
      drawGlow(ctx, x, y, 60, [f.color], 1);
      drawPetal(ctx, x, y, 16, f.color, this.t * 6);
    }

    // 여백
    if (this.chase.active || (this.mode === 'dying' && this.chase.front > 0 && this.chase.t > 0)) this.drawBlank(v);

    cam.apply(ctx, s, 1);
    this.parts.render(ctx);

    // 근경
    cam.apply(ctx, s, 1.3);
    const vf = cam.view(s, 1.3);
    for (const f of this.fg) {
      if (f.x + f.h < vf.x0 || f.x - f.h > vf.x1) continue;
      drawIcon(ctx, f.icon, f.x, 260, f.h, { color: '#0a0a0a', alpha: 0.92 });
    }

    if (DEBUG) this.drawDebug();

    // 후처리
    app.post.apply(s, dt, 0.55 + (this.chase.active ? 0.25 : 0), 0.07);
    // 추격 중 왼쪽 가장자리 하얗게
    if (this.chase.active) {
      const gap = this.player.x - this.chase.front;
      const a = clamp(1 - gap / 900) * 0.5;
      s.base(ctx);
      const g = ctx.createLinearGradient(0, 0, s.W * 0.4, 0);
      g.addColorStop(0, `rgba(246,245,241,${a})`);
      g.addColorStop(1, 'rgba(246,245,241,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s.W, s.H);
    }
    this.drawHUD();

    // 죽음 연출
    if (this.mode === 'dying') {
      const k = clamp((this.dieT - 0.55) / 0.8);
      app.post.fill(s, this.fadeColor, ease.inQuad(k));
    }
    if (this.fadeA > 0) app.post.fill(s, this.fadeColor, this.fadeA);
    if (this.cpFlash > 0) app.post.fill(s, '#ffffff', this.cpFlash * 0.05);

    if (this.mode === 'memory') drawMemory(s, this.memArt, this.memT, clamp(this.memT / 0.5));
    if (this.mode === 'ending') this.drawEnding();
  }

  private drawSolid(ctx: CanvasRenderingContext2D, so: Solid, v: { x0: number; x1: number; y0: number; y1: number }) {
    switch (so.look) {
      case 'invisible':
        return;
      case 'ground':
        drawGroundSlab(ctx, Math.max(so.x, v.x0 - 60), Math.min(so.x + so.w, v.x1 + 60), so.y, Math.min(so.h, v.y1 - so.y + 60));
        return;
      case 'bench':
        drawIcon(ctx, 'bench', so.x + so.w / 2, so.y + so.h, so.h * 1.25, { color: INK, sx: (so.w / (so.h * 1.25)) / 1.6 });
        ctx.fillStyle = INK;
        ctx.fillRect(so.x, so.y, so.w, 10);
        return;
      case 'car':
        drawIcon(ctx, 'car', so.x + so.w / 2, so.y + so.h + 4, so.h * 1.3, { color: INK, sx: so.w / (so.h * 1.3) / 1.0 });
        return;
      case 'bus':
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.roundRect(so.x, so.y, so.w, so.h - 26, 14);
        ctx.fill();
        ctx.fillStyle = '#c9c9c6';
        for (let i = 0; i < 4; i++) ctx.fillRect(so.x + 20 + i * 58, so.y + 22, 42, 38);
        ctx.fillStyle = INK;
        for (const wx of [so.x + 50, so.x + so.w - 50]) {
          ctx.beginPath();
          ctx.arc(wx, so.y + so.h - 22, 22, 0, TAU);
          ctx.fill();
        }
        return;
      case 'wall':
        drawBlock(ctx, so.x, so.y, so.w, so.h);
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 2;
        for (let y = so.y + 40; y < so.y + so.h; y += 40) {
          ctx.beginPath();
          ctx.moveTo(so.x, y);
          ctx.lineTo(so.x + so.w, y);
          ctx.stroke();
        }
        return;
      case 'building':
      case 'tower':
        drawBlock(ctx, so.x, so.y, so.w, so.h);
        ctx.fillStyle = '#bdbdba';
        for (let y = so.y + 34; y < so.y + so.h - 50; y += 62)
          for (let x = so.x + 26; x < so.x + so.w - 40; x += 64) ctx.fillRect(x, y, 30, 30);
        return;
      case 'billboard':
        ctx.fillStyle = INK;
        ctx.fillRect(so.x - 30, so.y - 400, 16, so.h + 400 + 80);
        ctx.fillRect(so.x + so.w + 14, so.y - 400, 16, so.h + 400 + 80);
        ctx.fillRect(so.x, so.y, so.w, so.h);
        drawIcon(ctx, 'warning', so.x + so.w / 2, so.y + so.h - 70, 120, { color: '#d9d9d6' });
        ctx.fillStyle = INK;
        ctx.fillRect(so.x, so.y - 400, so.w, 400);
        return;
      case 'bridge':
        drawBlock(ctx, so.x, so.y, so.w, so.h);
        ctx.fillStyle = INK;
        for (let x = so.x + 10; x < so.x + so.w; x += 40) ctx.fillRect(x, so.y - 50, 6, 50);
        ctx.fillRect(so.x, so.y - 54, so.w, 6);
        return;
      case 'platform':
        drawBlock(ctx, so.x, so.y, so.w, so.h);
        ctx.fillRect(so.x + so.w / 2 - 4, so.y + so.h, 8, 60);
        return;
      default:
        drawBlock(ctx, so.x, so.y, so.w, so.h);
    }
  }

  private drawBlank(v: { x0: number; x1: number; y0: number; y1: number }) {
    const s = app.screen;
    const ctx = s.ctx;
    const c = this.chase;
    const cam = this.cam;
    cam.apply(ctx, s, 1);
    drawErasedRegion(ctx, c.front, v.x0 - 100, v.y0 - 100, v.y1 + 100, this.t);
    // 여백의 몸
    const L = app.fxLayer;
    s.clearLayer(L);
    cam.apply(L.ctx, s, 1);
    const P = rigidPose();
    const rise = clamp(c.t / 1.6);
    P.turn = 0.85;
    P.lean = 0.3;
    P.arms[0].a = 1.35 + Math.sin(this.t * 2.3) * 0.12;
    P.arms[0].b = 0.15;
    P.arms[1].a = 1.0 + Math.sin(this.t * 2.3 + 1) * 0.15;
    P.arms[1].b = 0.25;
    P.legs[0].a = 0.25;
    P.legs[1].a = -0.15;
    P.legs[0].b = P.legs[1].b = 0.1;
    P.headTilt = Math.sin(this.t * 0.9) * 0.08;
    const bx = c.front - 60;
    const by = lerp(260, -20 + Math.sin(this.t * 1.7) * 14, ease.outCubic(rise));
    const scale = 430;
    drawBlankFigure(L.ctx, P, bx, by, scale, this.t);
    s.composite(L);
  }

  private drawHUD() {
    const s = app.screen;
    const ctx = s.ctx;
    s.base(ctx);
    // 꽃잎 수
    const nearSavable = !!this.prompt && this.prompt.p.text.includes('꽃잎');
    const hudA = Math.max(clamp(this.hudT), nearSavable ? 1 : 0, app.input.down('interact') ? 0.6 : 0);
    if (hudA > 0.01) {
      ctx.save();
      ctx.globalAlpha = hudA;
      drawGlow(ctx, 78, 92, 70, this.petals, 0.8);
      drawFlower(ctx, 78, 130, 38, this.petals, { stem: 1.0, sway: Math.sin(this.t * 1.5) * 0.06 });
      ctx.fillStyle = '#1a1a1a';
      ctx.font = `500 22px ${KR}`;
      ctx.textAlign = 'left';
      ctx.fillText(`× ${this.petals.length}`, 112, 102);
      ctx.restore();
    }
    // 상호작용 안내
    const pr = this.prompt;
    if (pr && this.mode === 'play') {
      const [sx, sy] = this.cam.toScreen(s, pr.x, pr.y - 40);
      const key = app.input.isTouch ? '행동' : 'E';
      ctx.save();
      ctx.font = `500 20px ${KR}`;
      const tw = ctx.measureText(pr.p.text).width;
      const w = tw + (pr.p.disabled ? 32 : 82);
      const x0 = sx - w / 2;
      const y0 = sy - 24 - Math.sin(this.t * 3) * 3;
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = '#0d0d0d';
      ctx.beginPath();
      ctx.roundRect(x0, y0, w, 46, 23);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (!pr.p.disabled) {
        ctx.fillStyle = '#efefec';
        ctx.beginPath();
        ctx.arc(x0 + 26, y0 + 23, 15, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#0d0d0d';
        ctx.font = `600 ${key.length > 1 ? 11 : 16}px ${KR}`;
        ctx.textAlign = 'center';
        ctx.fillText(key, x0 + 26, y0 + 29 - (key.length > 1 ? 1 : 0));
        if (pr.p.hold > 0 && this.holdT > 0) {
          ctx.strokeStyle = PETAL_COLORS[this.petals.length % 7] ?? '#fff';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(x0 + 26, y0 + 23, 20, -Math.PI / 2, -Math.PI / 2 + TAU * (this.holdT / pr.p.hold));
          ctx.stroke();
        }
      }
      ctx.fillStyle = pr.p.disabled ? '#8a8a87' : '#efefec';
      ctx.font = `500 20px ${KR}`;
      ctx.textAlign = 'left';
      ctx.fillText(pr.p.text + (pr.p.hold > 0 ? '  (길게)' : ''), x0 + (pr.p.disabled ? 16 : 52), y0 + 30);
      ctx.restore();
    }
    // 힌트
    if (this.hintText && this.hintT < this.hintDur + 0.6) {
      const a = clamp(this.hintT / 0.5) * clamp((this.hintDur + 0.6 - this.hintT) / 0.6);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `400 ${this.hintText.length <= 2 ? 64 : 25}px ${KR}`;
      ctx.textAlign = 'center';
      const y = this.hintText.length <= 2 ? s.H * 0.4 : s.H - 120;
      const g = ctx.createLinearGradient(0, y - 70, 0, y + 50);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, 'rgba(0,0,0,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 70, s.W, 120);
      ctx.fillStyle = '#f4f4f1';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 12;
      ctx.fillText(this.hintText, s.W / 2, y);
      ctx.restore();
    }
  }

  private drawEnding() {
    const s = app.screen;
    const ctx = s.ctx;
    const t = this.endT;
    app.post.fill(s, '#000', clamp(t / 1.5));
    s.base(ctx);
    ctx.textAlign = 'center';
    const line = (txt: string, y: number, t0: number, size = 24, color = '#d8d8d5') => {
      const a = clamp((t - t0) / 1.2);
      if (a <= 0) return;
      ctx.globalAlpha = a;
      ctx.fillStyle = color;
      ctx.font = `300 ${size}px ${KR}`;
      ctx.fillText(txt, s.W / 2, y);
    };
    const savable = this.ents.filter((e) => e instanceof Resident && e.savable).length;
    const mems = this.ents.filter((e) => e.type === 'memory').length;
    line('어둠 속에서도, 손에 든 꽃은 빛나고 있었다.', s.H * 0.38, 2.0, 26);
    line(`깨운 이웃  ${this.saved.size} / ${savable}      찾은 기억  ${this.memories.size} / ${mems}`, s.H * 0.5, 4.0, 19, '#8d8d8a');
    line('— 여기까지가 현재 개발된 부분입니다 —', s.H * 0.6, 5.5, 18, '#6f6f6c');
    if (t > 8) line('아무 키나 누르면 타이틀로 돌아갑니다', s.H * 0.8, 8, 16, '#5a5a57');
    ctx.globalAlpha = 1;
  }

  private drawDebug() {
    const s = app.screen;
    const ctx = s.ctx;
    this.cam.apply(ctx, s, 1);
    ctx.strokeStyle = 'rgba(255,0,0,0.7)';
    ctx.lineWidth = 2;
    for (const so of this.solids()) ctx.strokeRect(so.x, so.y, so.w, so.h);
    const b = this.player.body;
    ctx.strokeStyle = 'lime';
    ctx.strokeRect(b.x - b.w / 2, b.y - b.h, b.w, b.h);
    s.base(ctx);
    ctx.fillStyle = '#f00';
    ctx.font = '16px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`x ${b.x.toFixed(0)} y ${b.y.toFixed(0)} st ${this.player.state} fps ${this.fps.toFixed(0)} cp ${this.cpId}`, 20, s.H - 20);
  }
}

void PH;
void drawPetal;
void lerp;
