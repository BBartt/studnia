import { useEffect, useState } from 'react';
import styles from './Leaderboard.module.css';

/** Ranking wszech czasów pobierany z REST API serwera. */
export default function Leaderboard() {
  const [state, setState] = useState({ status: 'loading', entries: [] });

  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      fetch('/api/leaderboard', { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
        .then(({ entries }) => setState({ status: 'ready', entries }))
        .catch((err) => { if (err.name !== 'AbortError') setState((s) => ({ ...s, status: 'error' })); });

    load();
    window.addEventListener('focus', load);
    return () => { controller.abort(); window.removeEventListener('focus', load); };
  }, []);

  return (
    <section className={`panel ${styles.box}`} aria-labelledby="lb-title">
      <h2 id="lb-title" className={styles.title}>Ranking</h2>
      {state.status === 'loading' && <p className={styles.empty}>Wczytywanie…</p>}
      {state.status === 'error' && <p className={styles.empty}>Nie udało się pobrać rankingu. Sprawdź, czy serwer działa.</p>}
      {state.status === 'ready' && state.entries.length === 0 && (
        <p className={styles.empty}>Pusto. Rozegraj pierwszy mecz i zapisz się tutaj.</p>
      )}
      {state.entries.length > 0 && (
        <ol className={styles.list}>
          {state.entries.map((e, i) => (
            <li key={e.nick} className={styles.row}>
              <span className={styles.place}>{i + 1}</span>
              <span className={styles.nick}>{e.nick}</span>
              <span className={styles.meta}>{e.wins}/{e.matches} meczów</span>
              <span className={styles.points}>{e.points}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
