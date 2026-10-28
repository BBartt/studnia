import { GameEngine } from '@studnia/shared/engine';
import { COLS, ROWS } from '@studnia/shared/protocol';

const STEP = 1 / 60;
const HISTORY_MS = 1500;
const SNAP_DISTANCE = 1.6; // większy rozjazd = przeskok do stanu serwera (np. zepchnięcie przez klocek)
const CORRECTION = 0.3;    // jaką część błędu poprawiamy przy każdej aktualizacji serwera

/**
 * Predykcja ruchu skoczka po stronie klienta.
 *
 * Bez niej każdy ruch czekał na serwer (opóźnienie = ping), co na hostingu
 * wygląda jak zacinanie. Teraz przeglądarka skoczka od razu liczy ruch tym samym
 * silnikiem co serwer, a gdy przychodzi stan z serwera, porównuje go ze swoją
 * pozycją sprzed ~pingu i łagodnie koryguje różnicę. Serwer nadal decyduje
 * o wszystkim (zgniecenie, lawa, wynik) — predykcja dotyczy tylko płynności.
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
      finish: () => {}, // lokalna symulacja nigdy nie kończy rundy
    });
    this.engine = e;
    this.acc = 0;
    this.history = [];
  }

  get state() {
    return this.engine.jumper;
  }

  setPhysics({ jumpPower = 1, runSpeed = 1 } = {}) {
    this.engine.settings = { jumpPower, runSpeed };
  }

  setInput(keys) {
    const e = this.engine;
    if (e.jumper) e.setJumperInput(keys);
    else e.input = { left: !!keys.left, right: !!keys.right, jump: !!keys.jump };
  }

  /** Nowy stan z serwera: aktualizujemy świat i korygujemy pozycję. */
  sync(snap, rttMs) {
    const e = this.engine;
    e.grid = snap.grid.map((row) => Array.from(row, (c) => (c === '.' ? null : c)));
    e.activeCells = new Set((snap.piece?.cells ?? []).map(([x, y]) => y * COLS + x));
    e.lava = snap.lava ?? [];
    const s = snap.jumper;

    if (!e.jumper || s.dead) return this.snapTo(s);
    const j = e.jumper;
    // klocek albo wyczyszczona linia weszły w lokalnego skoczka — ufamy serwerowi
    if (e.overlaps(j.x, j.y)) return this.snapTo(s);

    const past = this.sampleAt(performance.now() - rttMs) ?? j;
    const ex = s.x - past.x;
    const ey = s.y - past.y;
    if (Math.hypot(ex, ey) > SNAP_DISTANCE) return this.snapTo(s);

    const cx = ex * CORRECTION;
    const cy = ey * CORRECTION;
    if (!e.overlaps(j.x + cx, j.y)) j.x += cx;
    if (!e.overlaps(j.x, j.y + cy)) j.y += cy;
    for (const h of this.history) { h.x += cx; h.y += cy; }
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
  }

  /** Krok lokalnej fizyki (wywoływany co klatkę). */
  advance(dt) {
    const e = this.engine;
    const j = e.jumper;
    if (!j || j.dead) return;
    this.acc = Math.min(this.acc + dt, 0.1);
    const now = performance.now();
    while (this.acc >= STEP) {
      e.events.length = 0;
      e.updateJumper(STEP);
      j.dead = false; // o śmierci decyduje serwer
      this.acc -= STEP;
    }
    this.history.push({ t: now, x: j.x, y: j.y });
    while (this.history.length && this.history[0].t < now - HISTORY_MS) this.history.shift();
  }

  sampleAt(t) {
    const h = this.history;
    if (!h.length) return null;
    let best = h[0];
    for (const s of h) {
      if (Math.abs(s.t - t) < Math.abs(best.t - t)) best = s;
      if (s.t > t) break;
    }
    return best;
  }
}
