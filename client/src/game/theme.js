/**
 * Motyw (ciemny / jasny) jako mały zewnętrzny store:
 * zapis w localStorage, domyślnie wg ustawień systemu.
 */
const KEY = 'studnia:theme';
const listeners = new Set();

function initial() {
  const saved = localStorage.getItem(KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

let current = initial();
apply(current);

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1b1f27' : '#ecebe6');
}

export const themeStore = {
  get: () => current,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  set(theme) {
    current = theme;
    localStorage.setItem(KEY, theme);
    apply(theme);
    listeners.forEach((fn) => fn(theme));
  },
  toggle() { this.set(current === 'dark' ? 'light' : 'dark'); },
};
