// 关卡数据（JSON 风格，渲染/物理读同一份）
// 世界坐标基于逻辑尺寸 800x600，渲染时缩放
// 难度设计：满力最远 ~570px，关卡直线距离控制在 300~480px（满力 85% 内可直射到）
// 障碍的作用是"增加思考/绕行"，不是"堵死"——确保直射距离够得着
export const WORLD_W = 800;
export const WORLD_H = 600;

export const LEVELS = [
  {
    id: 1, name: '老院子泥地', scene: 'dirt', maxShots: 4,
    start: { x: 100, y: 300 },
    hole: { x: 480, y: 300, r: 32 },   // 距离 380px，教学：基础蓄力
    obstacles: [],
  },
  {
    id: 2, name: '水泥台', scene: 'concrete', maxShots: 4,
    start: { x: 100, y: 300 },
    hole: { x: 520, y: 300, r: 32 },   // 距离 420px
    obstacles: [{ x: 310, y: 300, r: 14 }],  // 中路挡，需从上方/下方绕过
  },
  {
    id: 3, name: '土坡', scene: 'soil', maxShots: 5,
    start: { x: 100, y: 420 },
    hole: { x: 540, y: 180, r: 32 },   // 距离 ~484px（满力 85%）
    obstacles: [
      { x: 300, y: 360, r: 14 },
      { x: 440, y: 270, r: 14 },
    ], // 教学：远距离力度控制 + 绕斜角
  },
  {
    id: 4, name: '石板路', scene: 'stone', maxShots: 5,
    start: { x: 100, y: 300 },
    hole: { x: 540, y: 300, r: 32 },   // 距离 440px
    obstacles: [
      { x: 300, y: 300, r: 15 },
      { x: 420, y: 300, r: 15 },
    ], // 教学：借反弹穿缝（两障碍间留缝，需斜角打进）
  },
  {
    id: 5, name: '巷口', scene: 'alley', maxShots: 6,
    start: { x: 100, y: 440 },
    hole: { x: 560, y: 180, r: 32 },   // 距离 ~493px
    obstacles: [
      { x: 350, y: 360, r: 18 },
      { x: 480, y: 260, r: 16 },
      { x: 520, y: 360, r: 14 },
    ], // 教学：斜角 + 微调（洞半围，斜角进）
  },
  {
    id: 6, name: '排水沟台阶', scene: 'drain', maxShots: 7,
    start: { x: 90, y: 460 },
    hole: { x: 600, y: 140, r: 34 },   // 距离 ~584px（满力边缘，用障碍借力）
    obstacles: [
      { x: 230, y: 400, r: 13 },
      { x: 360, y: 330, r: 13 },
      { x: 470, y: 250, r: 13 },
      { x: 290, y: 230, r: 12 },
      { x: 430, y: 160, r: 12 },
    ], // 综合：多障碍 + 斜角借力
  },
];

export function getLevel(id) {
  return LEVELS.find((l) => l.id === id);
}
