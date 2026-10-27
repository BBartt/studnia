import { useCallback, useSyncExternalStore } from 'react';
import { useGame } from '../net/GameProvider.jsx';

/**
 * Wybiera fragment stanu gry. Komponent przerenderuje się tylko wtedy,
 * gdy wynik selektora się zmieni (selektor powinien zwracać prymitywy).
 */
export function useSnapshot(selector) {
  const { store } = useGame();
  const get = useCallback(() => selector(store.get()), [store, selector]);
  return useSyncExternalStore(store.subscribe, get, get);
}
