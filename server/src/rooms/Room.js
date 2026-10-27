import { PHASE, ROLES, S2C, C2S, TETRIS_ACTIONS, COUNTDOWN_MS } from '@studnia/shared/protocol';
import { defaultSettings, sanitizeSettings, roundSettings } from '@studnia/shared/settings';
import { GameEngine } from '../game/Engine.js';

const TICK_HZ = 60;
const STEP = 1 / TICK_HZ;
const SEND_EVERY_TICKS = 2; // 30 aktualizacji na sekundę
const ROUND_OVER_MS = 4200;
const RECONNECT_GRACE_MS = 30_000;

export const SCORE = Object.freeze({ roundWin: 100, perLine: 20, perSecond: 2 });

/**
 * Pokój dla dwóch graczy: role, ustawienia, przebieg meczu i pętla gry.
 * Stan gry trzyma wyłącznie serwer — klienci tylko wysyłają wejście.
 */
export class Room {
  constructor(code, hooks) {
    this.code = code;
    this.hooks = hooks;
    this.players = [];
    this.hostId = null;
    this.settings = defaultSettings('match'); // zasady meczu — wspólne
    this.settingsBy = null;                   // kto ostatnio zmienił zasady
    this.phase = PHASE.LOBBY;
    this.round = 0;
    this.engine = null;
    this.loop = null;
    this.timers = new Set();
    this.countdownEndsAt = 0;
    this.lastRound = null;
    this.lastMatch = null;
    this.notice = null;
  }

  get isFull() { return this.players.length >= 2; }
  get canJoin() { return !this.isFull && this.phase === PHASE.LOBBY; }

  playerOf(client) { return this.players.find((p) => p.client === client); }
  byRole(role) { return this.players.find((p) => p.role === role); }

  /* ---------- Gracze ---------- */

  addPlayer(client, nick) {
    const taken = this.players.some((p) => p.nick.toLowerCase() === nick.toLowerCase());
    const role = this.byRole(ROLES.TETRIS) ? ROLES.JUMPER : ROLES.TETRIS;
    const player = {
      id: client.id,
      sessionId: client.sessionId,
      nick: taken ? `${nick.slice(0, 14)} 2` : nick,
      role,
      wins: 0,
      score: 0,
      total: 0,
      matchesWon: 0,
      connected: true,
      client,
      graceTimer: null,
      settings: defaultSettings('player'),   // ustawienia tylko tego gracza
    };
    this.players.push(player);
    this.hostId ??= player.id;
    client.room = this;
    this.notice = null;
    this.broadcastRoom();
  }

  /** Gracz wraca po zerwanym połączeniu. */
  reattach(client) {
    const p = this.players.find((pl) => pl.sessionId === client.sessionId);
    if (!p) return false;
    clearTimeout(p.graceTimer);
    p.graceTimer = null;
    if (p.client && p.client !== client) p.client.room = null;
    p.client = client;
    p.connected = true;
    client.room = this;

    if (this.phase === PHASE.PAUSED && this.players.every((pl) => pl.connected)) {
      this.notice = null;
      this.startCountdown();
    } else {
      this.broadcastRoom();
      if (this.engine) client.send({ type: S2C.STATE, state: this.engine.snapshot() });
    }
    return true;
  }

  disconnect(client) {
    const p = this.playerOf(client);
    if (!p) return;
    p.client = null;
    p.connected = false;
    if (this.phase === PHASE.COUNTDOWN || this.phase === PHASE.PLAYING) this.pause(p);
    p.graceTimer = setTimeout(() => this.removePlayer(p.id), RECONNECT_GRACE_MS);
    this.broadcastRoom();
  }

  removePlayer(id) {
    const index = this.players.findIndex((p) => p.id === id);
    if (index === -1) return;
    const [p] = this.players.splice(index, 1);
    clearTimeout(p.graceTimer);
    if (p.client) {
      p.client.room = null;
      p.client.send({ type: S2C.ROOM, room: null });
    }
    this.hooks.onPlayerLeft?.(p);

    if (this.players.length === 0) {
      this.dispose();
      this.hooks.onEmpty?.(this);
      return;
    }
    if (this.hostId === id) this.hostId = this.players[0].id;
    if (this.phase !== PHASE.LOBBY) this.toLobby(`${p.nick} opuścił grę.`);
    else this.broadcastRoom();
  }

