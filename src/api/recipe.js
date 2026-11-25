// 菜谱相关接口：页面必须通过这里访问菜谱数据，禁止在页面里直接写 axios
import request from '@/utils/request'

/**
 * 查询菜谱列表（分页 + 筛选 + 排序）
 * @param {object} params 查询参数：keyword / method / categoryId / difficulty / sort / page / pageSize
 * @returns {Promise<{ list: object[], total: number, page: number, pageSize: number }>}
 */
export function getRecipeList(params) {
  return request.get('/recipes', { params })
}

/**
 * 查询菜谱详情（含食材清单与步骤）
 * @param {number|string} id 菜谱 id
 * @returns {Promise<object>} 菜谱详情（含 ingredients[] 与 steps[]，食材已 join 出 name）
 */
export function getRecipeDetail(id) {
  return request.get(`/recipes/${id}`)
}

/**
 * 切换收藏状态（收藏/取消收藏由后端决定当前状态）
 * @param {number|string} id 菜谱 id
 * @returns {Promise<{ favorite: boolean }>} 最新收藏状态
 */
export function toggleFavorite(id) {
  return request.post(`/recipes/${id}/favorite`)
}

// ---------- 管理端 CRUD（S5）----------

/**
 * 新增菜谱
 * @param {object} data 菜谱表单数据（含 ingredients / steps）
 * @returns {Promise<object>} 新建后的菜谱
 */
export function createRecipe(data) {
  return request.post('/recipes', data)
}

/**
 * 更新菜谱
 * @param {number|string} id 菜谱 id
 * @param {object} data 菜谱表单数据（含 ingredients / steps）
 * @returns {Promise<object>} 更新后的菜谱
 */
export function updateRecipe(id, data) {
  return request.put(`/recipes/${id}`, data)
}

/**
 * 删除菜谱
 * @param {number|string} id 菜谱 id
 * @returns {Promise<{ id: number }>}
 */
export function deleteRecipe(id) {
  return request.delete(`/recipes/${id}`)
}

/**
 * 更新菜谱上下架状态
 * @param {number|string} id 菜谱 id
 * @param {number} status 1=上架，0=下架
 * @returns {Promise<{ id: number, status: number }>}
 */
export function updateRecipeStatus(id, status) {
  return request.put(`/recipes/${id}/status`, { status })
}
