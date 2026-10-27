/**
 * Stan gry przychodzi 30 razy na sekundę. Trzymamy go poza stanem Reacta,
 * żeby nie przerenderowywać całego drzewa — canvas subskrybuje go bezpośrednio,
 * a HUD wybiera tylko potrzebne pola przez useSyncExternalStore.
 */
export function createSnapshotStore() {
  let snapshot = null;
  const listeners = new Set();

  return {
    get: () => snapshot,
    set(next) {
      snapshot = next;
      for (const listener of listeners) listener(next);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
