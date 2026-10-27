import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { C2S, S2C } from '@studnia/shared/protocol';
import { createSocket, socketUrl } from './socket.js';
import { createSnapshotStore } from './snapshotStore.js';

const SESSION_KEY = 'studnia:session';
const GameContext = createContext(null);

const initialState = { status: 'connecting', meId: null, room: null, error: null };

function reducer(state, action) {
  switch (action.type) {
    case 'status': return { ...state, status: action.status };
    case 'welcome': return { ...state, meId: action.id };
    case 'room': return { ...state, room: action.room };
    case 'error': return { ...state, error: { message: action.message, at: Date.now() } };
    case 'clearError': return { ...state, error: null };
    default: return state;
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef = useRef(null);
  const storeRef = useRef(null);
  storeRef.current ??= createSnapshotStore();

  useEffect(() => {
    const store = storeRef.current;
    const socket = createSocket({
      url: socketUrl(),
      onStatus(status) {
        dispatch({ type: 'status', status });
        // sessionStorage: każda karta to osobny gracz, a odświeżenie wraca do pokoju
        if (status === 'open') socket.send({ type: C2S.HELLO, sessionId: sessionStorage.getItem(SESSION_KEY) });
      },
      onMessage(msg) {
        switch (msg.type) {
          case S2C.WELCOME:
            sessionStorage.setItem(SESSION_KEY, msg.sessionId);
            dispatch({ type: 'welcome', id: msg.id });
            break;
          case S2C.ROOM:
            if (!msg.room) store.set(null);
            dispatch({ type: 'room', room: msg.room });
            break;
          case S2C.STATE:
            store.set(msg.state);
            break;
          case S2C.ERROR:
            dispatch({ type: 'error', message: msg.message });
            break;
          default:
            break;
        }
      },
    });
    socketRef.current = socket;
    return () => socket.close();
  }, []);

  const actions = useMemo(() => {
    const send = (payload) => socketRef.current?.send(payload);
    return {
      createRoom: (nick) => send({ type: C2S.CREATE, nick }),
      joinRoom: (code, nick) => send({ type: C2S.JOIN, code, nick }),
      leaveRoom: () => send({ type: C2S.LEAVE }),
      updateSettings: (settings) => send({ type: C2S.SETTINGS, settings }),
      resetSettings: (scope) => send({ type: C2S.RESET_SETTINGS, scope }),
      swapRoles: () => send({ type: C2S.SWAP }),
      startMatch: () => send({ type: C2S.START }),
      backToLobby: () => send({ type: C2S.LOBBY }),
      sendInput: (input) => send({ type: C2S.INPUT, ...input }),
      clearError: () => dispatch({ type: 'clearError' }),
    };
  }, []);

  const value = useMemo(
    () => ({ ...state, actions, store: storeRef.current }),
    [state, actions],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame musi być użyty wewnątrz <GameProvider>');
  return ctx;
}

/** Zwraca ja (gracza) i przeciwnika z aktualnego pokoju. */
export function usePlayers() {
  const { room, meId } = useGame();
  const players = room?.players ?? [];
  return {
    me: players.find((p) => p.id === meId) ?? null,
    opponent: players.find((p) => p.id !== meId) ?? null,
    isHost: room?.hostId === meId,
  };
}
