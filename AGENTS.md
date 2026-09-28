# marbles-h5 打弹珠 · Agent 约定

- 简介：H5 Canvas 打弹珠小游戏，闯关 + 圈内对战 AI 双模式
- 技术栈：原生 JS Canvas + ES Modules，Node 内置 test runner
- 线上：https://marbles-bws.pages.dev
- GitHub：https://github.com/jackwude/marbles-h5（public）
- 路径：`~/.hermes/workspace/projects/marbles-h5`
- 进度：`PROGRESS.md`（模块地图 + 版本历史）

## 命令

- 测试：`npm test`（node --test test/*.test.js，须显式 glob —— 旧写法 `node --test test/` 在 Node 22+ 被当模块路径解析直接报错）
- 本地预览：`python3 -m http.server 8080`（ES Modules 需 HTTP，不能用 file://）
- 部署：Cloudflare Pages（wrangler pages deploy .）

## 代码结构

- `index.html`：入口
- `src/`：模块源码（按功能域拆）
- `test/`：测试
- `style.css`：样式

## 关键约定

- 物理逻辑先写测试（TDD），CDP 实测交互
- rAF 循环注意避免碰撞 NaN
- 后续方向：微信小程序邀请对战（用户已明确）
- 版本号随 PROGRESS.md 维护（v0.6.x）

## 开发日志

- 2026-09-09：补建 AGENTS.md（dev-agents-md 规范）
