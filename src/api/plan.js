// 一周计划接口（S6）：周查询、增改删、复制上周
import request from '@/utils/request'

/**
 * 查询某一周的计划
 * @param {{ weekStart: string }} params 周一日期 YYYY-MM-DD
 * @returns {Promise<{ weekStart: string, items: object[] }>} items 已 join 菜谱信息与每份成本
 */
export function getPlan(params) {
  return request.get('/plans', { params })
}

/**
 * 添加一道菜到某一格的某一餐
 * @param {{ weekStart: string, date: string, mealType: string, recipeId: number, servings: number }} data
 * @returns {Promise<object>} 新增的计划项（已 join 菜谱信息）
 */
export function addPlanItem(data) {
  return request.post('/plans/items', data)
}

/**
 * 修改计划项（S6 主要改份数）
 * @param {number|string} id 计划项 id
 * @param {{ servings?: number }} data
 * @returns {Promise<object>} 更新后的计划项
 */
export function updatePlanItem(id, data) {
  return request.put(`/plans/items/${id}`, data)
}

/**
 * 删除计划项
 * @param {number|string} id 计划项 id
 * @returns {Promise<{ id: number }>}
 */
export function deletePlanItem(id) {
  return request.delete(`/plans/items/${id}`)
}

/**
 * 复制某一周的计划到另一周（mock 端整周复制；页面按交付物要求走"前端深拷贝 + 批量新增"）
 * @param {{ fromWeekStart: string, toWeekStart: string }} data
 * @returns {Promise<{ copied: number, weekStart: string }>}
 */
export function copyPlan(data) {
  return request.post('/plans/copy', data)
}
