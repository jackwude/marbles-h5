# 🎮 marbles-h5 → Three.js 3D 升级方案

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 把打弹珠从 Canvas 2D 升级为 Three.js 3D——斜 45° 视角、立体光影弹珠、3D 场景，同时**完整保留现有 2D 物理玩法与规则**（30 个单测全保）。

**Architecture:** 逻辑与渲染彻底分离。现有 `physics.js`（2D 物理）+ `vs.js`/`game.js`（规则状态机）**原样保留不动**，作为"逻辑层"。新增 Three.js 作为"渲染层"：把 2D 逻辑世界坐标（x,y）映射到 3D 场景地面（x,z），y 轴作为视觉高度（弹珠弹跳/滚动高度）。物理仍是 2D（俯视平面滚动天然是 2D 运动），Cannon.js 仅用于球体之间、球与地面的真实 3D 碰撞抬升（视觉增强，不承载玩法）。

**Tech Stack:**
- Three.js (r160+, ES Module via CDN importmap)
- Cannon-es（3D 物理，仅视觉碰撞抬升）
- 保留：现有 `physics.js`/`game.js`/`vs.js` 纯逻辑 + node:test 单测
- Cloudflare Pages 部署不变

---

## 核心决策

### 为什么保留 2D 物理？
- 现有规则（打倒赢珠 v2.1.1）全部建立在**2D 平面判定**（圆心距、出圈、圈内）上，逻辑已验证 30 测试全绿
- 俯视滚动游戏在斜视角下，**球的运动本质就是 2D 平面投影**——3D 引擎并不会让玩法更"真实"，只会更复杂
- 保留 2D 物理 = 规则零改动、单测全保、AI 决策零改动、可移植微信小程序（vs.js 纯逻辑）的路线不受影响

### Cannon.js 的边界（YAGNI）
- Cannon **只做**：球落地弹跳高度、球与球碰撞的轻微抬升（视觉厚度感）
- Cannon **不做**：玩法判定（出圈/得分/连打全在 2D 逻辑层）
- 理由：完整 3D 物理（滚动速度矢量、斜坡、旋转惯量）对俯视玩法是过度设计，且会引入"2D 逻辑 vs 3D 物理不同步"的 bug 源

### 版本路线（渐进，不一次性推翻）
| 阶段 | 内容 | 风险 |
|---|---|---|
| **P0** | Three.js 渲染层骨架 + 场景/相机/灯光 + 地面 | 低 |
| **P1** | 2D 逻辑 → 3D 渲染桥（坐标映射 + 同步） | 低 |
| **P2** | 3D 弹珠模型（材质/光影/滚动旋转） | 低 |
| **P3** | 圈/起始线/边界 3D 化 + 场景氛围（泥地/石板等皮肤） | 中 |
| **P4** | 输入适配（斜视角反向拖拽瞄准映射） | 中 |
| **P5** | 3D 化交互反馈（出圈飞入袋子动画、连打横幅、惩罚弹回） | 中 |
| **P6** | 全模式接入（闯关+对战）+ 真机性能验证 | 高 |

---

## 详细步骤

### Task 1: 搭建 Three.js 渲染层骨架

**Objective:** 新建 `src/three/` 目录 + 基础 Three.js 场景（相机/灯光/地面），页面能显示 3D 地面。

**Files:**
- Create: `src/three/scene.js` — 场景/相机/灯光/地面/环幕初始化
- Create: `src/three/bridge.js` — 2D 逻辑坐标 → 3D 场景坐标映射（核心桥）
- Create: `src/three/marbles3d.js` — 弹珠 3D 网格（球体+材质+滚动旋转）
- Modify: `index.html` — 引入 Three.js importmap + 挂载 3D canvas
- Modify: `style.css` — 3D canvas 样式

**Step 1: 桥接层坐标映射**

