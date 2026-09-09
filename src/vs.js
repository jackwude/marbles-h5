// 圈内对战模式（单人对 AI）— 纯逻辑，无 DOM，可单测 / 可移植微信小程序
// 规则（忠实还原童年"圈内玩法"）：
//  1. 圈内放 N 颗"彩珠"（战利品池），双方各 1 颗"母弹"（taw）
//  2. 轮流弹：从自己母弹当前位置弹射，撞圈内彩珠出圈 → 出圈的归自己
//  3. 连杀：撞出 ≥1 颗彩珠且母弹停在圈内 → 继续弹
//  4. 攻击母弹：撞对方母弹 → 撞出圈 = 对方所有战利品归你（大翻盘）
//  5. 母弹停在圈内且没撞出彩珠 → 停原地，下回合成为对方靶子
//  6. 胜负：圈内彩珠清空（或达目标数），赢得多的一方获胜
import { createWorld, makeBall, step, launch, allStopped } from './physics.js';
import { WORLD_W, WORLD_H } from './levels.js';

export const VsState = {
  PLAYER_AIM: 'player_aim', // 玩家瞄准
  PLAYER_ROLLING: 'player_rolling',
  AI_AIM: 'ai_aim',         // AI 瞄准（内部计算）
  AI_ROLLING: 'ai_rolling',
  GAME_OVER: 'game_over',
};

export const RING = {
  cx: WORLD_W / 2,          // 圈中心
  cy: WORLD_H / 2,
  r: 190,                   // 圈半径
  // 出圈判定：圆心距 > r + 珠半径 视为出圈（完全滚出圈外）
};

export const VS_CFG = {
  targetBalls: 8,           // 圈内彩珠数量
  marbleR: 11,              // 彩珠半径
  tawR: 13,                 // 母弹半径（略大）
  aiThinkMs: 700,           // AI "思考"时间（模拟人停顿）
  minWinBalls: 1,           // 至少赢 1 颗才算胜
};

// 创建对战局
export function createVsGame({ aiLevel = 1 } = {}) {
  const balls = [];
  // 玩家母弹（红）
  balls.push(makeBall('player_taw', 120, WORLD_H / 2, VS_CFG.tawR));
  // AI 母弹（蓝）
  balls.push(makeBall('ai_taw', WORLD_W - 120, WORLD_H / 2, VS_CFG.tawR));
  // 彩珠（圈内随机分布，不重叠、不在母弹上）
  const cx = RING.cx, cy = RING.cy, r = RING.r;
  let placed = 0;
  let guard = 0;
  while (placed < VS_CFG.targetBalls && guard < 500) {
    guard++;
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * r * 0.6; // 偏向中心 60% 半径内
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    // 不与已有彩珠/母弹重叠（间距 > 2.2r）
    const overlap = balls.some((b) => Math.hypot(b.x - x, b.y - y) < VS_CFG.marbleR * 2.4);
    if (overlap) continue;
    balls.push(makeBall(`m${placed}`, x, y, VS_CFG.marbleR));
    placed++;
  }
  const world = createWorld({ w: WORLD_W, h: WORLD_H, balls, holes: [], obstacles: [], walls: true });
  return {
    state: VsState.PLAYER_AIM,
    world,
    aiLevel,
    turn: 'player',          // 当前行动方
    scores: { player: 0, ai: 0 },  // 赢得的彩珠数
    inRing: VS_CFG.targetBalls,    // 圈内剩余彩珠
    turnCount: 0,                  // 回合计数（防无限拖局，超上限判胜负）
    lastShot: null,          // 上次射击结果 {knockedOut, tawInRing, hitTaw}
    winner: null,            // 'player' | 'ai' | null
    power: 0,
    aimDir: { x: 1, y: 0 },
  };
}

// 圈内判定：彩珠是否出圈（圆心距 > 圈半径 即出圈——滚出圈线就算，符合直觉）
function isOutOfRing(b) {
  const d = Math.hypot(b.x - RING.cx, b.y - RING.cy);
  return d > RING.r;
}

// 玩家设瞄准（同闯关：反向拖拽）
export function vsSetAim(game, dx, dy, maxDrag = 120) {
  const len = Math.hypot(dx, dy);
  if (len < 1) { game.power = 0; return; }
  game.aimDir = { x: -dx / len, y: -dy / len };
  game.power = Math.min(len / maxDrag, 1);
}

