import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { COLS, ROWS } from '@studnia/shared/protocol';
import styles from './FxLayer.module.css';

const LIFETIME_MS = 1150;
let nextId = 1;

/**
 * Wyskakujące napisy nad planszą („TETRIS!”, „ODBICIE ×3”…).
 * Rodzic wywołuje `ref.current.spawn({ text, sub, x, y, tone, size })`.
 */
const FxLayer = forwardRef(function FxLayer(_props, ref) {
  const [items, setItems] = useState([]);
  const timers = useRef(new Set());

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const spawn = useCallback(({ text, sub, x = COLS / 2, y = ROWS / 2, tone = 'pop', size = 1 }) => {
    const id = nextId++;
    const left = Math.min(82, Math.max(18, (x / COLS) * 100));
    const top = Math.min(88, Math.max(10, (y / ROWS) * 100));
    const tilt = (Math.random() - 0.5) * 14;
    setItems((list) => [...list.slice(-5), { id, text, sub, left, top, tone, size, tilt }]);
    const t = setTimeout(() => {
      timers.current.delete(t);
      setItems((list) => list.filter((i) => i.id !== id));
    }, LIFETIME_MS);
    timers.current.add(t);
  }, []);

  useImperativeHandle(ref, () => ({ spawn }), [spawn]);

  return (
    <div className={styles.layer} aria-hidden="true">
      {items.map((i) => (
        <div
          key={i.id}
          className={styles.pop}
          data-tone={i.tone}
          style={{ left: `${i.left}%`, top: `${i.top}%`, '--size': i.size, '--tilt': `${i.tilt}deg` }}
        >
          <span className={styles.text}>{i.text}</span>
          {i.sub && <span className={styles.sub}>{i.sub}</span>}
        </div>
      ))}
    </div>
  );
});

export default FxLayer;
