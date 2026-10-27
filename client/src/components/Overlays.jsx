import { useMemo } from 'react';
import { INTRO, ROLES } from '@studnia/shared/protocol';
import { useGame, usePlayers } from '../net/GameProvider.jsx';
import { useCountdown } from '../hooks/useCountdown.js';
import { ROLE_INFO, RESULT_COPY, otherRole } from '../game/roles.js';
import Scoreboard from './Scoreboard.jsx';
import Confetti from './Confetti.jsx';
import RoleIcon from './RoleIcon.jsx';
import styles from './Overlays.module.css';

/**
 * Odliczanie. Przez pierwsze 3 s zasłania planszę i mówi, kim jesteś;
 * potem chowa się do górnego paska, żeby było widać intro pola widzenia.
 */
export function CountdownOverlay({ room, endsAt }) {
  const { me } = usePlayers();
  const left = useCountdown(endsAt);
  const elapsed = room.countdownTotalMs - left;
  const compact = elapsed >= INTRO.markAt;
  const n = Math.max(1, Math.ceil(left / 1000));
  const info = me ? ROLE_INFO[me.role] : null;
  const swapped = room.round > 1;

  if (compact) {
    return (
      <div className={styles.compact} aria-live="polite">
        <span key={n} className={styles.compactCount}>{n}</span>
        {me?.role === ROLES.JUMPER && <span>Tyle zobaczysz w grze</span>}
        {me?.role === ROLES.TETRIS && <span>Start!</span>}
      </div>
    );
  }

  return (
    <div className={styles.overlay}>
      <p className={styles.kicker}>Runda {room.round}</p>
      {info && (
        <div className={styles.roleCard} data-role={me.role}>
          {swapped && <span className={styles.swapNote}>Zamiana ról</span>}
          <RoleIcon role={me.role} size={40} />
          <p className={styles.roleLine}>{me.nick}, grasz jako</p>
          <h2 className={styles.roleName}>{info.label}</h2>
          <p className={styles.sub}>{info.goal}</p>
        </div>
      )}
      <span key={n} className={styles.count}>{n}</span>
    </div>
  );
}

export function RoundOverlay({ room }) {
  const { meId } = useGame();
  const { me } = usePlayers();
  const r = room.lastRound;
  if (!r) return null;
  const winner = room.players.find((p) => p.id === r.winnerId);
  const copy = RESULT_COPY[r.reason];
  const iWon = r.winnerId === meId;
  const next = me ? ROLE_INFO[otherRole(me.role)] : null;

  return (
    <div className={styles.overlay}>
      <p className={styles.kicker}>Koniec rundy {r.round}</p>
      <h2 className={`${styles.title} ${iWon ? styles.good : styles.bad}`}>{copy.title}</h2>
      <p className={styles.sub}>{copy.line} {iWon ? 'Wygrywasz rundę.' : `Rundę wygrywa ${winner?.nick ?? '—'}.`}</p>
      <ul className={styles.points}>
        {room.players.map((p) => (
          <li key={p.id} data-me={p.id === meId}>
            <span>{p.nick}{p.id === meId ? ' (ty)' : ''}</span>
            <strong>+{r.points[p.id] ?? 0}</strong>
          </li>
        ))}
      </ul>
      {next && (
        <p className={styles.nextRole} data-role={otherRole(me.role)}>
          Zamiana ról — teraz będziesz: <strong>{next.label}</strong>
        </p>
      )}
      <div className={styles.progress} aria-hidden="true"><span /></div>
    </div>
  );
}

export function PausedOverlay({ room }) {
  return (
    <div className={styles.overlay}>
      <h2 className={styles.title}>Pauza</h2>
      <p className={styles.sub}>{room.notice ?? 'Czekamy na drugiego gracza…'}</p>
      <span className={styles.spinner} aria-hidden="true" />
    </div>
  );
}

export function MatchOverDialog({ room }) {
  const { meId, actions } = useGame();
  const winner = room.players.find((p) => p.id === room.lastMatch?.winnerId);
  const iWon = winner?.id === meId;
  const ordered = useMemo(() => room.players, [room.players]);

  return (
    <div className={styles.backdrop}>
      {iWon && <Confetti />}
      <div className={`panel ${styles.dialog}`} role="dialog" aria-labelledby="match-title">
        <p className={styles.kicker}>Koniec meczu</p>
        <h2 id="match-title" className={styles.dialogTitle}>
          {iWon ? 'Wygrywasz mecz' : `Wygrywa ${winner?.nick ?? '—'}`}
        </h2>
        <Scoreboard
          players={ordered}
          meId={meId}
          hostId={room.hostId}
          roundsToWin={room.settings.roundsToWin}
          highlightId={winner?.id}
          showTotals
        />
        <p className={styles.sub}>W rewanżu zaczynacie z zamienionymi rolami.</p>
        <div className={styles.actions}>
          <button type="button" className="btn btn--primary btn--large" onClick={actions.backToLobby}>
            Wróć do pokoju
          </button>
          <button type="button" className="btn btn--quiet" onClick={actions.leaveRoom}>Wyjdź</button>
        </div>
      </div>
    </div>
  );
}
