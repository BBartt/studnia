import { useCallback, useEffect, useRef } from 'react';
import { ROLES } from '@studnia/shared/protocol';

const TETRIS_KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'rotate', KeyW: 'rotate', KeyX: 'rotate',
  ArrowDown: 'soft', KeyS: 'soft',
  Space: 'hard', Enter: 'hard',
};
const REPEATABLE = new Set(['left', 'right', 'soft']);

const JUMPER_KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
};

const isTyping = (e) => e.target instanceof Element && e.target.closest('input, textarea, select');

/**
 * Klawiatura + dotyk dla aktualnej roli gracza.
 * Tetris wysyła pojedyncze akcje, skoczek — stan klawiszy tylko przy zmianie.
 */
export function useControls({ role, enabled, sendInput, hardDrop = false, onJumperInput, onTetrisAction }) {
  const pressedCodes = useRef(new Set());
  const touch = useRef({ left: false, right: false, jump: false });
  const lastSignature = useRef('');
  const lastKeys = useRef({ left: false, right: false, jump: false });
  const seq = useRef(0);

  const sendJumper = useCallback((keys) => {
    seq.current += 1;
    onJumperInput?.(keys, seq.current); // predykcja: ruch od razu na ekranie
    sendInput({ keys, seq: seq.current });
  }, [sendInput, onJumperInput]);

  const sendTetris = useCallback((action) => {
    const n = onTetrisAction?.(action); // predykcja: klocek rusza się od razu
    sendInput({ action, seq: n });
  }, [sendInput, onTetrisAction]);

  const flushJumper = useCallback(() => {
    const fromKeys = new Set([...pressedCodes.current].map((code) => JUMPER_KEYS[code]));
    const keys = {
      left: fromKeys.has('left') || touch.current.left,
      right: fromKeys.has('right') || touch.current.right,
      jump: fromKeys.has('jump') || touch.current.jump,
    };
    const signature = `${+keys.left}${+keys.right}${+keys.jump}`;
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;
    lastKeys.current = keys;
    sendJumper(keys);
  }, [sendJumper]);

  const act = useCallback((action) => {
    if (action === 'hard' && !hardDrop) return;
    if (enabled && role === ROLES.TETRIS) sendTetris(action);
  }, [enabled, role, sendTetris, hardDrop]);

  const setTouch = useCallback((key, value) => {
    touch.current[key] = value;
    if (enabled && role === ROLES.JUMPER) flushJumper();
  }, [enabled, role, flushJumper]);

  useEffect(() => {
    pressedCodes.current.clear();
    touch.current = { left: false, right: false, jump: false };
    lastSignature.current = '';
    lastKeys.current = { left: false, right: false, jump: false };
    if (!enabled) return undefined;

    const onDown = (e) => {
      if (isTyping(e)) return;
      if (role === ROLES.TETRIS) {
        const action = TETRIS_KEYS[e.code];
        if (!action) return;
        e.preventDefault();
        if (action === 'hard' && !hardDrop) return; // zrzut wyłączony, dopóki obaj się nie zgodzą
        if (e.repeat && !REPEATABLE.has(action)) return;
        sendTetris(action);
      } else if (JUMPER_KEYS[e.code]) {
        e.preventDefault();
        if (e.repeat) return;
        pressedCodes.current.add(e.code);
        flushJumper();
      }
    };
    const onUp = (e) => {
      if (role !== ROLES.JUMPER || !JUMPER_KEYS[e.code]) return;
      pressedCodes.current.delete(e.code);
      flushJumper();
    };
    const onBlur = () => {
      pressedCodes.current.clear();
      if (role === ROLES.JUMPER) flushJumper();
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [role, enabled, sendTetris, sendJumper, flushJumper, hardDrop]);

  return { act, setTouch };
}
