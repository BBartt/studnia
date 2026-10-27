import { useCallback, useEffect, useMemo, useRef } from 'react';
import { COLS, ROWS, PHASE, ROLES } from '@studnia/shared/protocol';
import { useGame, usePlayers } from '../net/GameProvider.jsx';
import { useSnapshot } from '../hooks/useSnapshot.js';
import { useControls } from '../hooks/useControls.js';
import { useGameEvents } from '../hooks/useGameEvents.js';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import Board from '../components/Board.jsx';
import FxLayer from '../components/FxLayer.jsx';
import NextPiece from '../components/NextPiece.jsx';
import Scoreboard from '../components/Scoreboard.jsx';
import TouchPad from '../components/TouchPad.jsx';
import RoleIcon from '../components/RoleIcon.jsx';
import { CountdownOverlay, RoundOverlay, PausedOverlay, MatchOverDialog } from '../components/Overlays.jsx';
import { ROLE_INFO } from '../game/roles.js';
import { shake, punch, thud, nudge } from '../game/uiFx.js';
import { createOuterFx } from '../game/outerFx.js';
import { PALETTES } from '../game/palette.js';
import { useTheme } from '../hooks/useTheme.js';
import styles from './Game.module.css';

const LINE_NAMES = { 1: 'Linia!', 2: 'Podwójna!', 3: 'Potrójna!', 4: 'Tetris!' };
const BANNERS = { 1: 'Linia', 2: 'Podwójna', 3: 'Potrójna', 4: 'TETRIS' };
const DANGER_STACK = 14;

const selectSeconds = (s) => (s ? Math.ceil(s.timeLeft) : null);
const selectLines = (s) => s?.lines ?? 0;
const selectInterval = (s) => s?.interval ?? 0;
const selectCombo = (s) => s?.combo ?? 0;
const selectChain = (s) => s?.jumper?.chain ?? 0;
const selectDanger = (s) => (s?.stack ?? 0) >= DANGER_STACK;

