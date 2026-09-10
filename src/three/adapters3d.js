// 3D 渲染器适配层：把 Renderer3D 封装成与 VsRenderer / GameRenderer 相同接口
// main.js 无痛切换：3D 可用 → 用 Renderer3D，否则 → 用原 2D 渲染器
import { Renderer3D } from './renderer3d.js';
import * as vs from '../vs.js';
import * as game from '../game.js';

// WebGL 可用性检测（2D 降级开关）
export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) {
    return false;
  }
}

// 检测是否应启用 3D（默认开，但提供 URL 参数 ?2d=1 强制 2D 调试）
export function shouldUse3D() {
  if (!webglAvailable()) return false;
  const params = new URLSearchParams(location.search);
  return params.get('2d') !== '1';
}

// ---- 对战模式 3D 渲染器（适配 VsRenderer 接口）----
export class VsRenderer3D {
  constructor(canvas, game, callbacks = {}, audio = null) {
    this.game = game;
    this.callbacks = callbacks;
    this.audio = audio;
    this._gameOverNotified = false;
    this._lastShotStamp = -1;

    // 对战模式：用 vs.js 的逻辑更新 + 圈/起始线竞技场
    this.renderer = new Renderer3D(canvas, game, {
      mode: 'vs',
      skinId: null,
      logicUpdate: (g, dt) => this._logicUpdate(g, dt),
      onPointerDown: () => this._onPointerDown(),
      onAimStart: (pt) => this._onAimStart(pt),
      onAim: (start, pt) => this._onAim(start, pt),
      onAimEnd: (start, pt) => this._onAimEnd(start, pt),
    });
  }

  // ---- vs.js 逻辑更新（复用现有规则，零改动）----
  _logicUpdate(g, dt) {
    // 同步渲染器的 logic 引用（restart/again 后 game 被替换）
    if (this.renderer && this.renderer.logic !== g) {
      this.renderer.logic = g;
    }
    // 玩家滚动中 → 推进物理（dt 是帧归一化值 /16.67，匹配物理引擎设计）
    if (g.state === 'player_rolling' || g.state === 'ai_rolling') {
      vs.vsUpdate(g, dt);
    }
    // AI 回合：思考后发射（只触发一次，与 2D VsRenderer 一致）
    if (g.state === 'ai_aim' && !this._aiTimer) {
      this._aiTimer = setTimeout(() => {
        this._aiTimer = null;
        if (this.game.state !== 'ai_aim') return;
        vs.vsAIShot(this.game);
        if (this.audio) this.audio.play('launch');
        if (this.callbacks.onStateChange) this.callbacks.onStateChange(this.game);
      }, 700); // AI "思考"时间
    }
    this._checkShotFeedback(g);
    this._checkGameOver(g);
  }

  _onPointerDown() {
    // 教学条显示中禁止拖拽
    const tut = document.getElementById('vs-tutorial');
    if (tut && !tut.classList.contains('hidden')) return false;
    if (!this.game || this.game.state !== 'player_aim') return false;
    this._aimStart = null;
    return true;
  }

  // 注意：2D 版拖拽用"屏幕像素"算 dx/dy（不走世界坐标映射），保持手感一致
  _onAimStart(pt) {
    this._aimStart = { x: pt.x, y: pt.y };
  }

  _onAim(start, pt) {
    if (!this._aimStart) return;
    // 屏幕像素差（与 2D 版一致：clientX - startX）
    const dx = pt.x - this._aimStart.x;
    const dy = pt.y - this._aimStart.y;
    vs.vsSetAim(this.game, dx, dy, 120);
  }

  _onAimEnd(start, pt) {
    if (!this._aimStart) return;
    const dx = pt.x - this._aimStart.x;
    const dy = pt.y - this._aimStart.y;
    this._aimStart = null;
    vs.vsSetAim(this.game, dx, dy, 120); // 最终瞄准
    vs.vsFire(this.game); // 发射（内部读 power/aimDir）
  }

  // 射击结果反馈（复用横幅逻辑，轻量实现）
  _checkShotFeedback(g) {
    const ls = g.lastShot;
    if (!ls) return;
    if (this._lastShotStamp === g.world.time) return;
    this._lastShotStamp = g.world.time;
    if (ls.knockedOut > 0 && this.audio) this.audio.play('hole');
    if (ls.combo && this.audio) this.audio.play('star');
    if (this.callbacks.onStateChange) this.callbacks.onStateChange(g);
  }

  _checkGameOver(g) {
    if (g.state === 'game_over' && !this._gameOverNotified) {
      this._gameOverNotified = true;
      if (this.callbacks.onGameOver) this.callbacks.onGameOver(g);
    }
  }

  destroy() {
    if (this.renderer) this.renderer.destroy();
  }
}

// ---- 闯关模式 3D 渲染器（适配 GameRenderer 接口）----
export class GameRenderer3D {
  constructor(canvas, game, callbacks = {}, audio = null) {
    this.game = game;
    this.callbacks = callbacks;
    this.audio = audio;
    this._levelCaptured = false;

    this.renderer = new Renderer3D(canvas, game, {
      mode: 'level',
      skinId: callbacks.skin ? callbacks.skin() : 'transparent',
      logicUpdate: (g, dt) => this._logicUpdate(g, dt),
      onPointerDown: () => this._onPointerDown(),
      onAimStart: (pt) => this._onAimStart(pt),
      onAim: (start, pt) => this._onAim(start, pt),
      onAimEnd: (start, pt) => this._onAimEnd(start, pt),
    });
  }

  _logicUpdate(g, dt) {
    // 同步渲染器的 logic 引用（restart 后 game 被替换）
    if (this.renderer && this.renderer.logic !== g) {
      this.renderer.logic = g;
    }
    if (g.state === 'rolling') {
      game.update(g, dt);
      // 状态切换（与 2D GameRenderer 对齐）
      if (g.state !== 'rolling') {
        if (g.state === 'captured') {
          if (this.audio) this.audio.play('hole');
          this._levelCaptured = true;
          if (this.callbacks.onCaptured) this.callbacks.onCaptured(g);
        } else {
          game.settle(g);
          if (g.state === 'out') {
            if (this.callbacks.onOut) this.callbacks.onOut(g);
          } else if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(g);
          }
        }
      }
    }
  }

  _onPointerDown() {
    if (!this.game || this.game.state !== 'aim') return false;
    this._aimStart = null;
    return true;
  }
  _onAimStart(pt) { this._aimStart = { x: pt.x, y: pt.y }; }
  _onAim(start, pt) {
    if (!this._aimStart) return;
    const dx = pt.x - this._aimStart.x;
    const dy = pt.y - this._aimStart.y;
    game.setAim(this.game, dx, dy);
  }
  _onAimEnd(start, pt) {
    if (!this._aimStart) return;
    const dx = pt.x - this._aimStart.x;
    const dy = pt.y - this._aimStart.y;
    this._aimStart = null;
    game.setAim(this.game, dx, dy);
    game.fire(this.game);
  }

  destroy() { if (this.renderer) this.renderer.destroy(); }
}
