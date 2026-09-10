// 3D 适配层 AI 驱动测试：AI_AIM → vsAIShot → AI_ROLLING
// 验证 3D 适配器的 AI 回合不会卡死（用户反馈"没法玩"的根因修复）
import { test } from 'node:test';
import assert from 'node:assert';
import { createVsGame, VsState, vsAIShot, vsUpdate, vsSetAim, vsFire } from '../src/vs.js';

test('3D 适配修复：AI_AIM → vsAIShot → AI_ROLLING（AI 能发射）', () => {
  const g = createVsGame();
  g.state = VsState.AI_AIM;
  assert.strictEqual(g.state, VsState.AI_AIM, '进入 AI 回合');
  // 模拟 3D 适配器的 setTimeout 回调
  vsAIShot(g);
  assert.strictEqual(g.state, VsState.AI_ROLLING, 'AI 发射后进入滚动');
  // 推进物理（帧归一化 dt=1），应最终 settle 回玩家回合
  let guard = 0;
  while (g.state === VsState.AI_ROLLING && guard < 600) {
    vsUpdate(g, 1);
    guard++;
  }
  assert.notStrictEqual(g.state, VsState.AI_ROLLING, 'AI 滚动结束');
  assert.ok([VsState.PLAYER_AIM, VsState.AI_AIM, VsState.GAME_OVER].includes(g.state), `状态正常: ${g.state}`);
});

test('3D 适配修复：dt=1（帧归一化）时物理正常推进', () => {
  const g = createVsGame();
  const pt = g.world.balls.find((b) => b.id === 'player_taw');
  pt.vx = 5; pt.vy = 0; // 给母珠初速度
  g.state = VsState.PLAYER_ROLLING;
  vsUpdate(g, 1); // 一帧
  assert.ok(pt.x > 240, `dt=1 时母珠移动: x=${pt.x}`);
  // 对比：如果 dt=0.016（错误的秒制），几乎不动
  const g2 = createVsGame();
  const pt2 = g2.world.balls.find((b) => b.id === 'player_taw');
  pt2.vx = 5; pt2.vy = 0;
  g2.state = VsState.PLAYER_ROLLING;
  vsUpdate(g2, 0.016); // 错误的秒制
  assert.ok(pt2.x < pt.x + 1, 'dt=0.016 几乎不动（证明 dt 单位关键）');
});

test('3D 适配修复：vsFire 后进入 ROLLING 能物理推进到结算', () => {
  const g = createVsGame();
  g.state = VsState.PLAYER_AIM;
  // 模拟拖拽发射
  vsSetAim(g, -60, -120, 120); // 往左上方拖
  vsFire(g);
  assert.strictEqual(g.state, VsState.PLAYER_ROLLING, '发射后进入滚动');
  // 推进
  let guard = 0;
  while (g.state === VsState.PLAYER_ROLLING && guard < 600) {
    vsUpdate(g, 1);
    guard++;
  }
  assert.notStrictEqual(g.state, VsState.PLAYER_ROLLING, '滚动结束，游戏可继续');
});
