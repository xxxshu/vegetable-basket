// Mock 数据模拟器：实现 axios 的 adapter 接口 —— 把"真正发请求"这一步替换成内存数据查询。
// 业务代码（src/api/*.js → src/utils/request.js）完全无感知；
// 把环境变量 VITE_USE_MOCK 改成 false，请求就会走真实后端（业务代码零改动）。
//
// 数据字段约定（与 docs/开发文档.md 5.1 节一致）：
// - ingredient.pricePerUnit：每「计价单位」的价格（单位：分）。
//   unitBase='g' 按每 kg 计价、unitBase='ml' 按每 L 计价、unitBase='个' 按每 个计价；
// - 金额统一留到 S7 用整数运算，避免浮点误差。
import { AxiosError } from 'axios'

import recipes from './data/recipes.json'

// 模拟网络延迟（毫秒）：保留"请求需要时间"的真实体感，便于后面验证 loading 态
const MOCK_DELAY = 200

// 错误注入时使用的提示文案：与开发文档 5.2 节的错误码约定对应
const MOCK_MESSAGES = {
  401: '登录已过期，请重新登录',
  403: '没有权限访问该资源',
  500: '服务器开小差了，请稍后重试',
}

// 菜谱列表排序器：sort 参数 → 比较函数（S4 菜谱库的排序下拉沿用这套取值）
const SORTERS = {
  default: (a, b) => a.id - b.id,
  'time-asc': (a, b) => a.timeMin - b.timeMin,
  'time-desc': (a, b) => b.timeMin - a.timeMin,
  'calories-asc': (a, b) => a.calories - b.calories,
  'calories-desc': (a, b) => b.calories - a.calories,
}

// 列表只返回卡片需要的字段：完整配方与步骤由后续的 GET /recipes/:id 提供（S4）
function toRecipeSummary(recipe) {
  return {
    id: recipe.id,
    title: recipe.title,
    cover: recipe.cover,
    description: recipe.description,
    categoryId: recipe.categoryId,
    method: recipe.method,
    difficulty: recipe.difficulty,
    calories: recipe.calories,
    timeMin: recipe.timeMin,
    baseServings: recipe.baseServings,
    status: recipe.status,
  }
}

// 菜谱列表 handler：模拟后端完成「只取上架 + 关键词/方式/品类/难度筛选 + 排序 + 分页」
function getRecipeListHandler(config) {
  const params = config.params || {}
  // URL 查询参数都是字符串，这里统一转成数字后再比较
  const page = Number(params.page) || 1
  const pageSize = Number(params.pageSize) || 10
  const keyword = String(params.keyword || '').trim()
  const method = String(params.method || '')
  const categoryId =
    params.categoryId === undefined || params.categoryId === '' ? null : Number(params.categoryId)
  const difficulty =
    params.difficulty === undefined || params.difficulty === '' ? null : Number(params.difficulty)

  // 前台菜谱库只展示已上架（status=1）的菜谱；管理端后续会带 status 参数查询全部
  let list = recipes.filter((recipe) => recipe.status === 1)

  // 关键词：标题或简介包含即命中（转小写比较，兼容英文关键词）
  if (keyword) {
    const lowerKeyword = keyword.toLowerCase()
    list = list.filter(
      (recipe) =>
        recipe.title.toLowerCase().includes(lowerKeyword) ||
        recipe.description.toLowerCase().includes(lowerKeyword),
    )
  }

  // 烹饪方式：精确匹配（如"炒"）
  if (method) list = list.filter((recipe) => recipe.method === method)

  // 品类 / 难度：数字精确匹配
  if (categoryId !== null) list = list.filter((recipe) => recipe.categoryId === categoryId)
  if (difficulty !== null) list = list.filter((recipe) => recipe.difficulty === difficulty)

  // 排序：未知 sort 值回退默认按 id 升序，避免脏参数导致列表乱序
  list = [...list].sort(SORTERS[params.sort] || SORTERS.default)

  // 分页：先算 total 再截取当前页；返回给前端的是"卡片摘要"而非完整配方
  const total = list.length
  const start = (page - 1) * pageSize
  const pageList = list.slice(start, start + pageSize).map(toRecipeSummary)
  return { list: pageList, total, page, pageSize }
}

// 路由表：method + 路径精确匹配；S1 只实现菜谱列表，其余接口随阶段逐个补充
const routes = [{ method: 'get', path: '/recipes', handler: getRecipeListHandler }]

// 读取注入的模拟状态码：优先请求头 x-mock-status，其次查询参数 _mockStatus
function getInjectedStatus(config) {
  const headers = config.headers || {}
  // config.headers 在 axios 里是 AxiosHeaders 实例（有 get 方法），这里同时兼容普通对象写法
  const headerValue =
    typeof headers.get === 'function' ? headers.get('x-mock-status') : headers['x-mock-status']
  const status = Number(headerValue || config.params?._mockStatus || 0)
  return Number.isFinite(status) && status > 0 ? status : 0
}

// 构造成功响应：结构必须与 axios 的响应对象一致，拦截器才能拿到 res.data
function buildSuccessResponse(config, data) {
  return { data, status: 200, statusText: 'OK', headers: {}, config, request: {} }
}

// 构造失败响应：模仿 axios 在 HTTP 非 2xx 时的行为（reject 一个带 response 的 AxiosError），
// 这样 S2 才能按 err.response.status === 401 做登录拦截
function buildErrorResponse(config, status, message) {
  const response = {
    data: { code: status, message },
    status,
    statusText: 'ERROR',
    headers: {},
    config,
    request: {},
  }
  return new AxiosError(message || 'Mock 请求失败', String(status), config, null, response)
}

// axios 自定义 adapter：返回 Promise；成功 resolve 响应对象，失败 reject AxiosError
export default async function mockAdapter(config) {
  // 1. 模拟网络延迟（真实项目里这里就是等网络返回）
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY))

  const method = String(config.method || 'get').toLowerCase()
  const path = String(config.url || '').split('?')[0]
  const route = routes.find((item) => item.method === method && item.path === path)

  // 2. 错误注入：用于验证拦截器的错误分支（例如注入 500 时页面是否弹 ElMessage.error）
  const injectedStatus = getInjectedStatus(config)
  if (injectedStatus) {
    return Promise.reject(buildErrorResponse(config, injectedStatus, MOCK_MESSAGES[injectedStatus]))
  }

  // 3. 未定义的接口：返回 404 + 控制台警告，方便第一时间发现接口路径写错
  if (!route) {
    console.warn(`[mock] 未定义的接口：${method.toUpperCase()} ${path}`)
    return Promise.reject(buildErrorResponse(config, 404, '接口不存在（mock 未定义）'))
  }

  // 4. 正常处理：handler 内抛错按 500 处理，保证页面永远拿到统一的错误结构
  try {
    const data = route.handler(config)
    return Promise.resolve(buildSuccessResponse(config, { code: 0, message: 'ok', data }))
  } catch (error) {
    console.warn(`[mock] 接口处理异常：${method.toUpperCase()} ${path}`, error)
    return Promise.reject(buildErrorResponse(config, 500, MOCK_MESSAGES[500]))
  }
}
