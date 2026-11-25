// 智能配菜接口（S10）
// 推荐结果由 mock 基于真实数据（库存 / 家庭预算 / 本周计划 / 菜谱营养）计算，
// 算法本体在 utils/recommend.js 的纯函数里，页面只负责展示与"加入计划"。
import request from '@/utils/request'

/**
 * 获取本周智能配菜推荐（规则加权，不接大模型）
 * @param {{ weekStart?: string, topN?: number }} params 周一日期（缺省为本周）、返回条数（默认 7）
 * @returns {Promise<Array<{
 *   recipe: { id, title, cover, description, categoryName, method, difficulty, calories, timeMin, baseServings },
 *   score: number,
 *   costPerServingFen: number,
 *   scoreDetail: { stockHits: number, budget: number, nutrition: number, difficulty: number },
 *   stockHitNames: string[],
 *   reasons: string[],
 * }>>}
 */
export function getRecommendations(params) {
  return request.post('/ai/recommend', params)
}
