// 完整回合流转验证：玩家发射 → 结算 → AI 回合 → AI 发射 → 回到玩家
// 模拟 3D 适配器的 _logicUpdate（含 AI 驱动 + dt 归一化）
import { test } from 'node:test';
import assert from 'node:assert';
import { createVsGame, VsState, vsSetAim, vsFire, vsUpdate, vsAIShot } from '../src/vs.js';

// 模拟适配器 _logicUpdate（与修复后一致）
function makeAdapter(game) {
  let aiTimer = null;
  const adapter = {
    game,
    _gameOverNotified: false,
    _logicUpdate(g, dt) {
      if (g.state === 'player_rolling' || g.state === 'ai_rolling') {
        vsUpdate(g, dt);
      }
      // AI 回合：思考后发射（模拟 setTimeout）
      if (g.state === 'ai_aim' && !aiTimer) {
        aiTimer = setTimeout(() => {
          aiTimer = null;
          if (g.state !== 'ai_aim') return;
          vsAIShot(g);
        }, 50); // 测试用短思考
      }
    },
  };
  return adapter;
}

test('完整链路：玩家发射 → 结算 → AI 思考 → AI 发射 → 回到玩家（dt=1 帧推进）', async () => {
  const g = createVsGame();
  const adapter = makeAdapter(g);

  // 玩家瞄准 → 发射
  g.state = VsState.PLAYER_AIM;
  vsSetAim(g, 0, -120, 120);
  vsFire(g);
  assert.strictEqual(g.state, VsState.PLAYER_ROLLING, '玩家发射进入滚动');

  // 驱动 200 帧（模拟 200 个 rAF 帧，dt=1）
  let frames = 0;
  while (frames < 300) {
    adapter._logicUpdate(g, 1);
    frames++;
    if (g.state !== 'player_rolling') break;
    // 给 AI setTimeout 机会
    if (g.state === 'ai_aim') await new Promise((r) => setTimeout(r, 60));
    if (frames % 50 === 0) await new Promise((r) => setTimeout(r, 10));
  }

  console.log('  → 玩家滚动结束后 state:', g.state, 'frames:', frames);
  // 玩家滚动必须结束
  assert.notStrictEqual(g.state, VsState.PLAYER_ROLLING, '玩家滚动结束');

  // 如果到了 AI 回合，等 AI 发射
  let totalWait = 0;
  while (totalWait < 5000) {
    adapter._logicUpdate(g, 1);
    totalWait += 16;
    if (g.state === 'ai_aim') {
      await new Promise((r) => setTimeout(r, 60)); // 等 AI setTimeout
      adapter._logicUpdate(g, 1); // 触发 vsAIShot
    }
    if (g.state === 'ai_rolling') {
      // AI 滚动中推进
      let guard = 0;
      while (g.state === 'ai_rolling' && guard < 300) { adapter._logicUpdate(g, 1); guard++; }
    }
    if (g.state === 'player_aim' || g.state === 'game_over') break;
    await new Promise((r) => setTimeout(r, 16));
  }

  console.log('  → 最终 state:', g.state, 'turn:', g.turn, 'scores:', JSON.stringify(g.scores));
  // 游戏不能卡死（player_rolling / ai_rolling 都不该持续）
  assert.ok(['player_aim', 'ai_aim', 'game_over'].includes(g.state), `状态正常流转: ${g.state}`);
});

test('AI 发射后物理正常推进并回到玩家回合', async () => {
  const g = createVsGame();
  const adapter = makeAdapter(g);
  g.state = VsState.AI_AIM;
  // 触发 AI
  adapter._logicUpdate(g, 1);
  await new Promise((r) => setTimeout(r, 80)); // 等 AI setTimeout 发射
  adapter._logicUpdate(g, 1);
  console.log('  → AI 发射后:', g.state);
  assert.strictEqual(g.state, VsState.AI_ROLLING, 'AI 发射进入滚动');
  // 推进 AI 滚动
  let guard = 0;
  while (g.state === VsState.AI_ROLLING && guard < 300) {
    adapter._logicUpdate(g, 1);
    guard++;
  }
  console.log('  → AI 滚动结束后:', g.state, 'turn:', g.turn);
  assert.ok(['player_aim', 'ai_aim', 'game_over'].includes(g.state), 'AI 回合正常结束');
});
