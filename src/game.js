// 游戏状态机（纯逻辑，可单测）
import { createWorld, makeBall, step, launch, simulateTrajectory, allStopped } from './physics.js';
import { LEVELS, WORLD_W, WORLD_H } from './levels.js';

export const GameState = {
  AIM: 'aim',        // 等待蓄力发射
  ROLLING: 'rolling', // 弹珠滚动中
  SETTLED: 'settled', // 停下，判定结果
  CAPTURED: 'captured', // 进洞
  OUT: 'out',        // 次数用尽未进洞
};

export function createGame(levelId) {
  const level = LEVELS.find((l) => l.id === levelId);
  if (!level) throw new Error(`no level ${levelId}`);
  const world = createWorld({
    w: WORLD_W, h: WORLD_H,
    balls: [makeBall('player', level.start.x, level.start.y, 12)],
    holes: [level.hole],
    obstacles: level.obstacles,
    walls: true,
  });
  return {
    level,
    world,
    state: GameState.AIM,
    shotsUsed: 0,
    maxShots: level.maxShots,
    power: 0,
    aimDir: { x: 1, y: 0 },
  };
}

// 更新蓄力（拖拽向量：屏幕坐标 → 世界力度）
export function setAim(game, dx, dy, maxDrag = 120) {
  const len = Math.hypot(dx, dy);
  if (len < 1) { game.power = 0; return; }
  // 反向拖拽：拖向量 = 发射向量的反方向
  game.aimDir = { x: -dx / len, y: -dy / len };
  game.power = Math.min(len / maxDrag, 1);
}

// 发射
export function fire(game) {
  if (game.state !== GameState.AIM || game.power <= 0) return;
  launch(game.world, 'player', game.aimDir.x, game.aimDir.y, game.power);
  game.shotsUsed++;
  game.state = GameState.ROLLING;
}

// 每帧推进：物理 + 状态机
export function update(game, dt = 1) {
  if (game.state === GameState.ROLLING) {
    step(game.world, dt);
    const b = game.world.balls[0];
    if (b.captured) {
      game.state = GameState.CAPTURED;
    } else if (allStopped(game.world)) {
      game.state = GameState.SETTLED;
    }
  }
  return game;
}

// 停下的结果判定
export function settle(game) {
  const b = game.world.balls[0];
  if (b.captured) { game.state = GameState.CAPTURED; return; }
  if (game.shotsUsed >= game.maxShots) {
    game.state = GameState.OUT;
  } else {
    game.state = GameState.AIM; // 还有次数，回到瞄准
  }
}

// 星级：进洞后按剩余次数
export function starsFor(game) {
  const remaining = game.maxShots - game.shotsUsed;
  if (remaining >= 2) return 3;
  if (remaining >= 1) return 2;
  return 1;
}

// 重开本关
export function restart(game) {
  const g = createGame(game.level.id);
  Object.assign(game, g);
  return game;
}

// 瞄准轨迹（给渲染层）
export function getTrajectory(game, steps = 60) {
  if (game.state !== GameState.AIM || game.power <= 0) return [];
  return simulateTrajectory(game.world, 'player', game.aimDir.x, game.aimDir.y, game.power, steps);
}
