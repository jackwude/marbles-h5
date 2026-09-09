// 入口：UI 流程 + 存档 + 页面切换
import { createGame, GameState, starsFor, restart } from './game.js';
import { LEVELS } from './levels.js';
import { GameRenderer, GameAudio } from './render.js';
import { SKINS, SKIN_ORDER } from './skins.js';

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
['home', 'levels', 'skins', 'game'].forEach((id) => screens[id] = $(`screen-${id}`));

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
  if (renderer) { renderer.game = game; renderer._stateChanged(); }
  else {
    renderer = new GameRenderer($('game-canvas'), game, {
      skin: () => save.skin,
      onCaptured: (g) => onCaptured(g),
      onOut: () => onOut(),
      onStateChange: (g) => updateHUD(g),
    });
  }
  window.__renderer = renderer; // 调试用
  window.__game = game;
  updateHUD(game);
  $('game-overlay').classList.add('hidden');
  show('game');
}

function updateHUD(g) {
  $('hud-level').textContent = `第 ${g.level.id} 关`;
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
  $('result-stars').textContent = '★'.repeat(stars);
  const next = LEVELS.find((l) => l.id === g.level.id + 1);
  $('btn-next').style.display = next ? 'block' : 'none';
  $('btn-next').textContent = next ? `下一关（第 ${next.id} 关）` : '';
  $('game-overlay').classList.remove('hidden');
  audio.play('star');
}

function onOut() {
  $('result-title').textContent = '没进洞…';
  $('result-stars').textContent = '💧';
  $('btn-next').style.display = 'none';
  $('game-overlay').classList.remove('hidden');
}

// ===== 事件绑定 =====
$('btn-start').onclick = () => { buildLevelGrid(); show('levels'); };
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

// ===== 启动 =====
show('home');
