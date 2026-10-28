import { useEffect, useRef } from 'react';
import { useGame } from '../net/GameProvider.jsx';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import { useTheme } from '../hooks/useTheme.js';
import { BoardRenderer } from '../game/renderer.js';

/**
 * Canvas planszy. Subskrybuje stan bezpośrednio, bez przerenderowań Reacta.
 * `mode="jumper"` włącza ograniczone pole widzenia z animacją intro.
 */
export default function Board({ className, showDanger, lite = false, mode, phase, countdownEndsAt, countdownTotal, rendererRef, predictor }) {
  const canvasRef = useRef(null);
  const localRef = useRef(null);
  const { store, latency } = useGame();
  const reducedMotion = useReducedMotion();
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = new BoardRenderer(canvas);
    localRef.current = renderer;
    canvas.studniaRenderer = renderer; // ułatwia diagnostykę w narzędziach przeglądarki
    if (rendererRef) rendererRef.current = renderer;
    renderer.push(store.get(), { replayEvents: false });

    const unsubscribe = store.subscribe((snap) => renderer.push(snap));
    const observer = new ResizeObserver(() => renderer.resize());
    observer.observe(canvas);

    let frame;
    let last = performance.now();
    const loop = (now) => {
      renderer.render(Math.min(0.05, (now - last) / 1000));
      last = now;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      unsubscribe();
      if (rendererRef) rendererRef.current = null;
    };
  }, [store, rendererRef]);

  useEffect(() => {
    localRef.current?.setPredictor(predictor, latency);
  }, [predictor, latency]);

  useEffect(() => {
    localRef.current?.setOptions({ reducedMotion, showDanger, lite, theme, mode, phase, countdownEndsAt, countdownTotal });
  }, [reducedMotion, showDanger, lite, theme, mode, phase, countdownEndsAt, countdownTotal]);

  return <canvas ref={canvasRef} className={className} role="img" aria-label="Plansza gry" />;
}
