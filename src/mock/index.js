// Mock 数据模拟器：实现 axios 的 adapter 接口 —— 把"真正发请求"这一步替换成内存数据查询。
// 业务代码（src/api/*.js → src/utils/request.js）完全无感知；
// 把环境变量 VITE_USE_MOCK 改成 false，请求就会走真实后端（业务代码零改动）。
//
// 数据字段约定（与 docs/开发文档.md 5.1 节一致）：
// - ingredient.pricePerUnit：每「计价单位」的价格（单位：分）。
//   unitBase='g' 按每 kg 计价、unitBase='ml' 按每 L 计价、unitBase='个' 按每 个计价；
// - 金额统一留到 S7 用整数运算，避免浮点误差。
import { AxiosError } from 'axios'

import categories from './data/categories.json'
import ingredients from './data/ingredients.json'
import recipes from './data/recipes.json'
import users from './data/users.json'

// 模拟 token 前缀：mock 环境没有真服务端 session，用 "mock-token-用户名" 让刷新页面后仍能找回用户
const MOCK_TOKEN_PREFIX = 'mock-token-'

// 模拟网络延迟（毫秒）：保留"请求需要时间"的真实体感，便于后面验证 loading 态
const MOCK_DELAY = 200

// 错误注入时使用的提示文案：与开发文档 5.2 节的错误码约定对应
const MOCK_MESSAGES = {
  401: '登录已过期，请重新登录',
  403: '没有权限访问该资源',
  500: '服务器开小差了，请稍后重试',
}

// ---------- 认证接口用到的工具（S2）----------

// 业务错误：HTTP 200 + code != 0（如密码错误），走响应拦截器的业务失败分支
function businessError(code, message) {
  const error = new Error(message)
  error.businessCode = code
  throw error
}

// HTTP 错误：真正返回非 2xx（如 token 失效的 401），走响应拦截器的错误分支
function httpError(status, message) {
  const error = new Error(message)
  error.httpStatus = status
  throw error
}

// 解析请求体：axios 默认把对象转成 JSON 字符串，这里同时兼容对象与字符串两种形态
function parseBody(config) {
  if (!config.data) return {}
  if (typeof config.data === 'string') {
    try {
      return JSON.parse(config.data)
    } catch {
      return {}
    }
  }
  return config.data
}

// 从请求头取 token：兼容 AxiosHeaders 实例（有 get 方法）与普通对象
function getBearerToken(config) {
  const headers = config.headers || {}
  const authorization =
    typeof headers.get === 'function' ? headers.get('Authorization') : headers.Authorization
  if (!authorization) return ''
  return String(authorization).replace(/^Bearer\s+/i, '')
}

// 只返回前端需要的字段：密码绝对不能出现在响应里
function toUserInfo(user) {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatar: user.avatar,
    role: user.role,
  }
}

// 菜谱列表排序器：sort 参数 → 比较函数（S4 菜谱库的排序下拉沿用这套取值）
const SORTERS = {
  default: (a, b) => a.id - b.id,
  'time-asc': (a, b) => a.timeMin - b.timeMin,
  'time-desc': (a, b) => b.timeMin - a.timeMin,
  'calories-asc': (a, b) => a.calories - b.calories,
  'calories-desc': (a, b) => b.calories - a.calories,
}

