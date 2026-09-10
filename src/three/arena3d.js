// 3D 竞技场：圈 / 起始线 / 边界墙
// 从 2D 逻辑 RING / START_LINE 布局生成 3D 视觉
import * as THREE from '../../vendor/three/three.module.js';
import { WORLD_W, WORLD_H } from '../levels.js';
import { RING, START_LINE } from '../vs.js';
import { to3D } from './scene3d.js';

// 创建对战竞技场（圈 + 起始线）
export function createArena3D(scene) {
  const group = new THREE.Group();

  // ---- 圈（虚线圆）：用 LineLoop 画在 xz 平面 ----
  const ringPoints = [];
  const segs = 64;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const p = to3D(RING.cx + Math.cos(a) * RING.r, RING.cy + Math.sin(a) * RING.r, 0.05);
    ringPoints.push(new THREE.Vector3(p.x, p.y, p.z));
  }
  const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPoints);
  // 虚线效果：用 LineDashedMaterial
  const ringLine = new THREE.Line(
    ringGeo,
    new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 12, gapSize: 8, transparent: true, opacity: 0.85 })
  );
  ringLine.computeLineDistances();
  group.add(ringLine);

  // 圈内淡色地面（比地面略高，防 z-fighting）
  const ringFloor = new THREE.Mesh(
    new THREE.RingGeometry(RING.r - 2, RING.r + 2, 48),
    new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
  );
  ringFloor.rotation.x = -Math.PI / 2;
  const c = to3D(RING.cx, RING.cy, 0.04);
  ringFloor.position.set(c.x, c.y, c.z);
  group.add(ringFloor);

  // ---- 起始线（下方横线）：细长 Box ----
  const startLine = new THREE.Mesh(
    new THREE.BoxGeometry(WORLD_W - 80, 2, 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 })
  );
  const s = to3D(WORLD_W / 2, START_LINE.y, 0.06);
  startLine.position.set(s.x, s.y, s.z);
  group.add(startLine);

  // ---- 边界墙（防止珠子滚出视野 + 视觉框定）----
  const wallH = 40;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a4a38, roughness: 0.8, transparent: true, opacity: 0.35 });
  // 四面墙
  const walls = [
    { w: WORLD_W, d: 6, x: 0, z: -WORLD_H / 2 },          // 上
    { w: WORLD_W, d: 6, x: 0, z: WORLD_H / 2 },            // 下
    { w: 6, d: WORLD_H, x: -WORLD_W / 2, z: 0 },           // 左
    { w: 6, d: WORLD_H, x: WORLD_W / 2, z: 0 },            // 右
  ];
  for (const w of walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w.w, wallH, w.d), wallMat);
    wall.position.set(w.x, wallH / 2, w.z);
    group.add(wall);
  }

  scene.add(group);
  return group;
}
