// 3D 适配层测试：逻辑更新 + 回调触发（不依赖 WebGL）
// 验证 VsRenderer3D 的 _checkShotFeedback / _checkGameOver 逻辑
import { test } from 'node:test';
import assert from 'node:assert';
import { createVsGame, VsState, vsUpdate } from '../src/vs.js';

// 手动实现一个最小的 3D 适配器回调链（不 new Renderer3D，避免 WebGL）
function makeLogicHarness() {
  const g = createVsGame();
  const events = { stateChanges: 0, gameOver: 0 };
  const harness = {
    game: g,
    _lastShotStamp: -1,
    _gameOverNotified: false,
    events,
    _checkShotFeedback() {
      const ls = g.lastShot;
      if (!ls) return;
      if (this._lastShotStamp === g.world.time) return;
      this._lastShotStamp = g.world.time;
      events.stateChanges++;
    },
    _checkGameOver() {
      if (g.state === VsState.GAME_OVER && !this._gameOverNotified) {
        this._gameOverNotified = true;
        events.gameOver++;
      }
    },
  };
  return harness;
}

test('3D 适配：射击结算触发 onStateChange（HUD 袋子刷新）', () => {
  const h = makeLogicHarness();
  const g = h.game;
  // 直接制造一次射击结果：母珠出圈 + 彩珠出圈 = 连打得分
  const pt = g.world.balls.find((b) => b.id === 'player_taw');
  const m = g.world.balls.find((b) => b.id.startsWith('m'));
  pt.x = 700; pt.y = 300; pt.vx = 0; pt.vy = 0; // 母珠出圈（距心 308 > 170）
  m.x = 680; m.y = 300; m.vx = 0; m.vy = 0;      // 彩珠出圈
  m.captured = false; m.owner = null;
  g.state = VsState.PLAYER_ROLLING;
  vsUpdate(g, 1); // 推进到 resolveShot
  assert.strictEqual(g.lastShot.combo, true, '连打触发');
  h._checkShotFeedback(g);
  assert.strictEqual(h.events.stateChanges, 1, 'onStateChange 触发');
});

test('3D 适配：游戏结束触发 onGameOver', () => {
  const h = makeLogicHarness();
  const g = h.game;
  g.state = VsState.GAME_OVER;
  h._checkGameOver(g);
  assert.strictEqual(h.events.gameOver, 1, 'onGameOver 触发');
  h._checkGameOver(g);
  assert.strictEqual(h.events.gameOver, 1, '不重复触发');
});