  /* ---------- Wiadomości ---------- */

  handle(client, msg) {
    const p = this.playerOf(client);
    if (!p) return;
    const isHost = p.id === this.hostId;
    const fail = (message) => client.send({ type: S2C.ERROR, message });

    switch (msg.type) {
      case C2S.SETTINGS: {
        if (this.phase !== PHASE.LOBBY) return fail('Ustawienia można zmieniać tylko w pokoju, między meczami.');
        const input = msg.settings;
        const nextMatch = sanitizeSettings(input, this.settings, 'match');
        if (JSON.stringify(nextMatch) !== JSON.stringify(this.settings)) {
          this.settings = nextMatch;
          this.settingsBy = p.nick;
        }
        p.settings = sanitizeSettings(input, p.settings, 'player');
        return this.broadcastRoom();
      }

      case C2S.RESET_SETTINGS:
        if (this.phase !== PHASE.LOBBY) return;
        if (msg.scope === 'match') {
          this.settings = defaultSettings('match');
          this.settingsBy = p.nick;
        } else {
          p.settings = defaultSettings('player');
        }
        return this.broadcastRoom();

      case C2S.SWAP:
        if (!isHost || this.phase !== PHASE.LOBBY) return;
        this.swapRoles();
        return this.broadcastRoom();

      case C2S.START:
        if (!isHost || this.phase !== PHASE.LOBBY) return;
        if (this.players.length < 2) return fail('Potrzebny jest drugi gracz.');
        if (!this.players.every((pl) => pl.connected)) return fail('Drugi gracz jest rozłączony.');
        return this.startMatch();

      case C2S.INPUT:
        if (this.phase !== PHASE.PLAYING || !this.engine) return;
        if (p.role === ROLES.TETRIS && TETRIS_ACTIONS.includes(msg.action)) {
          this.engine.queueAction(msg.action);
        } else if (p.role === ROLES.JUMPER && msg.keys && typeof msg.keys === 'object') {
          this.engine.setJumperInput(msg.keys);
        }
        return;

      case C2S.LOBBY:
        if (this.phase === PHASE.MATCH_OVER) this.toLobby(null);
        return;

      default:
        return;
    }
  }

  /* ---------- Przebieg meczu ---------- */

  swapRoles() {
    for (const p of this.players) p.role = p.role === ROLES.TETRIS ? ROLES.JUMPER : ROLES.TETRIS;
  }

  startMatch() {
    for (const p of this.players) { p.wins = 0; p.score = 0; }
    this.round = 0;
    this.lastMatch = null;
    this.notice = null;
    this.nextRound();
  }

  nextRound() {
    this.round += 1;
    this.lastRound = null;
    // Ustawienia tej rundy zależą od tego, kto teraz jest Tetrisem, a kto skoczkiem
    const tetris = this.byRole(ROLES.TETRIS);
    const jumper = this.byRole(ROLES.JUMPER);
    this.engine = new GameEngine(roundSettings(this.settings, tetris.settings, jumper.settings));
    this.startCountdown();
  }

  startCountdown() {
    this.clearTimers();
    this.phase = PHASE.COUNTDOWN;
    this.countdownEndsAt = Date.now() + COUNTDOWN_MS;
    this.broadcastRoom();
    this.broadcastState();
    this.later(COUNTDOWN_MS, () => {
      this.phase = PHASE.PLAYING;
      this.broadcastRoom();
      this.startLoop();
    });
  }

  pause(who) {
    this.stopLoop();
    this.clearTimers();
    this.phase = PHASE.PAUSED;
    this.notice = `Czekamy, aż ${who.nick} wróci…`;
  }

