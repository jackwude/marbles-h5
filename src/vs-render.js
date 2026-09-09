// 对战模式渲染层：Canvas 绘制 + 输入 + AI 回合驱动
// 复用 render.js 的 GameAudio；逻辑全在 vs.js（纯函数）
import { VsState, vsSetAim, vsFire, vsUpdate, vsAIShot, RING, VS_CFG } from './vs.js';
import { WORLD_W, WORLD_H } from './levels.js';
import { GameAudio } from './render.js';

// 彩珠配色（玻璃质感）
const MARBLE_COLORS = [
  ['#e74c3c', '#ff8a80'], // 红
  ['#2ecc71', '#a5f0c8'], // 绿
  ['#3498db', '#a3d5f7'], // 蓝
  ['#f1c40f', '#fff2a8'], // 黄
  ['#9b59b6', '#d7aef2'], // 紫
  ['#e67e22', '#ffc08a'], // 橙
  ['#1abc9c', '#a5f0e4'], // 青
  ['#e84393', '#f9b7d3'], // 粉
];

export class VsRenderer {
  constructor(canvas, game, callbacks, audio) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.callbacks = callbacks || {}; // { onTurnChange, onGameOver, onStateChange }
    this.audio = audio || new GameAudio();
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.lastTime = 0;
    this._dragging = false;
    this._startX = 0;
    this._startY = 0;
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._bindInput();
    requestAnimationFrame((t) => this._loop(t));
    // AI 思考定时器
    this._aiTimer = null;
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.scale = Math.min(w / WORLD_W, h / WORLD_H);
    this.offsetX = (w - WORLD_W * this.scale) / 2;
    this.offsetY = (h - WORLD_H * this.scale) / 2;
    this.viewW = w;
    this.viewH = h;
  }

  _toWorld(px, py) {
    return { x: (px - this.offsetX) / this.scale, y: (py - this.offsetY) / this.scale };
  }

  _bindInput() {
    this.canvas.addEventListener('pointerdown', (e) => this._onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this._onMove(e));
    this.canvas.addEventListener('pointerup', (e) => this._onUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this._onUp(e));
    this.canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  _onDown(e) {
    if (this.game.state !== VsState.PLAYER_AIM) return;
    this._dragging = true;
    this._startX = e.clientX;
    this._startY = e.clientY;
    this._updateAim(e);
  }
  _onMove(e) {
    if (!this._dragging) return;
    this._updateAim(e);
  }
  _onUp() {
    if (!this._dragging) return;
    this._dragging = false;
    if (this.game.state === VsState.PLAYER_AIM && this.game.power > 0.02) {
      vsFire(this.game);
      this.audio.play('launch');
      this._stateChanged();
    }
  }
  _updateAim(e) {
    const dx = e.clientX - this._startX;
    const dy = e.clientY - this._startY;
    const maxDrag = Math.min(this.viewW, this.viewH) * 0.35;
    const prevPower = this.game.power;
    vsSetAim(this.game, dx, dy, maxDrag);
    if (this.game.power > prevPower + 0.03) {
      const now = performance.now();
      if (!this._chargeTick || now - this._chargeTick > 120) {
        this.audio.play('charge', Math.max(0.05, this.game.power * 0.5));
        this._chargeTick = now;
      }
    }
  }

  _stateChanged() {
    if (this.callbacks.onStateChange) this.callbacks.onStateChange(this.game);
  }

  _loop(t) {
    const dt = Math.min((t - this.lastTime) / 16.67, 2);
    this.lastTime = t;
    try {
      // 物理推进
      if (this.game.state === VsState.PLAYER_ROLLING || this.game.state === VsState.AI_ROLLING) {
        vsUpdate(this.game, dt);
        this._handleEvents();
        this._stateChanged();
      }
      // AI 回合：思考后发射（只触发一次）
      if (this.game.state === VsState.AI_AIM && !this._aiTimer) {
        this._aiTimer = setTimeout(() => {
          this._aiTimer = null;
          if (this.game.state !== VsState.AI_AIM) return;
          vsAIShot(this.game);
          this.audio.play('launch');
          this._stateChanged();
        }, 700); // AI "思考"时间
      }
      // 游戏结束
      if (this.game.state === VsState.GAME_OVER && !this._gameOverNotified) {
        this._gameOverNotified = true;
        this.audio.play('star');
        if (this.callbacks.onGameOver) this.callbacks.onGameOver(this.game);
      }
    } catch (e) {
      console.error('vs loop error:', e);
    }
    try {
      this._draw();
    } catch (e) {
      console.error('vs draw error:', e);
    }
    requestAnimationFrame((t2) => this._loop(t2));
  }

  _handleEvents() {
    const events = this.game.world.events || [];
    for (const ev of events) {
      if (ev.impact > 0.5) {
        this.audio.play('bounce', Math.min(ev.impact / 6, 1));
        if (navigator.vibrate && ev.impact > 1.2) navigator.vibrate(15);
      }
    }
  }

  // ===== 绘制 =====
  _draw() {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.viewW, this.viewH);
    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);
    this._drawGround();
    this._drawRing();
    this._drawMarbles();
    this._drawTaws();
    this._drawAim();
    ctx.restore();
  }

  _drawGround() {
    const { ctx } = this;
    // 泥地（老院子）
    const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    g.addColorStop(0, '#9a7b4f');
    g.addColorStop(1, '#7d623a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // 噪点
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let i = 0; i < 400; i++) {
      ctx.fillRect((i * 137) % WORLD_W, (i * 331) % WORLD_H, 1.5, 1.5);
    }
    // 顶光
    const lg = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    lg.addColorStop(0, 'rgba(255,220,160,0.15)');
    lg.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  }

  _drawRing() {
    const { ctx } = this;
    // 圈线（粉笔感）
    ctx.save();
    ctx.beginPath();
    ctx.arc(RING.cx, RING.cy, RING.r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
    // 圈内淡色
    ctx.beginPath();
    ctx.arc(RING.cx, RING.cy, RING.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,240,200,0.12)';
    ctx.fill();
    ctx.restore();
  }

  _drawMarbles() {
    const { ctx } = this;
    const marbles = this.game.world.balls.filter((b) => b.id.startsWith('m'));
    marbles.forEach((m, i) => {
      // 出圈的战利品：灰色调 + 半透明（表示已赢走）
      const out = this._isOut(m);
      const colorIdx = parseInt(m.id.slice(1), 10) % MARBLE_COLORS.length;
      const [base, hl] = MARBLE_COLORS[colorIdx];
      ctx.save();
      if (out) {
        ctx.globalAlpha = 0.4;
      }
      // 阴影
      ctx.beginPath();
      ctx.arc(m.x + 2, m.y + 3, m.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fill();
      // 玻璃球体
      const g = ctx.createRadialGradient(m.x - m.r * 0.35, m.y - m.r * 0.35, m.r * 0.1, m.x, m.y, m.r);
      g.addColorStop(0, hl);
      g.addColorStop(0.5, base);
      g.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      // 高光
      ctx.beginPath();
      ctx.arc(m.x - m.r * 0.3, m.y - m.r * 0.35, m.r * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
      ctx.restore();
    });
  }

  _drawTaws() {
    const { ctx } = this;
    // 玩家母弹（红）
    const pt = this.game.world.balls.find((b) => b.id === 'player_taw');
    // AI 母弹（蓝）
    const at = this.game.world.balls.find((b) => b.id === 'ai_taw');
    if (pt) this._drawTaw(pt, '#e74c3c', '#ff8a80', '我');
    if (at) this._drawTaw(at, '#3498db', '#a3d5f7', 'AI');
  }

  _drawTaw(b, base, hl, label) {
    const { ctx } = this;
    ctx.save();
    // 阴影
    ctx.beginPath();
    ctx.arc(b.x + 2, b.y + 3, b.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    // 玻璃球体（母弹略大）
    const g = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.1, b.x, b.y, b.r);
    g.addColorStop(0, hl);
    g.addColorStop(0.5, base);
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    // 高光
    ctx.beginPath();
    ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.35, b.r * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    // 标签
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(8, b.r * 0.7)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, b.x, b.y);
    ctx.restore();
  }

  _drawAim() {
    if (this.game.state !== VsState.PLAYER_AIM || this.game.power <= 0) return;
    const { ctx } = this;
    const b = this.game.world.balls.find((x) => x.id === 'player_taw');
    if (!b) return;
    ctx.save();
    // 力度环
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r + 8, 0, Math.PI * 2 * this.game.power);
    ctx.strokeStyle = '#ffd27a';
    ctx.lineWidth = 4;
    ctx.stroke();
    // 方向箭头
    const dir = this.game.aimDir;
    const len = b.r * 2.2;
    const ax = b.x + dir.x * len;
    const ay = b.y + dir.y * len;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b.x + dir.x * b.r, b.y + dir.y * b.r);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    const ang = Math.atan2(dir.y, dir.x);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - Math.cos(ang - 0.5) * 8, ay - Math.sin(ang - 0.5) * 8);
    ctx.lineTo(ax - Math.cos(ang + 0.5) * 8, ay - Math.sin(ang + 0.5) * 8);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.restore();
  }

  _isOut(b) {
    const d = Math.hypot(b.x - RING.cx, b.y - RING.cy);
    return d > RING.r;
  }
}
