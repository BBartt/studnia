/**
 * Schemat ustawień gry. Klient buduje z niego formularz,
 * serwer używa go do walidacji — nic nie jest zduplikowane.
 */

export const SETTINGS_SCHEMA = Object.freeze({
  roundSeconds: {
    scope: 'match',
    label: 'Czas rundy', kind: 'range', min: 45, max: 180, step: 15, default: 90,
    format: (v) => `${v} s`,
    hint: 'Tyle musi przetrwać skoczek.',
  },
  startSpeed: {
    scope: 'player',
    label: 'Prędkość klocków', kind: 'range', min: 1, max: 10, step: 1, default: 4,
    format: (v) => `poziom ${v}`,
    hint: 'Gdy jesteś Tetrisem: jak szybko spadają twoje klocki.',
  },
  speedRamp: {
    scope: 'player',
    hint: 'Gdy jesteś Tetrisem: jak szybko klocki przyspieszają w trakcie rundy.',
    label: 'Przyspieszanie', kind: 'choice', default: 'normal',
    options: [
      { value: 'off', label: 'Brak' },
      { value: 'low', label: 'Lekkie' },
      { value: 'normal', label: 'Średnie' },
      { value: 'high', label: 'Ostre' },
    ],
  },
  jumpPower: {
    scope: 'player',
    label: 'Siła skoku', kind: 'range', min: 0.8, max: 1.3, step: 0.05, default: 1,
    format: (v) => `${Math.round(v * 100)}%`,
    hint: 'Gdy jesteś skoczkiem.',
  },
  runSpeed: {
    scope: 'player',
    label: 'Szybkość biegu', kind: 'range', min: 0.8, max: 1.3, step: 0.05, default: 1,
    format: (v) => `${Math.round(v * 100)}%`,
    hint: 'Gdy jesteś skoczkiem.',
  },
  roundsToWin: {
    scope: 'match',
    label: 'Wygrane rundy do końca meczu', kind: 'choice', default: 2,
    options: [
      { value: 1, label: '1' },
      { value: 2, label: '2' },
      { value: 3, label: '3' },
      { value: 5, label: '5' },
    ],
  },
  hardDrop: {
    scope: 'vote',
    label: 'Natychmiastowy zrzut (spacja)',
    kind: 'toggle', default: false,
    hint: 'Działa tylko wtedy, gdy zgodzą się obaj gracze.',
  },
  effects: {
    scope: 'player',
    label: 'Efekty wizualne', kind: 'choice', default: 'full',
    options: [
      { value: 'full', label: 'Pełne' },
      { value: 'lite', label: 'Oszczędne' },
    ],
    hint: 'Na twoim ekranie. „Oszczędne” wyłącza gwiazdki, wstęgi i deszcz gwiazd — przydatne na słabszym sprzęcie.',
  },
  dangerHint: {
    scope: 'player',
    label: 'Podświetlaj zagrożenie', kind: 'toggle', default: true,
    hint: 'Na twoim ekranie: cień klocka robi się czerwony nad skoczkiem.',
  },
});

/** Poziom prędkości → odstęp między krokami klocka (ms). */
export const speedToInterval = (level) => 1100 - level * 90;
/** O ile ms na sekundę gry skraca się odstęp. */
export const RAMP = Object.freeze({ off: 0, low: 3, normal: 6, high: 11 });
export const MIN_INTERVAL = 110;

/**
 * Zakres ustawienia:
 * - 'match'  — zasady wspólne dla obu graczy (może je zmienić każdy),
 * - 'player' — ustawienie każdego gracza osobno, działa w jego rolach / na jego ekranie,
 * - 'vote'   — głos każdego gracza; reguła działa tylko przy zgodzie wszystkich.
 */
export const SETTINGS_SCOPES = Object.freeze(['match', 'player', 'vote']);

/** Czy reguła głosowana jest włączona (wszyscy — i co najmniej dwóch — są za). */
export const votePassed = (players, key) =>
  players.length >= 2 && players.every((p) => p.settings?.[key] === true);

/** Klucze ustawień z danego zakresu (bez zakresu = wszystkie). */
export const settingsKeys = (scope) =>
  Object.keys(SETTINGS_SCHEMA).filter((k) => !scope || SETTINGS_SCHEMA[k].scope === scope);

/** Ustawienia fabryczne (dla zakresu albo wszystkie). */
export function defaultSettings(scope) {
  return Object.fromEntries(settingsKeys(scope).map((k) => [k, SETTINGS_SCHEMA[k].default]));
}

/**
 * Ustawienia rundy: zasady meczu + prędkość klocków gracza-Tetrisa
 * + fizyka gracza-skoczka. Podświetlanie zagrożenia liczymy zawsze,
 * a o pokazaniu decyduje ekran każdego gracza.
 */
export function roundSettings(match, tetrisPlayer, jumperPlayer, rules = {}) {
  return {
    ...match,
    startSpeed: tetrisPlayer.startSpeed,
    speedRamp: tetrisPlayer.speedRamp,
    jumpPower: jumperPlayer.jumpPower,
    runSpeed: jumperPlayer.runSpeed,
    hardDrop: Boolean(rules.hardDrop),
    dangerHint: true,
  };
}

/** Scala `input` z `base`, odrzucając wszystko, co nie pasuje do schematu (lub zakresu). */
export function sanitizeSettings(input, base = defaultSettings(), scope) {
  const out = { ...base };
  if (!input || typeof input !== 'object') return out;

  for (const key of settingsKeys(scope)) {
    const spec = SETTINGS_SCHEMA[key];
    if (!(key in input)) continue;
    const value = input[key];

    if (spec.kind === 'range') {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      const clamped = Math.min(spec.max, Math.max(spec.min, n));
      const snapped = spec.min + Math.round((clamped - spec.min) / spec.step) * spec.step;
      out[key] = Number(snapped.toFixed(2));
    } else if (spec.kind === 'choice') {
      const match = spec.options.find((o) => o.value === value);
      if (match) out[key] = match.value;
    } else if (spec.kind === 'toggle') {
      out[key] = Boolean(value);
    }
  }
  return out;
}