  startLoop() {
    this.stopLoop();
    let last = performance.now();
    let acc = 0;
    let ticks = 0;

    this.loop = setInterval(() => {
      const now = performance.now();
      acc += Math.min(0.1, (now - last) / 1000);
      last = now;

      while (acc >= STEP && !this.engine.result) {
        this.engine.tick(STEP);
        acc -= STEP;
      }
      ticks += 1;

      if (this.engine.result) {
        this.broadcastState();
        this.endRound();
      } else if (ticks % SEND_EVERY_TICKS === 0) {
        this.broadcastState();
      }
    }, 1000 / TICK_HZ);
  }

  stopLoop() {
    clearInterval(this.loop);
    this.loop = null;
  }

  endRound() {
    this.stopLoop();
    const { winner, reason } = this.engine.result;
    const tetris = this.byRole(ROLES.TETRIS);
    const jumper = this.byRole(ROLES.JUMPER);
    const survived = Math.floor(this.engine.survived);
    const winnerPlayer = winner === ROLES.TETRIS ? tetris : jumper;

    const points = {
      [tetris.id]: this.engine.lines * SCORE.perLine,
      [jumper.id]: survived * SCORE.perSecond,
    };
    points[winnerPlayer.id] += SCORE.roundWin;
    for (const p of this.players) p.score += points[p.id] ?? 0;
    winnerPlayer.wins += 1;

    this.lastRound = {
      round: this.round, winnerId: winnerPlayer.id, winnerRole: winner,
      reason, points, lines: this.engine.lines, survived,
    };
    this.phase = PHASE.ROUND_OVER;
    this.broadcastRoom();

    this.later(ROUND_OVER_MS, () => {
      // Po każdej rundzie gracze zamieniają się rolami — także po ostatniej,
      // więc rewanż zaczyna się „na odwrót”.
      this.swapRoles();
      if (winnerPlayer.wins >= this.settings.roundsToWin) return this.finishMatch(winnerPlayer);
      this.nextRound();
    });
  }

  finishMatch(winner) {
    winner.matchesWon += 1;
    for (const p of this.players) p.total += p.score;
    this.lastMatch = {
      winnerId: winner.id,
      rounds: Object.fromEntries(this.players.map((p) => [p.id, p.wins])),
    };
    this.phase = PHASE.MATCH_OVER;
    this.engine = null;
    this.hooks.onMatchEnd?.(this.players.map((p) => ({ nick: p.nick, points: p.score, won: p === winner })));
    this.broadcastRoom();
  }

  toLobby(notice) {
    this.stopLoop();
    this.clearTimers();
    this.engine = null;
    this.phase = PHASE.LOBBY;
    this.round = 0;
    this.lastRound = null;
    this.notice = notice;
    for (const p of this.players) { p.wins = 0; p.score = 0; }
    this.broadcastRoom();
  }

  /* ---------- Wysyłanie ---------- */

  publicState() {
    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      round: this.round,
      settings: this.settings,
      settingsBy: this.settingsBy,
      players: this.players.map(({ id, nick, role, wins, score, total, matchesWon, connected, settings }) =>
        ({ id, nick, role, wins, score, total, matchesWon, connected, settings })),
      countdownMs: this.phase === PHASE.COUNTDOWN ? Math.max(0, this.countdownEndsAt - Date.now()) : 0,
      countdownTotalMs: COUNTDOWN_MS,
      lastRound: this.lastRound,
      lastMatch: this.lastMatch,
      notice: this.notice,
    };
  }

  broadcastRoom() {
    const room = this.publicState();
    for (const p of this.players) p.client?.send({ type: S2C.ROOM, room });
  }

  broadcastState() {
    if (!this.engine) return;
    const state = this.engine.snapshot();
    for (const p of this.players) p.client?.send({ type: S2C.STATE, state });
  }

  /* ---------- Sprzątanie ---------- */

  later(ms, fn) {
    const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms);
    this.timers.add(t);
  }

  clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  dispose() {
    this.stopLoop();
    this.clearTimers();
    for (const p of this.players) clearTimeout(p.graceTimer);
  }
}
