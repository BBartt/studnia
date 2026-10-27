import { shade } from './color.js';

/**
 * Każdy kolor klocka rysujemy raz do małego canvasu i potem tylko kopiujemy.
 */
export function createBlockSprites() {
  const cache = new Map();
  let size = 0;
  let outline = '';

  return {
    get(color, px, outlineColor) {
      const s = Math.max(4, Math.round(px));
      if (s !== size || outlineColor !== outline) { cache.clear(); size = s; outline = outlineColor; }
      let sprite = cache.get(color);
      if (!sprite) {
        sprite = drawSprite(color, s, outlineColor);
        cache.set(color, sprite);
      }
      return sprite;
    },
  };
}

function drawSprite(color, s, outline) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');
  const inset = s * 0.05;
  const r = s * 0.2;

  const body = ctx.createLinearGradient(0, 0, 0, s);
  body.addColorStop(0, shade(color, 0.16));
  body.addColorStop(1, shade(color, -0.14));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(inset, inset, s - inset * 2, s - inset * 2, r);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(1, s * 0.045);
  ctx.stroke();

  // wewnętrzna fazka — miękka, bez połysku „plastiku”
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = Math.max(1, s * 0.035);
  ctx.beginPath();
  ctx.roundRect(s * 0.16, s * 0.16, s * 0.68, s * 0.68, r * 0.6);
  ctx.stroke();
  return canvas;
}
