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

// ===== v2.1 测试（用户确认：连打=击出+出圈 / 停圈=惩罚重置 / 出圈没击出=留原地）=====

test('v2.1：撞出彩珠 → 归射手 +1 分', () => {
  const g = createVsGame();
  const pt = g.world.balls.find((b) => b.id === 'player_taw');
  const m = g.world.balls.find((b) => b.id.startsWith('m'));
  pt.x = RING.cx - 50; pt.y = RING.cy; pt.vx = 0; pt.vy = 0; // 母珠在圈内
  m.x = RING.cx + RING.r + 30; m.y = RING.cy; m.vx = 0; m.vy = 0; // 彩珠出圈
  m.captured = false; m.owner = null;
  g.state = VsState.PLAYER_ROLLING;
  vsUpdate(g, 1); // 触发 resolveShot
  assert.strictEqual(g.scores.player, 1, '撞出彩珠归射手');
  assert.strictEqual(g.inRing, 7, '圈内减少 1');
  assert.strictEqual(m.owner, 'player', '彩珠归玩家');
});

test('v2.1：连打（击出彩珠 + 母珠出圈）→ 继续本回合', () => {
  const g = createVsGame();
  const pt = g.world.balls.find((b) => b.id === 'player_taw');
  const m = g.world.balls.find((b) => b.id.startsWith('m'));
  pt.x = RING.cx + RING.r + 50; pt.y = RING.cy; pt.vx = 0; pt.vy = 0; // 母珠出圈
  m.x = RING.cx + RING.r + 30; m.y = RING.cy; m.vx = 0; m.vy = 0; // 彩珠出圈
  m.captured = false; m.owner = null;
  g.state = VsState.PLAYER_ROLLING;
  vsUpdate(g, 1);
  assert.strictEqual(g.scores.player, 1, '撞出 1 颗');
  assert.strictEqual(g.state, VsState.PLAYER_AIM, '连打：继续玩家回合');
  assert.strictEqual(g.turn, 'player', '不换边');
  assert.ok(g.lastShot.combo === true, 'combo 标记');
});

test('v2.1：母珠停圈内（惩罚）→ 回合结束换人 + 重置回起始线', () => {
  const g = createVsGame();
  const pt = g.world.balls.find((b) => b.id === 'player_taw');
  const m = g.world.balls.find((b) => b.id.startsWith('m'));
  pt.x = RING.cx; pt.y = RING.cy; pt.vx = 0; pt.vy = 0; // 母珠停在圈内
  m.x = RING.cx + RING.r + 30; m.y = RING.cy; m.vx = 0; m.vy = 0; // 彩珠出圈（但母珠停圈内 = 惩罚）
  m.captured = false; m.owner = null;
  g.state = VsState.PLAYER_ROLLING;
  vsUpdate(g, 1);
  assert.strictEqual(g.turn, 'ai', '换到 AI');
  assert.strictEqual(g.state, VsState.AI_AIM, 'AI 回合');
  assert.ok(g.lastShot.stuckInRing === true, 'stuckInRing 标记');
  assert.ok(g.lastShot.combo === false, '不是连打（停圈内）');
  // 母珠重置回起始线（下方，玩家左下）
  const pt2 = g.world.balls.find((b) => b.id === 'player_taw');
  assert.ok(pt2.y > RING.cy, '母珠重置到下方起始线');
});

test('v2.1：母珠出圈但没击出 → 换人但母珠留原地', () => {
  const g = createVsGame();
  const pt = g.world.balls.find((b) => b.id === 'player_taw');
  pt.x = RING.cx + RING.r + 50; pt.y = RING.cy; pt.vx = 0; pt.vy = 0; // 母珠出圈
  // 所有彩珠都在圈内（没撞出）
  for (const m of g.world.balls.filter((b) => b.id.startsWith('m'))) {
    m.x = RING.cx + (Math.random() - 0.5) * 100;
    m.y = RING.cy + (Math.random() - 0.5) * 100;
    m.vx = 0; m.vy = 0; m.captured = false; m.owner = null;
  }
  g.state = VsState.PLAYER_ROLLING;
  vsUpdate(g, 1);
  assert.strictEqual(g.turn, 'ai', '出圈没击出 → 换人');
  assert.ok(g.lastShot.tawOutNoHit === true, 'tawOutNoHit 标记');
  assert.ok(g.lastShot.combo === false, '不是连打');
  // 母珠留原地（出圈但没击出，不重置）
  const pt2 = g.world.balls.find((b) => b.id === 'player_taw');
  assert.strictEqual(pt2.x, RING.cx + RING.r + 50, '母珠留在出圈处');
});

test('v2.1：不攻击对方母珠（母珠互撞不算分）', () => {
  const g = createVsGame();
  // 玩家母珠撞到 AI 母珠（但 AI 母珠出圈）→ 不应有任何得分/淘汰
  const pt = g.world.balls.find((b) => b.id === 'player_taw');
  const at = g.world.balls.find((b) => b.id === 'ai_taw');
  pt.x = RING.cx - 50; pt.y = RING.cy; pt.vx = 0; pt.vy = 0; // 玩家母珠圈内
  at.x = RING.cx + RING.r + 40; at.y = RING.cy; at.vx = 0; at.vy = 0; // AI 母珠出圈
  // 所有彩珠都在圈内（没撞出）
  for (const m of g.world.balls.filter((b) => b.id.startsWith('m'))) {
    m.x = RING.cx + (Math.random() - 0.5) * 100;
    m.y = RING.cy + (Math.random() - 0.5) * 100;
    m.vx = 0; m.vy = 0; m.captured = false; m.owner = null;
  }
  g.state = VsState.PLAYER_ROLLING;
  vsUpdate(g, 1);
  assert.strictEqual(g.scores.player, 0, '撞母珠不得分');
  assert.strictEqual(g.state, VsState.AI_AIM, '游戏不结束');
  assert.ok(at.captured !== true, 'AI 母珠不被吃下');
});
