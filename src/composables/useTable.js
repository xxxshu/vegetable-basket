// 表格通用状态 composable（S5）
// 职责：统一管理「loading / list / total / 分页参数 / 拉取 / 重置」，避免每个列表页重写分页逻辑。
// 说明：ProTable 内部使用它；后续需要自定义表格的页面也可以直接用。
import { reactive, ref } from 'vue'

/**
 * 创建表格状态
 * @param {Function} api 列表接口：params => Promise<{ list, total }>
 * @param {object} initialParams 初始查询参数（不含分页；会与分页参数合并）
 * @returns {{ loading, list, total, params, getList, reset }}
 */
export function useTable(api, initialParams = {}) {
  // 请求中状态：表格 loading / 骨架统一用它
  const loading = ref(false)
  // 当前页数据
  const list = ref([])
  // 总条数：分页组件用
  const total = ref(0)
  // 查询参数：业务条件 + page/pageSize（默认每页 10 条）
  const params = reactive({ page: 1, pageSize: 10, ...initialParams })

  /**
   * 按当前 params 拉取列表
   * 副作用：更新 list / total / loading
   */
  async function getList() {
    loading.value = true
    try {
      const data = await api({ ...params })
      list.value = data.list
      total.value = data.total
    } finally {
      // 无论成功失败都关闭 loading（错误提示由请求层统一弹出）
      loading.value = false
    }
  }

  /**
   * 重置查询条件并回到第 1 页
   * @param {object} resetParams 需要额外覆盖的查询条件
   */
  function reset(resetParams = {}) {
    Object.assign(params, initialParams, resetParams, { page: 1 })
    return getList()
  }

  return { loading, list, total, params, getList, reset }
}