// 发射当前行动方母弹
export function vsFire(game) {
  const shooter = game.turn === 'player' ? 'player_taw' : 'ai_taw';
  if (game.state === VsState.PLAYER_AIM) {
    if (game.power <= 0) return;
    launch(game.world, shooter, game.aimDir.x, game.aimDir.y, game.power);
    game.state = VsState.PLAYER_ROLLING;
  } else if (game.state === VsState.AI_AIM) {
    launch(game.world, shooter, game.aimDir.x, game.aimDir.y, game.power);
    game.state = VsState.AI_ROLLING;
  }
}

// AI 决策：返回 {dirX, dirY, power}
// 通过"模拟试射"选择最优射击——AI 会思考，命中率高
// 三级难度：
//  0=菜鸟：随机角度力度
//  1=正常：试射选能撞出彩珠的最优解，偶尔攻击母弹
//  2=高手：更精准（多试几次）+ 更激进攻击母弹
export function aiDecide(game) {
  const level = game.aiLevel;
  if (level === 0) {
    const ang = Math.random() * Math.PI * 2;
    return { dirX: Math.cos(ang), dirY: Math.sin(ang), power: 0.3 + Math.random() * 0.6 };
  }
  // level 1（普通）：70% 概率用"简单启发式"（朝最近彩珠打，会真失误，命中率~真人）
  // level 2（高手）：基本都用模拟试射（接近完美）
  if (level === 1 && Math.random() < 0.7) {
    return aiHeuristic(game);
  }
  return aiThink(game, level);
}

// 简单启发式：朝最近的彩珠打，力度估算（误差较大，命中率 ~40%，像新手）
function aiHeuristic(game) {
  const world = game.world;
  const shooterId = game.turn === 'player' ? 'player_taw' : 'ai_taw';
  const shooter = world.balls.find((b) => b.id === shooterId);
  const marbles = world.balls.filter((b) => b.id.startsWith('m') && !isOutOfRing(b) && !b.captured);
  if (!marbles.length) {
    const ang = Math.random() * Math.PI * 2;
    return { dirX: Math.cos(ang), dirY: Math.sin(ang), power: 0.5 };
  }
  // 选最近的彩珠
  let best = null, bestDist = Infinity;
  for (const m of marbles) {
    const d = Math.hypot(m.x - shooter.x, m.y - shooter.y);
    if (d < bestDist) { bestDist = d; best = m; }
  }
  const dx = best.x - shooter.x, dy = best.y - shooter.y;
  const dist = Math.hypot(dx, dy);
  // 角度：朝彩珠 + 大误差（±0.15 rad，容易打偏）
  const baseAng = Math.atan2(dy, dx);
  const jitterAng = (Math.random() - 0.5) * 0.3;
  const ang = baseAng + jitterAng;
  // 力度：估算 + 大误差（±0.25，可能不够/过头）
  const edgeDist = Math.hypot(best.x - RING.cx, best.y - RING.cy);
  const extra = Math.max(20, (RING.r - edgeDist) * 0.5);
  let power = (dist + extra) / 570 + (Math.random() - 0.5) * 0.5;
  power = Math.max(0.35, Math.min(1, power));
  return { dirX: Math.cos(ang), dirY: Math.sin(ang), power };
}

