// 库存接口（S7 查询用于采购聚合抵扣；S9 扩展为完整增删改）
import request from '@/utils/request'

/**
 * 查询家庭库存（采购聚合抵扣用：返回完整数组）
 * @returns {Promise<Array<{ id, ingredientId, amount, unit, boughtAt, expireAt }>>}
 */
export function getPantry() {
  return request.get('/pantry')
}

/**
 * 分页查询库存（库存页 ProTable 用，多返回食材名/品类/剩余天数等展示字段）
 * @param {{ keyword?: string, categoryId?: number|string, page?: number, pageSize?: number }} params
 * @returns {Promise<{ list: object[], total: number, page: number, pageSize: number }>}
 */
export function getPantryPage(params) {
  return request.get('/pantry', { params })
}

/**
 * 新增库存：同一食材不同批次分行记录，各自有购买日与到期日
 * @param {{ ingredientId: number, amount: number, unit?: string, boughtAt?: string, expireAt?: string }} data
 * @returns {Promise<object>} 新增后的库存行
 */
export function createPantryItem(data) {
  return request.post('/pantry', data)
}

/**
 * 编辑库存（数量 / 单位 / 购买日 / 到期日）
 * @param {number|string} id 库存 id
 * @param {object} data 需要修改的字段
 * @returns {Promise<object>} 更新后的库存行
 */
export function updatePantryItem(id, data) {
  return request.put(`/pantry/${id}`, data)
}

/**
 * 删除库存行
 * @param {number|string} id 库存 id
 * @returns {Promise<{ id: number }>}
 */
export function deletePantryItem(id) {
  return request.delete(`/pantry/${id}`)
}
