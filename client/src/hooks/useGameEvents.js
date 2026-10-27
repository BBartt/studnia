import { useEffect, useLayoutEffect, useRef } from 'react';
import { useGame } from '../net/GameProvider.jsx';

/**
 * Wywołuje `handler(event, snapshot)` dla każdego zdarzenia gry (linie, zrzut, odbicie…).
 * Handler trzymamy w refie, więc subskrypcja powstaje tylko raz.
 */
export function useGameEvents(handler) {
  const { store } = useGame();
  const ref = useRef(handler);
  useLayoutEffect(() => { ref.current = handler; });

  useEffect(() => store.subscribe((snap) => {
    if (!snap?.events?.length) return;
    for (const event of snap.events) ref.current(event, snap);
  }), [store]);
}
