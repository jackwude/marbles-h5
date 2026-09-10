// 入口：UI 流程 + 存档 + 页面切换
import { createGame, GameState, starsFor, restart } from './game.js';
import { LEVELS } from './levels.js';
import { GameRenderer, GameAudio } from './render.js';
import { SKINS, SKIN_ORDER } from './skins.js';
import { createVsGame, vsRestart, VsState } from './vs.js';
import { VsRenderer } from './vs-render.js';
import { GameRenderer3D, VsRenderer3D, shouldUse3D } from './three/adapters3d.js';
import { preloadMarbleTextures } from './marble-textures.js';

// 3D 渲染开关：默认 2D，仅 `?3d=1` 显式启用（v3.1.0 回归 2D 默认）
const USE_3D = new URLSearchParams(location.search).get('3d') === '1' && shouldUse3D();
console.log(`[marbles] renderer: ${USE_3D ? '3D (Three.js)' : '2D (Canvas)'}`);

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'marbles-h5-save-v1';

// ===== 存档 =====
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; }
}
function saveSave(s) { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); }

let save = loadSave();
if (!save.stars) save.stars = {};        // {levelId: stars}
if (!save.unlocked) save.unlocked = 1;   // 解锁到第几关
if (!save.skin) save.skin = 'transparent';
if (!save.totalStars) save.totalStars = 0;

function persist() {
  save.totalStars = Object.values(save.stars).reduce((a, b) => a + b, 0);
  saveSave(save);
}

// ===== 页面切换 =====
const screens = {};
function show(id) {
  Object.keys(screens).forEach((k) => screens[k].classList.add('hidden'));
  screens[id].classList.remove('hidden');
}
['home', 'levels', 'skins', 'game', 'vs'].forEach((id) => screens[id] = $(`screen-${id}`));

// ===== 选关网格 =====
function buildLevelGrid() {
  const grid = $('level-grid');
  grid.innerHTML = '';
  LEVELS.forEach((lv) => {
    const cell = document.createElement('div');
    cell.className = 'level-cell' + (lv.id > save.unlocked ? ' locked' : '');
    cell.innerHTML = `<span>${lv.id}</span><span class="star">${'★'.repeat(save.stars[lv.id] || 0)}</span>`;
    cell.onclick = () => {
      if (lv.id <= save.unlocked) startLevel(lv.id);
    };
    grid.appendChild(cell);
  });
}

// ===== 皮肤 =====
function buildSkins() {
  const list = $('skin-list');
  list.innerHTML = '';
  SKIN_ORDER.forEach((id) => {
    const s = SKINS[id];
    // 钢珠特殊：全关卡三星（且全部解锁）
    let unlocked;
    if (id === 'steel') {
      unlocked = LEVELS.length > 0 && LEVELS.every((lv) => save.stars[lv.id] === 3) && save.unlocked >= LEVELS.length;
    } else {
      unlocked = s.unlockStars <= save.totalStars;
    }
    const item = document.createElement('div');
    item.className = 'skin-item' + (save.skin === id ? ' selected' : '') + (unlocked ? '' : ' locked');
    const dot = document.createElement('div');
    dot.className = 'skin-dot';
    dot.style.background = `radial-gradient(circle at 35% 35%, ${s.highlight}, ${s.base} 40%, ${s.shadow})`;
    const info = document.createElement('div');
    info.style.flex = '1';
    info.innerHTML = `<div class="skin-name">${s.name}</div><div class="skin-hint">${unlocked ? s.hint : '🔒 ' + s.hint}</div>`;
    item.appendChild(dot);
    item.appendChild(info);
    item.onclick = () => {
      if (!unlocked) return;
      save.skin = id;
      persist();
      buildSkins();
    };
    list.appendChild(item);
  });
}

// ===== 对局 =====
let renderer = null;
let audio = null;
let currentLevelId = 1;

