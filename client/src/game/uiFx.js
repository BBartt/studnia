/**
 * Efekty na elementach DOM przez Web Animations API — bez przerenderowań Reacta.
 */

/** Trzęsienie elementu o zadanej sile (px), wygasające w czasie. */
export function shake(el, strength, duration = 420) {
  if (!el) return;
  const frames = [];
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const k = 1 - i / steps;
    const a = strength * k;
    frames.push({
      transform: i === steps
        ? 'translate(0, 0) rotate(0)'
        : `translate(${(Math.random() - 0.5) * 2 * a}px, ${(Math.random() - 0.5) * 2 * a}px) rotate(${(Math.random() - 0.5) * a * 0.12}deg)`,
    });
  }
  el.animate(frames, { duration, easing: 'ease-out', composite: 'add' });
}

/** Krótkie „uderzenie” — powiększenie i powrót ze sprężynowaniem. */
export function punch(el, scale = 1.04, duration = 380) {
  el?.animate(
    [{ transform: 'scale(1)' }, { transform: `scale(${scale})`, offset: 0.25 }, { transform: 'scale(1)' }],
    { duration, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', composite: 'add' },
  );
}

/** Ugięcie w dół, jakby klocek uderzył w dno studni. */
export function thud(el, depth = 6) {
  el?.animate(
    [{ transform: 'translateY(0)' }, { transform: `translateY(${depth}px)`, offset: 0.2 }, { transform: 'translateY(0)' }],
    { duration: 260, easing: 'ease-out', composite: 'add' },
  );
}

/** Szarpnięcie w bok (np. przy odbiciu od ściany). */
export function nudge(el, dx = 4) {
  el?.animate(
    [{ transform: 'translateX(0)' }, { transform: `translateX(${dx}px)`, offset: 0.25 }, { transform: 'translateX(0)' }],
    { duration: 220, easing: 'ease-out', composite: 'add' },
  );
}
