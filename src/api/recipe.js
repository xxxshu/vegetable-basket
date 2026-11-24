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