function startLevel(levelId) {
  currentLevelId = levelId;
  const game = createGame(levelId);
  if (!audio) audio = new GameAudio();
  audio.startAmbience(); // 环境音（知了/麻雀氛围）
  if (renderer) { renderer.game = game; if (renderer._stateChanged) renderer._stateChanged(); }
  else {
    if (USE_3D) {
      renderer = new GameRenderer3D($('game-canvas'), game, {
        skin: () => save.skin,
        onCaptured: (g) => onCaptured(g),
        onOut: (g) => onOut(g),
        onStateChange: (g) => updateHUD(g),
      }, audio);
    } else {
      renderer = new GameRenderer($('game-canvas'), game, {
        skin: () => save.skin,
        onCaptured: (g) => onCaptured(g),
        onOut: (g) => onOut(g),
        onStateChange: (g) => updateHUD(g),
      }, audio); // 复用同一个 GameAudio，避免双 AudioContext
    }
  }
  window.__renderer = renderer; // 调试用
  window.__game = game;
  updateHUD(game);
  $('game-overlay').classList.add('hidden');
  showTipForLevel(levelId);
  show('game');
}

// 关卡教学提示（首次进关显示）
const LEVEL_TIPS = {
  1: '按住屏幕往反方向拖拽蓄力，松手发射！',
  2: '障碍会挡路——换个角度绕过去！',
  3: '距离变远了，试试更大的力度！',
  4: '两个障碍中间有缝，借反弹穿过去！',
  5: '洞被围住了，斜着打 + 微调角度！',
  6: '多障碍 + 远距离，综合考验！',
};
function showTipForLevel(levelId) {
  const tip = $('game-tip');
  const text = $('game-tip-text');
  text.textContent = LEVEL_TIPS[levelId] || '';
  tip.classList.remove('hidden');
  clearTimeout(tip._timer);
  tip._timer = setTimeout(() => tip.classList.add('hidden'), 2600);
}

function updateHUD(g) {
  $('hud-level').textContent = `第 ${g.level.id} 关 · ${g.level.name}`;
  $('hud-shots').textContent = g.state === GameState.CAPTURED ? '进洞！' : `剩余 ${g.maxShots - g.shotsUsed} 次`;
}

function onCaptured(g) {
  console.log('[marbles] onCaptured called, level', g.level.id);
  const stars = starsFor(g);
  console.log('[marbles] stars:', stars);
  // 存档
  const prev = save.stars[g.level.id] || 0;
  save.stars[g.level.id] = Math.max(prev, stars);
  if (g.level.id + 1 > save.unlocked && g.level.id < LEVELS.length) save.unlocked = g.level.id + 1;
  persist();
  // 结算 UI
  $('result-title').textContent = '进洞！';
  // 星爆动画：每个★独立弹跳出现
  const starsEl = $('result-stars');
  starsEl.innerHTML = '';
  for (let i = 0; i < stars; i++) {
    const s = document.createElement('span');
    s.className = 'star-pop';
    s.textContent = '★';
    s.style.animationDelay = `${i * 0.15}s`;
    starsEl.appendChild(s);
  }
  const next = LEVELS.find((l) => l.id === g.level.id + 1);
  $('btn-next').style.display = next ? 'block' : 'none';
  $('btn-next').textContent = next ? `下一关（第 ${next.id} 关）` : '';
  $('game-overlay').classList.remove('hidden');
  audio.play('star');
}

function onOut(g) {
  // 根据弹珠距洞多远给不同提示
  const b = g.world.balls[0];
  const hole = g.world.holes[0];
  const dist = Math.hypot(b.x - hole.x, b.y - hole.y);
  let msg = '没进洞…';
  if (dist < 80) msg = '就差一点！';
  else if (dist < 180) msg = '有点近了…';
  else if (dist > 400) msg = '太大力了！';
  $('result-title').textContent = msg;
  const starsEl = $('result-stars');
  starsEl.innerHTML = '';
  const s = document.createElement('span');
  s.textContent = '💧';
  starsEl.appendChild(s);
  // 本关最佳成绩提示
  const best = save.stars[g.level.id];
  if (best) {
    const hint = document.createElement('div');
    hint.className = 'best-hint';
    hint.textContent = `本关最佳：${'★'.repeat(best)}（再试一次超越！）`;
    starsEl.appendChild(hint);
  }
  $('btn-next').style.display = 'none';
  $('game-overlay').classList.remove('hidden');
}

