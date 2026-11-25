// 字典接口：分类、食材（菜谱编辑页下拉、采购聚合、S9 管理端字典管理共用）
// 说明：GET 接口不传 page 时返回数组（字典场景）；传 page 时返回分页对象（管理端 ProTable 场景）
import request from '@/utils/request'

/**
 * 查询分类字典
 * @param {object} params 可选：{ type: 'ingredient' | 'method' }
 * @returns {Promise<object[]>} 分类列表
 */
export function getCategories(params) {
  return request.get('/categories', { params })
}

/**
 * 分页查询分类（管理端分类管理页 ProTable 用）
 * @param {{ keyword?: string, type?: string, page?: number, pageSize?: number }} params
 * @returns {Promise<{ list: object[], total: number, page: number, pageSize: number }>}
 */
export function getCategoryPage(params) {
  return request.get('/categories', { params })
}

/**
 * 新增分类
 * @param {{ name: string, type: 'ingredient'|'method', sort?: number }} data
 * @returns {Promise<object>} 新增后的分类
 */
export function createCategory(data) {
  return request.post('/categories', data)
}

/**
 * 编辑分类（类型不可修改；烹饪方式改名会联动更新菜谱的 method）
 * @param {number|string} id 分类 id
 * @param {{ name?: string, sort?: number }} data
 * @returns {Promise<object>} 更新后的分类
 */
export function updateCategory(id, data) {
  return request.put(`/categories/${id}`, data)
}

/**
 * 删除分类（被食材 / 菜谱引用时后端会拒绝）
 * @param {number|string} id 分类 id
 * @returns {Promise<{ id: number }>}
 */
export function deleteCategory(id) {
  return request.delete(`/categories/${id}`)
}

/**
 * 查询食材字典（含单位/别名/均价/保质期，供表单与聚合使用）
 * @returns {Promise<object[]>} 食材列表
 */
export function getIngredients() {
  return request.get('/ingredients')
}

/**
 * 分页查询食材（管理端食材字典页 ProTable 用）
 * @param {{ keyword?: string, categoryId?: number|string, page?: number, pageSize?: number }} params
 * @returns {Promise<{ list: object[], total: number, page: number, pageSize: number }>}
 */
export function getIngredientPage(params) {
  return request.get('/ingredients', { params })
}

/**
 * 新增食材
 * @param {object} data { name, categoryId, unitBase, pricePerUnit(分), aliases, shelfLifeDays }
 * @returns {Promise<object>} 新增后的食材
 */
export function createIngredient(data) {
  return request.post('/ingredients', data)
}

/**
 * 编辑食材（已被菜谱引用的食材不能改基准单位）
 * @param {number|string} id 食材 id
 * @param {object} data 需要修改的字段
 * @returns {Promise<object>} 更新后的食材
 */
export function updateIngredient(id, data) {
  return request.put(`/ingredients/${id}`, data)
}

/**
 * 删除食材（被菜谱 / 库存 / 采购核算引用时后端会拒绝）
 * @param {number|string} id 食材 id
 * @returns {Promise<{ id: number }>}
 */
export function deleteIngredient(id) {
  return request.delete(`/ingredients/${id}`)
}
