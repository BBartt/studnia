import { useSnapshot } from '../hooks/useSnapshot.js';
import { useTheme } from '../hooks/useTheme.js';
import { PALETTES } from '../game/palette.js';

const SHAPES = {
  I: [[1, 1, 1, 1]], O: [[1, 1], [1, 1]], T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]], Z: [[1, 1, 0], [0, 1, 1]], J: [[1, 0, 0], [1, 1, 1]], L: [[0, 0, 1], [1, 1, 1]],
};
const selectNext = (s) => s?.next ?? null;

/** Podgląd następnego klocka jako lekki SVG. */
export default function NextPiece({ size = 18 }) {
  const type = useSnapshot(selectNext);
  const { theme } = useTheme();
  if (!type) return <div style={{ height: size * 2 }} />;
  const m = SHAPES[type];
  const w = m[0].length * size;
  const h = m.length * size;
  return (
    <svg key={type} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label={`Następny klocek: ${type}`} style={{ animation: 'nextIn 360ms cubic-bezier(0.34,1.4,0.64,1)' }}>
      {m.flatMap((row, y) => row.map((v, x) => v && (
        <rect
          key={`${x}-${y}`}
          x={x * size + 1.5} y={y * size + 1.5}
          width={size - 3} height={size - 3}
          rx={size * 0.22}
          fill={PALETTES[theme].pieces[type]}
        />
      )))}
    </svg>
  );
}
