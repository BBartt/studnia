import { ROLES } from '@studnia/shared/protocol';

/** Ikona roli: klocek T dla Tetrisa, skoczek z szalikiem dla skoczka. */
export default function RoleIcon({ role, size = 22 }) {
  if (role === ROLES.TETRIS) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        {[[2, 5], [8.8, 5], [15.6, 5], [8.8, 11.8]].map(([x, y]) => (
          <rect key={`${x}${y}`} x={x} y={y} width="6.4" height="6.4" rx="1.8" fill="var(--tet)" />
        ))}
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="5" fill="var(--text)" />
      <rect x="5" y="13" width="14" height="3" fill="var(--jmp)" />
      <circle cx="10.5" cy="8.5" r="1.4" fill="var(--bg)" />
      <circle cx="14.5" cy="8.5" r="1.4" fill="var(--bg)" />
    </svg>
  );
}