// ===== 对战模式 =====
let vsRenderer = null;
let vsGame = null;
let vsAiLevel = 1;

function startVs(aiLevel = 1) {
  vsAiLevel = aiLevel;
  if (!audio) audio = new GameAudio();
  audio.startAmbience();
  preloadMarbleTextures(); // 预热弹珠 PNG 贴图（不阻塞，加载完自动生效）
  // 先显示对战屏，再取画布实际尺寸（hidden 时 clientWidth=0，会回退 window.innerWidth 导致世界比画布高）
  $('vs-overlay').classList.add('hidden');
  show('vs');
  // 竖屏自适应：用画布实际尺寸创建对战世界（铺满屏幕，圈最大化）
  requestAnimationFrame(() => {
    const canvas = $('vs-canvas');
    const cw = canvas.clientWidth || window.innerWidth;
    const ch = canvas.clientHeight || window.innerHeight;
    vsGame = createVsGame({ aiLevel, worldW: cw, worldH: ch });
    if (vsRenderer) { vsRenderer.game = vsGame; vsRenderer._gameOverNotified = false; }
    else {
      if (USE_3D) {
        vsRenderer = new VsRenderer3D($('vs-canvas'), vsGame, {
          onStateChange: (g) => updateVsHUD(g),
          onGameOver: (g) => onVsGameOver(g),
        }, audio);
      } else {
        vsRenderer = new VsRenderer($('vs-canvas'), vsGame, {
          onStateChange: (g) => updateVsHUD(g),
          onGameOver: (g) => onVsGameOver(g),
        }, audio);
      }
    }
    window.__vsGame = vsGame;
    window.__vsRenderer = vsRenderer;
    updateVsHUD(vsGame);
    showVsTutorial();
  });
}

// 显示对战规则教学条
function showVsTutorial() {
  const tut = $('vs-tutorial');
  if (!tut) return;
  tut.classList.remove('hidden');
  const dismiss = () => tut.classList.add('hidden');
  // 点击任意处关闭
  const onClick = () => { dismiss(); document.removeEventListener('pointerdown', onClick, true); };
  document.addEventListener('pointerdown', onClick, true);
  // 6 秒自动关闭
  clearTimeout(window.__vsTutTimer);
  window.__vsTutTimer = setTimeout(() => {
    dismiss();
    document.removeEventListener('pointerdown', onClick, true);
  }, 6000);
}

function updateVsHUD(g) {
  $('vs-count-player').textContent = g.scores.player;
  $('vs-count-ai').textContent = g.scores.ai;
  // 渲染袋子里的珠子（根据 owner 归属）
  renderPouch('player');
  renderPouch('ai');
  // 回合横幅
  const banner = $('vs-turn-banner');
  if (g.state === VsState.PLAYER_AIM) {
    banner.textContent = '轮到你了！拖拽瞄准';
    banner.classList.remove('vs-ai-turn');
  } else if (g.state === VsState.AI_AIM) {
    banner.textContent = 'AI 思考中…';
    banner.classList.add('vs-ai-turn');
  } else if (g.state === VsState.GAME_OVER) {
    banner.textContent = '';
  }
}

// 渲染一方袋子里的珠子（彩色小点，对应赢走的玻璃珠样式）
function renderPouch(side) {
  const marbles = vsGame.world.balls.filter((b) => b.id.startsWith('m') && b.owner === side);
  const el = $(`vs-marbles-${side}`);
  el.innerHTML = '';
  marbles.forEach((m) => {
    const dot = document.createElement('span');
    dot.className = 'vs-pouch-marble';
    // 用样式索引配色（与 vs-render MARBLE_STYLES 一致）
    const styleIdx = parseInt(m.id.slice(1), 10) % 8;
    const colors = ['#e74c3c', '#ff8800', '#2ecc71', '#3498db', '#9b59b6', '#f1c40f', '#1abc9c', '#e84393'];
    dot.style.background = colors[styleIdx];
    el.appendChild(dot);
  });
}

