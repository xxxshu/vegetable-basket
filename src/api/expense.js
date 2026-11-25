// 支出接口（S7：完成采购后写入支出；S8 统计图表会读取）
import request from '@/utils/request'

/**
 * 查询支出记录
 * @param {object} [params] 预留查询条件（如时间范围）
 * @returns {Promise<Array<object>>} 支出列表
 */
export function getExpenseList(params) {
  return request.get('/expenses', { params })
}
