import { COLS, ROWS, JUMPER_SIZE, JUMPER_VIEW, INTRO, isLava } from '@studnia/shared/protocol';
import { createBlockSprites } from './blockSprites.js';
import { PALETTES } from './palette.js';

const TAU = Math.PI * 2;
const JW = JUMPER_SIZE.w;
const JH = JUMPER_SIZE.h;
const VW = JUMPER_VIEW.cols;
const VH = JUMPER_VIEW.rows;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutBack = (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const easeOut = (t) => 1 - (1 - t) ** 3;

/** Gdzie patrzy kamera skoczka (lewy górny róg okna widzenia, w kratkach). */
export function jumperCamera(jx, jy) {
  return {
    x: clamp(jx + JW / 2 - VW / 2, 0, COLS - VW),
    // skoczek trochę poniżej środka kadru — widzi więcej z tego, co spada
    y: clamp(jy + JH / 2 - VH * 0.6, 0, ROWS - VH),
  };
}

/**
 * Rysuje planszę. Stan przychodzi z serwera (push), a efekty, kamera
 * i animacje żyją wyłącznie po stronie klienta.
 */
export class BoardRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sprites = createBlockSprites();
    this.reduced = false;
    this.showDanger = true;
    this.pal = PALETTES.dark;
    this.mode = 'full';           // 'full' (Tetris) albo 'jumper' (ograniczone pole widzenia)
    this.phase = 'lobby';
    this.countdownEndsAt = 0;
    this.countdownTotal = 5000;

    this.snap = null;
    this.view = null;             // wygładzona pozycja skoczka
    this.cam = null;              // wygładzona kamera skoczka
    this.zoom = 0;                // 0 = cała plansza, 1 = pole widzenia skoczka
    this.trail = [];
    this.particles = [];
    this.rings = [];
    this.sweeps = [];
    this.popCells = [];           // kopie czyszczonych klocków, które „pękają”
    this.streaks = [];
    this.pillars = [];            // słupy światła wystrzeliwujące z czyszczonych linii
    this.fall = null;             // opadanie rzędów po wyczyszczeniu linii
    this.lockPulse = null;        // błysk świeżo położonego klocka
    this.spawnT = 1;              // pojawianie się nowego klocka
    this.boardFlash = null;
    this.spin = null;
    this.shake = 0;
    this.time = 0;
    this.deadFor = 0;
    this.slideDust = 0;
    this.snow = Array.from({ length: 30 }, () => ({
      x: Math.random() * COLS, y: Math.random() * ROWS,
      r: rand(0.03, 0.08), v: rand(0.2, 0.6), p: Math.random() * TAU,
    }));
    this.buffer = [];        // stany skoczka z serwera do płynnej interpolacji (ekran Tetrisa)
    this.clockOffset = null; // lokalny zegar − zegar serwera (najmniejsza zaobserwowana różnica)
    this.offsets = [];
    this.backdropCache = null;
    this.vignetteCache = null;
    this.stats = { frames: [], arrivals: [], loopGap: 0 };
    this.setOptions(options);
    this.resize();
  }

  /** Statystyki do panelu diagnostycznego. */
  getStats() {
    const now = performance.now();
    const frames = this.stats.frames.filter((f) => f.t > now - 2000);
    const arrivals = this.stats.arrivals.filter((t) => t > now - 2000);
    let maxGap = 0;
    for (let i = 1; i < arrivals.length; i++) maxGap = Math.max(maxGap, arrivals[i] - arrivals[i - 1]);
    const avgFrame = frames.length ? frames.reduce((a, f) => a + f.d, 0) / frames.length : 0;
    return {
      fps: avgFrame ? Math.round(1000 / avgFrame) : 0,
      worstFrame: Math.round(Math.max(0, ...frames.map((f) => f.d))),
      updates: Math.round(arrivals.length / 2),
      maxGap: Math.round(maxGap),
      loopGap: this.stats.loopGap,
      dpr: this.dpr,
    };
  }

  /** Predykcja skoczka (tylko na ekranie skoczka) i źródło pingu do korekty. */
  setPredictor(predictor, latency) {
    this.predictor = predictor;
    this.latency = latency;
  }

  setPiecePredictor(piecePredictor) {
    this.piecePredictor = piecePredictor;
  }

  setOptions({ reducedMotion, showDanger, lite, theme, mode, phase, countdownEndsAt, countdownTotal } = {}) {
    if (reducedMotion !== undefined) this.reduced = reducedMotion;
    if (lite !== undefined) this.lite = lite;
    if (showDanger !== undefined) this.showDanger = showDanger;
    if (theme && PALETTES[theme] !== this.pal) {
      this.pal = PALETTES[theme] ?? PALETTES.dark;
      this.backdropCache = null;
    }
    if (mode) this.mode = mode;
    if (phase) this.phase = phase;
    if (countdownEndsAt !== undefined) this.countdownEndsAt = countdownEndsAt;
    if (countdownTotal !== undefined) this.countdownTotal = countdownTotal;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2); // powyżej 2× różnicy nie widać, a koszt rośnie kwadratowo
    this.backdropCache = null;
    this.vignetteCache = null;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.cs = Math.min(rect.width / COLS, rect.height / ROWS);
    this.offsetX = (rect.width - this.cs * COLS) / 2;
    this.offsetY = (rect.height - this.cs * ROWS) / 2;
  }

  push(snap, { replayEvents = true } = {}) {
    if (!snap) {
      this.snap = null;
      this.view = null;
      this.cam = null;
      this.trail = [];
      return;
    }
    if (replayEvents) for (const e of snap.events ?? []) this.onEvent(e);
    const now = performance.now();
    this.stats.arrivals.push(now);
    if (this.stats.arrivals.length > 200) this.stats.arrivals.splice(0, 100);
    this.stats.loopGap = snap.loopGap ?? 0;
    if (this.predicting()) this.predictor.sync(snap);
    this.piecePredictor?.sync(snap);
    this.bufferJumper(snap, now);
    const j = snap.jumper;
    if (!this.view || Math.hypot(j.x - this.view.x, j.y - this.view.y) > 2.5) {
      this.view = { x: j.x, y: j.y };
      this.cam = jumperCamera(j.x, j.y);
      this.trail = [];
    }
    if (!j.dead) this.deadFor = 0;
    this.snap = snap;
  }

  /** Pozycja punktu planszy na ekranie (w % wymiarów canvasu) — dla napisów nad planszą. */
  project(x, y) {
    const t = this.viewTransform();
    return {
      x: ((x - t.x0) * t.s / COLS) * 100,
      y: ((y - t.y0) * t.s / ROWS) * 100,
    };
  }

  /* ---------- Zdarzenia → efekty ---------- */

  onEvent(e) {
    const pal = this.pal;
    switch (e.type) {
      case 'lines': {
        const cleared = e.rows.map((r) => r.y);
        // każdy rząd nad wyczyszczonymi spada o tyle, ile linii zniknęło pod nim
        const drop = Array(ROWS).fill(0);
        for (let o = 0; o < ROWS; o++) {
          if (cleared.includes(o)) continue;
          const below = cleared.filter((c) => c > o).length;
          drop[o + below] = below;
        }
        for (let r = 0; r < cleared.length; r++) drop[r] = cleared.length;
        this.fall = { drop, t: 0, d: 0.34 };

        if (this.lockPulse) {
          this.lockPulse.cells = this.lockPulse.cells
            .filter(([, y]) => !cleared.includes(y))
            .map(([x, y]) => [x, y + cleared.filter((c) => c > y).length]);
        }

        const power = e.count + Math.min(e.combo, 4) * 0.5;
        e.rows.forEach((row, ri) => {
          this.sweeps.push({ y: row.y, t: -ri * 0.05, d: 0.45 });
          row.cells.forEach((type, x) => {
            const color = pal.pieces[type] ?? pal.label;
            const delay = -Math.abs(x - 4.5) * 0.02 - ri * 0.05;
            this.popCells.push({ x, y: row.y, color, t: delay, d: 0.42 });
            // słup światła z każdej kratki — wyższy przy większej liczbie linii
            if (!this.lite) this.pillars.push({ x, y: row.y, color, t: delay, d: 0.55 + power * 0.04, h: rand(3, 6) + power * 1.5 });
            const away = x < COLS / 2 ? -1 : 1;
            this.burst(x + 0.5, row.y + 0.5, color, 3, { speed: 5 + power, up: 4 + power * 0.5, size: 0.34, vxBias: away * (3 + power) });
            this.burst(x + 0.5, row.y + 0.5, `rgb(${pal.sweep})`, 1, { speed: 8 + power, up: 3, size: 0.1 });
            if (x % 2 === 0) this.burst(x + 0.5, row.y + 0.5, pal.gold, 1, { speed: 6, up: 6, size: 0.14, gravity: 6 });
          });
          for (let k = 0; k < 2; k++) {
            this.rings.push({ x: COLS / 2, y: row.y + 0.5, t: -k * 0.12, d: 0.6, max: COLS * (0.7 + k * 0.4), color: k ? pal.gold : `rgb(${pal.sweep})`, width: 0.16 });
          }
        });
        if (e.count >= 4) {
          this.boardFlash = { t: 0, d: 0.85, color: pal.gold };
          for (let k = 0; k < 3; k++) {
            this.rings.push({ x: COLS / 2, y: e.rows[0].y + 2, t: -k * 0.15, d: 1, max: ROWS * (0.6 + k * 0.3), color: k === 1 ? `rgb(${pal.sweep})` : pal.gold, width: 0.35 });
          }
        } else {
          this.boardFlash = { t: 0, d: 0.35 + e.count * 0.08, color: e.combo >= 2 ? pal.gold : `rgb(${pal.sweep})` };
        }
        this.kick(7 + e.count * 5 + Math.min(5, e.combo * 1.5));
        break;
      }
      case 'hardDrop': {
        const color = pal.pieces[e.piece];
        this.streaks.push({ cells: e.cells, color, distance: e.distance, t: 0, d: 0.3 });
        const bottom = Math.max(...e.cells.map((c) => c[1])) + 1;
        const xs = e.cells.map((c) => c[0]);
        const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2;
        this.rings.push({ x: cx, y: bottom, t: 0, d: 0.35, max: 2.4, color, width: 0.12 });
        this.kick(Math.min(8, 2 + e.distance * 0.35));
        break;
      }
      case 'lock': {
        this.lockPulse = { cells: e.cells.filter(([, y]) => y >= 0), t: 0, d: 0.32 };
        this.spawnT = 0;
        // kurz spod klocka — tylko z jego dolnych krawędzi
        const bottoms = new Map();
        for (const [x, y] of e.cells) bottoms.set(x, Math.max(bottoms.get(x) ?? -1, y));
        for (const [x, y] of bottoms) {
          this.burst(x + 0.5, y + 1, pal.dust, 2, { speed: 1.8, up: 0.4, size: 0.06, gravity: 4 });
        }
        this.kick(1.5);
        break;
      }
      case 'jump':
        this.burst(e.x, e.y, pal.dust, 5, { speed: 2.2, up: 0.3, size: 0.07, gravity: -1 });
        break;
      case 'land':
        this.burst(e.x, e.y, pal.dust, Math.min(10, 3 + e.power * 0.3), { speed: 3, up: 0.7, size: 0.07 });
        break;
      case 'wallJump': {
        const away = -e.dir;
        this.burst(e.x, e.y, pal.gold, 6 + e.chain * 3, { speed: 3.5, up: 2, size: 0.09, vxBias: away * 5 });
        this.rings.push({ x: e.x, y: e.y, t: 0, d: 0.3, max: 1.1 + e.chain * 0.35, color: pal.gold, width: 0.1 });
        if (e.chain >= 2 && !this.reduced) this.spin = { t: 0, d: 0.45, dir: away };
        this.kick(1 + e.chain);
        break;
      }
      case 'nearMiss':
        this.rings.push({ x: e.x, y: e.y + JH / 2, t: 0, d: 0.4, max: 1.3, color: pal.danger, width: 0.08 });
        break;
      case 'crush':
        this.burst(e.x, e.y, pal.jumperBody, 22, { speed: 8, up: 4, size: 0.14 });
        this.burst(e.x, e.y, pal.jumper, 18, { speed: 6, up: 3, size: 0.1 });
        this.rings.push({ x: e.x, y: e.y, t: 0, d: 0.5, max: 3.5, color: pal.danger, width: 0.2 });
        this.boardFlash = { t: 0, d: 0.4, color: pal.danger };
        this.kick(14);
        break;
      case 'floor':
        this.burst(e.x, e.y - 0.1, pal.hazard, 26, { speed: 5, up: 5, size: 0.12 });
        this.burst(e.x, e.y - 0.1, pal.jumperBody, 10, { speed: 4, up: 4, size: 0.1 });
        this.rings.push({ x: e.x, y: e.y, t: 0, d: 0.5, max: 2.5, color: pal.hazard, width: 0.18 });
        this.boardFlash = { t: 0, d: 0.45, color: pal.hazard };
        this.kick(10);
        break;
      case 'full':
        this.boardFlash = { t: 0, d: 0.6, color: pal.danger };
        this.kick(9);
        break;
      default:
        break;
    }
  }

  kick(amount) {
    if (!this.reduced) this.shake = Math.max(this.shake, amount);
  }

  burst(x, y, color, count, { speed = 4, up = 1, size = 0.1, gravity = 16, vxBias = 0 } = {}) {
    const MAX_PARTICLES = this.lite ? 110 : 260; // limit — burza efektów nie może zabić płynności
    const scale = this.reduced ? 1 / 3 : this.lite ? 0.5 : 1;
    const n = Math.min(Math.ceil(count * scale), MAX_PARTICLES - this.particles.length);
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * speed * 2 + vxBias * Math.random(),
        vy: -(Math.random() * speed * 0.7 + up),
        life: 0, max: rand(0.4, 0.9),
        size: size * rand(0.6, 1.4),
        rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12,
        color, gravity,
      });
    }
  }

  /* ---------- Kamera ---------- */

  /** Postęp intro skoczka: { zoom, mark } — z odliczania, albo płynnie w pozostałych fazach. */
  introState(dt) {
    if (this.mode !== 'jumper') return { zoom: 0, mark: 0 };
    if (this.phase === 'countdown') {
      const elapsed = this.countdownTotal - (this.countdownEndsAt - performance.now());
      const zoomSpan = this.countdownTotal - INTRO.zoomAt;
      const zoom = elapsed < INTRO.zoomAt ? 0 : easeInOut(clamp((elapsed - INTRO.zoomAt) / zoomSpan, 0, 1));
      const markIn = clamp((elapsed - INTRO.markAt) / 300, 0, 1);
      const markOut = 1 - clamp((elapsed - INTRO.zoomAt - zoomSpan * 0.5) / (zoomSpan * 0.5), 0, 1);
      this.zoom = zoom;
      return { zoom, mark: Math.min(markIn, markOut) };
    }
    // w trakcie gry: pole widzenia; po rundzie: odsłonięcie całej planszy
    const target = this.phase === 'playing' || this.phase === 'paused' ? 1 : 0;
    this.zoom += (target - this.zoom) * Math.min(1, dt * (target ? 6 : 2.5));
    return { zoom: this.zoom, mark: 0 };
  }

  viewTransform() {
    const z = this.zoom;
    const cam = this.cam ?? { x: 0, y: 0 };
    const w = lerp(COLS, VW, z);
    return { x0: lerp(0, cam.x, z), y0: lerp(0, cam.y, z), s: COLS / w };
  }

  updateCamera(dt) {
    if (!this.snap || !this.view) return;
    const target = jumperCamera(this.view.x, this.view.y);
    if (!this.cam) this.cam = target;
    const k = Math.min(1, dt * 7);
    this.cam.x += (target.x - this.cam.x) * k;
    this.cam.y += (target.y - this.cam.y) * k;
  }

  /* ---------- Klatka ---------- */

  render(dt) {
    const { ctx, cs } = this;
    if (!cs) return;
    this.time += dt;
    const nowT = performance.now();
    if (this.lastFrameAt) {
      this.stats.frames.push({ t: nowT, d: nowT - this.lastFrameAt });
      if (this.stats.frames.length > 300) this.stats.frames.splice(0, 150);
    }
    this.lastFrameAt = nowT;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.updateJumperView(dt);
    this.updateCamera(dt);
    const intro = this.introState(dt);
    const t = this.viewTransform();

    let ox = 0;
    let oy = 0;
    if (this.shake > 0.05) {
      ox = (Math.random() - 0.5) * this.shake;
      oy = (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 45);
    }

    // świat planszy: przesunięcie canvasu → wstrząs → kamera (zoom)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, (this.offsetX + ox) * this.dpr, (this.offsetY + oy) * this.dpr);
    ctx.scale(t.s, t.s);
    ctx.translate(-t.x0 * cs, -t.y0 * cs);

    this.drawBackdrop(dt);
    if (this.snap) {
      this.drawFloor(dt);
      this.drawGrid(dt);
      this.drawPillars(dt);
      this.drawPopCells(dt);
      this.drawGhost();
      this.drawStreaks(dt);
      this.drawPiece(dt);
      if (this.mode === 'full' && this.phase === 'playing') this.drawJumperVision();
      this.drawJumper(dt);
      this.drawSweeps(dt);
      if (intro.mark > 0) this.drawVisionMark(intro.mark);
    }
    this.drawRings(dt);
    this.drawParticles(dt);

    // warstwa ekranu (bez kamery)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, this.offsetX * this.dpr, this.offsetY * this.dpr);
    this.drawBoardFlash(dt);
    if (this.mode === 'jumper' && this.snap) {
      this.drawVignette(t);
      if (intro.zoom > 0.95 && this.phase === 'playing') this.drawOffscreenPiece(t);
    }
  }

  /**
   * Bufor do interpolacji: zapamiętujemy pozycję skoczka z czasem serwera.
   * Rysujemy ją ~100 ms „w przeszłości”, płynnie między dwiema paczkami —
   * nierówne przychodzenie paczek przestaje być widoczne.
   */
  bufferJumper(snap, now) {
    if (snap.t == null) return;
    const offset = now - snap.t;
    this.offsets.push({ t: now, v: offset });
    while (this.offsets.length && this.offsets[0].t < now - 3000) this.offsets.shift();
    this.clockOffset = Math.min(...this.offsets.map((o) => o.v));
    const j = snap.jumper;
    const last = this.buffer[this.buffer.length - 1];
    if (last && Math.hypot(j.x - last.x, j.y - last.y) > 2.5) this.buffer = []; // teleport (nowa runda)
    this.buffer.push({ t: snap.t, x: j.x, y: j.y });
    if (this.buffer.length > 40) this.buffer.splice(0, this.buffer.length - 40);
  }

  interpolatedJumper() {
    const b = this.buffer;
    if (b.length < 2 || this.clockOffset == null) return null;
    const renderT = performance.now() - this.clockOffset - 100;
    if (renderT <= b[0].t) return b[0];
    for (let i = b.length - 1; i > 0; i--) {
      if (b[i - 1].t <= renderT) {
        const a = b[i - 1];
        const c = b[i];
        const f = Math.min(1, (renderT - a.t) / (c.t - a.t || 1));
        return { x: a.x + (c.x - a.x) * f, y: a.y + (c.y - a.y) * f };
      }
    }
    return b[b.length - 1];
  }

  /** Klocek do narysowania — u gracza-Tetrisa z przewidzianymi ruchami. */
  displayPiece() {
    const snap = this.snap;
    if (this.piecePredictor && this.mode === 'full' && this.phase === 'playing') {
      const p = this.piecePredictor.piece(snap);
      return { piece: p, ghost: p?.ghost ?? snap.ghost };
    }
    return { piece: snap.piece, ghost: snap.ghost };
  }

  predicting() {
    return Boolean(this.predictor && this.mode === 'jumper' && this.phase === 'playing');
  }

  /** Stan skoczka do rysowania: lokalna predykcja (u skoczka) albo stan z serwera. */
  jumperState() {
    const s = this.snap.jumper;
    const p = this.predictor?.state;
    if (!this.predicting() || !p || s.dead) return s;
    return { ...s, x: p.x, y: p.y, vx: p.vx, vy: p.vy, ground: p.ground, wall: p.wall, face: p.face };
  }

  updateJumperView(dt) {
    if (!this.snap || !this.view) return;
    if (this.predicting()) {
      this.predictor.advance(dt);
      const p = this.predictor.renderPosition();
      if (p && !this.snap.jumper.dead) {
        // własny skoczek bez opóźnienia — dokładnie tam, gdzie policzyła go przeglądarka
        this.view.x = p.x;
        this.view.y = p.y;
        return;
      }
    }
    const j = this.snap.jumper;
    const smooth = j.dead ? null : this.interpolatedJumper();
    if (smooth) {
      this.view.x = smooth.x;
      this.view.y = smooth.y;
      return;
    }
    const follow = Math.min(1, dt * 22);
    this.view.x += (j.x - this.view.x) * follow;
    this.view.y += (j.y - this.view.y) * follow;
  }

  /** Statyczne tło (gradient, pasy, kropki) rysujemy raz do bufora, potem tylko kopiujemy. */
  backdropImage() {
    const { cs, pal, dpr } = this;
    const key = `${cs}|${dpr}|${pal.boardTop}`;
    if (this.backdropCache?.key === key) return this.backdropCache.canvas;
    const w = COLS * cs;
    const h = ROWS * cs;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w * dpr);
    canvas.height = Math.ceil(h * dpr);
    const c = canvas.getContext('2d');
    c.scale(dpr, dpr);
    const bg = c.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, pal.boardTop);
    bg.addColorStop(1, pal.boardBottom);
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = pal.stripe;
    for (let x = 0; x < COLS; x += 2) c.fillRect(x * cs, 0, cs, h);
    c.fillStyle = pal.dot;
    for (let y = 1; y < ROWS; y++) {
      for (let x = 1; x < COLS; x++) {
        c.beginPath();
        c.arc(x * cs, y * cs, Math.max(0.7, cs * 0.035), 0, TAU);
        c.fill();
      }
    }
    this.backdropCache = { key, canvas };
    return canvas;
  }

  drawBackdrop(dt) {
    const { ctx, cs, pal } = this;
    const w = COLS * cs;
    const h = ROWS * cs;
    ctx.fillStyle = pal.boardBottom;
    ctx.fillRect(-cs, -cs, w + cs * 2, h + cs * 2);
    ctx.drawImage(this.backdropImage(), 0, 0, w, h);

    ctx.fillStyle = pal.snow;
    for (const f of this.snow) {
      if (!this.reduced) {
        f.y += f.v * dt;
        f.p += dt;
        if (f.y > ROWS) { f.y = -0.2; f.x = Math.random() * COLS; }
      }
      ctx.beginPath();
      ctx.arc((f.x + Math.sin(f.p) * 0.2) * cs, f.y * cs, f.r * cs, 0, TAU);
      ctx.fill();
    }
  }

  /** Dno: bezpieczna platforma na całej szerokości poza polami lawy. */
  drawFloor(dt) {
    const { ctx, cs, pal } = this;
    const bottom = ROWS * cs;
    const lastRow = this.snap.grid[ROWS - 1];
    const lava = this.snap.lava ?? [];
    const free = (x) => lastRow[x] === '.';

    // ostrzegawcza poświata nad lawą
    for (const c of lava) {
      if (!free(c)) continue;
      const pulse = 0.14 + Math.sin(this.time * 3 + c) * 0.05;
      const g = ctx.createLinearGradient(0, bottom - cs * 2.5, 0, bottom);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, pal.hazard);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = g;
      ctx.fillRect(c * cs, bottom - cs * 2.5, cs, cs * 2.5);
      // bąbelki unoszące się z lawy
      if (!this.reduced && Math.random() < dt * 2.5) {
        this.burst(c + 0.2 + Math.random() * 0.6, ROWS - 0.1, pal.hazard, 1, { speed: 0.4, up: 1.2, size: 0.07, gravity: -1 });
      }
    }
    ctx.globalAlpha = 1;

    // lawa — falująca tafla (bez shadowBlur — poświatę daje gradient powyżej)
    ctx.save();
    ctx.fillStyle = pal.hazard;
    for (const c of lava) {
      if (!free(c)) continue;
      ctx.beginPath();
      ctx.moveTo(c * cs, bottom);
      for (let i = 0; i <= 6; i++) {
        const px = c + i / 6;
        const wave = Math.sin(px * 3.2 + this.time * 3) * 0.05 + 0.24;
        ctx.lineTo(px * cs, bottom - wave * cs);
      }
      ctx.lineTo((c + 1) * cs, bottom);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // platforma — ciągłe odcinki między lawą i klockami
    const h = cs * 0.2;
    const r = cs * 0.08;
    let x = 0;
    while (x < COLS) {
      if (!free(x) || isLava(lava, x)) { x += 1; continue; }
      let end = x;
      while (end + 1 < COLS && free(end + 1) && !isLava(lava, end + 1)) end += 1;
      const left = x * cs + cs * 0.04;
      const width = (end - x + 1) * cs - cs * 0.08;
      ctx.fillStyle = pal.pad;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.roundRect(left, bottom - h, width, h, [r, r, 0, 0]);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(left + cs * 0.06, bottom - h, width - cs * 0.12, Math.max(1, cs * 0.035));
      x = end + 1;
    }
  }

  block(x, y, color, { alpha = 1, scale = 1, flash = 0 } = {}) {
    const { ctx, cs } = this;
    const sprite = this.sprites.get(color, cs * this.dpr * (this.zoom > 0.5 ? COLS / VW : 1), this.pal.outline);
    const size = cs * scale;
    const px = x * cs + (cs - size) / 2;
    const py = y * cs + (cs - size) / 2;
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, px, py, size, size);
    if (flash > 0) {
      ctx.globalAlpha = alpha * flash;
      ctx.fillStyle = `rgb(${this.pal.sweep})`;
      ctx.beginPath();
      ctx.roundRect(px + size * 0.05, py + size * 0.05, size * 0.9, size * 0.9, size * 0.2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawGrid(dt) {
    const pal = this.pal;
    let fallK = 1;
    if (this.fall) {
      this.fall.t += dt;
      fallK = Math.min(1, this.fall.t / this.fall.d);
      if (fallK >= 1) this.fall = null;
    }
    let pulse = null;
    if (this.lockPulse) {
      this.lockPulse.t += dt;
      const k = this.lockPulse.t / this.lockPulse.d;
      if (k >= 1) this.lockPulse = null;
      else pulse = { set: new Set(this.lockPulse.cells.map(([x, y]) => `${x},${y}`)), k };
    }

    this.snap.grid.forEach((row, y) => {
      const offset = this.fall ? -this.fall.drop[y] * (1 - easeOutBack(fallK)) : 0;
      for (let x = 0; x < COLS; x++) {
        const type = row[x];
        if (type === '.') continue;
        if (pulse?.set.has(`${x},${y}`)) {
          // świeżo położony klocek: krótki błysk i sprężyste „osiadanie”
          const k = pulse.k;
          this.block(x, y + offset, pal.pieces[type], { scale: 1 + 0.14 * Math.sin(k * Math.PI) * (1 - k), flash: 0.55 * (1 - k) });
        } else {
          this.block(x, y + offset, pal.pieces[type]);
        }
      }
    });
  }

  /** Słupy światła wystrzeliwujące w górę z czyszczonych linii. */
  drawPillars(dt) {
    const { ctx, cs } = this;
    this.pillars = this.pillars.filter((p) => (p.t += dt) < p.d);
    for (const p of this.pillars) {
      if (p.t < 0) continue;
      const k = p.t / p.d;
      const grow = easeOut(Math.min(1, k * 2.2));
      const len = p.h * grow * cs;
      const w = cs * (0.8 - k * 0.5);
      const top = (p.y + 0.5) * cs - len;
      const g = ctx.createLinearGradient(0, top, 0, (p.y + 1) * cs);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.7, p.color);
      g.addColorStop(1, `rgb(${this.pal.sweep})`);
      ctx.globalAlpha = (1 - k) * 0.75;
      ctx.fillStyle = g;
      ctx.fillRect((p.x + 0.5) * cs - w / 2, top, w, len + cs * 0.5);
    }
    ctx.globalAlpha = 1;
  }

  drawPopCells(dt) {
    this.popCells = this.popCells.filter((p) => (p.t += dt) < p.d);
    for (const p of this.popCells) {
      if (p.t < 0) { this.block(p.x, p.y, p.color); continue; }
      const k = p.t / p.d;
      this.block(p.x, p.y, p.color, { alpha: 1 - k, scale: 1 + easeOut(k) * 0.5, flash: 1 - k });
    }
  }

  drawGhost() {
    const { danger } = this.snap;
    const { piece, ghost } = this.displayPiece();
    if (!ghost || !piece) return;
    const { ctx, cs, pal } = this;
    const alert = danger && this.showDanger;
    const pulse = 0.55 + Math.sin(this.time * 10) * 0.25;
    ctx.save();
    ctx.setLineDash([cs * 0.14, cs * 0.12]);
    ctx.lineWidth = Math.max(1.2, cs * 0.055);
    ctx.strokeStyle = alert ? pal.danger : pal.ghost;
    ctx.fillStyle = alert ? pal.danger : pal.ghostFill;
    for (const [x, y] of ghost) {
      ctx.globalAlpha = alert ? 0.18 * pulse : 1;
      ctx.beginPath();
      ctx.roundRect(x * cs + cs * 0.12, y * cs + cs * 0.12, cs * 0.76, cs * 0.76, cs * 0.18);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPiece(dt) {
    const { piece } = this.displayPiece();
    if (!piece) return;
    this.spawnT = Math.min(1, this.spawnT + dt / 0.18);
    const k = easeOutBack(this.spawnT);
    const color = this.pal.pieces[piece.type];
    const { ctx, cs } = this;
    // lekka poświata pod klockiem zamiast kosztownego shadowBlur
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = color;
    for (const [x, y] of piece.cells) {
      if (y >= 0) {
        ctx.beginPath();
        ctx.roundRect(x * cs - cs * 0.12, y * cs - cs * 0.12, cs * 1.24, cs * 1.24, cs * 0.3);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const [x, y] of piece.cells) {
      if (y >= 0) this.block(x, y, color, { scale: 0.55 + 0.45 * k, alpha: Math.min(1, this.spawnT * 2) });
    }
  }

  drawStreaks(dt) {
    const { ctx, cs } = this;
    this.streaks = this.streaks.filter((s) => (s.t += dt) < s.d);
    for (const s of this.streaks) {
      const k = 1 - s.t / s.d;
      const tops = new Map();
      for (const [x, y] of s.cells) tops.set(x, Math.min(tops.get(x) ?? Infinity, y));
      for (const [x, y] of tops) {
        const len = Math.min(s.distance + 1, 8) * cs;
        const g = ctx.createLinearGradient(0, y * cs - len, 0, y * cs);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, s.color);
        ctx.globalAlpha = 0.4 * k;
        ctx.fillStyle = g;
        ctx.fillRect(x * cs + cs * 0.18, y * cs - len, cs * 0.64, len);
      }
      ctx.globalAlpha = 1;
    }
  }

  /** Na ekranie Tetrisa: dyskretna ramka pokazująca, co widzi skoczek. */
  drawJumperVision() {
    if (!this.view) return;
    const { ctx, cs, pal } = this;
    const cam = jumperCamera(this.view.x, this.view.y);
    ctx.save();
    ctx.setLineDash([cs * 0.25, cs * 0.18]);
    ctx.lineWidth = Math.max(1, cs * 0.04);
    ctx.strokeStyle = pal.jumper;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.roundRect(cam.x * cs, cam.y * cs, VW * cs, VH * cs, cs * 0.3);
    ctx.stroke();
    ctx.restore();
  }

  /** Intro skoczka: zaznaczenie przyszłego pola widzenia. */
  drawVisionMark(alpha) {
    if (!this.cam) return;
    const { ctx, cs, pal } = this;
    const cam = jumperCamera(this.view.x, this.view.y);
    const pulse = 1 + Math.sin(this.time * 6) * 0.04;
    const cx = (cam.x + VW / 2) * cs;
    const cy = (cam.y + VH / 2) * cs;
    const w = VW * cs * pulse;
    const h = VH * cs * pulse;

    ctx.save();
    // przyciemnienie wszystkiego poza kadrem
    ctx.globalAlpha = 0.55 * alpha;
    ctx.fillStyle = `rgb(${pal.vignette})`;
    ctx.beginPath();
    ctx.rect(-cs, -cs, (COLS + 2) * cs, (ROWS + 2) * cs);
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, cs * 0.35);
    ctx.fill('evenodd');

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = pal.jumper;
    ctx.lineWidth = cs * 0.09;
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, cs * 0.35);
    ctx.stroke();

    // napis nad ramką (albo pod nią, gdy ramka dotyka sufitu), zawsze w obrębie planszy
    const label = 'Twoje pole widzenia';
    ctx.font = `700 ${cs * 0.42}px Figtree, system-ui, sans-serif`;
    const half = ctx.measureText(label).width / 2 + cs * 0.3;
    const lx = clamp(cx, half, COLS * cs - half);
    const above = cy - h / 2 - cs * 0.3;
    const ly = above > cs * 0.6 ? above : cy + h / 2 + cs * 0.65;
    ctx.fillStyle = pal.jumper;
    ctx.textAlign = 'center';
    ctx.fillText(label, lx, ly);
    ctx.restore();
  }

  drawJumper(dt) {
    const { ctx, cs, pal } = this;
    const j = this.jumperState();
    const v = this.view;

    const fast = Math.hypot(j.vx, j.vy) > 6;
    if (!this.reduced && !j.dead && (fast || j.chain > 0)) this.trail.push({ x: v.x, y: v.y, t: 0 });
    const trailLife = 0.15 + Math.min(j.chain, 4) * 0.04;
    this.trail = this.trail.filter((p) => (p.t += dt) < trailLife);
    for (const p of this.trail) {
      ctx.globalAlpha = (1 - p.t / trailLife) * 0.3;
      ctx.fillStyle = j.chain >= 2 ? pal.gold : pal.jumper;
      ctx.beginPath();
      ctx.roundRect(p.x * cs, p.y * cs, JW * cs, JH * cs, cs * 0.2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (j.wall && j.vy > 0 && !j.dead) {
      this.slideDust -= dt;
      if (this.slideDust <= 0) {
        this.slideDust = 0.05;
        this.burst(j.wall > 0 ? v.x + JW : v.x, v.y + JH * 0.8, pal.dust, 1, { speed: 1, up: 0.5, size: 0.06, vxBias: -j.wall });
      }
    }

    let w = JW * cs;
    let h = JH * cs;
    let x = v.x * cs;
    let y = v.y * cs;

    if (j.dead) {
      this.deadFor += dt;
      const k = Math.min(1, this.deadFor / 0.12);
      const nw = w * (1 + 0.7 * k);
      const nh = h * (1 - 0.78 * k);
      x -= (nw - w) / 2; y += h - nh; w = nw; h = nh;
    } else if (j.wall) {
      const nw = w * 0.86;
      if (j.wall > 0) x += w - nw;
      w = nw; h *= 1.06; y -= h * 0.03;
    } else if (!j.ground) {
      const s = Math.max(-0.12, Math.min(0.12, -j.vy * 0.008));
      const nw = w * (1 - s);
      const nh = h * (1 + s);
      x -= (nw - w) / 2; y -= nh - h; w = nw; h = nh;
    } else {
      const breathe = Math.sin(this.time * 4) * 0.025;
      y += h * breathe; h *= 1 - breathe;
    }

    ctx.save();
    if (this.spin) {
      this.spin.t += dt;
      const k = Math.min(1, this.spin.t / this.spin.d);
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate(easeOut(k) * TAU * this.spin.dir);
      ctx.translate(-(x + w / 2), -(y + h / 2));
      if (k >= 1) this.spin = null;
    }

    // poświata skoczka jako półprzezroczysta obwódka (bez shadowBlur)
    ctx.globalAlpha = 0.25 + Math.min(j.chain, 4) * 0.08;
    ctx.fillStyle = j.chain >= 2 ? pal.gold : pal.jumper;
    ctx.beginPath();
    ctx.roundRect(x - cs * 0.1, y - cs * 0.1, w + cs * 0.2, h + cs * 0.2, Math.min(w, h) * 0.45);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.jumperBody;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(w, h) * 0.32);
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = Math.max(1.2, cs * 0.05);
    ctx.stroke();

    ctx.fillStyle = j.chain >= 2 ? pal.gold : pal.jumper;
    ctx.fillRect(x + ctx.lineWidth / 2, y + h * 0.54, w - ctx.lineWidth, h * 0.15);
    if (!j.dead) {
      const wave = Math.sin(this.time * 14) * cs * 0.05;
      const tail = -j.face;
      ctx.beginPath();
      ctx.moveTo(x + w / 2 + (tail * w) / 2, y + h * 0.56);
      ctx.lineTo(x + w / 2 + tail * (w / 2 + cs * 0.28), y + h * 0.6 + wave);
      ctx.lineTo(x + w / 2 + tail * (w / 2 + cs * 0.22), y + h * 0.72 + wave);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = pal.ink;
    ctx.strokeStyle = pal.ink;
    const ex = x + w / 2 + j.face * w * 0.14;
    const ey = y + h * 0.3;
    const gap = cs * 0.13;
    if (j.dead) {
      ctx.lineWidth = Math.max(1.2, cs * 0.05);
      for (const o of [-gap, gap]) {
        ctx.beginPath();
        ctx.moveTo(ex + o - cs * 0.06, ey - cs * 0.04);
        ctx.lineTo(ex + o + cs * 0.06, ey + cs * 0.04);
        ctx.moveTo(ex + o + cs * 0.06, ey - cs * 0.04);
        ctx.lineTo(ex + o - cs * 0.06, ey + cs * 0.04);
        ctx.stroke();
      }
    } else {
      const blink = Math.sin(this.time * 1.7) > 0.985 ? 0.2 : 1;
      for (const o of [-gap, gap]) {
        ctx.beginPath();
        ctx.ellipse(ex + o, ey, cs * 0.05, cs * 0.072 * blink, 0, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawSweeps(dt) {
    const { ctx, cs, pal } = this;
    this.sweeps = this.sweeps.filter((s) => (s.t += dt) < s.d);
    for (const s of this.sweeps) {
      const k = s.t / s.d;
      const open = Math.min(1, k * 2.6);
      const fade = 1 - Math.max(0, (k - 0.35) / 0.65);
      const half = (COLS * cs * open) / 2;
      const thick = cs * (1 - k * 0.7);
      ctx.fillStyle = `rgba(${pal.sweep},${0.85 * fade})`;
      ctx.fillRect((COLS * cs) / 2 - half, s.y * cs + (cs - thick) / 2, half * 2, thick);
    }
  }

  drawRings(dt) {
    const { ctx, cs } = this;
    this.rings = this.rings.filter((r) => (r.t += dt) < r.d);
    for (const r of this.rings) {
      const k = r.t / r.d;
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(1, r.width * cs * (1 - k));
      ctx.beginPath();
      ctx.arc(r.x * cs, r.y * cs, Math.max(0.1, easeOut(k) * r.max * cs), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawParticles(dt) {
    const { ctx, cs } = this;
    this.particles = this.particles.filter((p) => (p.life += dt) < p.max);
    // setTransform zamiast save/restore — kilka razy taniej przy setkach cząsteczek
    const base = ctx.getTransform();
    for (const p of this.particles) {
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.color;
      const c = Math.cos(p.rot);
      const sn = Math.sin(p.rot);
      const px = p.x * cs;
      const py = p.y * cs;
      ctx.setTransform(
        base.a * c + base.c * sn, base.b * c + base.d * sn,
        base.c * c - base.a * sn, base.d * c - base.b * sn,
        base.a * px + base.c * py + base.e, base.b * px + base.d * py + base.f,
      );
      const s = p.size * cs;
      ctx.fillRect(-s / 2, -s / 2, s, s);
    }
    ctx.setTransform(base);
    ctx.globalAlpha = 1;
  }

  drawBoardFlash(dt) {
    const f = this.boardFlash;
    if (!f) return;
    f.t += dt;
    const k = f.t / f.d;
    if (k >= 1) { this.boardFlash = null; return; }
    this.ctx.globalAlpha = (1 - k) * (this.reduced ? 0.12 : 0.28);
    this.ctx.fillStyle = f.color;
    this.ctx.fillRect(0, 0, COLS * this.cs, ROWS * this.cs);
    this.ctx.globalAlpha = 1;
  }

  /** Przyciemnione brzegi kadru — wrażenie ograniczonej widoczności. */
  drawVignette() {
    const { ctx, cs, pal } = this;
    const z = this.zoom;
    if (z < 0.05) return;
    const w = COLS * cs;
    const h = ROWS * cs;
    const key = `${w}|${h}|${pal.vignette}`;
    if (this.vignetteCache?.key !== key) {
      const g = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.62);
      g.addColorStop(0, `rgba(${pal.vignette},0)`);
      g.addColorStop(1, `rgba(${pal.vignette},0.6)`);
      this.vignetteCache = { key, g };
    }
    ctx.globalAlpha = z;
    ctx.fillStyle = this.vignetteCache.g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  /** Strzałka przy górnej krawędzi, gdy klocek spada nad kadrem skoczka. */
  drawOffscreenPiece(t) {
    const { piece, danger } = this.snap;
    if (!piece) return;
    const { ctx, cs, pal } = this;
    const lowest = Math.max(...piece.cells.map((c) => c[1])) + 1;
    if (lowest > t.y0 + 0.2) return; // klocek już widać

    const xs = piece.cells.map((c) => c[0]);
    const center = (Math.min(...xs) + Math.max(...xs) + 1) / 2;
    const screenX = clamp((center - t.x0) * t.s * cs, cs * 0.6, COLS * cs - cs * 0.6);
    const distance = Math.max(0, Math.round(t.y0 - lowest));
    const color = danger && this.showDanger ? pal.danger : pal.label;
    const bob = Math.sin(this.time * 8) * cs * 0.08;
    const size = cs * 0.38;
    const y = cs * 0.45 + bob;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(screenX, y - size * 0.7);
    ctx.lineTo(screenX + size * 0.75, y + size * 0.45);
    ctx.lineTo(screenX - size * 0.75, y + size * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.font = `700 ${cs * 0.32}px Figtree, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${distance}`, screenX, y + size * 1.35);
    ctx.restore();
  }
}
