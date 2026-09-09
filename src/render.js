// 渲染层：Canvas 绘制 + 输入 + 音效（怀旧写实风，全程序化）
import { GameState, setAim, fire, update, settle, starsFor } from './game.js';
import { WORLD_W, WORLD_H } from './levels.js';
import { SKINS } from './skins.js';

export class GameRenderer {
  constructor(canvas, game, callbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.callbacks = callbacks; // { onCaptured, onOut, onStateChange }
    this.audio = new GameAudio();
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.rolling = false;
    this.lastTime = 0;
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._bindInput();
    requestAnimationFrame((t) => this._loop(t));
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 适配：保持宽高比缩放到世界坐标
    this.scale = Math.min(w / WORLD_W, h / WORLD_H);
    this.offsetX = (w - WORLD_W * this.scale) / 2;
    this.offsetY = (h - WORLD_H * this.scale) / 2;
    this.viewW = w;
    this.viewH = h;
  }

  // 屏幕坐标 → 世界坐标
  _toWorld(px, py) {
    return { x: (px - this.offsetX) / this.scale, y: (py - this.offsetY) / this.scale };
  }
  _toScreen(wx, wy) {
    return { x: wx * this.scale + this.offsetX, y: wy * this.scale + this.offsetY };
  }

  _bindInput() {
    this.canvas.addEventListener('pointerdown', (e) => this._onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this._onMove(e));
    this.canvas.addEventListener('pointerup', (e) => this._onUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this._onUp(e));
    // 防滚动/缩放
    this.canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  _onDown(e) {
    if (this.game.state !== GameState.AIM) return;
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
    if (this.game.state === GameState.AIM && this.game.power > 0.02) {
      fire(this.game);
      this.audio.play('launch');
      this._stateChanged();
    }
  }
  _updateAim(e) {
    // 任意位置起手拖拽：拖向量 = 当前点 - 起手点（反向：往左拖 = 往右发射）
    const dx = e.clientX - this._startX;
    const dy = e.clientY - this._startY;
    // 拖拽允许超出屏幕边缘（clamp 到窗口内，保证边缘也能满力）
    const maxDrag = Math.min(this.viewW, this.viewH) * 0.35;
    const prevPower = this.game.power;
    setAim(this.game, dx, dy, maxDrag);
    // 蓄力音效：力度上升时"呼~"渐强（节流）
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
    // 物理推进 + 状态机（异常不阻断 rAF 链）
    try {
      if (this.game.state === GameState.ROLLING) {
        update(this.game, dt);
        this._handleEvents();
        if (this.game.state !== GameState.ROLLING) {
          // 停下来了
          if (this.game.state === GameState.CAPTURED) {
            this.audio.play('hole');
            this._captureAnim = 0;
            if (this.callbacks.onCaptured) this.callbacks.onCaptured(this.game);
          } else {
            settle(this.game);
            if (this.game.state === GameState.OUT) {
              if (this.callbacks.onOut) this.callbacks.onOut(this.game);
            } else {
              this._stateChanged();
            }
          }
        }
      }
    } catch (e) {
      console.error('loop error:', e);
    }
    // 进洞下沉动画推进
    if (this._captureAnim !== undefined && this._captureAnim < 1) {
      this._captureAnim = Math.min(this._captureAnim + dt * 0.05, 1);
    }
    // 绘制（异常不阻断 rAF 链）
    try {
      this._draw();
    } catch (e) {
      console.error('draw error:', e);
    }
    requestAnimationFrame((t2) => this._loop(t2));
  }

  _handleEvents() {
    const events = this.game.world.events || [];
    for (const ev of events) {
      // 碰撞音效（按冲击力度调整音量）
      if (ev.impact > 0.5) {
        this.audio.play('bounce', Math.min(ev.impact / 6, 1));
        // 屏幕震动（Web Vibration API）
        if (navigator.vibrate && ev.impact > 1.2) {
          navigator.vibrate(15);
        }
      }
    }
    // 滚动音效：弹珠低速移动时细碎声
    const b = this.game.world.balls[0];
    if (this.game.state === GameState.ROLLING && b && !b.captured) {
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > 0.1 && speed < 1.5) {
        if (!this._rollingSoundTick || performance.now() - this._rollingSoundTick > 400) {
          this.audio.play('roll', Math.min(speed / 2, 0.5));
          this._rollingSoundTick = performance.now();
        }
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
    this._drawHole();
    this._drawObstacles();
    this._drawBall();
    this._drawAim();
    ctx.restore();
  }

  _drawGround() {
    const { ctx } = this;
    const scene = this.game.level.scene;
    // 场景底色
    const colors = {
      dirt: ['#a0743c', '#8a5f2e'],
      concrete: ['#9a9a92', '#7d7d76'],
      soil: ['#8a6a3a', '#6d5229'],
      stone: ['#8d8d84', '#6f6f68'],
      alley: ['#7a6a52', '#5e5140'],
      drain: ['#6f6f68', '#565650'],
    };
    const [c1, c2] = colors[scene] || colors.dirt;
    const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // 颗粒噪点（程序化）
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let i = 0; i < 400; i++) {
      const x = (i * 137) % WORLD_W, y = (i * 331) % WORLD_H;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
    // 顶光
    const lg = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    lg.addColorStop(0, 'rgba(255,220,160,0.18)');
    lg.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  }

  _drawHole() {
    const { ctx } = this;
    const h = this.game.world.holes[0];
    ctx.save();
    // 洞缘
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1008';
    ctx.fill();
    // 内壁阴影
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = '#0d0703';
    ctx.fill();
    // 边缘高光
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,220,160,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  _drawObstacles() {
    const { ctx } = this;
    for (const o of this.game.world.obstacles) {
      ctx.save();
      // 阴影
      ctx.beginPath();
      ctx.arc(o.x + 2, o.y + 3, o.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fill();
      // 玻璃质感
      const g = ctx.createRadialGradient(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.1, o.x, o.y, o.r);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.3, 'rgba(120,200,220,0.5)');
      g.addColorStop(1, 'rgba(60,120,140,0.2)');
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    }
  }

  _drawBall() {
    const { ctx } = this;
    const b = this.game.world.balls[0];
    const skinId = typeof this.callbacks.skin === 'function' ? this.callbacks.skin() : this.callbacks.skin;
    const skin = SKINS[skinId] || SKINS.transparent;
    // 进洞下沉动画（_captureAnim 0→1：缩小+下沉+淡出）
    if (b.captured) {
      const t = this._captureAnim !== undefined ? this._captureAnim : 1;
      const r = b.r * (1 - t * 0.8);
      ctx.save();
      ctx.globalAlpha = 1 - t * 0.7;
      ctx.beginPath();
      ctx.arc(b.x, b.y + t * b.r * 0.6, r, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(b.x - r * 0.3, b.y + t * b.r * 0.6 - r * 0.3, r * 0.1, b.x, b.y + t * b.r * 0.6, r);
      g.addColorStop(0, skin.highlight);
      g.addColorStop(0.4, skin.base);
      g.addColorStop(1, skin.shadow);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.save();
    // 阴影
    ctx.beginPath();
    ctx.arc(b.x + 2, b.y + 3, b.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();
    // 玻璃球体
    const g = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.1, b.x, b.y, b.r);
    g.addColorStop(0, skin.highlight);
    g.addColorStop(0.4, skin.base);
    g.addColorStop(1, skin.shadow);
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    // 内部花纹
    if (skin.spiral) {
      ctx.strokeStyle = skin.pattern;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 0.7, a, a + Math.PI * 1.2);
        ctx.stroke();
      }
    } else if (skin.stripe) {
      ctx.strokeStyle = skin.pattern;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x - b.r * 0.8, b.y);
      ctx.lineTo(b.x + b.r * 0.8, b.y);
      ctx.stroke();
    }
    // 高光点
    ctx.beginPath();
    ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.35, b.r * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
    ctx.restore();
  }

  _drawAim() {
    if (this.game.state !== GameState.AIM || this.game.power <= 0) return;
    const { ctx } = this;
    const b = this.game.world.balls[0];
    // 力度环（围绕弹珠，角度 = 力度）
    ctx.save();
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r + 8, 0, Math.PI * 2 * this.game.power);
    ctx.strokeStyle = '#ffd27a';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
    // 方向箭头（固定短长度，只指示方向，不预测轨迹）
    const dir = this.game.aimDir;
    const len = b.r * 2.2; // 固定长度，与力度无关
    const ax = b.x + dir.x * len;
    const ay = b.y + dir.y * len;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b.x + dir.x * b.r, b.y + dir.y * b.r);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    // 箭头头部
    const ang = Math.atan2(dir.y, dir.x);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - Math.cos(ang - 0.5) * 8, ay - Math.sin(ang - 0.5) * 8);
    ctx.lineTo(ax - Math.cos(ang + 0.5) * 8, ay - Math.sin(ang + 0.5) * 8);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
    ctx.restore();
  }
}

