import { useTheme } from '../hooks/useTheme.js';
import styles from './ThemeToggle.module.css';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggle}
      aria-label={dark ? 'Włącz jasny motyw' : 'Włącz ciemny motyw'}
      title={dark ? 'Jasny motyw' : 'Ciemny motyw'}
    >
      <span className={styles.track} data-dark={dark}>
        <span className={styles.knob}>
          {dark ? (
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <circle cx="12" cy="12" r="4.5" fill="currentColor" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                <rect key={a} x="11.2" y="1.5" width="1.6" height="3.4" rx="0.8" fill="currentColor" transform={`rotate(${a} 12 12)`} />
              ))}
            </svg>
          )}
        </span>
      </span>
    </button>
  );
}
