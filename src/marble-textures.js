// 弹珠 PNG 贴图加载器
// AI 生成的透明 PNG 弹珠资产（assets/marbles/），游戏内用贴图绘制
// 加载失败自动回退程序化绘制（渐进增强）
const MARBLE_TEXTURE_COUNT = 8; // 8 种样式

const _textures = new Map(); // idx → { img, loaded }
const _ready = [];

// 预加载所有弹珠贴图
export function preloadMarbleTextures() {
  for (let i = 0; i < MARBLE_TEXTURE_COUNT; i++) {
    if (_textures.has(i)) continue;
    const img = new Image();
    img.onload = () => {
      _textures.set(i, { img, loaded: true });
      _ready.forEach((cb) => cb(i));
    };
    img.onerror = () => {
      _textures.set(i, { img: null, loaded: false });
    };
    img.src = `assets/marbles/marble_${String(i).padStart(3, '0')}.png`;
  }
}

// 等待所有贴图加载完成（或超时）
export function waitMarbleTextures(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const check = () => {
      let loaded = 0;
      for (let i = 0; i < MARBLE_TEXTURE_COUNT; i++) {
        if (_textures.has(i) && _textures.get(i).loaded) loaded++;
      }
      if (loaded === MARBLE_TEXTURE_COUNT) {
        resolve(true);
      }
    };
    check();
    // 轮询直到全部加载或超时
    const start = Date.now();
    const timer = setInterval(() => {
      check();
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        resolve(loadedCount() === MARBLE_TEXTURE_COUNT);
      }
    }, 100);
  });
}

function loadedCount() {
  let n = 0;
  for (let i = 0; i < MARBLE_TEXTURE_COUNT; i++) {
    if (_textures.has(i) && _textures.get(i).loaded) n++;
  }
  return n;
}

// 获取贴图（未加载返回 null）
export function getMarbleTexture(idx) {
  const t = _textures.get(idx % MARBLE_TEXTURE_COUNT);
  return t && t.loaded ? t.img : null;
}

// 贴图是否全部可用
export function hasAllMarbleTextures() {
  return loadedCount() === MARBLE_TEXTURE_COUNT;
}
