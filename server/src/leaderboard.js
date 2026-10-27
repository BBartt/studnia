import { readFileSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Ranking wszech czasów zapisywany do pliku JSON (bez bazy danych). */
export class Leaderboard {
  constructor(file) {
    this.file = file;
    this.entries = new Map();
    this.saveTimer = null;
    this.load();
  }

  load() {
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8'));
      for (const e of data) this.entries.set(e.nick.toLowerCase(), e);
    } catch {
      // brak pliku przy pierwszym uruchomieniu — to normalne
    }
  }

  record({ nick, points, won }) {
    const key = nick.toLowerCase();
    const e = this.entries.get(key) ?? { nick, points: 0, matches: 0, wins: 0, best: 0 };
    e.nick = nick;
    e.points += points;
    e.matches += 1;
    if (won) e.wins += 1;
    e.best = Math.max(e.best, points);
    this.entries.set(key, e);
    this.scheduleSave();
  }

  top(limit = 10) {
    return [...this.entries.values()]
      .sort((a, b) => b.points - a.points || b.wins - a.wins)
      .slice(0, limit);
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save().catch((err) => console.error('[leaderboard]', err)), 500);
  }

  async save() {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify([...this.entries.values()], null, 2));
    await rename(tmp, this.file); // zapis atomowy — plik nigdy nie jest „w połowie”
  }
}