// AI 思考：克隆世界试射，选"能撞出彩珠"的最优角度力度
export function aiThink(game, level = 1) {
  const world = game.world;
  const shooterId = game.turn === 'player' ? 'player_taw' : 'ai_taw';
  const shooter = world.balls.find((b) => b.id === shooterId);
  const marbles = world.balls.filter((b) => b.id.startsWith('m') && !isOutOfRing(b) && !b.captured);

  // 候选射击：朝每个彩珠打（保证碰到）+ 朝圈外偏移（把彩珠推出圈），评估试射选最优
  const shots = [];
  for (const m of marbles) {
    const toMarble = Math.atan2(m.y - shooter.y, m.x - shooter.x);       // 母弹→彩珠
    const outDir = Math.atan2(m.y - RING.cy, m.x - RING.cx);             // 彩珠→圈外
    const dist = Math.hypot(m.x - shooter.x, m.y - shooter.y);
    // 朝彩珠打（偏转范围 + 朝圈外方向也试）
    const angles = [
      toMarble, toMarble - 0.1, toMarble + 0.1,
      outDir, outDir - 0.08, outDir + 0.08,
    ];
    for (const ang of angles) {
      for (const pow of [0.7, 0.85, 0.95, 1.0]) {
        shots.push({ dirX: Math.cos(ang), dirY: Math.sin(ang), power: pow, marble: m, dist });
      }
    }
  }
  // 不攻击对方母珠（v2.0：母珠只是工具）
  // 只生成"撞彩珠"候选

  // 逐个试射，评估结果
  let best = null;
  for (const s of shots) {
    const eval_ = evaluateShot(game, s);
    if (!best || eval_.score > best.score) {
      best = { ...s, score: eval_.score, details: eval_ };
    }
  }
  if (!best || best.score <= 0) {
    // 找不到好射击：打最近彩珠（力度给足），兜底
    const m = marbles[0];
    if (m) {
      const ang = Math.atan2(m.y - shooter.y, m.x - shooter.x);
      return { dirX: Math.cos(ang), dirY: Math.sin(ang), power: 0.95 };
    }
    const ang = Math.random() * Math.PI * 2;
    return { dirX: Math.cos(ang), dirY: Math.sin(ang), power: 0.5 };
  }
  return { dirX: best.dirX, dirY: best.dirY, power: best.power };
}

// 试射评估：克隆世界 → 发射 → 跑物理到静止 → 检查最终结果
// 返回 {score, knockedOut, tawInRing}
export function evaluateShot(game, shot) {
  const clone = structuredClone(game.world);
  const shooterId = game.turn === 'player' ? 'player_taw' : 'ai_taw';
  launch(clone, shooterId, shot.dirX, shot.dirY, shot.power);
  // 跑物理直到全部静止（与真实 resolveShot 一致：最终位置判定）
  // guard 要高（物理沉降慢，单发可超 280 帧），同时早停优化
  let guard = 0;
  while (!allStopped(clone) && guard < 600) {
    guard++;
    step(clone, 1);
    // 早停：射手已出圈且不再动 + 彩珠已停止 → 结果已定
    const s = clone.balls.find((b) => b.id === shooterId);
    if (s && !s.captured && s.vx === 0 && s.vy === 0) {
      const anyMoving = clone.balls.some((b) => !b.captured && (b.vx !== 0 || b.vy !== 0));
      if (!anyMoving) break;
    }
  }
  const shooter = clone.balls.find((b) => b.id === shooterId);
  if (!shooter) return { score: 0, knockedOut: 0, tawInRing: false };
  // 最终位置判定（与 resolveShot 相同逻辑）
  let knockedOut = 0;
  for (const m of clone.balls.filter((b) => b.id.startsWith('m'))) {
    if (isOutOfRing(m)) knockedOut++;
  }
  const tawInRing = Math.hypot(shooter.x - RING.cx, shooter.y - RING.cy) < RING.r;
  // 评分（v2.0"打倒赢珠"）：撞出彩珠越多越好；
  // 撞出 + 停圈内 = 连打（+3 奖励）；停圈内但没撞出 = missed（无价值）
  let score = knockedOut * 10;
  if (knockedOut > 0 && tawInRing) score += 3; // 连打奖励
  if (levelHigh(game) && knockedOut === 0 && !tawInRing) score -= 5; // 高手避免无用射击
  return { score, knockedOut, tawInRing };
}

function levelHigh(game) {
  return game.aiLevel === 2;
}

// 每帧推进（对战模式：与闯关一致的物理，不做额外摩擦——避免彩珠撞不出圈）
export function vsUpdate(game, dt = 1) {
  if (game.state === VsState.PLAYER_ROLLING || game.state === VsState.AI_ROLLING) {
    step(game.world, dt);
    if (allStopped(game.world)) {
      resolveShot(game);
    }
  }
  return game;
}

