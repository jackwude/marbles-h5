// 关卡数据（JSON 风格，渲染/物理读同一份）
// 世界坐标基于逻辑尺寸 800x600，渲染时缩放
// 难度设计：满力最远 ~570px，关卡距离控制在 300~520px（60~90% 力度）
export const WORLD_W = 800;
export const WORLD_H = 600;

export const LEVELS = [
  {
    id: 1, name: '老院子泥地', scene: 'dirt', maxShots: 4,
    start: { x: 100, y: 300 },
    hole: { x: 500, y: 300, r: 32 },   // 距离 400px，力度 ~0.6
    obstacles: [],
  },
  {
    id: 2, name: '水泥台', scene: 'concrete', maxShots: 4,
    start: { x: 100, y: 300 },
    hole: { x: 520, y: 300, r: 32 },   // 距离 420px
    obstacles: [{ x: 310, y: 300, r: 16 }],  // 中路挡一个，需轻微偏移
  },
  {
    id: 3, name: '土坡', scene: 'soil', maxShots: 5,
    start: { x: 100, y: 460 },
    hole: { x: 620, y: 120, r: 32 },   // 斜线距离 ~588px（满力）
    obstacles: [
      { x: 300, y: 400, r: 15 },
      { x: 480, y: 280, r: 15 },
    ],
  },
  {
    id: 4, name: '石板路', scene: 'stone', maxShots: 5,
    start: { x: 100, y: 300 },
    hole: { x: 560, y: 300, r: 32 },   // 距离 460px
    obstacles: [
      { x: 300, y: 280, r: 12 },
      { x: 380, y: 320, r: 12 },
      { x: 460, y: 280, r: 12 },
    ], // 之字形通道
  },
  {
    id: 5, name: '巷口', scene: 'alley', maxShots: 6,
    start: { x: 100, y: 460 },
    hole: { x: 620, y: 140, r: 32 },   // 斜线 ~560px
    obstacles: [
      { x: 350, y: 380, r: 20 },
      { x: 500, y: 260, r: 18 },
      { x: 560, y: 380, r: 16 },
    ], // 洞被半围，斜角进
  },
  {
    id: 6, name: '排水沟台阶', scene: 'drain', maxShots: 7,
    start: { x: 90, y: 500 },
    hole: { x: 650, y: 100, r: 34 },   // 斜线 ~620px 最远
    obstacles: [
      { x: 230, y: 430, r: 14 },
      { x: 360, y: 350, r: 14 },
      { x: 490, y: 270, r: 14 },
      { x: 300, y: 220, r: 13 },
      { x: 470, y: 150, r: 13 },
    ], // 综合：多障碍 + 窄洞位
  },
];

export function getLevel(id) {
  return LEVELS.find((l) => l.id === id);
}