`src/three/bridge.js`:
```js
// 2D 逻辑世界 (0..WORLD_W, 0..WORLD_H) → 3D 场景 (以中心为原点, x→x, y→z)
export const MAP = {
  scale: 1,                    // 逻辑px → 3D单位（1:1 或缩放）
  originX: -WORLD_W / 2,       // 3D 场景 x 起点
  originZ: -WORLD_H / 2,       // 3D 场景 z 起点（2D 的 y 变成 3D 的 z）
};
export function to3D(x, y, h = 0) {
  return { x: originX + x * scale, y: h, z: originZ + y * scale };
}
export function to2D(v3) {
  return { x: (v3.x - originX) / scale, y: (v3.z - originZ) / scale };
}
```
- 2D 的 `y`（屏幕纵坐标）→ 3D 的 `z`；2D 的 `x` → 3D 的 `x`；3D 的 `y` 是**视觉高度**（弹珠弹跳用）
- 相机斜 45°：`camera.position.set(0, 高度, 距离)`, `camera.lookAt(0, 0, 0)` —— 俯视变斜视角

**Step 2: 场景初始化**

`src/three/scene.js`:
```js
import * as THREE from 'three';
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  // 斜 45° 相机（俯视改斜视角）
  const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 2000);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_W, WORLD_H),
    new THREE.MeshStandardMaterial({ color: 0x8a6d4f })  // 泥地色
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  // 灯光：主光 + 补光 + 环境光（弹珠立体感关键）
  scene.add(new THREE.DirectionalLight(0xffffff, 1.2));
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  return { renderer, scene, camera };
}
```

**Step 3: 验证**
- 本地 `python3 -m http.server 8080` 打开 → 能看到 3D 泥地地面 + 斜视角
- 无 JS 报错（浏览器 console）

**Step 4: Commit**
```bash
git add src/three/ index.html style.css
git commit -m "feat(3d): three.js render skeleton - scene/camera/light/ground"
```

---

### Task 2: 2D 逻辑 → 3D 渲染桥

**Objective:** 现有 `vs.js`/`game.js` 的逻辑跑起来，但渲染用 Three.js——每帧同步 2D 逻辑球的位置到 3D 网格。

**Files:**
- Create: `src/three/renderer3d.js` — 3D 渲染器类（替代 `render.js`/`vs-render.js` 的渲染部分）
- Modify: `src/main.js` — 按模式（闯关/对战）选择 2D 或 3D 渲染器

**Step 1: 渲染器主循环**

`src/three/renderer3d.js`:
```js
export class Renderer3D {
  constructor(canvas, logic, callbacks) {
    this.sceneKit = createScene(canvas);
    this.logic = logic;        // 现有 2D 逻辑对象（game 或 vsGame）
    this.balls = new Map();    // id → { mesh }
    this.callbacks = callbacks;
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }
  _sync() {
    for (const b of this.logic.world.balls) {
      const m = this._ball3d(b.id, b);
      m.position.set(...to3D(b.x, b.y, 0));  // 同步 2D 逻辑位置 → 3D
    }
  }
  _loop(t) {
    // 每帧：推进 2D 逻辑 → 同步到 3D → 渲染
    this.logicUpdate(this.logic);   // 复用现有 update 逻辑
    this._sync();
    this.sceneKit.renderer.render(this.sceneKit.scene, this.sceneKit.camera);
    requestAnimationFrame(this._loop);
  }
}
```

**Step 2: 逻辑更新复用**
- 闯关模式：直接调现有 `update(game, dt)`（`game.js`）
- 对战模式：调 `vsUpdate(vsGame, dt)`（`vs.js`）
- 规则、AI、得分全在 2D 逻辑层跑，渲染层只读位置——**零逻辑改动**

**Step 3: 验证**
- 单测不动（30 个仍全绿，因为逻辑没碰）
- 浏览器：弹珠能在 3D 地面滚动，位置与 2D 逻辑一致

**Step 4: Commit**
```bash
git commit -m "feat(3d): 2D logic → 3D render bridge, logic untouched"
```

---

### Task 3: 3D 弹珠模型（材质/光影/滚动旋转）

**Objective:** 弹珠从平面圆变成**立体玻璃珠**——有高光、阴影、滚动时表面图案旋转。

**Files:**
- Modify: `src/three/marbles3d.js`
- Modify: `src/three/renderer3d.js`（滚动旋转同步）

**Step 1: 玻璃材质弹珠**

```js
import * as THREE from 'three';
export function createMarbleMesh(style) {
  const group = new THREE.Group();
  // 球体（玻璃质感）
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(style.radius, 24, 24),
    new THREE.MeshPhysicalMaterial({
      color: style.baseColor,
      roughness: 0.15, metalness: 0.1, clearcoat: 1, transparent: true, opacity: 0.9,
    })
  );
  group.add(sphere);
  // 内部花纹（猫眼/条纹/星纹——复用现有 skins.js 样式定义）
  const inner = new THREE.Mesh(
    new THREE.SphereGeometry(style.radius * 0.8, 16, 16),
    new THREE.MeshStandardMaterial({ color: style.accentColor, wireframe: style.pattern === 'wire' })
  );
  group.add(inner);
  return group;
}
```

