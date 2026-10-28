import { COLS, ROWS, JUMPER_SIZE, LAVA_COUNT } from '../protocol.js';
import { speedToInterval, RAMP, MIN_INTERVAL } from '../settings.js';
import { SHAPES, rotate, createBag } from './pieces.js';

// Skoczek (jednostką jest jedna kratka planszy)
const W = JUMPER_SIZE.w;
const H = JUMPER_SIZE.h;
const LAVA_OVERLAP = W / 2; // ponad połowa skoczka nad lawą = śmierć
const EPS = 1e-5;
const GRAVITY = 40;
const MAX_FALL = 24;
const RUN = 7.5;
const JUMP = 13;
const JUMP_RUN_BONUS = 0.42; // rozpęd podwyższa skok, jak w Icy Tower
const COYOTE = 0.09;
const JUMP_BUFFER = 0.13;

// Odbicie od ściany (wall jump) — im dłuższa seria odbić bez lądowania, tym wyżej
const WALL_COYOTE = 0.12;      // chwila „po odklejeniu” od ściany, kiedy wciąż można się odbić
const WALL_JUMP = 15.5;        // bazowa siła odbicia (zwykły skok to 13)
const WALL_KICK = 8.5;         // odepchnięcie w poziomie
const WALL_CHAIN_BONUS = 0.12; // +12% za każde kolejne odbicie w serii
const WALL_CHAIN_MAX = 4;
const WALL_IMPACT_BONUS = 0.3; // rozpęd sprzed uderzenia w ścianę też podbija skok
const WALL_SLIDE_MAX = 5;      // zsuwanie po ścianie jest wolniejsze niż spadanie
const WALL_CONTROL_LOCK = 0.16;
const NEAR_MISS = 0.35;

const KICKS = [0, -1, 1, -2, 2];
const MAX_ACTIONS_PER_TICK = 6;
const MAX_QUEUED_ACTIONS = 20;

const round3 = (n) => Math.round(n * 1000) / 1000;

/** Losuje kolumny lawy: różne i nie obok siebie. */
export function randomLava(count = LAVA_COUNT, random = Math.random) {
  const lava = [];
  for (let tries = 0; lava.length < count && tries < 200; tries++) {
    const c = Math.floor(random() * COLS);
    if (lava.some((l) => Math.abs(l - c) <= 1)) continue;
    lava.push(c);
  }
  return lava.sort((a, b) => a - b);
}

/** Kolumna startowa skoczka: jak najbliżej środka, ale z dala od lawy. */
function startColumn(lava) {
  const order = [4, 5, 3, 6, 2, 7, 1, 8, 0, 9];
  return order.find((c) => !lava.some((l) => Math.abs(l - c) <= 1)) ?? order.find((c) => !lava.includes(c));
}

/**
 * Autorytatywna symulacja jednej rundy. Nie wie nic o sieci:
 * dostaje wejście, liczy krok `tick(dt)`, oddaje `snapshot()`.
 */
export class GameEngine {
  /**
   * @param {object} settings ustawienia rundy (roundSettings)
   * @param {{ lava?: number[] }} [options] stała lawa — do testów
   */
  constructor(settings, { lava } = {}) {
    this.settings = settings;
    this.lava = lava ?? randomLava();
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.bag = createBag();
    this.nextType = this.bag.next();
    this.piece = null;
    this.activeCells = new Set();
    this.dropTimer = 0;
    this.elapsed = 0;
    this.timeLeft = settings.roundSeconds;
    this.lines = 0;
    this.actions = [];
    this.input = { left: false, right: false, jump: false };
    this.jumper = {
      x: startColumn(this.lava) + (1 - W) / 2, y: ROWS - H - EPS, vx: 0, vy: 0,
      ground: true, coyote: 0, buffer: 0, face: 1, dead: false,
      wall: 0, wallDir: 0, wallCoyote: 0, chain: 0, impact: 0, controlLock: 0,
    };
    this.combo = 0;
    this.events = [];
    this.result = null;
    this.spawn();
  }

  /* ---------- API ---------- */

  queueAction(action) {
    if (this.actions.length < MAX_QUEUED_ACTIONS) this.actions.push(action);
  }

  setJumperInput({ left, right, jump }) {
    const j = this.jumper;
    if (jump && !this.input.jump) j.buffer = JUMP_BUFFER;
    if (!jump && this.input.jump && j.vy < -4) j.vy *= 0.45; // krótkie wciśnięcie = niski skok
    this.input = { left: Boolean(left), right: Boolean(right), jump: Boolean(jump) };
  }

