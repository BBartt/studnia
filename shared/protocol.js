/** Wspólne stałe klienta i serwera — jedno źródło prawdy o protokole. */

export const COLS = 10;
export const ROWS = 20;

export const ROLES = Object.freeze({ TETRIS: 'tetris', JUMPER: 'jumper' });

/** Wymiary skoczka (w kratkach). */
export const JUMPER_SIZE = Object.freeze({ w: 0.7, h: 0.9 });

/**
 * Dno studni jest bezpieczne poza polami lawy: LAVA_COUNT pól po 1 kratce,
 * losowanych w każdej rundzie (nigdy obok siebie).
 */
export const LAVA_COUNT = 2;

/** Czy kolumna `x` jest lawą (lista kolumn lawy przychodzi w stanie gry). */
export const isLava = (lava, x) => Boolean(lava?.includes(x));

/** Pole widzenia skoczka: 7 kratek szerokości, proporcje 1:2 jak cała plansza (7 × 14). */
export const JUMPER_VIEW = Object.freeze({ cols: 7, rows: 14 });

/** Długość odliczania przed rundą (ms) i chwile intro skoczka w tym czasie. */
export const COUNTDOWN_MS = 5000;
export const INTRO = Object.freeze({ markAt: 3000, zoomAt: 4000 });

export const PHASE = Object.freeze({
  LOBBY: 'lobby',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  PAUSED: 'paused',
  ROUND_OVER: 'roundOver',
  MATCH_OVER: 'matchOver',
});

/** Wiadomości klient → serwer */
export const C2S = Object.freeze({
  HELLO: 'hello',
  CREATE: 'createRoom',
  JOIN: 'joinRoom',
  LEAVE: 'leaveRoom',
  SETTINGS: 'updateSettings',
  RESET_SETTINGS: 'resetSettings',
  PING: 'ping',
  SWAP: 'swapRoles',
  START: 'startMatch',
  INPUT: 'input',
  LOBBY: 'backToLobby',
});

/** Wiadomości serwer → klient */
export const S2C = Object.freeze({
  WELCOME: 'welcome',
  ROOM: 'room',
  STATE: 'state',
  ERROR: 'error',
  PONG: 'pong',
});

export const TETRIS_ACTIONS = Object.freeze(['left', 'right', 'rotate', 'soft', 'hard']);

export const PIECE_COLORS = Object.freeze({
  I: '#5CC8FF',
  O: '#FFD166',
  T: '#C084FC',
  S: '#6EE7A8',
  Z: '#FF7A8A',
  J: '#7C8CFF',
  L: '#FFA45C',
});

export const NICK_MIN = 2;
export const NICK_MAX = 16;
export const ROOM_CODE_LENGTH = 4;

/** Zwraca oczyszczony nick albo null, jeśli jest niepoprawny. */
export function sanitizeNick(raw) {
  if (typeof raw !== 'string') return null;
  const nick = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  if (nick.length < NICK_MIN || nick.length > NICK_MAX) return null;
  return nick;
}
