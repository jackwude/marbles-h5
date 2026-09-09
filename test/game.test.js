import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, setAim, fire, update, settle, starsFor, restart,
  GameState, getTrajectory,
} from '../src/game.js';

test('createGame: starts in AIM with correct world', () => {
  const g = createGame(1);
  assert.equal(g.state, GameState.AIM);
  assert.equal(g.maxShots, 4);
  assert.equal(g.shotsUsed, 0);
  assert.equal(g.world.balls.length, 1);
  assert.equal(g.world.holes.length, 1);
  assert.equal(g.level.id, 1);
});

test('setAim: reverse drag maps to aim direction and power', () => {
  const g = createGame(1);
  setAim(g, -100, 0, 120); // 往左拖 → 往右发射
  assert.ok(Math.abs(g.aimDir.x - 1) < 1e-6, 'aims right');
  assert.ok(g.power > 0.8, 'power ~ 0.83');
  // 满力
  setAim(g, -240, 0, 120);
  assert.equal(g.power, 1);
});

test('fire: transitions to ROLLING and consumes a shot', () => {
  const g = createGame(1);
  setAim(g, -200, 0, 120);
  fire(g);
  assert.equal(g.state, GameState.ROLLING);
  assert.equal(g.shotsUsed, 1);
  assert.ok(g.world.balls[0].vx > 0, 'launched right');
});

test('update: ball rolls and settles', () => {
  const g = createGame(1);
  setAim(g, -200, 0, 120);
  fire(g);
  for (let i = 0; i < 2000; i++) {
    update(g);
    if (g.state !== GameState.ROLLING) break;
  }
  assert.notEqual(g.state, GameState.ROLLING);
});

test('settle: with shots left returns to AIM', () => {
  const g = createGame(1);
  setAim(g, -50, 0, 120);
  fire(g);
  for (let i = 0; i < 500; i++) { update(g); if (g.state !== GameState.ROLLING) break; }
  // 球停在原地附近（力度小），未进洞
  assert.equal(g.state, GameState.SETTLED);
  settle(g);
  assert.equal(g.state, GameState.AIM);
  assert.equal(g.shotsUsed, 1);
});

test('starsFor: remaining shots map to stars', () => {
  const g = createGame(1);
  g.shotsUsed = 1; g.maxShots = 4; // remaining 3
  assert.equal(starsFor(g), 3);
  g.shotsUsed = 3; // remaining 1
  assert.equal(starsFor(g), 2);
  g.shotsUsed = 4; // remaining 0
  assert.equal(starsFor(g), 1);
});

test('restart: resets the game', () => {
  const g = createGame(1);
  setAim(g, -200, 0, 120);
  fire(g);
  restart(g);
  assert.equal(g.state, GameState.AIM);
  assert.equal(g.shotsUsed, 0);
});

test('getTrajectory: empty when no power, path when aiming', () => {
  const g = createGame(1);
  assert.deepEqual(getTrajectory(g), []);
  setAim(g, -200, 0, 120);
  const path = getTrajectory(g);
  assert.ok(path.length > 5, `trajectory has points (${path.length})`);
});