export default function Game() {
  const { room, meId, actions } = useGame();
  const { me, opponent } = usePlayers();
  const seconds = useSnapshot(selectSeconds);
  const lines = useSnapshot(selectLines);
  const interval = useSnapshot(selectInterval);
  const combo = useSnapshot(selectCombo);
  const chain = useSnapshot(selectChain);
  const stackDanger = useSnapshot(selectDanger);
  const reduced = useReducedMotion();
  const lite = me?.settings?.effects === 'lite';

  const pageRef = useRef(null);
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const frameRef = useRef(null);
  const linesRef = useRef(null);
  const fxRef = useRef(null);
  const rendererRef = useRef(null);
  const outerRef = useRef(null);
  const ambientRef = useRef(null);
  const outerFx = useRef(null);
  const { theme } = useTheme();

  useEffect(() => {
    outerFx.current = createOuterFx(outerRef.current, ambientRef.current);
  }, []);

  const playing = room.phase === PHASE.PLAYING;
  const { act, setTouch } = useControls({ role: me?.role, enabled: playing, sendInput: actions.sendInput });

  // room zmienia tożsamość przy każdej wiadomości — koniec odliczania liczymy raz na odliczanie
  const countdownEndsAt = useMemo(
    () => performance.now() + room.countdownMs,
    [room.round, room.phase], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Punkt planszy → miejsce na ekranie (u skoczka uwzględnia kamerę). */
  const place = (x, y) => {
    const p = rendererRef.current?.project(x, y);
    return p ? { x: (p.x / 100) * COLS, y: (p.y / 100) * ROWS } : { x, y };
  };

  // Te same efekty na obu ekranach. Napisy na planszy (FxLayer) idą za kamerą skoczka,
  // a efekty wokół ramki używają współrzędnych całej studni — dzięki temu zawsze są widoczne.
  const onEvent = useCallback((e) => {
    const fx = fxRef.current;
    const out = outerFx.current;
    const pal = PALETTES[theme];
    const motion = !reduced;
    // „oszczędne” efekty: zostają wstrząsy, promienie, fale i poświata; znikają gwiazdki, wstęgi i odłamki
    const rich = motion && !lite;
    const board = (x, y) => ({ x: Math.min(100, Math.max(0, (x / COLS) * 100)), y: Math.min(100, Math.max(0, (y / ROWS) * 100)) });
    const pieceColors = Object.values(pal.pieces);

    switch (e.type) {
      case 'lines': {
        const tetris = e.count >= 4;
        const accent = tetris ? pal.gold : pal.accent;
        const colors = e.rows.flatMap((r) => r.cells.map((t) => pal.pieces[t])).filter(Boolean);
        const sparkle = [...colors, accent, pal.gold];

        fx?.spawn({
          text: LINE_NAMES[e.count] ?? `${e.count} linie!`,
          sub: e.combo >= 2 ? `combo ×${e.combo}` : undefined,
          ...place(COLS / 2, e.rows[0].y),
          tone: tetris ? 'rainbow' : 'tet',
          size: 1 + e.count * 0.22,
        });

        const power = e.count + Math.min(e.combo, 4) * 0.5; // 1 … ~6
        if (out) {
          e.rows.forEach((row, i) => {
            const at = board(COLS / 2, row.y + 0.5);
            setTimeout(() => {
              out.beam(at.y, colors[i * COLS] ?? accent, power);
              if (rich) {
                out.shards(at.y, colors.slice(i * COLS, i * COLS + COLS), 10 + e.count * 2);
                out.edgeStars('left', at.y, sparkle, 10 + e.count * 4, 1.2 + power * 0.2);
                out.edgeStars('right', at.y, sparkle, 10 + e.count * 4, 1.2 + power * 0.2);
              }
            }, i * 70);
          });
          const mid = board(COLS / 2, e.rows[0].y + 0.5);
          if (motion) {
            // kaskada fal wychodzących daleko poza planszę
            const base = tetris ? 900 : 480 + e.count * 140;
            for (let k = 0; k < 2 + Math.min(e.count, 3); k++) {
              setTimeout(() => out.ring(mid.x, mid.y, k % 2 ? '#ffffff' : accent, base + k * 260), k * 110);
            }
            // gwiazdki z całego obwodu ramki — zawsze, im więcej linii tym więcej
            if (rich) out.perimeterStars(sparkle, tetris ? 50 : 14 + e.count * 8 + e.combo * 6, 1 + power * 0.18);
            if (rich && (tetris || e.combo >= 3)) out.starRain(sparkle, tetris ? 30 : 14 + e.combo * 3);
            if (rich && (e.count >= 2 || e.combo >= 2)) out.banner(BANNERS[e.count] ?? `${e.count} linie`, accent, mid.y, power);
          }
          out.screenFlash(accent, power);
          out.frameGlow(accent, 1 + power);
          out.glow(accent, 1 + power);
          out.flyTo(mid.x, mid.y, linesRef.current, `+${e.count * 20}`, accent)
            ?.then(() => punch(linesRef.current, 1.8, 460));
        }
        if (motion) {
          shake(pageRef.current, 7 + power * 4, 380 + power * 90);
          punch(frameRef.current, 1.015 + 0.012 * e.count + (tetris ? 0.035 : 0));
          // panele boczne podskakują razem z planszą
          setTimeout(() => {
            punch(leftRef.current, 1 + 0.008 * power, 420);
            punch(rightRef.current, 1 + 0.008 * power, 420);
          }, 60);
        }
        break;
      }
      case 'lock': {
        const xs = e.cells.map((c) => c[0]);
        const at = board((Math.min(...xs) + Math.max(...xs) + 1) / 2, ROWS);
        const color = pal.pieces[e.piece] ?? pal.accent;
        if (motion) {
          thud(frameRef.current, 2);
          out?.impact(at.x, color, 0.4);
          if (rich) out?.edgeStars('bottom', at.x, [color, pal.gold], 4, 0.7);
        }
        out?.frameGlow(color, 0.4);
        break;
      }
      case 'hardDrop': {
        const xs = e.cells.map((c) => c[0]);
        const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2;
        const bottom = Math.max(...e.cells.map((c) => c[1])) + 1;
        const color = pal.pieces[e.piece] ?? pal.accent;
        const strength = Math.min(2.5, 0.6 + e.distance * 0.12);
        if (motion) {
          thud(frameRef.current, Math.min(8, 2 + e.distance * 0.35));
          out?.impact(board(cx, ROWS).x, color, strength);
          if (rich) out?.edgeStars('bottom', board(cx, ROWS).x, [color, pal.gold, color], 5 + Math.round(e.distance / 2), strength);
          // gwiazdki z boków na wysokości uderzenia
          const y = board(cx, bottom).y;
          if (rich) out?.edgeStars(cx < COLS / 2 ? 'left' : 'right', y, [color, pal.gold], 3 + Math.round(e.distance / 4), strength * 0.8);
          if (e.distance >= 6) out?.ring(board(cx, bottom).x, y, color, 260 + e.distance * 14);
        }
        out?.frameGlow(color, strength * 0.6);
        out?.glow(color, strength * 0.5);
        break;
      }
      case 'wallJump': {
        fx?.spawn({
          text: e.chain >= 2 ? `Odbicie ×${e.chain}` : 'Odbicie!',
          ...place(e.x, e.y - 1.2), tone: 'jmp', size: 0.75 + e.chain * 0.1,
        });
        if (motion) {
          if (rich) out?.edgeStars(e.dir < 0 ? 'left' : 'right', board(e.x, e.y).y, [pal.jumper, pal.gold], 2 + e.chain * 2, 0.6 + e.chain * 0.2);
          if (e.chain >= 2) nudge(frameRef.current, -e.dir * (1.5 + e.chain));
        }
        break;
      }
      case 'nearMiss':
        fx?.spawn({ text: 'O włos!', ...place(e.x, e.y - 1), tone: 'pop', size: 0.8 });
        if (rich) out?.edgeStars(e.x < COLS / 2 ? 'left' : 'right', board(e.x, e.y).y, [pal.danger, pal.gold], 4, 0.7);
        break;
      case 'crush':
      case 'floor': {
        fx?.spawn({ text: e.type === 'crush' ? 'Plask!' : 'Dno!', ...place(e.x, e.y - 1.5), tone: 'danger', size: 1.6 });
        if (motion) {
          shake(pageRef.current, e.type === 'crush' ? 14 : 10, 600);
          if (rich) out?.perimeterStars([pal.danger, pal.jumper, pal.gold], 26, 1.3);
        }
        out?.frameGlow(pal.danger, 3);
        break;
      }
      case 'full':
        if (motion) {
          shake(pageRef.current, 10, 500);
          if (rich) out?.perimeterStars([pal.danger, ...pieceColors], 20, 1.2);
        }
        out?.frameGlow(pal.danger, 3);
        break;
      default:
        break;
    }
  }, [reduced, theme, lite]); // eslint-disable-line react-hooks/exhaustive-deps

  // Spokojne iskierki wokół planszy przez całą rundę — plansza „żyje” nawet bez akcji
  useEffect(() => {
    if (!playing || reduced || lite) return undefined;
    const pal = PALETTES[theme];
    const colors = [...Object.values(pal.pieces), pal.gold, pal.jumper];
    const id = setInterval(() => outerFx.current?.idleSparkle(colors), 380);
    return () => clearInterval(id);
  }, [playing, reduced, theme, lite]);

  useGameEvents(onEvent);

  const total = room.settings.roundSeconds;
  const urgent = seconds !== null && seconds <= 10 && playing;
  const progress = seconds !== null ? Math.max(0, Math.min(1, seconds / total)) : 1;
  const myInfo = me ? ROLE_INFO[me.role] : null;
  const speed = interval ? (1000 / interval).toFixed(1) : '—';

  return (
    <main ref={pageRef} className={styles.page}>
      <div ref={ambientRef} className={styles.ambient} aria-hidden="true" />
      <aside ref={leftRef} className={styles.left}>
        {myInfo && (
          <section className={styles.myRole} data-role={me.role} key={me.role}>
            <div className={styles.myRoleHead}>
              <span className={styles.roleBadge}><RoleIcon role={me.role} size={28} /></span>
              <div>
                <p className={styles.small}>{me.nick}, grasz jako</p>
                <h2>{myInfo.label}</h2>
              </div>
            </div>
            <p className={styles.goal}>{myInfo.goal}</p>
            <ul className={styles.keys}>
              {myInfo.keys.map(([k, what]) => (
                <li key={k}><span className="kbd">{k}</span><span>{what}</span></li>
              ))}
            </ul>
            {myInfo.tip && <p className={styles.tip}>{myInfo.tip}</p>}
          </section>
        )}

        <section className={`panel ${styles.scores}`}>
          <h2 className={styles.panelTitle}>Mecz do {room.settings.roundsToWin} {room.settings.roundsToWin === 1 ? 'wygranej rundy' : 'wygranych rund'}</h2>
          <Scoreboard players={room.players} meId={meId} hostId={room.hostId} roundsToWin={room.settings.roundsToWin} />
        </section>
      </aside>

      <section className={styles.center}>
        <header className={styles.topbar}>
          <span className={styles.chip}>Runda {room.round}</span>
          <div className={`${styles.clock} ${urgent ? styles.urgent : ''}`} aria-live="off">
            <span key={urgent ? seconds : 'calm'} className={urgent ? styles.tick : undefined}>{seconds ?? total}</span>
            <span className={styles.unit}>s</span>
          </div>
          <span className={`${styles.chip} ${styles.vs}`}>{opponent ? `vs ${opponent.nick}` : ''}</span>
        </header>

        <div className={styles.timebar} aria-hidden="true">
          <span style={{ transform: `scaleX(${progress})` }} data-urgent={urgent} />
        </div>

        <div ref={frameRef} className={styles.boardFrame} data-role={me?.role} data-danger={stackDanger && playing}>
          {me && (
            <span className={styles.screenTag} data-role={me.role}>
              Twój ekran · {myInfo.label}{me.role === ROLES.JUMPER ? ' (ograniczony widok)' : ''}
            </span>
          )}
          <div className={styles.screen}>
            <Board
              className={styles.board}
              rendererRef={rendererRef}
              showDanger={me?.settings?.dangerHint ?? true}
              lite={lite}
              mode={me?.role === ROLES.JUMPER ? 'jumper' : 'full'}
              phase={room.phase}
              countdownEndsAt={countdownEndsAt}
              countdownTotal={room.countdownTotalMs}
            />
            <FxLayer ref={fxRef} />
            {room.phase === PHASE.COUNTDOWN && <CountdownOverlay room={room} endsAt={countdownEndsAt} />}
            {room.phase === PHASE.ROUND_OVER && <RoundOverlay room={room} />}
            {room.phase === PHASE.PAUSED && <PausedOverlay room={room} />}
          </div>
          {stackDanger && playing && <span className={styles.dangerTag}>Klocki pod sufitem</span>}
          <div ref={outerRef} className={styles.outerFx} aria-hidden="true" />
        </div>

        {me && <TouchPad role={me.role} act={act} setTouch={setTouch} />}
      </section>

      <aside ref={rightRef} className={styles.right}>
        <section className={`panel ${styles.nextBox}`}>
          <p className={styles.small}>Następny klocek</p>
          <div className={styles.next}><NextPiece size={22} /></div>
        </section>

        <section className={`panel ${styles.stats}`}>
          <div>
            <p className={styles.small}>Linie</p>
            <p ref={linesRef} className={styles.big}>{lines}</p>
          </div>
          <div>
            <p className={styles.small}>Prędkość</p>
            <p className={styles.big}>{speed}<span className={styles.per}>/s</span></p>
          </div>
        </section>

        <section className={styles.meters}>
          <div className={styles.meter} data-on={combo >= 2} data-kind="tet">
            <span className={styles.meterLabel}>Combo</span>
            <span key={combo} className={styles.meterValue}>×{combo}</span>
          </div>
          <div className={styles.meter} data-on={chain >= 2} data-kind="jmp">
            <span className={styles.meterLabel}>Seria odbić</span>
            <span key={chain} className={styles.meterValue}>×{chain}</span>
          </div>
        </section>

        <button type="button" className={`btn btn--quiet ${styles.leave}`} onClick={actions.leaveRoom}>
          Opuść mecz
        </button>
      </aside>

      {room.phase === PHASE.MATCH_OVER && <MatchOverDialog room={room} />}
    </main>
  );
}
