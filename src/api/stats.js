// 数据统计接口（S8）
// 数据来源：支出（S7 确认核算写入的 expenses）+ 一周计划 + 菜谱营养（每份）。
// 统计口径见各函数注释；金额一律「分」，由页面用 utils/format.js 转成元展示。
import request from '@/utils/request'

/**
 * 工作台概览：本周已排餐数、预估金额、实际支出、采购状态、待采购 Top5、临期库存、按天摘要
 * @param {{ weekStart?: string }} params 周一日期 YYYY-MM-DD（缺省为本周）
 * @returns {Promise<object>} 概览数据
 */
export function getStatsOverview(params) {
  return request.get('/stats/overview', { params })
}

/**
 * 支出趋势：按周汇总的支出金额（金额单位：分）
 * @param {{ weeks?: number }} params 统计周数（1 / 4 / 8，默认 8）
 * @returns {Promise<Array<{ weekStart: string, budget: number|null, actual: number }>>}
 */
export function getExpenseTrend(params) {
  return request.get('/stats/expense-trend', { params })
}

/**
 * 营养摄入：统计范围内「已排餐日」的日均营养 vs 成年人日均推荐值
 * @param {{ weekStart?: string, weeks?: number }} params 统计周数（1 / 4 / 8）
 * @returns {Promise<Record<string, { actual: number, recommend: number }>|null>}
 *   菜谱 nutrition 字段：protein/fat/carb/fiber/sodium；范围内没有计划时返回 null
 */
export function getNutritionStats(params) {
  return request.get('/stats/nutrition', { params })
}

/**
 * 品类占比：食材品类维度的金额（单位：分）
 * 口径：优先用范围内已确认核算的实际金额；没有核算数据时回退为计划聚合的预估金额
 * @param {{ weekStart?: string, weeks?: number }} params 统计周数（1 / 4 / 8）
 * @returns {Promise<Array<{ categoryName: string, amount: number }>>}
 */
export function getCategoryShare(params) {
  return request.get('/stats/category-share', { params })
}

/**
 * 菜谱分布：上架菜谱按烹饪方式统计数量（不随时间范围变化）
 * @returns {Promise<Array<{ method: string, count: number }>>}
 */
export function getRecipeDistribution() {
  return request.get('/stats/recipe-distribution')
}