  get interval() {
    const s = this.settings;
    return Math.max(MIN_INTERVAL, speedToInterval(s.startSpeed) - RAMP[s.speedRamp] * this.elapsed);
  }

  get survived() {
    return this.settings.roundSeconds - Math.max(0, this.timeLeft);
  }

  tick(dt) {
    if (this.result) return;

    for (const action of this.actions.splice(0, MAX_ACTIONS_PER_TICK)) {
      this.applyAction(action);
      if (this.result) return;
    }

    this.elapsed += dt;
    this.timeLeft -= dt;
    this.dropTimer += dt * 1000;
    if (this.dropTimer >= this.interval) {
      this.dropTimer = 0;
      this.stepDown();
      if (this.result) return;
    }

    this.updateJumper(dt);

    if (!this.result && this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.finish('jumper', 'time');
    }
  }

  snapshot() {
    const p = this.piece;
    const j = this.jumper;
    let ghost = null;
    let danger = false;

    if (p) {
      let gy = p.y;
      while (this.fits(p.m, p.x, gy + 1)) gy++;
      ghost = this.cellsOf(p.m, p.x, gy);
      if (!j.dead) {
        for (let y = p.y; y <= gy && !danger; y++) danger = this.jumperHits(this.cellsOf(p.m, p.x, y)).length > 0;
      }
    }

    return {
      grid: this.grid.map((row) => row.map((c) => c || '.').join('')),
      piece: p ? { type: p.type, cells: this.cellsOf(p.m, p.x, p.y) } : null,
      ghost,
      danger,
      next: this.nextType,
      jumper: {
        x: round3(j.x), y: round3(j.y), vx: round3(j.vx), vy: round3(j.vy),
        ground: j.ground, face: j.face, dead: j.dead, wall: j.wall, chain: j.chain,
      },
      combo: this.combo,
      lava: this.lava,
      stack: this.stackHeight(),
      timeLeft: round3(Math.max(0, this.timeLeft)),
      lines: this.lines,
      interval: Math.round(this.interval),
      events: this.events.splice(0),
    };
  }

  /* ---------- Tetris ---------- */

  stackHeight() {
    const top = this.grid.findIndex((row) => row.some(Boolean));
    return top === -1 ? 0 : ROWS - top;
  }

  applyAction(action) {
    switch (action) {
      case 'left': this.shift(-1); break;
      case 'right': this.shift(1); break;
      case 'rotate': this.turn(); break;
      case 'soft': if (this.stepDown()) this.dropTimer = 0; break;
      case 'hard': if (this.settings.hardDrop) this.hardDrop(); break;
      default: break;
    }
  }

  cellsOf(m, x, y) {
    const out = [];
    m.forEach((row, ry) => row.forEach((v, rx) => { if (v) out.push([x + rx, y + ry]); }));
    return out;
  }

  cells() {
    return this.cellsOf(this.piece.m, this.piece.x, this.piece.y);
  }

  fits(m, x, y) {
    return this.cellsOf(m, x, y).every(([cx, cy]) =>
      cx >= 0 && cx < COLS && cy < ROWS && (cy < 0 || !this.grid[cy][cx]));
  }

  refreshActive() {
    this.activeCells = new Set();
    if (this.piece) for (const [cx, cy] of this.cells()) this.activeCells.add(cy * COLS + cx);
  }

  spawn() {
    const type = this.nextType;
    this.nextType = this.bag.next();
    const m = SHAPES[type].map((row) => row.slice());
    this.piece = { type, m, x: Math.floor((COLS - m[0].length) / 2), y: 0 };

    if (!this.fits(m, this.piece.x, 0)) {
      this.piece = null;
      this.refreshActive();
      this.events.push({ type: 'full' });
      this.finish('jumper', 'full');
      return;
    }
    this.refreshActive();
    this.pushJumper(0, 1);
  }

  shift(dx) {
    if (!this.piece) return;
    if (this.fits(this.piece.m, this.piece.x + dx, this.piece.y)) {
      this.piece.x += dx;
      this.refreshActive();
      this.pushJumper(dx, 0);
    }
  }

  turn() {
    if (!this.piece) return;
    const m = rotate(this.piece.m);
    for (const k of KICKS) {
      const x = this.piece.x + k;
      // obrót nie może „zgnieść” skoczka — to byłoby nieuczciwe
      if (this.fits(m, x, this.piece.y) && !this.jumperHits(this.cellsOf(m, x, this.piece.y)).length) {
        this.piece.m = m;
        this.piece.x = x;
        this.refreshActive();
        return;
      }
    }
  }

