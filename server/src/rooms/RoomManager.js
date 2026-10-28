import { randomUUID } from 'node:crypto';
import { C2S, S2C, ROOM_CODE_LENGTH, sanitizeNick } from '@studnia/shared/protocol';
import { Room } from './Room.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // bez I i O, żeby nie myliły się z 1 i 0
const SESSION_RE = /^[0-9a-f-]{36}$/i;
const SESSION_TTL_MS = 10 * 60_000;

/** Routuje wiadomości, pilnuje sesji (powrót po zerwaniu) i tworzy pokoje. */
export class RoomManager {
  constructor({ leaderboard }) {
    this.leaderboard = leaderboard;
    this.rooms = new Map();
    this.sessions = new Map(); // sessionId → { id, roomCode, expires }
  }

  handle(client, msg) {
    if (msg.type === C2S.HELLO) return this.hello(client, msg);
    if (msg.type === C2S.PING) return client.send({ type: S2C.PONG, t: Number(msg.t) || 0 });
    if (!client.sessionId) return;

    switch (msg.type) {
      case C2S.CREATE: return this.create(client, msg);
      case C2S.JOIN: return this.join(client, msg);
      case C2S.LEAVE: return this.leave(client);
      default: return client.room?.handle(client, msg);
    }
  }

  hello(client, { sessionId }) {
    let session = typeof sessionId === 'string' && SESSION_RE.test(sessionId) ? this.sessions.get(sessionId) : null;
    if (!session) {
      sessionId = randomUUID();
      session = { id: randomUUID(), roomCode: null };
      this.sessions.set(sessionId, session);
    }
    session.expires = null;
    client.sessionId = sessionId;
    client.id = session.id;
    client.send({ type: S2C.WELCOME, sessionId, id: session.id });

    const room = session.roomCode && this.rooms.get(session.roomCode);
    if (room?.reattach(client)) return;
    session.roomCode = null;
    client.send({ type: S2C.ROOM, room: null });
  }

  create(client, { nick }) {
    const clean = sanitizeNick(nick);
    if (!clean) return this.fail(client, 'Nick musi mieć od 2 do 16 znaków.');
    this.leave(client, { silent: true });

    const code = this.generateCode();
    const room = new Room(code, {
      onEmpty: (r) => this.rooms.delete(r.code),
      onPlayerLeft: (p) => { const s = this.sessions.get(p.sessionId); if (s) s.roomCode = null; },
      onMatchEnd: (results) => results.forEach((r) => this.leaderboard.record(r)),
    });
    this.rooms.set(code, room);
    room.addPlayer(client, clean);
    this.sessions.get(client.sessionId).roomCode = code;
  }

  join(client, { code, nick }) {
    const clean = sanitizeNick(nick);
    if (!clean) return this.fail(client, 'Nick musi mieć od 2 do 16 znaków.');
    const roomCode = String(code ?? '').trim().toUpperCase();
    const room = this.rooms.get(roomCode);
    if (!room) return this.fail(client, `Nie ma pokoju o kodzie ${roomCode || '—'}.`);
    if (client.room === room) return;
    if (room.isFull) return this.fail(client, 'Ten pokój jest już pełny.');
    if (!room.canJoin) return this.fail(client, 'W tym pokoju trwa już mecz.');

    this.leave(client, { silent: true });
    room.addPlayer(client, clean);
    this.sessions.get(client.sessionId).roomCode = roomCode;
  }

  leave(client, { silent = false } = {}) {
    if (client.room) client.room.removePlayer(client.id);
    else if (!silent) client.send({ type: S2C.ROOM, room: null });
  }

  disconnect(client) {
    client.room?.disconnect(client);
    const session = this.sessions.get(client.sessionId);
    if (session) session.expires = Date.now() + SESSION_TTL_MS;
  }

  /** Usuwa porzucone sesje, żeby mapa nie rosła w nieskończoność. */
  sweepSessions() {
    const now = Date.now();
    for (const [key, s] of this.sessions) {
      if (s.expires && s.expires < now && !s.roomCode) this.sessions.delete(key);
    }
  }

  generateCode() {
    let code;
    do {
      code = Array.from({ length: ROOM_CODE_LENGTH },
        () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }

  fail(client, message) {
    client.send({ type: S2C.ERROR, message });
  }
}
