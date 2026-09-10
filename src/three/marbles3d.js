// 3D 弹珠模型：玻璃质感球体 + 内部花纹 + 滚动旋转
// 支持多种样式（复用 skins.js 的定义思路）
import * as THREE from '../../vendor/three/three.module.js';

// 把 2D 皮肤颜色 → 3D 材质
// style: { base, highlight, shadow, name }
// 返回 THREE.Group（含外层玻璃球 + 内部花纹球）
export function createMarble3D(style, radius) {
  const group = new THREE.Group();

  // 外层：玻璃质感球
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 24),
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(style.base || 0xffffff),
      roughness: 0.18,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      transparent: true,
      opacity: 0.92,
      envMapIntensity: 0.6,
    })
  );
  glass.castShadow = true;
  group.add(glass);

  // 内部花纹球（略小，透过玻璃可见）——营造"玻璃珠内有花色"的怀旧感
  const inner = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.72, 16, 16),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(style.highlight || 0x88ccff),
      roughness: 0.4,
      metalness: 0.1,
    })
  );
  inner.castShadow = true;
  group.add(inner);

  // 高光点（玻璃珠反光）
  const spec = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.25, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
  );
  spec.position.set(radius * 0.35, radius * 0.35, radius * 0.35);
  group.add(spec);

  group.userData.angle = 0;       // 累计滚动角
  group.userData.axis = new THREE.Vector3(0, 0, 1); // 滚动轴（每帧按运动方向更新）

  return group;
}

// 更新弹珠滚动：根据速度方向旋转内部/整体
// mesh: THREE.Group, vx/vy: 2D 逻辑速度
export function updateMarbleRoll(mesh, vx, vy, radius) {
  const speed = Math.hypot(vx, vy);
  if (speed < 0.02) return;
  // 滚动轴 = 垂直于运动方向的水平轴（2D 平面上）
  // 运动方向 (vx, vy) → 3D 中运动方向 (vx, -vy)（2D y 向下，3D z 向上）
  const mvx = vx, mvz = -vy;
  const len = Math.hypot(mvx, mvz);
  if (len < 0.001) return;
  // 滚动轴 = 运动方向旋转 90°（在水平面上垂直）
  const ax = -mvz / len, az = mvx / len;
  // 角速度 = 线速度 / 半径
  const omega = speed / radius;
  mesh.userData.angle += omega;
  // 应用旋转：绕滚动轴旋转，但需要把轴先摆到局部空间——用 quaternion
  const axis = new THREE.Vector3(ax, 0, az).normalize();
  const q = new THREE.Quaternion().setFromAxisAngle(axis, mesh.userData.angle);
  mesh.quaternion.copy(q);
}
