import { useSyncExternalStore } from 'react';
import { themeStore } from '../game/theme.js';

export function useTheme() {
  const theme = useSyncExternalStore(themeStore.subscribe, themeStore.get, themeStore.get);
  return { theme, toggle: () => themeStore.toggle() };
}