// 结算卡片袋子（玩家赢得的珠子）
function renderPouchResult(containerId) {
  if (!vsGame) return;
  const marbles = vsGame.world.balls.filter((b) => b.id.startsWith('m') && b.owner === 'player');
  const el = $(`vs-marbles-${containerId}`);
  if (!el) return;
  el.innerHTML = '';
  marbles.forEach((m) => {
    const dot = document.createElement('span');
    dot.className = 'vs-pouch-marble';
    const styleIdx = parseInt(m.id.slice(1), 10) % 8;
    const colors = ['#e74c3c', '#ff8800', '#2ecc71', '#3498db', '#9b59b6', '#f1c40f', '#1abc9c', '#e84393'];
    dot.style.background = colors[styleIdx];
    el.appendChild(dot);
  });
}

function onVsGameOver(g) {
  $('vs-overlay').classList.remove('hidden');
  const title = $('vs-result-title');
  const detail = $('vs-result-detail');
  if (g.winner === 'player') {
    title.textContent = '🎉 你赢了！';
    title.style.color = '#ffd27a';
  } else if (g.winner === 'ai') {
    title.textContent = '😤 AI 赢了';
    title.style.color = '#8ac4ff';
  } else {
    title.textContent = '🤝 平局';
    title.style.color = '#fff';
  }
  detail.innerHTML = `<div class="vs-score-line"><span class="vs-score vs-player">我 ${g.scores.player}</span> : <span class="vs-score vs-ai">AI ${g.scores.ai}</span></div>
    <div class="vs-result-sub">圈内彩珠已清空，${g.scores.player === g.scores.ai ? '平分秋色' : (g.scores.player > g.scores.ai ? '你赢走了更多弹珠！' : 'AI 赢走了更多弹珠…')}</div>`;
  // 结算卡片里的袋子快照（显示最终赢得的珠子）
  const pouchSnap = document.createElement('div');
  pouchSnap.className = 'vs-result-pouch';
  pouchSnap.innerHTML = `<div class="vs-pouch" id="vs-pouch-result"><span class="vs-pouch-label">我</span><span class="vs-pouch-count">${g.scores.player}</span><div class="vs-pouch-marbles" id="vs-marbles-result"></div></div>`;
  const detailEl = $('vs-result-detail');
  detailEl.appendChild(pouchSnap);
  renderPouchResult('result');
}

// ===== 事件绑定 =====
$('btn-start').onclick = () => { buildLevelGrid(); show('levels'); if (!audio) { audio = new GameAudio(); } audio.startAmbience(); };
$('btn-skins').onclick = () => { buildSkins(); show('skins'); };
$('btn-back-home').onclick = () => show('home');
$('btn-back-skins').onclick = () => show('home');
$('btn-levels').onclick = () => { buildLevelGrid(); show('levels'); };
$('btn-restart').onclick = () => {
  if (renderer) { restart(renderer.game); updateHUD(renderer.game); $('game-overlay').classList.add('hidden'); }
};
$('btn-next').onclick = () => startLevel(currentLevelId + 1);
$('btn-replay').onclick = () => startLevel(currentLevelId);
$('btn-result-levels').onclick = () => { buildLevelGrid(); show('levels'); };

// ===== 对战事件 =====
$('btn-vs').onclick = () => startVs(1);
$('btn-vs-home').onclick = () => show('home');
$('btn-vs-home2').onclick = () => show('home');
$('btn-vs-restart').onclick = () => {
  if (vsGame) { vsRestart(vsGame, { aiLevel: vsAiLevel }); vsRenderer._gameOverNotified = false; updateVsHUD(vsGame); $('vs-overlay').classList.add('hidden'); }
};
$('btn-vs-again').onclick = () => {
  if (vsGame) { vsRestart(vsGame, { aiLevel: vsAiLevel }); vsRenderer._gameOverNotified = false; updateVsHUD(vsGame); $('vs-overlay').classList.add('hidden'); }
};

// ===== 启动 =====
show('home');
