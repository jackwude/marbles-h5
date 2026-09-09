# 打弹珠 (Marbles H5)

童年「打弹珠·进洞」玩法的手机 H5 小游戏。零依赖、零构建、零图片资源（全程序化美术）。

## 运行

```bash
# 本地预览
python3 -m http.server 8080
# 打开 http://localhost:8080
```

## 测试

```bash
npm test   # node --test test/ 物理引擎 + 状态机单测
```

## 结构

```
index.html        # 页面骨架
style.css         # 样式（移动端优先）
src/physics.js    # 物理引擎（纯函数，可单测）
src/game.js       # 游戏状态机（纯逻辑，可单测）
src/levels.js     # 6 关关卡数据（JSON）
src/skins.js      # 弹珠皮肤定义
src/render.js     # Canvas 渲染 + 输入 + 音效
src/main.js       # UI 流程 + 存档
test/             # 单测（node:test）
```

## 玩法

- 按住弹珠向目标**反方向**拖拽（拉弓式），力度 = 拖拽距离
- 松手发射，用有限次数把弹珠送进洞
- 剩余次数越多，星级越高（剩≥2：★★★，剩1：★★，0：★）
- 累计星级解锁皮肤：透明珠 → 花纹珠 → 猫眼珠 → 钢珠