**Step 2: 滚动旋转**
- 每个 3D 球体挂一个 `userData.angle`（累计滚动角）
- 每帧 `angle += speed / radius`，绕滚动轴旋转 —— 让图案跟着滚（珠子"转起来"）

**Step 3: 验证**
- 弹珠有立体光影、滚动时内部花纹旋转
- 拖动/发射时旋转方向与运动方向一致

**Step 4: Commit**
```bash
git commit -m "feat(3d): realistic glass marbles with rolling rotation"
```

---

### Task 4: 圈/起始线/边界 3D 化 + 场景皮肤

**Objective:** 圈（虚线圆）、起始线、边界墙变成 3D 物体；场景按皮肤（泥地/石板/土坡）换材质。

**Files:**
- Create: `src/three/arena.js` — 3D 竞技场（圈/线/边界）
- Modify: `src/three/scene.js` — 皮肤切换
- Modify: `src/three/renderer3d.js`

**Step 1: 3D 圈 + 起始线**

```js
// 圈：用 LineLoop 或 圆环 RingGeometry 放在地面上
const ring = new THREE.Mesh(
  new THREE.RingGeometry(RING.r - 1, RING.r + 1, 48),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
);
ring.rotation.x = -Math.PI / 2;
ring.position.set(0, 0.02, ...);  // 略高于地面防 z-fighting

// 起始线：细长 Box
const startLine = new THREE.Mesh(
  new THREE.BoxGeometry(WORLD_W - 80, 2, 2),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })
);
```

**Step 2: 皮肤切换**
- 现有 `skins.js` 定义 4 款皮肤（泥地/水泥/石板/土坡）——把颜色/纹理映射到 3D 地面材质
- 泥地：`MeshStandardMaterial` 棕色 + 凹凸贴图（程序化噪声）
- 石板：灰色 + 更粗糙
- 对战场景：固定泥地/老院子

**Step 3: 验证**
- 3D 视角下圈、起始线清晰可辨，出圈判定与 2D 逻辑一致
- 切换皮肤时地面材质变化

**Step 4: Commit**
```bash
git commit -m "feat(3d): 3D arena (ring/start line/walls) + skin materials"
```

---

### Task 5: 输入适配（斜视角瞄准映射）

**Objective:** 斜 45° 视角下，手指拖拽反向瞄准的方向要正确映射到 2D 逻辑发射方向。

**Files:**
- Modify: `src/three/renderer3d.js`（输入处理）
- Modify: `src/three/bridge.js`（屏幕→世界坐标）

**Step 1: 屏幕坐标 → 3D 射线 → 地面交点**

```js
// pointer 屏幕坐标 → 3D 射线 → 地面 (y=0) 交点 → 2D 逻辑坐标
export function screenTo2D(renderer, camera, clientX, clientY) {
  const ndc = new THREE.Vector2(
    (clientX / innerWidth) * 2 - 1,
    -(clientY / innerHeight) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const point = new THREE.Vector3();
  raycaster.ray.intersectPlane(hit, point);
  return to2D(point);  // → {x, y} 2D 逻辑坐标
}
```

**Step 2: 反向拖拽发射**
- `pointerdown` 记录起始 2D 点
- `pointermove` 计算拖拽向量 `(dx, dy)` → **反向** `(-dx, -dy)` 作为发射方向（沿用现有拉弓手感）
- `pointerup` → 调 `fire(game, ...)` / `vsFire(vsGame, ...)`，力度 = 拖拽长度（沿用现有力度映射）

**Step 3: 验证**
- 斜视角下朝圈内拖拽 → 弹珠朝预期方向飞去
- 力度环/方向箭头（3D 化）跟随拖拽

**Step 4: Commit**
```bash
git commit -m "feat(3d): oblique-view aim mapping (screen ray → 2D logic)"
```

---

### Task 6: 3D 交互反馈

**Objective:** 把 2D 反馈升级为 3D——出圈飞入袋子动画、连打横幅、惩罚弹回。

