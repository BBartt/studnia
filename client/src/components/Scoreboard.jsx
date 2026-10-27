import RoleIcon from './RoleIcon.jsx';
import { ROLE_INFO } from '../game/roles.js';
import styles from './Scoreboard.module.css';

function PlayerCell({ p, meId, hostId, showRole }) {
  return (
    <div className={styles.player}>
      {showRole && (
        <span className={styles.icon} title={ROLE_INFO[p.role].label}>
          <RoleIcon role={p.role} size={20} />
        </span>
      )}
      <span className={styles.nick}>{p.nick}</span>
      {p.id === meId && <span className={styles.tag}>ty</span>}
      {p.id === hostId && <span className={styles.tag} title="Gospodarz pokoju">gosp.</span>}
      {!p.connected && <span className={`${styles.tag} ${styles.off}`}>rozłączony</span>}
    </div>
  );
}

function Pips({ wins, roundsToWin }) {
  return (
    <span className={styles.rounds}>
      <span className={styles.pips} aria-hidden="true">
        {Array.from({ length: roundsToWin }, (_, i) => (
          <span key={i} className={i < wins ? styles.pipOn : styles.pip} />
        ))}
      </span>
      <span className={styles.count}>{wins}/{roundsToWin}</span>
    </span>
  );
}

/**
 * Tabela graczy w dwóch wariantach:
 * - "match" (w grze, po meczu): wygrane rundy bieżącego meczu i jego punkty,
 * - "room" (w pokoju między meczami): bilans całej sesji w pokoju.
 */
export default function Scoreboard({ variant = 'match', players, meId, hostId, roundsToWin, highlightId, lastMatch, showTotals = false }) {
  if (variant === 'room') {
    const sorted = [...players].sort((a, b) => b.matchesWon - a.matchesWon || b.total - a.total);
    const last = lastMatch?.rounds;
    return (
      <table className={styles.table}>
        <caption className="visually-hidden">Wyniki graczy w tym pokoju</caption>
        <thead>
          <tr>
            <th scope="col">Gracz</th>
            {last && <th scope="col" title="Wygrane rundy w ostatnim meczu">Ostatni mecz</th>}
            <th scope="col" className={styles.num}>Wygrane mecze</th>
            <th scope="col" className={styles.num}>Punkty łącznie</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id} className={p.id === lastMatch?.winnerId ? styles.winner : undefined}>
              <td><PlayerCell p={p} meId={meId} hostId={hostId} /></td>
              {last && (
                <td>
                  <span className={styles.lastMatch}>
                    {last[p.id] ?? 0} {roundWord(last[p.id] ?? 0)}
                    {p.id === lastMatch.winnerId && <span className={styles.crown} title="Zwycięzca ostatniego meczu">wygrana</span>}
                  </span>
                </td>
              )}
              <td className={`${styles.num} ${styles.score}`}>{p.matchesWon}</td>
              <td className={styles.num}>{p.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const sorted = [...players].sort((a, b) => b.wins - a.wins || b.score - a.score);
  return (
    <table className={styles.table}>
      <caption className="visually-hidden">Wyniki bieżącego meczu</caption>
      <thead>
        <tr>
          <th scope="col">Gracz</th>
          <th scope="col" title={`Wygrane rundy — mecz trwa do ${roundsToWin}`}>Rundy</th>
          <th scope="col" className={styles.num}>Punkty</th>
          {showTotals && <th scope="col" className={styles.num}>Łącznie</th>}
        </tr>
      </thead>
      <tbody>
        {sorted.map((p) => (
          <tr key={p.id} className={p.id === highlightId ? styles.winner : undefined}>
            <td><PlayerCell p={p} meId={meId} hostId={hostId} showRole /></td>
            <td><Pips wins={p.wins} roundsToWin={roundsToWin} /></td>
            <td className={`${styles.num} ${styles.score}`}>{p.score}</td>
            {showTotals && <td className={styles.num}>{p.total}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function roundWord(n) {
  if (n === 1) return 'runda';
  const lastDigit = n % 10;
  const lastTwo = n % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'rundy';
  return 'rund';
}
