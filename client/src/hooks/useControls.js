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
export function useControls({ role, enabled, sendInput }) {
  const pressedCodes = useRef(new Set());
  const touch = useRef({ left: false, right: false, jump: false });
  const lastSignature = useRef('');

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
    sendInput({ keys });
  }, [sendInput]);

  const act = useCallback((action) => {
    if (enabled && role === ROLES.TETRIS) sendInput({ action });
  }, [enabled, role, sendInput]);

  const setTouch = useCallback((key, value) => {
    touch.current[key] = value;
    if (enabled && role === ROLES.JUMPER) flushJumper();
  }, [enabled, role, flushJumper]);

  useEffect(() => {
    pressedCodes.current.clear();
    touch.current = { left: false, right: false, jump: false };
    lastSignature.current = '';
    if (!enabled) return undefined;

    const onDown = (e) => {
      if (isTyping(e)) return;
      if (role === ROLES.TETRIS) {
        const action = TETRIS_KEYS[e.code];
        if (!action) return;
        e.preventDefault();
        if (e.repeat && !REPEATABLE.has(action)) return;
        sendInput({ action });
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
  }, [role, enabled, sendInput, flushJumper]);

  return { act, setTouch };
}