**Files:**
- Modify: `src/three/renderer3d.js`
- Modify: `src/three/marbles3d.js`（动画）

**Step 1: 出圈飞入袋子（3D 动画）**
- 彩珠出圈 → 3D 网格沿弧线飞向积分板位置（抛物线轨迹）
- 复用现有 `lastShot.wonMarbles`（位置列表）触发

**Step 2: 反馈横幅**
- 复用现有反馈文案（「🎯 打中了！继续弹！」等）
- 用 CSS overlay（保留现有 DOM 横幅）——**不重新造轮子**，横幅仍是 HTML，只有弹珠/场景是 3D

**Step 3: 惩罚弹回（3D 动画）**
- 母珠停圈内 → 弹珠"弹跳"回起始线（3D y 轴上下起伏 + 位置移动）

**Step 4: 验证**
- 出圈珠子飞入袋子、连打横幅出现、惩罚弹回动画流畅
- 30 单测仍全绿（逻辑没动）

**Step 5: Commit**
```bash
git commit -m "feat(3d): 3D feedback - fly-to-pouch, penalty bounce, combo banner"
```

---

### Task 7: 全模式接入 + 真机性能验证

**Objective:** 闯关模式 + 对战模式都走 3D 渲染；手机真机验证性能。

**Files:**
- Modify: `src/main.js`（模式切换：2D/3D 渲染器二选一）
- Modify: `index.html`（版本号 `?v=` 升 v3.0.0）

**Step 1: 双渲染器并存**
- 首页/选关/结算等 UI 流程不变（仍 HTML/CSS）
- 对局页面：`main.js` 按需创建 3D 渲染器（或回退 2D——**低端机自动降级**）

**Step 2: 性能降级开关**
- `WebGL` 不可用 / 低端机 → 自动回退现有 Canvas 2D 渲染（游戏永远能玩）
- 检测：`!!document.createElement('canvas').getContext('webgl2')`

**Step 3: 真机验证**
- iPhone/Android 各测：帧率、发热、触控瞄准精度
- 目标：60fps；低于 30fps 或发热明显 → 降级 2D

**Step 4: 版本 + 部署**
```bash
sed -i '' 's/v2.1.1/v3.0.0/g' index.html
npx wrangler pages deploy . --project-name marbles --branch main --commit-dirty=true
```

**Step 5: Commit**
```bash
git commit -m "feat(3d): v3.0.0 full 3D with 2D fallback, perf validation"
```

---

## 验证策略

| 层 | 方式 |
|---|---|
| 2D 逻辑/规则 | **现有 30 单测不动，全保**（v3 必须仍 30/30） |
| 3D 桥接 | `bridge.js` 坐标映射单测（to3D/to2D 往返一致） |
| 3D 渲染 | 浏览器 CDP 实测（版本徽章/3D 场景/弹珠滚动/布局截图） |
| 真机 | 帧率监控 + 自动降级开关验证 |

## 风险与权衡

| 风险 | 缓解 |
|---|---|
| 3D 渲染 + 逻辑不同步（球位置漂移） | 每帧从 2D 逻辑**单向拉取**，3D 网格只读不写 |
| 低端机卡顿/发热 | WebGL 检测 + 自动降级 2D；像素比上限 2 |
| 斜视角瞄准不直观 | 拖拽方向映射严格测试 + 真机试玩反馈迭代 |
| 物理变 3D 后规则判定偏移 | **玩法判定留在 2D 逻辑层**，Cannon 只做视觉抬升 |
| 体积增大（Three ~600KB） | ES Module CDN + 缓存；仅在需要 3D 时动态加载 |

## 开放问题（实现前需拍板）

1. **Cannon.js 要不要**：完整 3D 物理（球体滚动+碰撞抬升）还是纯 Three.js 渲染（无 3D 物理，球贴地滚动）？→ 建议**要 Cannon 但仅视觉**，更真实
2. **皮肤范围**：闯关 6 关全 3D 化，还是先只做对战模式 3D 化（泥地）？→ 建议**先对战模式**，闯关后补
3. **性能底线**：目标 60fps，低于多少 fps 降级 2D？→ 建议 30fps
4. **Three.js 引入方式**：CDN importmap（零构建）还是 npm 打包？→ 建议 **CDN importmap**（保持零构建约定）
