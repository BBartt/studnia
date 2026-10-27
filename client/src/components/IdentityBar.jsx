import { useEffect } from 'react';
import { usePlayers } from '../net/GameProvider.jsx';
import { ROLE_INFO } from '../game/roles.js';
import RoleIcon from './RoleIcon.jsx';
import styles from './IdentityBar.module.css';

/**
 * Stała etykieta „to Ty” — który gracz siedzi przy tym ekranie i jaką ma rolę.
 * Nick i rola trafiają też do tytułu karty, co pomaga przy testach w dwóch kartach.
 */
export default function IdentityBar() {
  const { me } = usePlayers();

  useEffect(() => {
    const base = 'Studnia';
    document.title = me ? `${me.nick} · ${ROLE_INFO[me.role].label} — ${base}` : `${base} — Tetris kontra skoczek`;
    return () => { document.title = `${base} — Tetris kontra skoczek`; };
  }, [me]);

  if (!me) return null;
  return (
    <div className={styles.bar} data-role={me.role} role="status" aria-label={`Grasz jako ${me.nick}, rola ${ROLE_INFO[me.role].label}`}>
      <span className={styles.icon}><RoleIcon role={me.role} size={18} /></span>
      <span className={styles.label}>To Ty</span>
      <strong className={styles.nick}>{me.nick}</strong>
      <span className={styles.role} key={me.role}>{ROLE_INFO[me.role].label}</span>
    </div>
  );
}