// 射击结束：判定结果，切换回合
// 规则（v2.0 定稿"打倒赢珠"，marbles-h5-VS-RULES.md）：
//  1. 撞出彩珠（圆心过圈线）→ 归射手（+1 分，飞入袋子）
//  2. 连打：本轮撞出 ≥1 颗 且 母珠停圈内 → 继续本回合
//  3. 换人：母珠出圈（惩罚，回合结束）或 没撞出彩珠（母珠停圈内没打中）→ 换人
//  4. 不攻击对方母珠（母珠只是工具）
//  5. 胜负：圈内彩珠清空，最多者胜；回合上限 40
function resolveShot(game) {
  const shooterId = game.turn === 'player' ? 'player_taw' : 'ai_taw';
  const shooter = game.world.balls.find((b) => b.id === shooterId);
  const marbles = game.world.balls.filter((b) => b.id.startsWith('m'));
  const tawInRing = Math.hypot(shooter.x - RING.cx, shooter.y - RING.cy) < RING.r;
  const shooterInRing = tawInRing;

  // 1. 找出本轮出圈的彩珠（出圈 + 未捕获），记录赢走的珠子
  let knockedOut = 0;
  const wonMarbles = [];
  for (const m of marbles) {
    if (isOutOfRing(m) && !m.captured) {
      // 出圈彩珠：标记 captured（防重复计分），归射手
      m.captured = true;
      m.outOfRing = true;
      m.owner = game.turn; // 记录归属（player/ai）
      knockedOut++;
      wonMarbles.push({ id: m.id, x: m.x, y: m.y }); // 记录位置（供飞入动画）
    }
  }
  if (knockedOut > 0) {
    game.scores[game.turn] += knockedOut;
    game.inRing -= knockedOut;
  }

  // 记录本次结果（供 UI 显示）
  game.lastShot = {
    shooter: game.turn,
    knockedOut,
    wonMarbles,
    tawInRing: shooterInRing,
    // 连打 = 撞出彩珠 且 母珠停圈内
    combo: knockedOut > 0 && shooterInRing,
    // 母珠出圈（惩罚，回合结束换人）
    tawOut: !shooterInRing,
    // 没撞出（母珠停圈内但没打中，回合结束换人）
    missed: knockedOut === 0 && shooterInRing,
  };

  // 2. 连打：撞出 ≥1 颗 且 母珠停圈内 → 继续本回合
  if (knockedOut > 0 && shooterInRing) {
    game.state = game.turn === 'player' ? VsState.PLAYER_AIM : VsState.AI_AIM;
    return; // 不换边，不重置母珠，从母珠当前位置继续
  }

  // 3. 换人：母珠出圈（惩罚）或 没撞出（停圈内没打中）
  game.turn = game.turn === 'player' ? 'ai' : 'player';
  game.turnCount++;
  // 重置母珠：出圈的母珠（自己滚出圈）回到圈外起点；没撞出停圈内的母珠留在原地（下回合从落点继续）
  for (const tawId of ['player_taw', 'ai_taw']) {
    const tb = game.world.balls.find((b) => b.id === tawId);
    if (tb && !tb.captured && isOutOfRing(tb)) {
      tb.x = tawId === 'player_taw' ? 120 : WORLD_W - 120;
      tb.y = WORLD_H / 2;
      tb.vx = 0; tb.vy = 0;
    }
  }

  // 胜负判定
  let gameOver = false;
  if (game.inRing <= 0) {
    gameOver = true;
    if (game.scores.player === game.scores.ai) game.winner = 'draw';
    else game.winner = game.scores.player > game.scores.ai ? 'player' : 'ai';
  }
  // 回合上限：防无限拖局
  if (!gameOver && game.turnCount >= 40) {
    gameOver = true;
    if (game.scores.player === game.scores.ai) game.winner = 'draw';
    else game.winner = game.scores.player > game.scores.ai ? 'player' : 'ai';
  }
  if (gameOver) {
    game.state = VsState.GAME_OVER;
  } else {
    game.state = game.turn === 'player' ? VsState.PLAYER_AIM : VsState.AI_AIM;
  }
}

// 玩家发射后的更新流程（渲染层调用）
export function vsPlayerShot(game) {
  vsFire(game);
}

// 让 AI 出手（渲染层在 AI_AIM 时调用）
export function vsAIShot(game) {
  const d = aiDecide(game);
  game.aimDir = { x: d.dirX, y: d.dirY };
  game.power = d.power;
  vsFire(game);
}

// 重开
export function vsRestart(game, { aiLevel } = {}) {
  const g = createVsGame({ aiLevel: aiLevel ?? game.aiLevel });
  Object.assign(game, g);
  return game;
}
