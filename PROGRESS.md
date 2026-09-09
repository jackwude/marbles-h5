# 🎯 打弹珠（Marbles H5）— 项目进度

> **最后更新**：2026-09-09
> **当前版本**：v0.5.0（右下角徽章显示）
> **线上地址**：https://marbles-bws.pages.dev/
> **CF Pages 项目**：`marbles`（Production: main 分支，独立项目，不碰现有线上）

---

## 📌 项目一句话

童年「打弹珠·进洞」玩法的手机 H5 物理休闲闯关游戏，独立项目给其他用户玩。

## ✅ 已完成（全部上线）

### v0.1 — MVP 核心（2026-09-09）
- [x] 手写物理引擎（纯函数，Node 可单测）：摩擦衰减、边界反弹、圆-圆碰撞、进洞判定
- [x] 6 关单人闯关（老院子泥地/水泥台/土坡/石板路/巷口/排水沟）
- [x] 星级结算（剩≥2→★★★，剩1→★★，0→★）+ localStorage 存档
- [x] 皮肤解锁：透明珠（初始）→花纹珠（5星）→猫眼珠（12星）→钢珠（全关卡三星）
- [x] UI 流程：首页/选关/对局/结算/皮肤
- [x] CF Pages 部署（新项目 `marbles`，不覆盖现有项目）

### v0.2 — 交互优化（用户反馈）
- [x] **任意位置起手拖拽**（不再要求按住弹珠，解决边缘弹珠无法满力）
- [x] **去掉预测轨迹虚线**，改**短方向箭头 + 力度环**（保留"能否进洞"的判断乐趣）

### v0.3 — 手感三要素补全（对照 GDD §3.2/§6.3）
- [x] 碰撞音效"咚"+ 屏幕震动（Web Vibration API，按冲击力度分级）
- [x] 蓄力音效"呼~"渐强 + 滚动细碎声
- [x] 进洞下沉动画（缩小+下沉+淡出）
- [x] 结算星爆三连音"叮叮叮"
- [x] 环境音（知了/麻雀氛围，进入对局自动播放）
- [x] 首页开场一句话 + 标题楷体手写粉笔感
- [x] 修复钢珠皮肤永远不解锁 bug（改为全关卡三星判断）
- [x] 修复双 AudioContext（main/renderer 复用同一实例）

### v0.4 — 版本可视化（当前）
- [x] 右下角版本号徽章 + main.js 加 `?v=` 缓存参数
- [x] PROGRESS.md 项目进度文件（新会话快速接续）

### v0.5 — 策划完整度补全（对照 GDD 审查修正）
- [x] **关卡距离修正**：L3/L5/L6 原距离超满力（621/611/688px > 570px 极限）→ 重排到 380~602px，确保直射够得着，障碍只用于"绕行/穿缝"不"堵死"
- [x] **HUD 显示关卡场景名**（如"第 1 关 · 老院子泥地"）——怀旧氛围
- [x] **结算星爆动画**：每个★独立弹跳出现（0.15s 间隔）
- [x] **失败反馈丰富**：按距洞距离提示"就差一点/有点近了/太大力了"
- [x] **本关最佳成绩提示**：失败时显示"本关最佳：★★★（再试一次超越！）"
- [x] **关卡教学提示**：每关首次进关显示教学文案（2.6s 自动消失），补全"微调/穿缝"教学点
- [x] **首页环境音**：点击开始按钮即启动环境音氛围

## 🔬 技术架构

```
marbles-h5/
├── index.html          # 骨架 + 版本徽章
├── style.css           # 样式（移动端优先）
├── src/
│   ├── physics.js      # 物理引擎（纯函数，可单测）核心
│   ├── game.js         # 状态机（aim→rolling→settled/captured/out）
│   ├── levels.js       # 6 关 JSON 数据（关卡即数据，加关不改代码）
│   ├── skins.js        # 皮肤定义（4 款）
│   ├── render.js       # Canvas 绘制 + 输入 + 音效（GameAudio）
│   └── main.js         # UI 流程 + 存档 + 页面切换
├── test/               # node:test 单测（18 个，全绿）
└── PROGRESS.md         # 本文件
```

**关键设计**：
- 零依赖、零构建、零图片资源（美术全程序化 Canvas）
- 物理引擎纯函数化 → Node 单测覆盖
- 关卡 = JSON 数据，渲染/物理读同一份
- 输入：**反向拖拽拉弓式**（往目标反方向拖），任意位置起手

## 🧪 验证方式

```bash
cd ~/.hermes/workspace/projects/marbles-h5
npm test          # 18/18 单测全绿
python3 -m http.server 8099   # 本地预览
```

**浏览器实测**（CDP 脚本 /tmp/cdp_*.py）：
- 模拟触摸发射 → 进洞 → 星级结算 → 存档 → 解锁下一关
- 全 6 关可通关（L2 需绕障碍）

## 🚀 部署

```bash
cd ~/.hermes/workspace/projects/marbles-h5
npx wrangler pages deploy . --project-name marbles --branch main --commit-dirty=true
```

- **不覆盖现有项目**：hengan.indevs.in / debao.indevs.in 都是独立项目
- 部署后 curl 验证：`curl -sI https://marbles-bws.pages.dev/`

## 🔧 已知坑点（新会话必读）

1. **`this.audio` 必须初始化**：GameRenderer 构造时不传 audio 会 undefined，`audio.play('hole')` 抛异常导致 onCaptured 不触发（曾踩过，进洞无结算）。现在 main 传入共享实例。
2. **rAF 链防断**：`_loop` 里物理和绘制都包 try/catch，任何异常不阻断 rAF。
3. **物理参数**：`maxLaunchSpeed=9`（满力最远 ~570px），摩擦 0.985。改关卡距离要留满力余量。
4. **ES Module 缓存**：改 JS 必须同时改 `index.html` 里 `main.js?v=X` 版本号，否则用户浏览器用旧缓存（CF Pages 缓存 4h）。
5. **碰撞事件**：physics.step 每帧重置 `world.events`，renderer 消费后播音效/震动。碰撞在 `resolveCollisions` 里收集。

## 📋 待开发（GDD 路线图）

| 版本 | 内容 | 状态 |
|---|---|---|
| v1.1 | 双人对战（同屏轮流弹，撞出圈赢珠）——复用同一套物理 | ⏳ 未开始 |
| v1.2 | 更多关卡包（场景扩展）、"比远"挑战模式 | ⏳ 未开始 |
| v1.3 | 分享裂变（成绩卡片图）、好友 PK | ⏳ 未开始 |
| 远期 | 每日挑战（随机关卡）、排行榜 | ⏳ 未开始 |
| 待办 | 环境音效果待真机验证（Web Audio 合成知了声可能偏弱） | ⏳ |
| 待办 | 自定义域名 `marbles.indevs.in`（需 DNS 操作，用户确认后做） | ⏳ |

## 📁 关联文档

- `~/.hermes/workspace/docs/marbles-h5/marbles-h5-PLAN.md` — MVP 范围
- `~/.hermes/workspace/docs/marbles-h5/marbles-h5-GDD.md` — 游戏策划案
- `~/.hermes/workspace/docs/marbles-h5/marbles-h5-EXECUTION.md` — 开发方案
