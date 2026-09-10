// 3D 渲染器：把 2D 逻辑（game.js / vs.js）桥接到 Three.js 场景
// 核心原则：每帧从 2D 逻辑单向拉取位置 → 同步到 3D 网格，3D 只读不写逻辑
import * as THREE from '../../vendor/three/three.module.js';
import { createScene3D, to3D, to2D } from './scene3d.js';
import { createMarble3D, updateMarbleRoll } from './marbles3d.js';
import { createArena3D } from './arena3d.js';
import { SKINS } from '../skins.js';

const MARBLE_R = 11;   // 彩珠半径（逻辑）
const TAW_R = 13;      // 母珠半径（逻辑）

export class Renderer3D {
  constructor(canvas, logic, opts = {}) {
    this.logic = logic;
    this.opts = opts;
    this.mode = opts.mode || 'vs'; // 'vs' | 'level'
    this.meshMap = new Map();      // ballId → { group }

    this.sceneKit = createScene3D(canvas);
    this.scene = this.sceneKit.scene;
    this.camera = this.sceneKit.camera;
    this.renderer = this.sceneKit.renderer;

    // 竞技场（对战模式有圈+起始线；闯关模式画洞）
    if (this.mode === 'vs') {
      this.arena = createArena3D(this.scene);
    }

    // 同步尺寸
    this._resize();
    window.addEventListener('resize', () => this._resize());

    // 输入（斜视角拖拽瞄准）
    this._bindInput(canvas);

    this._lastTime = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _resize() {
    const w = this.renderer.domElement.clientWidth || window.innerWidth;
    const h = this.renderer.domElement.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---- 弹珠网格管理 ----
  _getMesh(ball) {
    let entry = this.meshMap.get(ball.id);
    if (!entry) {
      const isTaw = ball.id.includes('taw');
      let style;
      if (isTaw) {
        // 对战：玩家红 / AI 蓝
        style = ball.id.includes('player')
          ? { base: 0xdd3333, highlight: 0xffffff, shadow: 0x000000 }
          : { base: 0x3366cc, highlight: 0xffffff, shadow: 0x000000 };
      } else if (this.opts.mode === 'vs') {
        // 对战彩珠：8 种彩色样式（与 2D MARBLE_STYLES 配色一致）
        const vsColors = [
          { base: 0xe74c3c, highlight: 0xffa5a5 },  // 红
          { base: 0xff8800, highlight: 0xffd0a0 },  // 橙
          { base: 0x2ecc71, highlight: 0xa8f0c8 },  // 绿
          { base: 0x3498db, highlight: 0xa8d8f0 },  // 蓝
          { base: 0x9b59b6, highlight: 0xd8b0e8 },  // 紫
          { base: 0xf1c40f, highlight: 0xffe880 },  // 黄
          { base: 0x1abc9c, highlight: 0xa8f0e8 },  // 青
          { base: 0xe84393, highlight: 0xffb0d8 },  // 粉
        ];
        const idx = parseInt(ball.id.slice(1), 10) % vsColors.length;
        style = { base: vsColors[idx].base, highlight: vsColors[idx].highlight, shadow: 0x333333 };
      } else {
        // 闯关：当前皮肤（rgba 字符串 → 数字色）
        const skin = SKINS[this.opts.skinId] || SKINS.transparent;
        style = {
          base: this._rgbaToHex(skin.base) || 0xffffff,
          highlight: this._rgbaToHex(skin.highlight) || 0x88ccff,
          shadow: this._rgbaToHex(skin.shadow) || 0x333333,
        };
      }
      const group = createMarble3D(style, ball.r || MARBLE_R);
      this.scene.add(group);
      entry = { group };
      this.meshMap.set(ball.id, entry);
    }
    return entry;
  }

  // 'rgba(r,g,b,a)' → 0xRRGGBB
  _rgbaToHex(rgba) {
    if (typeof rgba !== 'string') return null;
    const m = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return null;
    return (parseInt(m[1]) << 16) | (parseInt(m[2]) << 8) | parseInt(m[3]);
  }

  // ---- 每帧：同步 2D 逻辑 → 3D ----
  _sync() {
    const balls = this.logic.world.balls;
    for (const b of balls) {
      const { group } = this._getMesh(b);
      // 动画中的珠子跳过同步（由 _updateFlyAnim 控制位置）
      if (this._flyQueue && this._flyQueue.some((f) => f.id === b.id)) continue;
      const p = to3D(b.x, b.y, 0);
      group.position.set(p.x, p.y, p.z);
      // 滚动旋转
      updateMarbleRoll(group, b.vx, b.vy, b.r || MARBLE_R);
    }
  }

  // ---- 主循环：推进逻辑 → 同步 → 渲染 ----
  _loop(t) {
    requestAnimationFrame(this._loop);
    // dt 帧归一化（60fps → 1），匹配物理引擎按"帧"设计（与 2D render.js 一致）
    const dt = Math.min((t - this._lastTime) / 16.67, 2);
    this._lastTime = t;
    // 推进 2D 逻辑（复用现有 game.js / vs.js 的 update）
    if (this.opts.logicUpdate) {
      this.opts.logicUpdate(this.logic, dt);
    }
    this._sync();
    this._updateFlyAnim(dt);
    this.renderer.render(this.scene, this.camera);
  }

  // ---- 出圈彩珠"飞入袋子"3D 动画 ----
  // 监听 lastShot.wonMarbles：赢走的彩珠沿抛物线飞向屏幕上方（袋子区域）
  _updateFlyAnim(dt) {
    // 初始化动画队列（从 lastShot 读取一次）
    if (!this._flyQueue && this.opts.mode === 'vs' && this.logic.lastShot && this.logic.lastShot.wonMarbles && this.logic.lastShot.wonMarbles.length) {
      this._flyQueue = this.logic.lastShot.wonMarbles.map((w) => ({
        id: w.id,
        start: to3D(w.x, w.y, 0),
        t: 0,
        dur: 30, // 30 帧 ≈ 0.5 秒
      }));
      this.logic.lastShot.wonMarbles = []; // 消费掉，防重复
    }
    if (!this._flyQueue) return;
    // 推进动画
    const done = [];
    for (const f of this._flyQueue) {
      f.t += dt;
      const k = Math.min(f.t / f.dur, 1);
      const entry = this.meshMap.get(f.id);
      if (entry) {
        // 抛物线：起点 → 终点（圈上方屏幕中心），高度隆起
        const end = to3D(this.logic.world ? 400 : 400, -50, 0); // 世界中心偏上
        const x = f.start.x + (end.x - f.start.x) * k;
        const z = f.start.z + (end.z - f.start.z) * k;
        const y = Math.sin(k * Math.PI) * 60; // 抛物线拱起
        entry.group.position.set(x, y, z);
        entry.group.scale.setScalar(1 - k * 0.6); // 缩小飞远
      }
      if (k >= 1) done.push(f);
    }
    this._flyQueue = this._flyQueue.filter((f) => !done.includes(f));
    if (this._flyQueue.length === 0) this._flyQueue = null;
  }

  // ---- 输入：斜视角拖拽瞄准 ----
  _bindInput(canvas) {
    this._dragging = false;
    this._start = null;

    canvas.addEventListener('pointerdown', (e) => {
      if (this.opts.onPointerDown && !this.opts.onPointerDown()) return; // 返回 false 阻止（如教学条显示中）
      this._dragging = true;
      this._start = { x: e.clientX, y: e.clientY }; // 屏幕坐标（与 2D 手感一致）
      if (this.opts.onAimStart) this.opts.onAimStart(this._start);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this._dragging) return;
      const pt = { x: e.clientX, y: e.clientY };
      if (this.opts.onAim) this.opts.onAim(this._start, pt);
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!this._dragging) return;
      this._dragging = false;
      const pt = { x: e.clientX, y: e.clientY };
      if (this.opts.onAimEnd) this.opts.onAimEnd(this._start, pt);
    });
    canvas.addEventListener('pointercancel', () => { this._dragging = false; });
    // 防滚动/缩放
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  // 屏幕坐标 → 3D 射线 → 地面交点 → 2D 逻辑坐标
  _screenTo2D(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    const ndc = new THREE.Vector2(ndcX, ndcY);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, point);
    return to2D(point.x, point.z);
  }

  destroy() {
    this.meshMap.forEach(({ group }) => this.scene.remove(group));
    this.meshMap.clear();
    this.renderer.dispose();
  }
}
