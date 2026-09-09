// 关卡数据（JSON 风格，渲染/物理读同一份）
// 世界坐标基于逻辑尺寸 800x600，渲染时缩放
export const WORLD_W = 800;
export const WORLD_H = 600;

export const LEVELS = [
  {
    id: 1, name: '老院子泥地', scene: 'dirt', maxShots: 4,
    start: { x: 100, y: 300 },
    hole: { x: 650, y: 300, r: 32 },
    obstacles: [],
  },
  {
    id: 2, name: '水泥台', scene: 'concrete', maxShots: 4,
    start: { x: 100, y: 300 },
    hole: { x: 650, y: 300, r: 32 },
    obstacles: [{ x: 400, y: 300, r: 18 }],
  },
  {
    id: 3, name: '土坡', scene: 'soil', maxShots: 5,
    start: { x: 80, y: 500 },
    hole: { x: 660, y: 140, r: 32 },
    obstacles: [
      { x: 300, y: 420, r: 16 },
      { x: 500, y: 320, r: 16 },
    ],
  },
  {
    id: 4, name: '石板路', scene: 'stone', maxShots: 5,
    start: { x: 100, y: 300 },
    hole: { x: 640, y: 300, r: 32 },
    obstacles: [
      { x: 350, y: 300, r: 14 },
      { x: 430, y: 300, r: 14 },
      { x: 510, y: 300, r: 14 },
    ], // 缝道：需要借反弹穿缝
  },
  {
    id: 5, name: '巷口', scene: 'alley', maxShots: 6,
    start: { x: 100, y: 480 },
    hole: { x: 660, y: 130, r: 32 },
    obstacles: [
      { x: 400, y: 300, r: 24 },
      { x: 560, y: 240, r: 20 },
      { x: 620, y: 420, r: 18 },
    ], // 洞被障碍半围，斜角能进
  },
  {
    id: 6, name: '排水沟台阶', scene: 'drain', maxShots: 7,
    start: { x: 90, y: 520 },
    hole: { x: 660, y: 90, r: 34 },
    obstacles: [
      { x: 240, y: 440, r: 16 },
      { x: 380, y: 360, r: 16 },
      { x: 520, y: 280, r: 16 },
      { x: 300, y: 200, r: 15 },
      { x: 480, y: 160, r: 15 },
    ], // 综合：多障碍 + 窄洞位
  },
];

export function getLevel(id) {
  return LEVELS.find((l) => l.id === id);
}