// ===== 音效（Web Audio 合成）=====
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.envNodes = null;
  }
  _ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.enabled = false; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  play(type, volume = 0.25) {
    if (!this.enabled) return;
    this._ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain); gain.connect(this.ctx.destination);
    const v = Math.max(0.02, Math.min(volume, 0.5));
    switch (type) {
      case 'launch': // 短促"啵"
        osc.type = 'sine'; osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(700, t + 0.12);
        gain.gain.setValueAtTime(v, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        break;
      case 'bounce': // 闷响"咚"（玻璃撞玻璃）
        osc.type = 'triangle'; osc.frequency.setValueAtTime(160 + v * 120, t);
        gain.gain.setValueAtTime(v, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        break;
      case 'charge': // 蓄力"呼~"渐强
        osc.type = 'sine'; osc.frequency.setValueAtTime(120 + v * 160, t);
        gain.gain.setValueAtTime(0.03, t);
        gain.gain.linearRampToValueAtTime(v * 0.5, t + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        break;
      case 'roll': // 滚动细碎声
        osc.type = 'square'; osc.frequency.setValueAtTime(2000 + v * 800, t);
        gain.gain.setValueAtTime(v * 0.06, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        break;
      case 'hole': // 清脆"叮——"上滑
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(1200, t + 0.2);
        gain.gain.setValueAtTime(v, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        break;
      case 'star': { // 星星"叮叮叮"三连
        const notes = [880, 1108, 1318];
        notes.forEach((f, i) => {
          const to = t + i * 0.09;
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.connect(g); g.connect(this.ctx.destination);
          o.type = 'sine'; o.frequency.setValueAtTime(f, to);
          g.gain.setValueAtTime(v * 0.6, to);
          g.gain.exponentialRampToValueAtTime(0.001, to + 0.12);
          o.start(to); o.stop(to + 0.15);
        });
        return;
      }
      case 'env_cricket': // 环境音：远处知了
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(4200, t);
        gain.gain.setValueAtTime(0.012, t);
        gain.gain.setValueAtTime(0.012, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        break;
    }
    osc.start(t); osc.stop(t + 0.3);
  }

  // 环境音循环（知了/麻雀氛围，低声量）
  startAmbience() {
    if (!this.enabled) return;
    this._ensure();
    if (!this.ctx || this.envNodes) return;
    // 简单循环：每 1.5~2.5s 随机一声知了/鸟叫
    const loop = () => {
      if (!this.envNodes) return;
      this.play('env_cricket', 0.05);
      setTimeout(loop, 1500 + Math.random() * 1000);
    };
    this.envNodes = { loop };
    setTimeout(loop, 800);
  }
  stopAmbience() {
    this.envNodes = null;
  }
}
