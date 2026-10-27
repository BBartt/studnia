import { useEffect, useState } from 'react';

/** Odlicza do `endsAt` (performance.now()), odświeżając co 100 ms. */
export function useCountdown(endsAt) {
  const [left, setLeft] = useState(() => Math.max(0, endsAt - performance.now()));
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, endsAt - performance.now()));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [endsAt]);
  return left;
}