// 列表只返回卡片需要的字段：完整配方与步骤由 GET /recipes/:id 提供（S4）
function toRecipeSummary(recipe) {
  // 品类名用于卡片标签展示（列表里只存 categoryId，这里 join 出名称）
  const categoryName = categories.find((item) => item.id === recipe.categoryId)?.name || ''
  return {
    id: recipe.id,
    title: recipe.title,
    cover: recipe.cover,
    description: recipe.description,
    categoryId: recipe.categoryId,
    categoryName,
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

// ---------- 菜谱详情 / 收藏 handler（S4）----------

// mock 内存里的收藏集合：让接口"看起来可用"；真正的收藏状态以 Pinia 持久化为准
const favoriteRecipeIds = new Set()

// 详情：返回完整配方（食材 join 出名称与基准单位），不存在或已下架返回 404
function getRecipeDetailHandler(config, routeParams) {
  const recipe = recipes.find((item) => item.id === Number(routeParams.id))
  if (!recipe || recipe.status !== 1) httpError(404, '菜谱不存在或已下架')

  const categoryName = categories.find((item) => item.id === recipe.categoryId)?.name || ''
  const detailIngredients = recipe.ingredients.map((row) => {
    const ingredient = ingredients.find((item) => item.id === row.ingredientId)
    return {
      ...row,
      name: ingredient?.name || '',
      unitBase: ingredient?.unitBase || '',
    }
  })
  return { ...recipe, categoryName, ingredients: detailIngredients }
}

// 切换收藏：返回最新收藏状态（前端再把结果写进 recipe store）
function toggleFavoriteHandler(config, routeParams) {
  const recipeId = Number(routeParams.id)
  if (!recipes.some((item) => item.id === recipeId)) httpError(404, '菜谱不存在')

  if (favoriteRecipeIds.has(recipeId)) favoriteRecipeIds.delete(recipeId)
  else favoriteRecipeIds.add(recipeId)
  return { favorite: favoriteRecipeIds.has(recipeId) }
}

// ---------- 认证接口 handler（S2）----------

// 登录：校验用户名/密码/账号状态，成功后返回 token + 用户信息
function loginHandler(config) {
  const { username = '', password = '' } = parseBody(config)
  const user = users.find((item) => item.username === username)

  // 用户名或密码错误：业务错误（HTTP 200 + code 400），让拦截器统一弹出 message
  if (!user || user.password !== password) businessError(400, '用户名或密码错误')
  // 账号被禁用：业务错误 403
  if (user.status !== 1) businessError(403, '账号已被禁用，请联系管理员')

  // token 里带用户名：刷新页面后 mock 仍能根据 token 找回用户（不需要服务端 session）
  return {
    token: `${MOCK_TOKEN_PREFIX}${user.username}`,
    userInfo: toUserInfo(user),
  }
}

// 获取当前用户：校验 Authorization 里的 token，无效返回 401（交给拦截器做登录过期处理）
function getMeHandler(config) {
  const token = getBearerToken(config)
  const user = token.startsWith(MOCK_TOKEN_PREFIX)
    ? users.find((item) => item.username === token.slice(MOCK_TOKEN_PREFIX.length))
    : null

  if (!user || user.status !== 1) httpError(401, '登录已过期，请重新登录')
  return toUserInfo(user)
}

// 路由表：method + 路径匹配；带 :id 的动态段由 findRoute 用正则匹配，其余接口随阶段补充
const routes = [
  { method: 'get', path: '/recipes', handler: getRecipeListHandler },
  { method: 'get', path: '/recipes/:id', handler: getRecipeDetailHandler },
  { method: 'post', path: '/recipes/:id/favorite', handler: toggleFavoriteHandler },
  { method: 'post', path: '/auth/login', handler: loginHandler },
  { method: 'get', path: '/auth/me', handler: getMeHandler },
]

// 把带动态段的路由路径编译成正则 + 参数名：
// '/recipes/:id' → { keys: ['id'], regex: /^\/recipes\/([^/]+)\/?$/ }
function compileRoutePath(path) {
  const keys = []
  const segments = path
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1))
        return '([^/]+)'
      }
      // 静态段：转义正则特殊字符后原样匹配
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
  return { keys, regex: new RegExp(`^/${segments.join('/')}/?$`) }
}

const compiledRoutes = routes.map((route) => ({ ...route, ...compileRoutePath(route.path) }))

/**
 * 匹配请求路由
 * 先做静态路径精确匹配（保证 /recipes 不会被 /recipes/:id 抢走），再按顺序匹配动态路由
 * @param {string} method 请求方法（小写）
 * @param {string} path 请求路径（不含查询串）
 * @returns {{ route: object, params: object } | null}
 */
function findRoute(method, path) {
  const staticRoute = routes.find((item) => item.method === method && item.path === path)
  if (staticRoute) return { route: staticRoute, params: {} }

  for (const item of compiledRoutes) {
    if (item.method !== method) continue
    const result = item.regex.exec(path)
    if (!result) continue
    const params = {}
    item.keys.forEach((key, index) => {
      params[key] = result[index + 1]
    })
    return { route: item, params }
  }
  return null
}

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
  const matched = findRoute(method, path)

  // 2. 错误注入：用于验证拦截器的错误分支（例如注入 500 时页面是否弹 ElMessage.error）
  const injectedStatus = getInjectedStatus(config)
  if (injectedStatus) {
    return Promise.reject(buildErrorResponse(config, injectedStatus, MOCK_MESSAGES[injectedStatus]))
  }

  // 3. 未定义的接口：返回 404 + 控制台警告，方便第一时间发现接口路径写错
  if (!matched) {
    console.warn(`[mock] 未定义的接口：${method.toUpperCase()} ${path}`)
    return Promise.reject(buildErrorResponse(config, 404, '接口不存在（mock 未定义）'))
  }

  // 4. 正常处理：handler 内抛错按错误类型区分处理，保证页面拿到统一的结构
  try {
    // 第二个参数是路径参数（如 { id: '3' }），静态路由时为空对象
    const data = matched.route.handler(config, matched.params)
    return Promise.resolve(buildSuccessResponse(config, { code: 0, message: 'ok', data }))
  } catch (error) {
    // 业务错误：HTTP 200 + code != 0（如登录密码错误），交给响应拦截器的业务失败分支
    if (error.businessCode) {
      return Promise.resolve(
        buildSuccessResponse(config, { code: error.businessCode, message: error.message }),
      )
    }
    // HTTP 错误：真正返回非 2xx（如 token 失效的 401），交给响应拦截器的错误分支
    if (error.httpStatus) {
      return Promise.reject(buildErrorResponse(config, error.httpStatus, error.message))
    }
    // 其它未知异常：统一按 500 处理
    console.warn(`[mock] 接口处理异常：${method.toUpperCase()} ${path}`, error)
    return Promise.reject(buildErrorResponse(config, 500, MOCK_MESSAGES[500]))
  }
}
