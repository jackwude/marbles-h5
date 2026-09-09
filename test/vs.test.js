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
  // 新规则：分数可能因吐珠/吃母弹而不等于 8，但不会为负，且赢家分数应 >= 对方
  assert.ok(g.scores.player >= 0 && g.scores.ai >= 0, '分数不应为负');
  if (g.winner !== 'draw') {
    const winSide = g.winner === 'player' ? 'player' : 'ai';
    const loseSide = g.winner === 'player' ? 'ai' : 'player';
    assert.ok(g.scores[winSide] >= g.scores[loseSide], '赢家分数应 >= 输家');
  }
});

test('重开保留 AI 难度', () => {
  const g = createVsGame({ aiLevel: 2 });
  vsRestart(g);
  assert.strictEqual(g.aiLevel, 2);
  assert.strictEqual(g.state, VsState.PLAYER_AIM);
});

// ===== 新规则测试（v0.7 定稿：中国圈内规则）=====

test('新规则：击出彩珠获得资格（eligibility）', () => {
  const g = createVsGame();
  // 初始无资格
  assert.strictEqual(g.eligibility.player, false);
  assert.strictEqual(g.eligibility.ai, false);
  // 直接调用内部逻辑：构造场景——玩家击出一颗彩珠出圈
  // 通过模拟：把玩家母弹移到圈内，一颗彩珠移到圈外，触发 resolveShot
  const pt = g.world.balls.find((b) => b.id === 'player_taw');
  const m = g.world.balls.find((b) => b.id.startsWith('m'));
  pt.x = RING.cx - 50; pt.y = RING.cy; pt.vx = 0; pt.vy = 0; // 母弹在圈内
  m.x = RING.cx + RING.r + 30; m.y = RING.cy; m.vx = 0; m.vy = 0; // 彩珠出圈
  m.captured = false; m.owner = null;
  g.state = VsState.PLAYER_ROLLING;
  vsUpdate(g, 1); // 触发 resolveShot
  assert.strictEqual(g.eligibility.player, true, '击出彩珠后玩家应获得资格');
  assert.strictEqual(g.scores.player, 1);
});

test('新规则：母弹停圈内 → 吐出战利品', () => {
  const g = createVsGame();
  // 玩家先赢 2 颗（模拟 owner + 分数）
  const ms = g.world.balls.filter((b) => b.id.startsWith('m'));
  ms[0].owner = 'player'; ms[0].captured = true; ms[0].outOfRing = true;
  ms[1].owner = 'player'; ms[1].captured = true; ms[1].outOfRing = true;
  ms[0].x = RING.cx + RING.r + 20; ms[0].y = RING.cy;
  ms[1].x = RING.cx + RING.r + 30; ms[1].y = RING.cy;
  g.scores.player = 2;
  g.eligibility.player = true;
  g.inRing = 6;
  // 玩家母弹停在圈内（没击出新珠）
  const pt = g.world.balls.find((b) => b.id === 'player_taw');
  pt.x = RING.cx; pt.y = RING.cy; pt.vx = 0; pt.vy = 0;
  g.state = VsState.PLAYER_ROLLING;
  vsUpdate(g, 1);
  // 惩罚：吐出 2 颗，分数归 0，圈内恢复 8
  assert.strictEqual(g.scores.player, 0, '母弹停圈内应吐出全部战利品');
  assert.strictEqual(g.inRing, 8, '吐出的珠子应放回圈内');
  const stillOwned = g.world.balls.filter((b) => b.owner === 'player');
  assert.strictEqual(stillOwned.length, 0, '玩家不应再有战利品');
});

test('新规则：无资格撞出对方母弹 → 对方吐珠但可继续', () => {
  const g = createVsGame();
  // AI 先赢 2 颗
  const ms = g.world.balls.filter((b) => b.id.startsWith('m'));
  ms[0].owner = 'ai'; ms[0].captured = true; ms[0].outOfRing = true;
  ms[1].owner = 'ai'; ms[1].captured = true; ms[1].outOfRing = true;
  ms[0].x = RING.cx + RING.r + 20; ms[0].y = RING.cy;
  ms[1].x = RING.cx + RING.r + 30; ms[1].y = RING.cy;
  g.scores.ai = 2;
  g.eligibility.ai = true;
  g.inRing = 6;
  // 玩家（无资格）撞出 AI 母弹
  const at = g.world.balls.find((b) => b.id === 'ai_taw');
  at.x = RING.cx + RING.r + 30; at.y = RING.cy; at.vx = 0; at.vy = 0; // AI 母弹出圈
  const pt = g.world.balls.find((b) => b.id === 'player_taw');
  pt.x = RING.cx - 50; pt.y = RING.cy; pt.vx = 0; pt.vy = 0; // 玩家母弹在圈内（但无资格）
  g._prevOppInRing = true; // 射击前 AI 母弹在圈内（被撞出）
  g.state = VsState.PLAYER_ROLLING;
  vsUpdate(g, 1);
  // 玩家无资格 → 不算吃下：AI 吐珠但没淘汰
  assert.strictEqual(g.scores.ai, 0, 'AI 应吐出战利品');
  assert.ok(g.state !== VsState.GAME_OVER, '无资格撞母弹不能结束游戏');
  assert.ok(at.captured !== true, 'AI 母弹不应被吃下（无资格）');
});

test('新规则：有资格撞出对方母弹 → 吃下淘汰 + 赢走全部', () => {
  const g = createVsGame();
  // AI 赢 2 颗，玩家有资格
  const ms = g.world.balls.filter((b) => b.id.startsWith('m'));
  ms[0].owner = 'ai'; ms[0].captured = true; ms[0].outOfRing = true;
  ms[1].owner = 'ai'; ms[1].captured = true; ms[1].outOfRing = true;
  ms[0].x = RING.cx + RING.r + 20; ms[0].y = RING.cy;
  ms[1].x = RING.cx + RING.r + 30; ms[1].y = RING.cy;
  g.scores.ai = 2;
  g.eligibility.ai = true;
  g.eligibility.player = true; // 玩家已有资格
  g.inRing = 6;
  // 玩家（有资格）撞出 AI 母弹
  const at = g.world.balls.find((b) => b.id === 'ai_taw');
  at.x = RING.cx + RING.r + 30; at.y = RING.cy; at.vx = 0; at.vy = 0; // AI 母弹出圈
  const pt = g.world.balls.find((b) => b.id === 'player_taw');
  pt.x = RING.cx - 50; pt.y = RING.cy; pt.vx = 0; pt.vy = 0; // 玩家母弹在圈内（但有资格）
  g._prevOppInRing = true; // 射击前 AI 母弹在圈内（被撞出）
  g.state = VsState.PLAYER_ROLLING;
  vsUpdate(g, 1);
  // 吃下：玩家赢走 AI 的 2 颗，游戏结束，玩家胜
  assert.strictEqual(g.scores.player, 2, '玩家应赢走 AI 的全部战利品');
  assert.strictEqual(g.state, VsState.GAME_OVER, '吃下母弹应结束游戏');
  assert.strictEqual(g.winner, 'player', '吃下母弹者获胜');
  assert.ok(at.captured === true, 'AI 母弹应被吃下');
});
