// 字典接口：分类、食材（管理端菜谱编辑页的下拉数据源；后续页面也复用）
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
 * 查询食材字典（含单位/别名/均价/保质期，供表单与后续聚合使用）
 * @returns {Promise<object[]>} 食材列表
 */
export function getIngredients() {
  return request.get('/ingredients')
}
