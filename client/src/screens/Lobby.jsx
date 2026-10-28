import { useState } from 'react';
import { ROLES } from '@studnia/shared/protocol';
import { useGame, usePlayers } from '../net/GameProvider.jsx';
import SettingsPanel, { SettingsSummary } from '../components/SettingsPanel.jsx';
import { defaultSettings, SETTINGS_SCHEMA } from '@studnia/shared/settings';
import Scoreboard from '../components/Scoreboard.jsx';
import RoleIcon from '../components/RoleIcon.jsx';
import { ROLE_INFO, roleKeys } from '../game/roles.js';
import styles from './Lobby.module.css';

export default function Lobby() {
  const { room, meId, actions } = useGame();
  const { isHost, me, opponent } = usePlayers();
  const [copied, setCopied] = useState(false);

  const inviteLink = `${location.origin}${location.pathname}?room=${room.code}`;
  const ready = room.players.length === 2 && room.players.every((p) => p.connected);
  const anyMatchPlayed = room.players.some((p) => p.total > 0 || p.matchesWon > 0);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Kod pokoju</p>
          <h1 className={styles.code} aria-label={`Kod pokoju ${room.code}`}>
            {[...room.code].map((ch, i) => <span key={i} aria-hidden="true">{ch}</span>)}
          </h1>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className="btn" onClick={copy}>
            {copied ? 'Skopiowano link' : 'Kopiuj link zaproszenia'}
          </button>
          <button type="button" className="btn btn--quiet" onClick={actions.leaveRoom}>Wyjdź</button>
        </div>
      </header>

      {room.notice && <p className={styles.notice} role="status">{room.notice}</p>}

      <section className={styles.slots} aria-label="Gracze">
        {[ROLES.TETRIS, ROLES.JUMPER].map((role) => {
          const player = room.players.find((p) => p.role === role);
          const info = ROLE_INFO[role];
          return (
            <article key={role} className={styles.slot} data-role={role} data-empty={!player}>
              <div className={styles.slotHead}>
                <RoleIcon role={role} size={30} />
                <span className={styles.roleName}>{info.label}</span>
              </div>
              {player ? (
                <p className={styles.slotNick}>
                  {player.nick}
                  {player.id === meId && <span className={styles.you}> (ty)</span>}
                </p>
              ) : (
                <p className={styles.waiting}>Czekamy na gracza…</p>
              )}
              <p className={styles.goal}>{info.goal}</p>
              <ul className={styles.keys}>
                {roleKeys(role, room.rules).map(([k, what]) => (
                  <li key={k}><span className="kbd">{k}</span> {what}</li>
                ))}
              </ul>
            </article>
          );
        })}
        {isHost && room.players.length === 2 && (
          <button type="button" className={styles.swap} onClick={actions.swapRoles} aria-label="Zamień role">
            ⇄
          </button>
        )}
      </section>

      <p className={styles.swapInfo}>Role zamieniają się automatycznie po każdej rundzie. W każdej rundzie klocki spadają z prędkością ustawioną przez gracza-Tetrisa, a skoczek skacze ze swoją siłą skoku.</p>

      <section className={`panel ${styles.settings}`} aria-labelledby="match-settings-title">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="match-settings-title">Zasady meczu</h2>
            <p className={styles.readonly}>
              Wspólne dla was obu — może je zmienić każdy.
              {room.settingsBy && <> Ostatnio zmienił(a): <strong>{room.settingsBy}</strong>.</>}
            </p>
          </div>
          <ResetButton
            disabled={isDefault(room.settings, 'match') && !room.players.some((p) => p.settings?.hardDrop)}
            onClick={() => actions.resetSettings('match')}
          />
        </div>
        <SettingsPanel scope="match" settings={room.settings} onChange={actions.updateSettings} />
        {me && (
          <VoteRule
            settingKey="hardDrop"
            players={room.players}
            me={me}
            enabled={Boolean(room.rules?.hardDrop)}
            onVote={(value) => actions.updateSettings({ hardDrop: value })}
          />
        )}
      </section>

      {me && (
        <section className={`panel ${styles.settings}`} aria-labelledby="my-settings-title">
          <div className={styles.sectionHead}>
            <div>
              <h2 id="my-settings-title">Twoje ustawienia</h2>
              <p className={styles.readonly}>Działają tylko na ciebie — w twoich rundach jako Tetris albo skoczek.</p>
            </div>
            <ResetButton
              disabled={isDefault(me.settings, 'player')}
              onClick={() => actions.resetSettings('player')}
            />
          </div>
          <SettingsPanel scope="player" settings={me.settings} onChange={actions.updateSettings} />
          {opponent && (
            <div className={styles.opponent}>
              <p className={styles.readonly}>Ustawienia gracza <strong>{opponent.nick}</strong>:</p>
              <SettingsSummary scope="player" settings={opponent.settings} />
            </div>
          )}
        </section>
      )}

      {anyMatchPlayed && (
        <section className={`panel ${styles.table}`} aria-labelledby="table-title">
          <h2 id="table-title" className={styles.tableTitle}>Wyniki w tym pokoju</h2>
          <Scoreboard variant="room" players={room.players} meId={meId} hostId={room.hostId} roundsToWin={room.settings.roundsToWin} lastMatch={room.lastMatch} />
        </section>
      )}

      <footer className={styles.footer}>
        {isHost ? (
          <button type="button" className="btn btn--primary btn--large" disabled={!ready} onClick={actions.startMatch}>
            {ready ? 'Zacznij mecz' : 'Czekamy na drugiego gracza'}
          </button>
        ) : (
          <p className={styles.readonly}>Gospodarz zaczyna mecz, gdy obaj jesteście gotowi.</p>
        )}
      </footer>
    </main>
  );
}

const isDefault = (settings, scope) => {
  const defaults = defaultSettings(scope);
  return Object.keys(defaults).every((k) => settings?.[k] === defaults[k]);
};

function ResetButton({ onClick, disabled }) {
  return (
    <button type="button" className={`btn ${styles.reset}`} onClick={onClick} disabled={disabled} title="Przywróć ustawienia fabryczne">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Ustawienia fabryczne
    </button>
  );
}

/** Reguła wymagająca zgody obu graczy: mój głos + stan głosów wszystkich. */
function VoteRule({ settingKey, players, me, enabled, onVote }) {
  const spec = SETTINGS_SCHEMA[settingKey];
  const mine = Boolean(me.settings?.[settingKey]);
  const missing = players.length < 2;
  return (
    <div className={styles.vote} data-enabled={enabled}>
      <div className={styles.voteHead}>
        <div>
          <p className={styles.voteLabel}>{spec.label}</p>
          <p className={styles.readonly}>
            {enabled
              ? 'Włączony — obaj gracze się zgodzili.'
              : missing ? 'Potrzebny drugi gracz — działa tylko przy zgodzie obu.' : 'Wyłączony — działa tylko, gdy zgodzą się obaj gracze.'}
          </p>
        </div>
        <label className={styles.voteSwitch}>
          <span>{mine ? 'Jestem za' : 'Jestem przeciw'}</span>
          <input type="checkbox" role="switch" checked={mine} onChange={(e) => onVote(e.target.checked)} />
        </label>
      </div>
      <ul className={styles.voters}>
        {players.map((p) => {
          const yes = Boolean(p.settings?.[settingKey]);
          return (
            <li key={p.id} data-yes={yes}>
              <span className={styles.voteMark} aria-hidden="true">{yes ? '✓' : '·'}</span>
              {p.nick}{p.id === me.id ? ' (ty)' : ''}: {yes ? 'za' : 'jeszcze nie'}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
