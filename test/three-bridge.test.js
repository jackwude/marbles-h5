// 3D 桥接层坐标映射测试
// to3D/to2D 往返一致性 + 布局关键点
import { test } from 'node:test';
import assert from 'node:assert';
import { to3D, to2D } from '../src/three/scene3d.js';
import { WORLD_W, WORLD_H } from '../src/levels.js';

test('3D: to3D/to2D 往返一致（逻辑坐标 → 3D → 逻辑坐标）', () => {
  const pts = [
    [0, 0], [WORLD_W / 2, WORLD_H / 2], [WORLD_W, WORLD_H],
    [120, 510], [300, 228], [100, 400],
  ];
  for (const [x, y] of pts) {
    const v3 = to3D(x, y, 0);
    const back = to2D(v3.x, v3.z);
    assert.ok(Math.abs(back.x - x) < 0.001, `x 往返: ${back.x} ≈ ${x}`);
    assert.ok(Math.abs(back.y - y) < 0.001, `y 往返: ${back.y} ≈ ${y}`);
  }
});

test('3D: 逻辑原点 (0,0) 映射到 3D 中心偏移（负坐标）', () => {
  const v = to3D(0, 0, 0);
  assert.strictEqual(v.x, -WORLD_W / 2, 'x 原点 = -W/2');
  assert.strictEqual(v.z, -WORLD_H / 2, 'z 原点 = -H/2');
});

test('3D: 逻辑中心映射到 3D 原点', () => {
  const v = to3D(WORLD_W / 2, WORLD_H / 2, 0);
  assert.ok(Math.abs(v.x) < 0.001, '中心 x ≈ 0');
  assert.ok(Math.abs(v.z) < 0.001, '中心 z ≈ 0');
});

test('3D: 高度参数独立于 x/z（弹跳高度用）', () => {
  const v = to3D(100, 200, 30);
  assert.strictEqual(v.y, 30, '高度 y = 传入值');
});

test('3D: 母珠起始线位置（下方）映射合理', () => {
  // 玩家母珠起始线 TAW_START.player = { x: W*0.3, y: START_LINE.y = H-90 }
  const player = to3D(WORLD_W * 0.3, WORLD_H - 90, 0);
  assert.ok(player.z > 0, '起始线在 3D z 正方向（屏幕下方）');
  assert.ok(player.x < 0, '玩家在 3D x 负方向（左侧）');
});
