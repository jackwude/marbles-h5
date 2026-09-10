// 对战模式渲染层：Canvas 绘制 + 输入 + AI 回合驱动
// 复用 render.js 的 GameAudio；逻辑全在 vs.js（纯函数）
import { VsState, vsSetAim, vsFire, vsUpdate, vsAIShot, RING, START_LINE, VS_CFG } from './vs.js';
import { WORLD_W, WORLD_H } from './levels.js';
import { GameAudio } from './render.js';
import { getMarbleTexture } from './marble-textures.js';

// 彩珠样式（8 种经典玻璃弹珠，程序化渲染）
const MARBLE_STYLES = [
  { type: 'cateye',   base: 'rgba(255,255,255,0.55)', inner: ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db'] }, // 猫眼（四色扇形）
  { type: 'rainbow',  base: 'rgba(200,230,255,0.5)',  colors: ['#ff0000', '#ff8800', '#ffee00', '#00cc44', '#0088ff', '#8800ff'] }, // 彩虹螺旋
  { type: 'stripe',   base: 'rgba(255,255,255,0.6)',  stripe: '#e74c3c' }, // 红白条纹
  { type: 'crystal',  base: 'rgba(180,220,255,0.35)', highlight: 'rgba(255,255,255,0.95)' }, // 透明水晶
  { type: 'porcelain', base: '#f5e6d3', shadow: 'rgba(160,120,80,0.5)' }, // 不透明瓷珠
  { type: 'starburst', base: 'rgba(255,220,150,0.6)', star: '#fff200' }, // 星光
  { type: 'bicolor',  baseA: '#2ecc71', baseB: '#3498db' }, // 双色
  { type: 'neon',     base: '#ff6ec7', glow: 'rgba(255,110,199,0.5)' }, // 荧光
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
      // 反馈横幅：检测上次射击结果（大翻盘 / 连杀 / 母弹重置）
      this._checkShotFeedback();
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

  // 检测射击结果，显示反馈（v2.1 用户确认文案）
  _checkShotFeedback() {
    const ls = this.game.lastShot;
    if (!ls) return;
    const stamp = this.game.world.time; // 用世界时间做去重
    if (this._lastFeedbackStamp === stamp) return;
    this._lastFeedbackStamp = stamp;
    // 撞出珠子：轻提示（不打扰）——触发"珠子飞入袋子"动画 + 积分板高亮
    if (ls.knockedOut > 0) {
      this._flyMarblesToPouch(ls.wonMarbles || [], ls.shooter);
      if (this.callbacks.onMarbleWon) this.callbacks.onMarbleWon(ls.shooter, ls.knockedOut);
      this.audio.play('hole'); // 清脆一声，表示收入
    }
    // 连打（击出彩珠 + 母珠出圈）：小横幅
    if (ls.combo) {
      this.audio.play('star');
      this._showFeedbackBanner(ls.shooter === 'player' ? '🎯 打中了！继续弹！' : 'AI 打中了，继续！', true);
    }
    // 母珠停圈内（惩罚）：换人 + 重置起始线
    else if (ls.stuckInRing) {
      this.audio.play('bounce');
      if (ls.canceled) {
        // 打中了彩珠但母珠停圈内 → 彩珠作废归还
        this._showFeedbackBanner(ls.shooter === 'player' ? '⚠️ 母珠停在圈内！彩珠归还，回起始线' : '⚠️ AI 母珠停在圈内，彩珠归还', true);
      } else {
        this._showFeedbackBanner(ls.shooter === 'player' ? '⚠️ 母珠停在圈内！回合结束，回到起始线' : '⚠️ AI 母珠停在圈内，回起始线', true);
      }
    }
    // 母珠出圈但没击出（白打）：换人，母珠留原地
    else if (ls.tawOutNoHit) {
      this.audio.play('bounce');
      this._showFeedbackBanner(ls.shooter === 'player' ? '📤 母珠出圈，没打中，轮到 AI' : 'AI 母珠出圈，没打中，轮到你了', true);
    }
  }

  // 珠子飞入袋子动画（轻提示）：从出圈位置飞向积分板
  _flyMarblesToPouch(wonMarbles, side) {
    if (!wonMarbles.length) return;
    // 找到积分板袋子位置
    const pouchEl = document.getElementById(`vs-pouch-${side}`);
    if (!pouchEl) return;
    const pouchRect = pouchEl.getBoundingClientRect();
    const targetX = pouchRect.left + pouchRect.width / 2;
    const targetY = pouchRect.top + pouchRect.height / 2;
    wonMarbles.forEach((wm) => {
      // 从出圈位置（世界坐标→屏幕）创建飞入小球
      const sp = this._toScreen(wm.x, wm.y);
      const el = document.createElement('div');
      el.className = 'vs-fly-marble';
      const styleIdx = parseInt(wm.id.slice(1), 10) % 8;
      const colors = ['#e74c3c', '#ff8800', '#2ecc71', '#3498db', '#9b59b6', '#f1c40f', '#1abc9c', '#e84393'];
      el.style.background = colors[styleIdx];
      el.style.left = sp.x + 'px';
      el.style.top = sp.y + 'px';
      document.body.appendChild(el);
      // 用 CSS transition 飞向袋子
      requestAnimationFrame(() => {
        el.style.left = targetX + 'px';
        el.style.top = targetY + 'px';
        el.style.opacity = '0.3';
        el.style.transform = 'scale(0.3)';
      });
      setTimeout(() => el.remove(), 700);
    });
    // 袋子高亮
    pouchEl.classList.add('vs-pouch-glow');
    setTimeout(() => pouchEl.classList.remove('vs-pouch-glow'), 500);
  }

  // 显示居中反馈横幅（大 = 强调，小 = 轻提示）
  _showFeedbackBanner(msg, small = false) {
    if (this._feedbackEl) this._feedbackEl.remove();
    const el = document.createElement('div');
    el.className = 'vs-feedback' + (small ? ' vs-feedback-small' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    this._feedbackEl = el;
    clearTimeout(this._fbTimer);
    this._fbTimer = setTimeout(() => {
      if (this._feedbackEl) { this._feedbackEl.remove(); this._feedbackEl = null; }
    }, small ? 900 : 1500);
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
    // 起始线（下方）
    ctx.beginPath();
    ctx.moveTo(40, START_LINE.y);
    ctx.lineTo(WORLD_W - 40, START_LINE.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
    // 起始线标签
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('起始线', WORLD_W / 2, START_LINE.y - 10);
    ctx.restore();
  }

  _drawMarbles() {
    const { ctx } = this;
    const marbles = this.game.world.balls.filter((b) => b.id.startsWith('m'));
    marbles.forEach((m, i) => {
      const out = this._isOut(m);
      const style = MARBLE_STYLES[i % MARBLE_STYLES.length];
      ctx.save();
      if (out) ctx.globalAlpha = 0.35; // 出圈战利品半透明
      // 阴影
      ctx.beginPath();
      ctx.arc(m.x + 2, m.y + 3, m.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fill();
      // 优先用 PNG 贴图（AI 生成玻璃质感），无贴图回退程序化绘制
      const tex = getMarbleTexture(i);
      if (tex) {
        this._drawMarbleTexture(tex, m.x, m.y, m.r);
      } else {
        this._drawMarbleStyle(style, m.x, m.y, m.r);
      }
      ctx.restore();
    });
  }

  // 用 PNG 贴图绘制一颗弹珠（圆形裁剪 + 保留公共玻璃层）
  _drawMarbleTexture(tex, x, y, r) {
    const { ctx } = this;
    ctx.save();
    // 圆形裁剪
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    // 画贴图（覆盖整个圆）
    ctx.drawImage(tex, x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  // 按样式绘制一颗弹珠
  _drawMarbleStyle(style, x, y, r) {
    const { ctx } = this;
    ctx.save();
    const clip = () => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();
    };
    switch (style.type) {
      case 'cateye': {
        // 半透明底 + 内部四色扇形（经典猫眼）
        clip();
        ctx.fillStyle = style.base;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        const n = style.inner.length;
        for (let i = 0; i < n; i++) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.arc(x, y, r * 0.85, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2);
          ctx.closePath();
          ctx.fillStyle = style.inner[i];
          ctx.globalAlpha = 0.7;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        // 外圈玻璃边
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
      }
      case 'rainbow': {
        // 彩虹螺旋
        clip();
        ctx.fillStyle = style.base;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        const n = style.colors.length;
        for (let i = 0; i < n * 4; i++) {
          const a0 = (i / (n * 4)) * Math.PI * 2;
          const a1 = ((i + 1) / (n * 4)) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.arc(x, y, r * (0.2 + 0.8 * (i % 4) / 4), a0, a1);
          ctx.closePath();
          ctx.fillStyle = style.colors[i % n];
          ctx.globalAlpha = 0.8;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        break;
      }
      case 'stripe': {
        // 条纹珠
        clip();
        ctx.fillStyle = style.base;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.fillStyle = style.stripe;
        ctx.globalAlpha = 0.8;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.ellipse(x, y + i * r * 0.4, r * 1.05, r * 0.22, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'crystal': {
        // 透明水晶：浅色底 + 强高光 + 折射光斑
        clip();
        ctx.fillStyle = style.base;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        // 底部折射光斑
        ctx.beginPath();
        ctx.ellipse(x + r * 0.3, y + r * 0.4, r * 0.4, r * 0.25, 0.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fill();
        // 边缘暗化
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(120,160,200,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
      }
      case 'porcelain': {
        // 不透明瓷珠：磨砂无透射
        clip();
        ctx.fillStyle = style.base;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        // 细腻颗粒感
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        for (let i = 0; i < 12; i++) {
          ctx.beginPath();
          ctx.arc(x + (Math.sin(i * 37) * r * 0.7), y + (Math.cos(i * 53) * r * 0.7), r * 0.15, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'starburst': {
        // 星光珠
        clip();
        ctx.fillStyle = style.base;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.fillStyle = style.star;
        ctx.globalAlpha = 0.9;
        // 四角星
        const starR = r * 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y - starR);
        ctx.quadraticCurveTo(x + r * 0.12, y - r * 0.12, x + starR, y);
        ctx.quadraticCurveTo(x + r * 0.12, y + r * 0.12, x, y + starR);
        ctx.quadraticCurveTo(x - r * 0.12, y + r * 0.12, x - starR, y);
        ctx.quadraticCurveTo(x - r * 0.12, y - r * 0.12, x, y - starR);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'bicolor': {
        // 双色珠：左半绿右半蓝
        clip();
        ctx.fillStyle = style.baseA;
        ctx.fillRect(x - r, y - r, r, r * 2);
        ctx.fillStyle = style.baseB;
        ctx.fillRect(x, y - r, r, r * 2);
        // 分界线
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x, y + r);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        break;
      }
      case 'neon': {
        // 荧光珠：亮色 + 外发光
        ctx.beginPath();
        ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
        ctx.fillStyle = style.glow;
        ctx.fill();
        clip();
        ctx.fillStyle = style.base;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.25, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
    // 公共玻璃质感层：球体立体渐变 + 高光点 + 菲涅尔边缘 + 环境反射弧 + 底部反光
    ctx.globalAlpha = 1;
    // ① 玻璃透光感：中心微亮（玻璃透光），边缘暗（球体曲率）
    const glassGrad = ctx.createRadialGradient(
      x, y, r * 0.1,
      x, y, r
    );
    glassGrad.addColorStop(0, 'rgba(255,255,255,0.18)');   // 中心透光
    glassGrad.addColorStop(0.6, 'rgba(255,255,255,0.05)');  // 过渡
    glassGrad.addColorStop(0.85, 'rgba(255,255,255,0.0)');  // 渐隐
    glassGrad.addColorStop(1, 'rgba(20,20,50,0.35)');       // 底部暗边（体积感）
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = glassGrad;
    ctx.fill();

    // ①b 内部高光球（左上偏移亮斑）—— 玻璃球内部的体积光
    const innerGrad = ctx.createRadialGradient(
      x - r * 0.35, y - r * 0.4, r * 0.05,
      x - r * 0.35, y - r * 0.4, r * 0.6
    );
    innerGrad.addColorStop(0, 'rgba(255,255,255,0.35)');
    innerGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = innerGrad;
    ctx.fill();

    // ② 主高光点（小、亮、实心）—— 玻璃球最亮的镜面反射
    ctx.beginPath();
    ctx.arc(x - r * 0.32, y - r * 0.38, r * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    ctx.fill();

    // ②b 菲涅尔边缘（球体边缘强白环）—— 玻璃球标志性的边缘透光/反射
    // 外圈亮环
    ctx.beginPath();
    ctx.arc(x, y, r * 0.98, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = Math.max(1.2, r * 0.09);
    ctx.stroke();
    // 内侧柔光（左上重点）
    ctx.beginPath();
    ctx.arc(x, y, r * 0.86, Math.PI * 0.75, Math.PI * 1.45);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1.2, r * 0.06);
    ctx.stroke();

    // ③ 环境反射弧（顶部内侧弧形白线）—— 模拟窗/天空在球面上的反射
    ctx.beginPath();
    ctx.arc(x, y, r * 0.92, Math.PI * 1.15, Math.PI * 1.85);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.lineCap = 'round';
    ctx.stroke();

    // ④ 底部反光（下方暖色弧）—— 地面光反弹到球底部
    ctx.beginPath();
    ctx.arc(x, y, r * 0.8, Math.PI * 0.1, Math.PI * 0.45);
    ctx.strokeStyle = 'rgba(255,240,200,0.3)';
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.stroke();

    // ⑤ 次高光（右下小点，柔和）
    ctx.beginPath();
    ctx.arc(x + r * 0.3, y + r * 0.32, r * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();

    ctx.restore();
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
    // 玻璃立体层：内部透光 + 菲涅尔边缘 + 环境反射弧 + 底部反光
    // 内部透光（中心微亮，玻璃通透感）
    const innerGlass = ctx.createRadialGradient(b.x, b.y, b.r * 0.1, b.x, b.y, b.r);
    innerGlass.addColorStop(0, 'rgba(255,255,255,0.22)');
    innerGlass.addColorStop(0.6, 'rgba(255,255,255,0.05)');
    innerGlass.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = innerGlass;
    ctx.fill();
    // 菲涅尔边缘（玻璃球标志性边缘透光）
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 0.98, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(1.5, b.r * 0.09);
    ctx.stroke();
    // 环境反射弧
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 0.92, Math.PI * 1.15, Math.PI * 1.85);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = Math.max(1.5, b.r * 0.09);
    ctx.lineCap = 'round';
    ctx.stroke();
    // 底部反光
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 0.8, Math.PI * 0.1, Math.PI * 0.45);
    ctx.strokeStyle = 'rgba(255,240,200,0.35)';
    ctx.lineWidth = Math.max(1.5, b.r * 0.12);
    ctx.stroke();
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