  /** @returns {boolean} czy klocek przesunął się w dół */
  stepDown() {
    if (!this.piece) return false;
    if (this.fits(this.piece.m, this.piece.x, this.piece.y + 1)) {
      this.piece.y++;
      this.refreshActive();
      this.pushJumper(0, 1);
      return true;
    }
    this.lock();
    return false;
  }

  hardDrop() {
    if (!this.piece) return;
    const startY = this.piece.y;
    while (this.fits(this.piece.m, this.piece.x, this.piece.y + 1)) {
      this.piece.y++;
      this.refreshActive();
      if (!this.pushJumper(0, 1)) return;
    }
    this.events.push({ type: 'hardDrop', piece: this.piece.type, cells: this.cells(), distance: this.piece.y - startY });
    this.lock();
  }

  lock() {
    const { type } = this.piece;
    const cells = this.cells();
    for (const [cx, cy] of cells) if (cy >= 0) this.grid[cy][cx] = type;
    this.piece = null;
    this.refreshActive();
    this.events.push({ type: 'lock', piece: type, cells });

    const full = [];
    for (let r = 0; r < ROWS; r++) if (this.grid[r].every(Boolean)) full.push(r);

    this.combo = full.length ? this.combo + 1 : 0;
    this.checkNearMiss(cells);

    if (full.length) {
      this.events.push({
        type: 'lines',
        count: full.length,
        combo: this.combo,
      lava: this.lava,
        rows: full.map((y) => ({ y, cells: this.grid[y].slice() })),
      });
      this.grid = this.grid.filter((_, r) => !full.includes(r));
      while (this.grid.length < ROWS) this.grid.unshift(Array(COLS).fill(null));
      this.lines += full.length;

      // klocki zsunęły się w dół — jeśli weszły na skoczka, wypychamy go w górę
      const j = this.jumper;
      for (let i = 0; i < 40 && this.overlaps(j.x, j.y); i++) j.y -= 0.05;
      if (this.overlaps(j.x, j.y)) { this.crush(); return; }
    }

    this.dropTimer = 0;
    this.spawn();
  }

  /** Klocek wylądował tuż obok skoczka — dobry moment na efekt „o włos!”. */
  checkNearMiss(cells) {
    const j = this.jumper;
    if (j.dead) return;
    const close = cells.some(([cx, cy]) =>
      cx + 1 > j.x - NEAR_MISS && cx < j.x + W + NEAR_MISS &&
      cy + 1 > j.y - NEAR_MISS && cy < j.y + H + NEAR_MISS);
    if (close) this.events.push({ type: 'nearMiss', x: round3(j.x + W / 2), y: round3(j.y) });
  }

  /* ---------- Skoczek ---------- */

  solid(cx, cy) {
    if (cx < 0 || cx >= COLS || cy >= ROWS || cy < 0) return true;
    return Boolean(this.grid[cy][cx]) || this.activeCells.has(cy * COLS + cx);
  }

