import { COLS, ROWS } from '@studnia/shared/protocol';
import { rotate } from '@studnia/shared/pieces';

const KICKS = [0, -1, 1, -2, 2];
const PENDING_TIMEOUT_MS = 1500;

/**
 * Predykcja ruchów klocka u gracza-Tetrisa: ← → ↑ ↓ są widoczne od razu,
 * zamiast czekać na serwer. Każda akcja ma numer (seq); serwer odsyła numer
 * ostatniej zastosowanej (ack). Do pozycji klocka z serwera „doklejamy”
 * akcje, których serwer jeszcze nie potwierdził.
 */
export class PiecePredictor {
  constructor() {
    this.seq = 0;
    this.pending = []; // { seq, action, t }
  }

  /** Rejestruje akcję i zwraca jej numer do wysłania na serwer. */
  act(action) {
    const seq = ++this.seq;
    if (action !== 'hard') this.pending.push({ seq, action, t: performance.now() });
    return seq;
  }

  sync(snap) {
    const now = performance.now();
    this.pending = this.pending.filter((p) => p.seq > (snap.ack ?? 0) && now - p.t < PENDING_TIMEOUT_MS);
  }

  /** Klocek do narysowania: stan serwera + niepotwierdzone akcje. */
  piece(snap) {
    const p = snap.piece;
    if (!p?.m || !this.pending.length) return p;
    const grid = snap.grid;
    const fits = (m, x, y) => m.every((row, ry) => row.every((v, rx) => {
      if (!v) return true;
      const cx = x + rx;
      const cy = y + ry;
      return cx >= 0 && cx < COLS && cy < ROWS && (cy < 0 || grid[cy][cx] === '.');
    }));

    let { m, x, y } = p;
    for (const { action } of this.pending) {
      if (action === 'left' && fits(m, x - 1, y)) x -= 1;
      else if (action === 'right' && fits(m, x + 1, y)) x += 1;
      else if (action === 'soft' && fits(m, x, y + 1)) y += 1;
      else if (action === 'rotate') {
        const r = rotate(m);
        const k = KICKS.find((dx) => fits(r, x + dx, y));
        if (k !== undefined) { m = r; x += k; }
      }
    }
    const cells = [];
    m.forEach((row, ry) => row.forEach((v, rx) => { if (v) cells.push([x + rx, y + ry]); }));
    let gy = y;
    while (fits(m, x, gy + 1)) gy += 1;
    const ghost = [];
    m.forEach((row, ry) => row.forEach((v, rx) => { if (v) ghost.push([x + rx, gy + ry]); }));
    return { ...p, cells, ghost };
  }
}
