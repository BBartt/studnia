import { useEffect, useState } from 'react';
import styles from './Diagnostics.module.css';

/**
 * Panel diagnostyczny: pokazuje, czy zacinanie pochodzi z komputera (FPS),
 * z łącza (ping, przerwy między paczkami) czy z serwera (opóźnienie pętli).
 */
export default function Diagnostics({ rendererRef, ping }) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const tick = () => setStats(rendererRef.current?.getStats() ?? null);
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [open, rendererRef]);

  const rows = stats && [
    ['Klatki na sekundę', `${stats.fps}`, stats.fps >= 50 ? 'good' : stats.fps >= 30 ? 'ok' : 'bad', 'komputer'],
    ['Najdłuższa klatka', `${stats.worstFrame} ms`, stats.worstFrame < 40 ? 'good' : stats.worstFrame < 80 ? 'ok' : 'bad', 'komputer'],
    ['Ping', ping == null ? '—' : `${ping} ms`, ping == null ? 'ok' : ping < 70 ? 'good' : ping < 150 ? 'ok' : 'bad', 'łącze'],
    ['Aktualizacje z serwera', `${stats.updates}/s`, stats.updates >= 25 ? 'good' : stats.updates >= 15 ? 'ok' : 'bad', 'łącze / serwer'],
    ['Najdłuższa przerwa', `${stats.maxGap} ms`, stats.maxGap < 80 ? 'good' : stats.maxGap < 200 ? 'ok' : 'bad', 'łącze'],
    ['Opóźnienie pętli serwera', `${stats.loopGap} ms`, stats.loopGap < 60 ? 'good' : stats.loopGap < 120 ? 'ok' : 'bad', 'serwer'],
  ];

  return (
    <section className={styles.box}>
      <button type="button" className={styles.toggle} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? 'Ukryj diagnostykę' : 'Diagnostyka płynności'}
      </button>
      {open && rows && (
        <>
          <dl className={styles.list}>
            {rows.map(([label, value, level, source]) => (
              <div key={label} data-level={level}>
                <dt>{label}<span>{source}</span></dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className={styles.hint}>Czerwone pole wskazuje źródło zacinania. Wyniki zbierane są w trakcie rundy.</p>
        </>
      )}
    </section>
  );
}
