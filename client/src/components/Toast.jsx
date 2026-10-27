import { useEffect } from 'react';
import { useGame } from '../net/GameProvider.jsx';
import styles from './Toast.module.css';

export default function Toast() {
  const { error, actions } = useGame();

  useEffect(() => {
    if (!error) return undefined;
    const id = setTimeout(actions.clearError, 3500);
    return () => clearTimeout(id);
  }, [error, actions]);

  if (!error) return null;
  return (
    <div className={styles.toast} role="alert" key={error.at}>
      {error.message}
    </div>
  );
}
