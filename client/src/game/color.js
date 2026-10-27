/** Rozjaśnia (amount > 0) lub przyciemnia (amount < 0) kolor hex. */
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `rgb(${r}, ${g}, ${b})`;
}

export const JMP = '#18A8F0';
export const POP = '#FFD23F';
export const TET = '#FF5B3A';
export const DANGER = '#FF3D6E';
export const INK = '#0F1B3D';
