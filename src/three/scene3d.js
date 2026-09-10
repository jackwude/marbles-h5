// 3D 渲染层 - 场景/相机/灯光/地面初始化
// Three.js r160 (ES Module, 本地 vendor)
import * as THREE from '../../vendor/three/three.module.js';
import { WORLD_W, WORLD_H } from '../levels.js';

// 世界逻辑尺寸（2D 逻辑坐标范围）
// 2D: x ∈ [0, WORLD_W], y ∈ [0, WORLD_H]
// 3D: 地面平面在 y=0, x ∈ [-W/2, W/2], z ∈ [-H/2, H/2]
// 映射: 2D (x, y) → 3D (x - W/2, 0, y - H/2)   （2D 的 y 变成 3D 的 z）

export function to3D(x, y, h = 0) {
  return { x: x - WORLD_W / 2, y: h, z: y - WORLD_H / 2 };
}

export function to2D(vx, vz) {
  return { x: vx + WORLD_W / 2, y: vz + WORLD_H / 2 };
}

// 创建 3D 场景
export function createScene3D(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x3a2f22); // 暗色背景（突出弹珠）

  // 斜 45° 相机：从上方斜看地面（俯视改斜视角）
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000);
  camera.position.set(0, 950, 950); // 斜上方
  camera.lookAt(0, 0, 0);

  // 灯光：主光（方向光，产生阴影）+ 补光 + 环境光
  const dirLight = new THREE.DirectionalLight(0xfff5e0, 1.6);
  dirLight.position.set(300, 700, 400);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0x88aaff, 0.5);
  fillLight.position.set(-300, 400, -300);
  scene.add(fillLight);

  const ambient = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambient);

  // 地面（泥地色）
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_W, WORLD_H),
    new THREE.MeshStandardMaterial({ color: 0x8a6d4f, roughness: 0.9, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  return { renderer, scene, camera, ground };
}
