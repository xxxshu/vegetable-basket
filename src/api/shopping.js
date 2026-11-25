// 采购清单 / 核算清单接口（S7 重构）
// 流程：生成采购清单 → 逐项改分量 → 确认清单（锁定）→ 生成核算清单 → 录入实际分量/金额 → 确认核算（写支出）
import request from '@/utils/request'

/**
 * 查询某一周的采购清单（未生成时返回 null）
 * @param {{ weekStart: string }} params 周一日期 YYYY-MM-DD
 * @returns {Promise<object|null>}
 */
export function getShoppingList(params) {
  return request.get('/shopping', { params })
}

/**
 * 生成 / 重新生成某一周的采购清单（清单已确认时后端会拒绝）
 * @param {{ weekStart: string }} data
 * @returns {Promise<object>} 采购清单（含 groups / unmergeableGroup / summary）
 */
export function generateShoppingList(data) {
  return request.post('/shopping/generate', data)
}

/**
 * 修改采购清单某一项的分量（建议量只是初始值，用户可自由修改）
 * @param {number|string} id 清单项 id
 * @param {number} amount 新的分量（整数最小单位）
 * @returns {Promise<object>} 更新后的清单项（display / priceFen 同步重算）
 */
export function updateShoppingItem(id, amount) {
  return request.patch(`/shopping/items/${id}`, { amount })
}

/**
 * 手动添加一条采购清单项
 * @param {{ weekStart: string, ingredientId: number, amount: number, unit: string, note?: string }} data
 * @returns {Promise<object>} 更新后的采购清单
 */
export function addShoppingItem(data) {
  return request.post('/shopping/items', data)
}

/**
 * 删除一条采购清单项
 * @param {number|string} id 清单项 id
 * @returns {Promise<{ id: number, summary: object }>}
 */
export function deleteShoppingItem(id) {
  return request.delete(`/shopping/items/${id}`)
}

/**
 * 确认采购清单：状态置 confirmed 并锁定（之后不能改分量/增删/重新生成）
 * @param {number|string} id 采购清单 id
 * @returns {Promise<object>} 确认后的采购清单
 */
export function confirmShoppingList(id) {
  return request.post(`/shopping/${id}/confirm`)
}

/**
 * 查询某一周的核算清单（未生成时返回 null）
 * @param {{ weekStart: string }} params
 * @returns {Promise<object|null>}
 */
export function getShoppingAccount(params) {
  return request.get('/shopping/account', { params })
}

/**
 * 从已确认的采购清单生成核算清单草稿（默认带出食材、建议分量与预估金额，用户可改）
 * @param {{ weekStart: string }} data
 * @returns {Promise<object>} 核算清单
 */
export function createShoppingAccount(data) {
  return request.post('/shopping/account', data)
}

/**
 * 修改核算清单项的分量 / 金额
 * @param {number|string} id 核算项 id
 * @param {{ amount?: number, priceFen?: number }} data 分量（整数最小单位）与金额（分）
 * @returns {Promise<object>} 更新后的核算项
 */
export function updateShoppingAccountItem(id, data) {
  return request.patch(`/shopping/account/items/${id}`, data)
}

/**
 * 手动添加一条核算项
 * @param {{ weekStart: string, ingredientId: number, amount: number, unit: string, priceFen?: number, note?: string }} data
 * @returns {Promise<object>} 更新后的核算清单
 */
export function addShoppingAccountItem(data) {
  return request.post('/shopping/account/items', data)
}

/**
 * 删除一条核算项
 * @param {number|string} id 核算项 id
 * @returns {Promise<object>} 更新后的核算清单
 */
export function deleteShoppingAccountItem(id) {
  return request.delete(`/shopping/account/items/${id}`)
}

/**
 * 确认核算：状态置 done、锁定，并按实付金额写入一条支出记录
 * @param {number|string} id 核算清单 id
 * @returns {Promise<object>} 确认后的核算清单
 */
export function confirmShoppingAccount(id) {
  return request.post(`/shopping/account/${id}/confirm`)
}
