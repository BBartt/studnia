import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/game/Engine.js';
import { defaultSettings } from '@studnia/shared/settings';
import { ROWS } from '@studnia/shared/protocol';
import { randomLava } from '@studnia/shared/engine';

const STEP = 1 / 60;
const settings = (over = {}) => ({ ...defaultSettings(), startSpeed: 1, speedRamp: 'off', roundSeconds: 999, ...over });
/** Silnik bez spadającego klocka — do testów samego skoczka. */
function quiet(over, lava = [1, 8]) {
  const e = new GameEngine(settings(over), { lava });
  e.piece = null;
  e.refreshActive();
  e.dropTimer = -1e9;
  return e;
}
const run = (e, input, frames) => { e.setJumperInput(input); for (let i = 0; i < frames; i++) e.tick(STEP); };

test('lawa: 2 pola po 1 kratce, nigdy obok siebie', () => {
  for (let i = 0; i < 500; i++) {
    const lava = randomLava();
    assert.equal(lava.length, 2);
    assert.ok(Math.abs(lava[0] - lava[1]) >= 2, `lawa obok siebie: ${lava}`);
    assert.ok(lava.every((c) => c >= 0 && c < 10));
  }
});

test('skoczek startuje z dala od lawy i przeżywa', () => {
  for (let i = 0; i < 100; i++) {
    const e = new GameEngine(settings());
    const col = Math.floor(e.jumper.x + 0.35);
    assert.ok(e.lava.every((l) => Math.abs(l - col) >= 1), `start ${col} przy lawie ${e.lava}`);
  }
  const e = quiet();
  run(e, {}, 120);
  assert.equal(e.result, null);
});

test('dno poza lawą jest bezpieczne — można po nim chodzić', () => {
  const e = quiet({}, [0, 9]);
  run(e, { right: true }, 25);
  run(e, { left: true }, 40);
  run(e, {}, 20);
  assert.equal(e.result, null);
});

test('wejście na lawę kończy rundę wygraną Tetrisa', () => {
  const e = quiet({}, [1, 8]);
  run(e, { left: true }, 90);
  assert.deepEqual(e.result, { winner: 'tetris', reason: 'floor' });
});

test('natychmiastowy zrzut działa tylko, gdy reguła jest włączona', () => {
  for (const hardDrop of [false, true]) {
    const e = new GameEngine(settings({ hardDrop }), { lava: [0, 9] });
    const y0 = e.piece.y;
    e.queueAction('hard');
    e.tick(STEP);
    const moved = !e.piece || e.piece.y > y0 + 5 || e.events.some((ev) => ev.type === 'hardDrop');
    assert.equal(moved, hardDrop);
  }
});

test('stanie na klocku przy dnie jest bezpieczne', () => {
  const e = quiet({}, [5, 8]);
  for (let x = 0; x < 10; x++) if (x !== 9) e.grid[ROWS - 1][x] = 'O';
  e.jumper.y = ROWS - 1 - 0.9 - 1e-5;
  run(e, { right: true }, 20);
  run(e, {}, 60);
  assert.equal(e.result, null);
});

test('seria odbić od ściany daje coraz wyższe odbicia', () => {
  const e = quiet();
  for (let y = 6; y < ROWS; y++) e.grid[y][4] = 'I';   // ściana z klocków → komin 4 kratki
  for (let x = 0; x < 4; x++) e.grid[ROWS - 1][x] = 'O'; // bezpieczna podłoga w kominie
  e.jumper.x = 1.5; e.jumper.y = ROWS - 1 - 0.9 - 1e-5;
  const chains = [];
  run(e, { left: true, jump: true }, 12);
  for (let k = 0; k < 4; k++) {
    let n = 0;
    while (!e.jumper.wall && n++ < 60) run(e, { left: e.jumper.vx <= 0, right: e.jumper.vx > 0 }, 1);
    run(e, { left: e.jumper.wall < 0, right: e.jumper.wall > 0 }, 3);
    run(e, { jump: true }, 14);
    for (const ev of e.events.splice(0)) if (ev.type === 'wallJump') chains.push(ev.chain);
  }
  assert.ok(chains.length >= 3, `za mało odbić: ${chains}`);
  assert.deepEqual(chains.slice(0, 3), [1, 2, 3]);
});

test('losowa gra nie wpycha skoczka w klocki i zawsze się kończy', () => {
  const acts = ['left', 'right', 'rotate', 'soft', 'hard'];
  for (let r = 0; r < 120; r++) {
    const e = new GameEngine(settings({ roundSeconds: 60, startSpeed: 1 + (r % 10), speedRamp: 'high', jumpPower: 1.3, runSpeed: 1.3, hardDrop: r % 2 === 0 }));
    let t = 0;
    while (!e.result && t < 70) {
      if (Math.random() < 0.15) e.queueAction(acts[Math.floor(Math.random() * 5)]);
      if (Math.random() < 0.08) e.setJumperInput({ left: Math.random() < 0.5, right: Math.random() < 0.5, jump: Math.random() < 0.5 });
      e.tick(STEP);
      t += STEP;
      e.snapshot();
      const j = e.jumper;
      assert.ok(j.dead || !e.overlaps(j.x, j.y), `runda ${r}: skoczek w klocku`);
      assert.ok(Number.isFinite(j.x + j.y + j.vx + j.vy));
    }
    assert.ok(e.result, `runda ${r} nie skończyła się`);
  }
});
