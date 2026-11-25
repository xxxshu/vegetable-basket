// 家庭设置接口（S9）
// 数据：成员数、周预算（分）、忌口食材、常备调料；采购聚合 / 工作台预算卡 / 统计预算线都会读取它。
import request from '@/utils/request'

/**
 * 查询家庭设置
 * @returns {Promise<{ id, name, memberCount, weekBudgetFen, preferences: string[], defaultPantry: string[] }>}
 *   weekBudgetFen 单位是「分」；preferences/defaultPantry 存食材名称或别名
 */
export function getFamily() {
  return request.get('/family')
}

/**
 * 保存家庭设置（只传需要修改的字段）
 * @param {object} data 可选字段：memberCount / weekBudgetFen / preferences / defaultPantry
 * @returns {Promise<object>} 更新后的家庭设置
 */
export function updateFamily(data) {
  return request.put('/family', data)
}
