import { useRef } from 'react';
import { ROLES } from '@studnia/shared/protocol';
import styles from './TouchPad.module.css';

/** Przycisk reagujący na wciśnięcie i puszczenie (palec, mysz, rysik). */
function HoldButton({ label, children, onDown, onUp, repeat = false, className }) {
  const timers = useRef([]);
  const stop = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const down = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    onDown();
    if (repeat) {
      const tick = () => { onDown(); timers.current.push(setTimeout(tick, 70)); };
      timers.current.push(setTimeout(tick, 180));
    }
  };
  const up = () => { stop(); onUp?.(); };

  return (
    <button
      type="button"
      aria-label={label}
      className={`${styles.btn} ${className ?? ''}`}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

export default function TouchPad({ role, act, setTouch }) {
  if (role === ROLES.TETRIS) {
    return (
      <div className={`${styles.pad} ${styles.tetris}`}>
        <HoldButton label="Klocek w lewo" repeat onDown={() => act('left')}>◀</HoldButton>
        <HoldButton label="Obróć" onDown={() => act('rotate')}>⟳</HoldButton>
        <HoldButton label="Klocek w prawo" repeat onDown={() => act('right')}>▶</HoldButton>
        <HoldButton label="Szybciej w dół" repeat onDown={() => act('soft')}>▼</HoldButton>
        <HoldButton label="Zrzuć" className={styles.wide} onDown={() => act('hard')}>Zrzut</HoldButton>
      </div>
    );
  }
  return (
    <div className={`${styles.pad} ${styles.jumper}`}>
      <HoldButton label="W lewo" onDown={() => setTouch('left', true)} onUp={() => setTouch('left', false)}>◀</HoldButton>
      <HoldButton label="W prawo" onDown={() => setTouch('right', true)} onUp={() => setTouch('right', false)}>▶</HoldButton>
      <HoldButton label="Skok" className={styles.jump} onDown={() => setTouch('jump', true)} onUp={() => setTouch('jump', false)}>Skok</HoldButton>
    </div>
  );
}
