// 库存接口（S7 只提供查询：采购清单生成时用于抵扣；S9 在此基础上扩展增删改）
import request from '@/utils/request'

/**
 * 查询家庭库存
 * @returns {Promise<Array<{ id, ingredientId, amount, unit, boughtAt, expireAt }>>}
 */
export function getPantry() {
  return request.get('/pantry')
}
