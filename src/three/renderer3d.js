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
    // 瞄准指示器（力度环 + 方向箭头）
    this._createAimGuide();
    this._updateAimGuide();
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

  // ---- 瞄准指示器（力度环 + 方向箭头，替代 2D 的 _drawAim）----
  _createAimGuide() {
    if (this._aimGuide) return;
    const group = new THREE.Group();

    // 力度环：圆弧（RingGeometry 扇形，thetaLength 随 power）
    const ringGeo = new THREE.RingGeometry(0.9, 1.0, 48, 1, 0, Math.PI * 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 2; // 略高于地面
    this.scene.add(ring); // 力度环独立于组（不随箭头旋转，固定起点 +x）
    this._ring = ring;

    // 方向箭头组：独立旋转（复用开头的 group）
    this._arrowGroup = group;
    this.scene.add(group);

    // 方向箭头：用 Mesh（平面三角）代替 Line —— Line 在 3D 里太细看不见
    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    // 箭头杆：细长矩形（长 1，宽 0.35）
    const shaftGeo = new THREE.PlaneGeometry(1, 0.35);
    const shaft = new THREE.Mesh(shaftGeo, arrowMat);
    shaft.position.x = 0.5; // 中心在 0.5（从母珠边缘到箭头头）
    group.add(shaft);
    this._arrowShaft = shaft;

    // 箭头头：三角锥（朝 +x）
    const headGeo = new THREE.ConeGeometry(0.55, 0.9, 8);
    const head = new THREE.Mesh(headGeo, arrowMat);
    head.rotation.x = Math.PI / 2; // 平躺朝 +x
    head.position.x = 1.2;
    group.add(head);
    this._arrowHead = head;

    this._aimGuide = group;
    this.scene.add(group);
    this._aimGuideHidden = true;
    return group;
  }

  _updateAimGuide() {
    if (!this._aimGuide) return;
    const g = this.logic;
    const isAim = this.mode === 'vs'
      ? g.state === 'player_aim'
      : g.state === 'aim';
    const power = g.power || 0;

    // 仅玩家瞄准时显示
    if (!isAim || power <= 0.02) {
      if (!this._aimGuideHidden) {
        this._aimGuide.visible = false;
        this._ring.visible = false;
        this._aimGuideHidden = true;
      }
      return;
    }

    // 定位到母珠（对战：player_taw；闯关：player）
    const tawId = this.mode === 'vs' ? 'player_taw' : 'player';
    const ball = ((g.world && g.world.balls) || []).find((b) => b.id === tawId);
    if (!ball) return;

    const p = to3D(ball.x, ball.y, 2);
    this._aimGuide.position.set(p.x, p.y, p.z);
    this._ring.position.set(p.x, p.y, p.z);

    // 力度环：圆弧比例 = power（thetaLength = power * 2π，类似 2D 的 arc）
    // 起点固定 +x（不随箭头旋转），半径固定 = 母珠外 8px
    const theta = Math.max(0.05, Math.min(1, power)) * Math.PI * 2;
    const r = ball.r + 8;
    this._ring.geometry.dispose();
    this._ring.geometry = new THREE.RingGeometry(r - 4, r, 48, 1, 0, theta);
    this._ring.scale.set(1, 1, 1);
    this._ring.visible = true;

    // 方向箭头：沿 aimDir 旋转（箭头组独立旋转，力度环固定）
    // 2D aimDir 是 (x, y) 单位向量，y 负方向 = 向上（朝圈）
    // 3D 映射：2D x → 3D x；2D y → 3D z（y 增大 = z 增大 = 靠近相机）
    //   → 2D "上"（y 减） = 3D -z（远离相机） = 朝圈方向
    const dir = g.aimDir || { x: 0, y: -1 };
    const dir3 = { x: dir.x, z: dir.y };
    // 箭头线几何朝 +x，绕 Y 旋转 ang 后 +x → (cos, 0, -sin)。
    // 要让 +x 指向 dir3，需 rotation.y = -atan2(dir3.z, dir3.x)
    const ang = Math.atan2(dir3.z, dir3.x);
    this._aimGuide.rotation.y = -ang;

    // 箭头长度随 power
    const len = (ball.r * 2.2) * Math.max(0.1, power); // 约 28 逻辑单位
    // shaft 几何长 1 宽 0.35：scale.x = len（拉长），scale.y = 10（宽 → 3.5）
    this._arrowShaft.scale.set(len, 10, 1);
    // 箭头头：放大 5 倍（半径 2.75，长 4.5），放在杆末端
    this._arrowHead.scale.setScalar(5);
    this._arrowHead.position.x = len;

    this._aimGuide.visible = true;
    this._aimGuideHidden = false;
  }
}
