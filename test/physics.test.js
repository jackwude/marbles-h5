import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHYS, createWorld, makeBall, step, launch,
  simulateTrajectory, checkHoleCaptures, allStopped,
} from '../src/physics.js';

// 1. 摩擦衰减
test('friction: ball decelerates and eventually stops', () => {
  const w = createWorld({ w: 800, h: 600 });
  w.balls.push(makeBall('a', 100, 100, 10, 5, 0));
  const v0 = w.balls[0].vx;
  for (let i = 0; i < 500; i++) step(w);
  const b = w.balls[0];
  assert.ok(b.vx === 0 && b.vy === 0, 'ball should stop');
  assert.ok(v0 > 0, 'initial speed positive');
});

// 2. 边界反弹
test('walls: ball bounces off right wall with restitution', () => {
  const w = createWorld({ w: 200, h: 200 });
  w.balls.push(makeBall('a', 195, 100, 10, 2, 0));
  for (let i = 0; i < 10; i++) step(w);
  const b = w.balls[0];
  assert.ok(b.x <= 200 - b.r + 0.01, 'stays inside bounds');
  assert.ok(b.vx < 0, 'reflects to negative vx');
  assert.ok(Math.abs(b.vx) <= 2 * PHYS.restitution + 0.01, 'restitution applied');
});

// 3. 圆-圆碰撞（等质量交换速度）
test('collision: equal-mass balls exchange velocity along normal', () => {
  const w = createWorld({ w: 800, h: 600, walls: false });
  w.balls.push(makeBall('a', 90, 100, 10, 3, 0));
  w.balls.push(makeBall('b', 110, 100, 10, -0.1, 0));
  for (let i = 0; i < 20; i++) step(w);
  // a 撞 b，能量交换后 a 应明显减速/反向，b 应获得正向速度
  assert.ok(w.balls[1].vx > 1, 'b gains positive velocity');
});

// 4. 静态障碍反弹
test('obstacle: ball bounces off static obstacle', () => {
  const w = createWorld({ w: 800, h: 600, walls: false });
  w.balls.push(makeBall('a', 80, 100, 10, 3, 0));
  w.obstacles.push({ x: 110, y: 100, r: 12 });
  for (let i = 0; i < 30; i++) step(w);
  const b = w.balls[0];
  const dist = Math.hypot(b.x - 110, b.y - 100);
  assert.ok(dist >= b.r + 12 - 0.1, 'not overlapping obstacle');
  assert.ok(b.vx <= 0, 'reflected backward');
});

// 5. 进洞判定
test('hole: ball captured when close enough', () => {
  const w = createWorld({ w: 800, h: 600 });
  w.holes.push({ x: 200, y: 200, r: 30 });
  w.balls.push(makeBall('a', 200, 200, 10)); // 圆心距 0
  checkHoleCaptures(w);
  assert.equal(w.balls[0].captured, true);

  // 远球不进
  const w2 = createWorld({ w: 800, h: 600 });
  w2.holes.push({ x: 200, y: 200, r: 30 });
  w2.balls.push(makeBall('b', 200, 260, 10)); // 距 60 > 18
  checkHoleCaptures(w2);
  assert.equal(w2.balls[0].captured, false);
});

// 6. 低速停止
test('stop: below stopThreshold velocity becomes zero', () => {
  const w = createWorld({ w: 800, h: 600, walls: false });
  w.balls.push(makeBall('a', 100, 100, 10, 0.001, 0));
  for (let i = 0; i < 10; i++) step(w);
  assert.equal(w.balls[0].vx, 0);
});

// 7. 瞄准轨迹：朝洞发射能到达洞附近
test('trajectory: aiming at hole reaches capture zone', () => {
  const w = createWorld({ w: 800, h: 600 });
  w.holes.push({ x: 500, y: 300, r: 30 });
  w.balls.push(makeBall('a', 100, 300, 10));
  const path = simulateTrajectory(w, 'a', 1, 0, 1, 200);
  const last = path[path.length - 1];
  const dist = Math.hypot(last.x - 500, last.y - 300);
  assert.ok(dist < 30, `trajectory reaches hole area (dist=${dist})`);
});

// 8. 全静止判定
test('allStopped: false while moving, true when stopped', () => {
  const w = createWorld({ w: 800, h: 600, walls: false });
  w.balls.push(makeBall('a', 100, 100, 10, 2, 0));
  assert.equal(allStopped(w), false);
  w.balls[0].vx = 0;
  assert.equal(allStopped(w), true);
});

// 9. 最大发射速度限制
test('launch: speed capped at maxLaunchSpeed', () => {
  const w = createWorld({ w: 800, h: 600 });
  w.balls.push(makeBall('a', 100, 100, 10));
  launch(w, 'a', 1, 0, 10); // power 10 > 1
  const speed = Math.hypot(w.balls[0].vx, w.balls[0].vy);
  assert.ok(Math.abs(speed - PHYS.maxLaunchSpeed) < 1e-9, `speed=${speed}`);
});

// 10. 障碍分离：撞静止障碍后不穿透
test('collision: static obstacle prevents penetration over many steps', () => {
  const w = createWorld({ w: 800, h: 600, walls: false });
  w.balls.push(makeBall('a', 80, 100, 10, 3, 0));
  w.obstacles.push({ x: 110, y: 100, r: 12 });
  for (let i = 0; i < 200; i++) step(w);
  const b = w.balls[0];
  const dist = Math.hypot(b.x - 110, b.y - 100);
  assert.ok(dist >= b.r + 12 - 0.5, `no deep penetration (dist=${dist})`);
});
