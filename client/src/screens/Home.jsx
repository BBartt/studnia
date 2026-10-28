import { useState } from 'react';
import { NICK_MAX, NICK_MIN, ROOM_CODE_LENGTH, sanitizeNick } from '@studnia/shared/protocol';
import { useGame } from '../net/GameProvider.jsx';
import Leaderboard from '../components/Leaderboard.jsx';
import HeroWell from '../components/HeroWell.jsx';
import RoleIcon from '../components/RoleIcon.jsx';
import styles from './Home.module.css';

const NICK_KEY = 'studnia:nick';
const codeFromUrl = () => new URLSearchParams(location.search).get('room')?.toUpperCase().slice(0, ROOM_CODE_LENGTH) ?? '';

export default function Home() {
  const { actions, status } = useGame();
  const [nick, setNick] = useState(() => localStorage.getItem(NICK_KEY) ?? '');
  const [code, setCode] = useState(codeFromUrl);
  const [touched, setTouched] = useState(false);

  const cleanNick = sanitizeNick(nick);
  const nickError = touched && !cleanNick ? `Nick musi mieć od ${NICK_MIN} do ${NICK_MAX} znaków.` : null;
  const online = status === 'open';
  const hasInvite = code.length === ROOM_CODE_LENGTH;

  const withNick = (fn) => (e) => {
    e.preventDefault();
    setTouched(true);
    if (!cleanNick) return;
    localStorage.setItem(NICK_KEY, cleanNick);
    fn(cleanNick);
  };

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.titleRow}>
          <div>
            <p className={styles.tagline}>Tetris kontra skoczek</p>
            <h1 className={styles.title}>Studnia</h1>
          </div>
          <HeroWell />
        </div>
        <p className={styles.lede}>
          Gra dla dwóch osób na dwóch komputerach. Jedna układa klocki, druga skacze po nich
          w tej samej studni i próbuje nie dać się zgnieść. Po każdej rundzie zamieniacie się rolami.
        </p>
        <div className={styles.roles}>
          <div className={styles.role} data-role="tetris">
            <RoleIcon role="tetris" size={28} />
            <div>
              <strong>Tetris</strong>
              <span>Wygrywa, gdy zgniecie skoczka albo zepchnie go do lawy.</span>
            </div>
          </div>
          <div className={styles.role} data-role="jumper">
            <RoleIcon role="jumper" size={28} />
            <div>
              <strong>Skoczek</strong>
              <span>Widzi tylko kawałek studni. Wygrywa, gdy przetrwa rundę.</span>
            </div>
          </div>
        </div>
      </section>

      <aside className={styles.side}>
        <form className={`panel ${styles.form}`} onSubmit={withNick(hasInvite ? (n) => actions.joinRoom(code, n) : actions.createRoom)}>
          <div className="field">
            <label className="field__label" htmlFor="nick">Twój nick</label>
            <input
              id="nick"
              className="input"
              value={nick}
              maxLength={NICK_MAX}
              autoComplete="nickname"
              placeholder="np. Bartek"
              aria-invalid={Boolean(nickError)}
              aria-describedby={nickError ? 'nick-error' : undefined}
              onChange={(e) => setNick(e.target.value)}
              onBlur={() => setTouched(true)}
            />
            {nickError && <span id="nick-error" className={styles.error}>{nickError}</span>}
          </div>

          {hasInvite ? (
            <button type="submit" className="btn btn--primary btn--large" disabled={!online}>
              Dołącz do pokoju {code}
            </button>
          ) : (
            <button type="submit" className="btn btn--primary btn--large" disabled={!online}>
              Stwórz pokój
            </button>
          )}

          <div className={styles.divider}><span>albo dołącz kodem</span></div>

          <div className={styles.joinRow}>
            <label className="visually-hidden" htmlFor="code">Kod pokoju</label>
            <input
              id="code"
              className={`input ${styles.code}`}
              value={code}
              maxLength={ROOM_CODE_LENGTH}
              placeholder="ABCD"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            />
            <button
              type="button"
              className="btn"
              disabled={!online || !hasInvite}
              onClick={withNick((n) => actions.joinRoom(code, n))}
            >
              Dołącz
            </button>
          </div>
          {hasInvite && (
            <button type="button" className={`btn btn--quiet ${styles.reset}`} onClick={() => setCode('')}>
              Wolę stworzyć własny pokój
            </button>
          )}
        </form>

        <Leaderboard />
      </aside>
    </main>
  );
}
