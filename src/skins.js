// 弹珠皮肤定义（纯视觉）
export const SKINS = {
  transparent: {
    id: 'transparent', name: '透明珠', hint: '初始弹珠', unlockStars: 0,
    base: 'rgba(200,240,255,0.35)', highlight: 'rgba(255,255,255,0.9)', shadow: 'rgba(120,160,180,0.4)',
    spiral: false, stripe: false, pattern: null,
  },
  pattern: {
    id: 'pattern', name: '花纹珠', hint: '累计 5 星解锁', unlockStars: 5,
    base: 'rgba(255,180,100,0.5)', highlight: 'rgba(255,255,255,0.9)', shadow: 'rgba(180,80,40,0.5)',
    spiral: true, stripe: false, pattern: 'rgba(200,80,40,0.7)',
  },
  cat: {
    id: 'cat', name: '猫眼珠', hint: '累计 12 星解锁', unlockStars: 12,
    base: 'rgba(120,220,180,0.5)', highlight: 'rgba(255,255,255,0.9)', shadow: 'rgba(40,140,110,0.5)',
    spiral: false, stripe: true, pattern: 'rgba(20,80,120,0.8)',
  },
  steel: {
    id: 'steel', name: '钢珠', hint: '全关卡三星解锁', unlockStars: 999,
    base: 'rgba(190,195,200,0.9)', highlight: 'rgba(255,255,255,1)', shadow: 'rgba(90,95,100,0.8)',
    spiral: false, stripe: false, pattern: null,
  },
};
export const SKIN_ORDER = ['transparent', 'pattern', 'cat', 'steel'];
