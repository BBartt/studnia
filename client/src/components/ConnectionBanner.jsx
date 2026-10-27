import styles from './ConnectionBanner.module.css';

export default function ConnectionBanner({ status }) {
  const text = status === 'connecting' ? 'Łączenie z serwerem…' : 'Utracono połączenie. Próbuję ponownie…';
  return (
    <div className={styles.banner} role="status">
      <span className={styles.dot} aria-hidden="true" />
      {text}
    </div>
  );
}
