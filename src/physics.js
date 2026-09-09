// 物理引擎纯函数 — 无 DOM 依赖，Node 可跑
// world = {
//   w, h,                        // 逻辑尺寸（单位：px）
//   balls: [{id,x,y,vx,vy,r,captured}],   // 动态弹珠
//   holes: [{x,y,r}],            // 洞
//   obstacles: [{x,y,r}],        // 静态障碍（圆）
//   walls: true,                 // 是否边界反弹
// }

export const PHYS = {
  friction: 0.985,        // 每帧速度衰减（滑行感关键）
  restitution: 0.55,      // 反弹恢复系数
  lowSpeedThreshold: 0.5, // 低于此速度启用额外滚动摩擦
  lowSpeedFriction: 0.98,
  maxLaunchSpeed: 9,      // 最大发射速度（单位/帧），满力最远 ~570px
  holeCaptureRatio: 0.6,  // 进洞判定 = 圆心距 < 洞半径 × 此值
  stopThreshold: 0.02,    // 低于此速度视为停
};

export function createWorld({ w, h, balls = [], holes = [], obstacles = [], walls = true }) {
  return { w, h, balls, holes, obstacles, walls, time: 0 };
}

export function makeBall(id, x, y, r = 10, vx = 0, vy = 0) {
  return { id, x, y, vx, vy, r, captured: false };
}

// 单帧推进：摩擦 → 停止 → 边界 → 碰撞 → 进洞
// world.events 收集本帧事件：[{type:'wall'|'collide', impact}]
export function step(world, dt = 1) {
  world.time += dt;
  world.events = [];
  for (const b of world.balls) {
    if (b.captured) continue;
    // 摩擦衰减
    const speed = Math.hypot(b.vx, b.vy);
    let factor = PHYS.friction ** dt;
    if (speed < PHYS.lowSpeedThreshold) factor *= PHYS.lowSpeedFriction ** dt;
    b.vx *= factor;
    b.vy *= factor;
    // 停止阈值
    if (Math.hypot(b.vx, b.vy) < PHYS.stopThreshold) {
      b.vx = 0; b.vy = 0;
    }
    // 位移
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    // 边界反弹
    if (world.walls) {
      if (b.x - b.r < 0) { b.x = b.r; b.vx = -b.vx * PHYS.restitution; world.events.push({ type: 'wall', impact: Math.abs(b.vx) }); }
      if (b.x + b.r > world.w) { b.x = world.w - b.r; b.vx = -b.vx * PHYS.restitution; world.events.push({ type: 'wall', impact: Math.abs(b.vx) }); }
      if (b.y - b.r < 0) { b.y = b.r; b.vy = -b.vy * PHYS.restitution; world.events.push({ type: 'wall', impact: Math.abs(b.vy) }); }
      if (b.y + b.r > world.h) { b.y = world.h - b.r; b.vy = -b.vy * PHYS.restitution; world.events.push({ type: 'wall', impact: Math.abs(b.vy) }); }
    }
  }
  resolveCollisions(world);
  checkHoleCaptures(world);
  return world;
}

// 圆-圆碰撞（等质量弹性 + 位置分离）
export function resolveCollisions(world) {
  const { balls, obstacles } = world;
  // 动-静（障碍）
  for (const b of balls) {
    if (b.captured) continue;
    for (const o of obstacles) {
      const hit = collidePair(b, o, o.r, true);
      if (hit) world.events.push({ type: 'collide', impact: hit });
    }
  }
  // 动-动（弹珠互撞）
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.captured) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const c = balls[j];
      if (c.captured) continue;
      const hit = collidePair(a, c, c.r, false);
      if (hit) world.events.push({ type: 'collide', impact: hit });
    }
  }
}

// 通用两圆碰撞：a 为动球，b 半径 rb，static=true 时 b 不动
// 接触容差：dist < minDist + TOLERANCE 即视为接触，避免"恰好接触不弹速"卡死
const TOLERANCE = 0.5;
function collidePair(a, b, rb, isStatic) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = a.r + rb;
  if (dist === 0 || dist >= minDist + TOLERANCE) return;
  const nx = dx / dist, ny = dy / dist;
  const overlap = minDist - dist;
  // 位置分离（无条件执行，防止穿透卡死）
  if (isStatic) {
    a.x -= nx * overlap; a.y -= ny * overlap;
  } else {
    a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
    b.x += nx * overlap / 2; b.y += ny * overlap / 2;
  }
  // 速度反弹（仅当速度沿法线分量朝向对方时）
  const bvx = isStatic ? 0 : b.vx, bvy = isStatic ? 0 : b.vy;
  const dvx = a.vx - bvx, dvy = a.vy - bvy;
  const vn = dvx * nx + dvy * ny;
  if (vn > 0) {
    const impulse = vn * (isStatic ? (1 + PHYS.restitution) : 1);
    a.vx -= impulse * nx; a.vy -= impulse * ny;
    if (!isStatic) { b.vx += impulse * nx; b.vy += impulse * ny; }
    return impulse; // 冲击力度（用于音效/震动）
  }
  return 0;
}

// 进洞判定：圆心距 < 洞半径 × ratio → captured
export function checkHoleCaptures(world) {
  for (const b of world.balls) {
    if (b.captured) continue;
    for (const h of world.holes) {
      const d = Math.hypot(b.x - h.x, b.y - h.y);
      if (d < h.r * PHYS.holeCaptureRatio) {
        b.captured = true;
        break;
      }
    }
  }
}

// 发射：给定方向(dx,dy)与力度(0~1)，设速度
export function launch(world, ballId, dx, dy, power) {
  const b = world.balls.find((x) => x.id === ballId);
  if (!b) return;
  const len = Math.hypot(dx, dy) || 1;
  const speed = Math.min(power, 1) * PHYS.maxLaunchSpeed;
  b.vx = (dx / len) * speed;
  b.vy = (dy / len) * speed;
}

// 瞄准轨迹预测：克隆世界，发射，模拟 steps 帧，返回路径点
export function simulateTrajectory(world, ballId, dx, dy, power, steps = 60) {
  const clone = structuredClone(world);
  launch(clone, ballId, dx, dy, power);
  const b = clone.balls.find((x) => x.id === ballId);
  const path = [{ x: b.x, y: b.y }];
  for (let i = 0; i < steps; i++) {
    step(clone, 1);
    const bb = clone.balls.find((x) => x.id === ballId);
    path.push({ x: bb.x, y: bb.y });
    if (bb.captured || (bb.vx === 0 && bb.vy === 0)) break;
  }
  return path;
}

// 全部静止？
export function allStopped(world) {
  return world.balls.every((b) => b.captured || (b.vx === 0 && b.vy === 0));
}
