import { useEffect, useRef } from 'react';
import { PALETTES } from '../game/palette.js';
import { useReducedMotion } from '../hooks/useReducedMotion.js';

const COLORS = [...Object.values(PALETTES.dark.pieces), '#82B9B1', '#A9A5D8'];

/** Pełnoekranowe konfetti z kwadracików w kolorach klocków. */
export default function Confetti({ duration = 4200 }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return undefined;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const pieces = Array.from({ length: 140 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.3,
      y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 900,
      vy: -300 - Math.random() * 700,
      s: 6 + Math.random() * 8,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 12,
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));

    const start = performance.now();
    let last = start;
    let frame;
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - start) / duration;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - 0.7) / 0.3);
      for (const p of pieces) {
        p.vy += 900 * dt;
        p.vx *= 0.99;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.r += p.vr * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.7);
        ctx.restore();
      }
      if (t < 1) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); };
  }, [duration, reduced]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 40 }}
    />
  );
}
