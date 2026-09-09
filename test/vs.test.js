import { test } from 'node:test';
import assert from 'node:assert';
import { createVsGame, vsSetAim, vsFire, vsUpdate, vsAIShot, aiDecide, vsRestart, VsState, RING, VS_CFG } from '../src/vs.js';

test('创建对战局：双方母弹 + 8 颗彩珠', () => {
  const g = createVsGame();
  const ids = g.world.balls.map((b) => b.id);
  assert.ok(ids.includes('player_taw'));
  assert.ok(ids.includes('ai_taw'));
  const marbles = ids.filter((id) => id.startsWith('m'));
  assert.strictEqual(marbles.length, 8);
  // 母弹在圈外
  const pt = g.world.balls.find((b) => b.id === 'player_taw');
  assert.ok(Math.hypot(pt.x - RING.cx, pt.y - RING.cy) > RING.r);
  // 彩珠在圈内
  for (const m of g.world.balls.filter((b) => b.id.startsWith('m'))) {
    assert.ok(Math.hypot(m.x - RING.cx, m.y - RING.cy) < RING.r);
  }
});

test('玩家瞄准：反向拖拽', () => {
  const g = createVsGame();
  vsSetAim(g, -100, 0, 120); // 往左拖 = 往右打
  assert.strictEqual(g.aimDir.x, 1);
  assert.ok(g.power > 0.8);
  assert.strictEqual(g.state, VsState.PLAYER_AIM);
});

test('发射后进入 rolling', () => {
  const g = createVsGame();
  vsSetAim(g, -100, 0, 120);
  vsFire(g);
  assert.strictEqual(g.state, VsState.PLAYER_ROLLING);
});

test('AI 决策返回合理方向力度', () => {
  const g = createVsGame();
  g.turn = 'ai';
  const d = aiDecide(g);
  assert.ok(Math.abs(d.dirX) <= 1 && Math.abs(d.dirY) <= 1);
  assert.ok(d.power > 0 && d.power <= 1);
});

test('AI 菜鸟级：随机角度', () => {
  const g = createVsGame({ aiLevel: 0 });
  g.turn = 'ai';
  const d1 = aiDecide(g);
  const d2 = aiDecide(g);
  // 随机：两次大概率不同
  assert.ok(Math.abs(d1.dirX - d2.dirX) > 0.01 || Math.abs(d1.dirY - d2.dirY) > 0.01);
});

test('模拟整局：AI 能玩到结束', () => {
  const g = createVsGame({ aiLevel: 1 });
  let steps = 0;
  let shots = { player: 0, ai: 0 };
  while (g.state !== VsState.GAME_OVER && steps < 500) {
    steps++;
    if (g.state === VsState.PLAYER_AIM) {
      // 玩家随便打
      const ang = Math.random() * Math.PI * 2;
      vsSetAim(g, -Math.cos(ang) * 80, -Math.sin(ang) * 80, 120);
      vsFire(g);
      shots.player++;
    } else if (g.state === VsState.AI_AIM) {
      vsAIShot(g);
      shots.ai++;
    }
    // 模拟帧推进：每发等滚动结束（物理慢，需要足够帧）
    let guard = 0;
    while ((g.state === VsState.PLAYER_ROLLING || g.state === VsState.AI_ROLLING) && guard < 600) {
      vsUpdate(g, 1);
      guard++;
    }
  }
  assert.ok(steps < 500, 'AI 对局应能在 500 步内结束');
  assert.strictEqual(g.state, VsState.GAME_OVER);
  assert.ok(g.winner === 'player' || g.winner === 'ai' || g.winner === 'draw');
  assert.ok(g.scores.player + g.scores.ai === VS_CFG.targetBalls, '彩珠应全部分配');
});

test('重开保留 AI 难度', () => {
  const g = createVsGame({ aiLevel: 2 });
  vsRestart(g);
  assert.strictEqual(g.aiLevel, 2);
  assert.strictEqual(g.state, VsState.PLAYER_AIM);
});