  overlaps(x, y) {
    const x0 = Math.floor(x);
    const x1 = Math.floor(x + W - 1e-6);
    const y0 = Math.floor(y);
    const y1 = Math.floor(y + H - 1e-6);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) if (this.solid(cx, cy)) return true;
    }
    return false;
  }

  jumperHits(cells) {
    const j = this.jumper;
    return cells.filter(([cx, cy]) => cx + 1 > j.x && cx < j.x + W && cy + 1 > j.y && cy < j.y + H);
  }

  /**
   * Po ruchu klocka spycha skoczka. Jeśli nie ma go gdzie zepchnąć — zgniata.
   * @returns {boolean} czy skoczek przeżył
   */
  pushJumper(dx, dy) {
    const j = this.jumper;
    if (j.dead || !this.piece) return true;
    const hit = this.jumperHits(this.cells());
    if (!hit.length) return true;

    if (dy > 0) {
      j.y = Math.max(...hit.map((c) => c[1])) + 1;
      j.vy = Math.max(j.vy, 0);
    } else if (dx > 0) {
      j.x = Math.max(...hit.map((c) => c[0])) + 1;
    } else if (dx < 0) {
      j.x = Math.min(...hit.map((c) => c[0])) - W - EPS;
    }

    if (this.overlaps(j.x, j.y)) {
      this.crush();
      return false;
    }
    this.checkFloor();
    return !j.dead;
  }

  updateJumper(dt) {
    const j = this.jumper;
    const { jumpPower, runSpeed } = this.settings;
    const dir = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    if (dir && j.controlLock <= 0) j.face = dir;

    // Po odbiciu od ściany przez chwilę ignorujemy „ciągnięcie” z powrotem do niej
    j.controlLock = Math.max(0, j.controlLock - dt);
    if (j.controlLock <= 0) {
      const target = dir * RUN * runSpeed;
      const accel = (j.ground ? 70 : 38) * runSpeed;
      if (j.vx < target) j.vx = Math.min(target, j.vx + accel * dt);
      else if (j.vx > target) j.vx = Math.max(target, j.vx - accel * dt);
    }

    j.ground = this.overlaps(j.x, j.y + 0.03);
    j.coyote = j.ground ? COYOTE : j.coyote - dt;
    j.buffer -= dt;
    j.impact = Math.max(0, j.impact - dt * 12);

    // Kontakt ze ścianą (ściana studni albo bok klocka), tylko w powietrzu
    const touchLeft = this.overlaps(j.x - 0.04, j.y);
    const touchRight = this.overlaps(j.x + 0.04, j.y);
    j.wall = j.ground ? 0 : touchLeft ? -1 : touchRight ? 1 : 0;
    if (j.wall) {
      j.wallDir = j.wall;
      j.wallCoyote = WALL_COYOTE;
    } else {
      j.wallCoyote -= dt;
    }
    if (j.ground) j.chain = 0;

    if (j.buffer > 0 && j.coyote > 0) {
      j.vy = -(JUMP + Math.abs(j.vx) * JUMP_RUN_BONUS) * jumpPower;
      j.buffer = 0;
      j.coyote = 0;
      j.ground = false;
      this.events.push({ type: 'jump', x: round3(j.x + W / 2), y: round3(j.y + H) });
    } else if (j.buffer > 0 && j.wallCoyote > 0) {
      this.wallJump();
    }

    j.vy = Math.min(j.vy + GRAVITY * dt, MAX_FALL);
    if (j.wall && dir === j.wall && j.vy > WALL_SLIDE_MAX) j.vy = WALL_SLIDE_MAX;

    j.x += j.vx * dt;
    if (this.overlaps(j.x, j.y)) {
      j.impact = Math.max(j.impact, Math.abs(j.vx));
      j.x = j.vx > 0 ? Math.floor(j.x + W) - W - EPS : Math.floor(j.x) + 1;
      j.vx = 0;
    }

    j.y += j.vy * dt;
    if (this.overlaps(j.x, j.y)) {
      if (j.vy > 0) {
        j.y = Math.floor(j.y + H) - H - EPS;
        if (j.vy > 8) this.events.push({ type: 'land', x: round3(j.x + W / 2), y: round3(j.y + H), power: round3(j.vy) });
      } else {
        j.y = Math.floor(j.y) + 1;
      }
      j.vy = 0;
    }

    this.checkFloor();
  }

  /** Dno jest bezpieczne poza polami lawy — stanie ponad połową ciała nad lawą zabija. */
  checkFloor() {
    const j = this.jumper;
    if (j.dead || j.y + H < ROWS - 0.01) return;
    const overLava = this.lava.some((c) => Math.min(j.x + W, c + 1) - Math.max(j.x, c) > LAVA_OVERLAP);
    if (!overLava) return;
    j.dead = true;
    this.events.push({ type: 'floor', x: round3(j.x + W / 2), y: ROWS });
    this.finish('tetris', 'floor');
  }

  wallJump() {
    const j = this.jumper;
    const { jumpPower, runSpeed } = this.settings;
    j.chain = Math.min(WALL_CHAIN_MAX, j.chain + 1);
    const power = (1 + WALL_CHAIN_BONUS * (j.chain - 1)) * jumpPower;
    j.vy = -(WALL_JUMP + j.impact * WALL_IMPACT_BONUS) * power;
    j.vx = -j.wallDir * WALL_KICK * runSpeed;
    j.face = -j.wallDir;
    j.controlLock = WALL_CONTROL_LOCK;
    j.buffer = 0;
    j.wallCoyote = 0;
    j.impact = 0;
    this.events.push({
      type: 'wallJump',
      x: round3(j.wallDir > 0 ? j.x + W : j.x),
      y: round3(j.y + H / 2),
      dir: j.wallDir,
      chain: j.chain,
    });
  }

  crush() {
    const j = this.jumper;
    if (j.dead) return;
    j.dead = true;
    this.events.push({ type: 'crush', x: round3(j.x + W / 2), y: round3(j.y + H / 2) });
    this.finish('tetris', 'crush');
  }

  finish(winner, reason) {
    if (!this.result) this.result = { winner, reason };
  }
}
