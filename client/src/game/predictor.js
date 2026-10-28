import { GameEngine } from '@studnia/shared/engine';
import { COLS, ROWS } from '@studnia/shared/protocol';

const STEP = 1 / 60;
const HISTORY_MS = 6000;
const SNAP_DISTANCE = 1.6;  // większy rozjazd = przeskok do stanu serwera (np. zepchnięcie przez klocek)
const DEADZONE = 0.04;      // drobne różnice ignorujemy — nie warto za nimi gonić
const CORRECTION_RATE = 12; // jak szybko (1/s) rozpuszczamy błąd w kolejnych klatkach

/**
 * Predykcja ruchu skoczka po stronie klienta.
 *
 * Przeglądarka skoczka liczy jego ruch od razu, tym samym silnikiem co serwer.
 * Każda zmiana klawiszy ma numer (seq). Serwer odsyła numer ostatniej zastosowanej zmiany
 * i ile czasu symulacji od niej minęło (age). Obie symulacje od tej chwili liczą
 * to samo wejście, więc porównujemy
 * stan serwera z lokalną historią dokładnie w tej samej chwili gry — niezależnie
 * od pingu i nierówności łącza — i poprawiamy różnicę płynnie, bez szarpnięć.
 * O zgnieceniu, lawie i wyniku nadal decyduje serwer.
 */
export class JumperPredictor {
  constructor() {
    const e = Object.create(GameEngine.prototype);
    Object.assign(e, {
      settings: { jumpPower: 1, runSpeed: 1 },
      grid: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
      activeCells: new Set(),
      lava: [],
      events: [],
      result: null,
      input: { left: false, right: false, jump: false },
      jumper: null,
      simTime: 0,
      finish: () => {},
    });
    this.engine = e;
    this.acc = 0;
    this.history = [];   // { t, x, y } — t w ms lokalnego zegara
    this.inputs = [];    // { seq, t } — kiedy lokalnie zastosowaliśmy wejście
    this.pending = { x: 0, y: 0 };
    this.prev = null; // stan sprzed ostatniego kroku fizyki — do rysowania pozycji pośredniej
  }

  get state() {
    return this.engine.jumper;
  }

  /**
   * Pozycja do narysowania: interpolacja między dwoma ostatnimi krokami fizyki.
   * Bez tego ruch idzie „schodkami” (raz 1, raz 2 kroki na klatkę), co na monitorach
   * 120/144 Hz i przy nierównych klatkach wygląda jak zacinanie.
   */
  renderPosition() {
    const j = this.engine.jumper;
    if (!j || !this.prev) return j;
    const a = this.acc / STEP;
    return { x: this.prev.x + (j.x - this.prev.x) * a, y: this.prev.y + (j.y - this.prev.y) * a };
  }

  setPhysics({ jumpPower = 1, runSpeed = 1 } = {}) {
    this.engine.settings = { jumpPower, runSpeed };
  }

  /** Lokalnie stosujemy wejście natychmiast i zapamiętujemy, kiedy. */
  setInput(keys, seq) {
    const e = this.engine;
    if (e.jumper) e.setJumperInput(keys);
    else e.input = { left: !!keys.left, right: !!keys.right, jump: !!keys.jump };
    if (seq) {
      this.inputs.push({ seq, t: performance.now() });
      if (this.inputs.length > 200) this.inputs.splice(0, this.inputs.length - 200);
    }
  }

  sync(snap) {
    const e = this.engine;
    e.grid = snap.grid.map((row) => Array.from(row, (c) => (c === '.' ? null : c)));
    e.activeCells = new Set((snap.piece?.cells ?? []).map(([x, y]) => y * COLS + x));
    e.lava = snap.lava ?? [];
    const s = snap.jumper;

    if (!e.jumper || s.dead) return this.snapTo(s);
    const j = e.jumper;
    if (e.overlaps(j.x, j.y)) return this.snapTo(s);

    // chwila lokalnej gry odpowiadająca stanowi serwera
    const input = this.inputs.find((i) => i.seq === s.seq);
    const past = input ? this.sampleAt(input.t + s.age) : null;
    if (!past) {
      // brak punktu odniesienia (np. tuż po starcie) — reagujemy tylko na duży rozjazd
      if (Math.hypot(s.x - j.x, s.y - j.y) > SNAP_DISTANCE * 1.5) this.snapTo(s);
      return;
    }

    const ex = s.x - past.x;
    const ey = s.y - past.y;
    if (Math.hypot(ex, ey) > SNAP_DISTANCE) return this.snapTo(s);
    if (Math.abs(ex) < DEADZONE && Math.abs(ey) < DEADZONE) { this.pending = { x: 0, y: 0 }; return; }
    this.pending = { x: ex, y: ey };
    j.chain = s.chain;
  }

  snapTo(s) {
    const prev = this.engine.input;
    this.engine.jumper = {
      x: s.x, y: s.y, vx: s.vx, vy: s.vy,
      ground: s.ground, face: s.face, dead: s.dead,
      wall: s.wall ?? 0, wallDir: s.wall ?? 0, chain: s.chain ?? 0,
      coyote: 0, buffer: 0, impact: 0, controlLock: 0, wallCoyote: 0,
    };
    this.engine.input = prev;
    this.history = [];
    this.pending = { x: 0, y: 0 };
    this.prev = null;
  }

  advance(dt) {
    const e = this.engine;
    const j = e.jumper;
    if (!j || j.dead) return;

    // płynne rozpuszczanie błędu (zamiast skoku o 30% przy każdej paczce z serwera)
    const k = Math.min(1, dt * CORRECTION_RATE);
    const cx = this.pending.x * k;
    const cy = this.pending.y * k;
    if (cx || cy) {
      if (!e.overlaps(j.x + cx, j.y)) j.x += cx;
      if (!e.overlaps(j.x, j.y + cy)) j.y += cy;
      this.pending.x -= cx;
      this.pending.y -= cy;
      if (this.prev) { this.prev.x += cx; this.prev.y += cy; }
      for (const h of this.history) { h.x += cx; h.y += cy; }
    }

    this.acc = Math.min(this.acc + dt, 0.1);
    while (this.acc >= STEP) {
      this.prev = { x: j.x, y: j.y };
      e.events.length = 0;
      e.updateJumper(STEP);
      j.dead = false; // o śmierci decyduje serwer
      this.acc -= STEP;
    }
    const now = performance.now();
    this.history.push({ t: now, x: j.x, y: j.y });
    while (this.history.length && this.history[0].t < now - HISTORY_MS) this.history.shift();
  }

  /** Pozycja z historii w chwili t (interpolacja między próbkami). */
  sampleAt(t) {
    const h = this.history;
    if (!h.length || t < h[0].t) return null;
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i].t <= t) {
        const a = h[i];
        const b = h[i + 1];
        if (!b) return a;
        const f = (t - a.t) / (b.t - a.t || 1);
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      }
    }
    return h[0];
  }
}
