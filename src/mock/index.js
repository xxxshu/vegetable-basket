// Mock 数据模拟器：实现 axios 的 adapter 接口 —— 把"真正发请求"这一步替换成内存数据查询。
// 业务代码（src/api/*.js → src/utils/request.js）完全无感知；
// 把环境变量 VITE_USE_MOCK 改成 false，请求就会走真实后端（业务代码零改动）。
//
// 数据字段约定（与 docs/开发文档.md 5.1 节一致）：
// - ingredient.pricePerUnit：每「计价单位」的价格（单位：分）。
//   unitBase='g' 按每 kg 计价、unitBase='ml' 按每 L 计价、unitBase='个' 按每 个计价；
// - 金额统一留到 S7 用整数运算，避免浮点误差。
import { AxiosError } from 'axios'

import { aggregateShoppingList } from '@/utils/aggregate'
import { DEFAULT_PANTRY } from '@/utils/constants'
import { addDays, formatDate, getWeekStart, getWeekdayLabel, parseDate } from '@/utils/date'
import { deepClone } from '@/utils/deepClone'
import { canMerge, normalize, toDisplay } from '@/utils/unit'

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

// 从请求头 token 反查当前 mock 用户：用于区分家庭用户 / 管理员的数据范围
function getCurrentMockUser(config) {
  const token = getBearerToken(config)
  if (!token.startsWith(MOCK_TOKEN_PREFIX)) return null
  const username = token.slice(MOCK_TOKEN_PREFIX.length)
  return users.find((item) => item.username === username) || null
}
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

  // 数据范围：家庭用户只看已上架（status=1）；管理员默认看全部，可用 status 参数再筛
  const currentUser = getCurrentMockUser(config)
  const isAdmin = currentUser?.role === 'admin'
  const statusParam =
    params.status === undefined || params.status === '' ? null : Number(params.status)
  let list = recipes.filter((recipe) => {
    if (statusParam !== null) return recipe.status === statusParam
    return isAdmin ? true : recipe.status === 1
  })

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

// 详情：返回完整配方（食材 join 出名称与基准单位），家庭用户看不到下架菜谱
function getRecipeDetailHandler(config, routeParams) {
  const recipe = recipes.find((item) => item.id === Number(routeParams.id))
  const isAdmin = getCurrentMockUser(config)?.role === 'admin'
  // 管理员需要编辑下架菜谱，允许查看；家庭用户只看上架菜谱
  if (!recipe || (!isAdmin && recipe.status !== 1)) httpError(404, '菜谱不存在或已下架')

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

// ---------- 字典接口 handler（S5 建立，S9 扩展管理端增删改）----------

// 分类类型：ingredient=食材品类（菜谱分类/采购分组）、method=烹饪方式（菜谱做法）
const CATEGORY_TYPES = ['ingredient', 'method']

/**
 * 分类查询：
 * - 不传 page → 返回数组（菜谱筛选、编辑页下拉等字典场景，保持旧结构）
 * - 传 page → 返回分页对象（管理端分类管理页 ProTable 用）
 * @param {object} config axios 配置（params: type / keyword / page / pageSize）
 */
function getCategoriesHandler(config) {
  const params = config.params || {}
  const type = params.type
  const keyword = String(params.keyword || '').trim()

  let list = categories.filter((item) => (type ? item.type === type : true))
  if (keyword) list = list.filter((item) => item.name.includes(keyword))

  if (params.page !== undefined && params.page !== '') return paginateList(list, params)
  return list
}

// 分类重名校验：同一 type 下不允许重名（编辑时排除自己）
function ensureCategoryNameUnique(name, type, excludeId) {
  const duplicated = categories.some(
    (item) => item.type === type && item.name === name && item.id !== Number(excludeId),
  )
  if (duplicated) businessError(400, `分类「${name}」已存在`)
}

// 生成分类 id：食材品类走 1-99 段、烹饪方式走 101+ 段，保持与种子数据风格一致
function nextCategoryId(type) {
  const sameType = categories.filter((item) => item.type === type)
  const floor = type === 'method' ? 100 : 0
  return sameType.reduce((max, item) => Math.max(max, item.id), floor) + 1
}

// 新增分类
function createCategoryHandler(config) {
  const body = parseBody(config)
  const name = String(body.name || '').trim()
  const type = String(body.type || '')
  if (!name) businessError(400, '分类名称不能为空')
  if (!CATEGORY_TYPES.includes(type)) businessError(400, '分类类型不合法')
  ensureCategoryNameUnique(name, type)

  const item = {
    id: nextCategoryId(type),
    name,
    type,
    sort: Math.max(0, Math.round(Number(body.sort) || 0)),
  }
  categories.push(item)
  return item
}

// 编辑分类：类型不允许改（已有数据引用它）；烹饪方式改名时联动更新菜谱 method 字段
function updateCategoryHandler(config, routeParams) {
  const item = categories.find((row) => row.id === Number(routeParams.id))
  if (!item) httpError(404, '分类不存在')

  const body = parseBody(config)
  if (body.type && body.type !== item.type) businessError(400, '分类类型创建后不可修改')

  const name = String(body.name ?? item.name).trim()
  if (!name) businessError(400, '分类名称不能为空')
  ensureCategoryNameUnique(name, item.type, item.id)

  // 烹饪方式在菜谱里以名称字符串存储（recipe.method），改名时要同步历史菜谱，避免数据对不上
  if (item.type === 'method' && name !== item.name) {
    recipes.forEach((recipe) => {
      if (recipe.method === item.name) recipe.method = name
    })
  }
  item.name = name
  if (body.sort !== undefined) item.sort = Math.max(0, Math.round(Number(body.sort) || 0))
  return item
}

// 删除分类：被食材/菜谱引用时拒绝，避免出现"分类不存在"的脏数据
function deleteCategoryHandler(config, routeParams) {
  const item = categories.find((row) => row.id === Number(routeParams.id))
  if (!item) httpError(404, '分类不存在')

  if (item.type === 'method') {
    const used = recipes.some((recipe) => recipe.method === item.name)
    if (used) businessError(400, '该烹饪方式已被菜谱使用，不能删除')
  } else {
    const usedByIngredient = ingredients.some((row) => row.categoryId === item.id)
    const usedByRecipe = recipes.some((row) => row.categoryId === item.id)
    if (usedByIngredient || usedByRecipe) businessError(400, '该品类下还有食材或菜谱，不能删除')
  }

  categories.splice(categories.indexOf(item), 1)
  return { id: item.id }
}

/**
 * 食材查询：
 * - 不传 page → 返回数组（菜谱编辑/采购聚合等字典场景）
 * - 传 page → 返回分页对象（管理端食材字典页 ProTable 用）
 * 支持 keyword（名称/别名）与 categoryId 过滤；额外 join 出 categoryName 方便管理页展示。
 */
function getIngredientsHandler(config) {
  const params = config.params || {}
  const keyword = String(params.keyword || '').trim()
  const categoryId =
    params.categoryId === undefined || params.categoryId === '' ? null : Number(params.categoryId)

  let list = ingredients
  if (keyword) {
    list = list.filter(
      (item) =>
        item.name.includes(keyword) ||
        (item.aliases || []).some((alias) => alias.includes(keyword)),
    )
  }
  if (categoryId !== null) list = list.filter((item) => item.categoryId === categoryId)

  // join 品类名：管理端表格直接展示，字典调用方多一个字段也无影响
  const rows = list.map((item) => ({
    ...item,
    categoryName: categories.find((category) => category.id === item.categoryId)?.name || '其他',
  }))
  if (params.page !== undefined && params.page !== '') return paginateList(rows, params)
  return rows
}

// 食材重名校验
function ensureIngredientNameUnique(name, excludeId) {
  const duplicated = ingredients.some((item) => item.name === name && item.id !== Number(excludeId))
  if (duplicated) businessError(400, `食材「${name}」已存在`)
}

// 别名归一：支持数组，也支持管理页输入的「逗号/顿号分隔字符串」
function normalizeAliases(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === 'string') {
    return value
      .split(/[,，、]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

// 校验并整理食材表单（新增/编辑共用）
function normalizeIngredientPayload(body, currentItem) {
  const name = String(body.name ?? currentItem?.name ?? '').trim()
  if (!name) businessError(400, '食材名称不能为空')
  ensureIngredientNameUnique(name, currentItem?.id)

  const categoryId = Number(body.categoryId ?? currentItem?.categoryId)
  const category = categories.find((item) => item.id === categoryId && item.type === 'ingredient')
  if (!category) businessError(400, '请选择食材品类')

  const unitBase = String(body.unitBase ?? currentItem?.unitBase ?? 'g')
  if (!['g', 'ml', '个'].includes(unitBase)) businessError(400, '基准单位只能是 g / ml / 个')
  // 已被菜谱引用的食材不能改基准单位：菜谱用量按旧单位存，改了口径会导致聚合结果错误
  if (currentItem && unitBase !== currentItem.unitBase) {
    const referenced = recipes.some((recipe) =>
      recipe.ingredients.some((row) => row.ingredientId === currentItem.id),
    )
    if (referenced) businessError(400, '该食材已被菜谱引用，不能修改基准单位')
  }

  // 单价：每计价单位的价格（分）——g/ml 按每 1000 单位、个按每个
  const pricePerUnit = Math.round(Number(body.pricePerUnit ?? currentItem?.pricePerUnit ?? 0))
  if (!Number.isFinite(pricePerUnit) || pricePerUnit < 0) businessError(400, '单价不能为负数')

  const shelfLifeDays = Math.round(Number(body.shelfLifeDays ?? currentItem?.shelfLifeDays ?? 7))
  if (!(shelfLifeDays >= 1 && shelfLifeDays <= 3650)) {
    businessError(400, '保质期需在 1-3650 天之间')
  }

  const aliases =
    body.aliases === undefined ? currentItem?.aliases || [] : normalizeAliases(body.aliases)

  return { name, categoryId, unitBase, pricePerUnit, aliases, shelfLifeDays }
}

// 新增食材（新食材默认没有历史引用，可以自由选基准单位）
function createIngredientHandler(config) {
  const payload = normalizeIngredientPayload(parseBody(config))
  const item = { id: nextId(ingredients), ...payload }
  ingredients.push(item)
  return item
}

// 编辑食材
function updateIngredientHandler(config, routeParams) {
  const item = ingredients.find((row) => row.id === Number(routeParams.id))
  if (!item) httpError(404, '食材不存在')
  Object.assign(item, normalizeIngredientPayload(parseBody(config), item))
  return item
}

// 删除食材：被菜谱 / 库存 / 采购核算引用时拒绝删除
function deleteIngredientHandler(config, routeParams) {
  const item = ingredients.find((row) => row.id === Number(routeParams.id))
  if (!item) httpError(404, '食材不存在')

  const usedByRecipe = recipes.some((recipe) =>
    recipe.ingredients.some((row) => row.ingredientId === item.id),
  )
  if (usedByRecipe) businessError(400, '该食材已被菜谱使用，不能删除')
  if (pantryItems.some((row) => row.ingredientId === item.id)) {
    businessError(400, '该食材还有库存记录，请先删除库存')
  }
  const usedByShopping = shoppingLists.some((list) => {
    const rows = list.groups.flatMap((group) => group.items)
    return [...rows, ...list.unmergeableGroup.items].some((row) => row.ingredientId === item.id)
  })
  const usedByAccount = shoppingAccounts.some((account) =>
    account.items.some((row) => row.ingredientId === item.id),
  )
  if (usedByShopping || usedByAccount) businessError(400, '该食材已被采购/核算清单使用，不能删除')

  ingredients.splice(ingredients.indexOf(item), 1)
  return { id: item.id }
}

// ---------- 菜谱 CRUD handler（S5，直接操作内存数组让增删改真的生效）----------

// 取列表里下一个可用 id（现有最大值 + 1）
function nextId(list) {
  return list.reduce((max, item) => Math.max(max, item.id), 0) + 1
}

/**
 * 通用分页：管理端列表接口传了 page 参数时返回分页对象，未传时由各 handler 返回完整数组
 * （保持字典下拉接口 GET /categories、GET /ingredients 的旧返回结构不变）
 * @param {object[]} list 完整列表
 * @param {object} params 查询参数（page / pageSize）
 * @returns {{ list: object[], total: number, page: number, pageSize: number }}
 */
function paginateList(list, params = {}) {
  // 页码/每页条数都做兜底，非法值按第 1 页、每页 10 条处理
  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = Math.max(1, Number(params.pageSize) || 10)
  const start = (page - 1) * pageSize
  return { list: list.slice(start, start + pageSize), total: list.length, page, pageSize }
}

// 取所有菜谱配方行 / 步骤行里的下一个可用 id（保证新增行不与旧行冲突）
function nextGlobalRowId(key) {
  let max = 0
  recipes.forEach((recipe) => {
    recipe[key].forEach((row) => {
      max = Math.max(max, row.id)
    })
  })
  return max + 1
}

// 校验并整理菜谱表单（新增/编辑共用）：返回基础字段 + 配方行/步骤行
function normalizeRecipePayload(body) {
  const title = String(body.title || '').trim()
  if (!title) businessError(400, '菜谱名称不能为空')
  if (!body.categoryId) businessError(400, '请选择菜谱分类')
  if (!body.method) businessError(400, '请选择烹饪方式')
  if (!body.difficulty) businessError(400, '请选择难度')

  const ingredientsInput = Array.isArray(body.ingredients) ? body.ingredients : []
  if (ingredientsInput.length === 0) businessError(400, '至少需要一条食材')
  const ingredientRows = ingredientsInput.map((row, index) => {
    if (!row.ingredientId) businessError(400, `第 ${index + 1} 行食材未选择`)
    if (!(Number(row.amount) > 0)) businessError(400, `第 ${index + 1} 行食材用量必须大于 0`)
    return {
      ingredientId: Number(row.ingredientId),
      amount: Number(row.amount),
      unit: row.unit || 'g',
      perServings: Number(body.baseServings) || 2,
      optional: Boolean(row.optional),
    }
  })

  const stepsInput = Array.isArray(body.steps) ? body.steps : []
  if (stepsInput.length === 0) businessError(400, '至少需要一个步骤')
  const stepRows = stepsInput.map((step, index) => {
    const content = String(step.content || '').trim()
    if (!content) businessError(400, `第 ${index + 1} 步内容不能为空`)
    return { order: index + 1, content, durationMin: Number(step.durationMin) || 0 }
  })

  return {
    base: {
      title,
      cover: body.cover || '',
      description: String(body.description || '').trim(),
      categoryId: Number(body.categoryId),
      method: body.method,
      difficulty: Number(body.difficulty),
      calories: Number(body.calories) || 0,
      protein: Number(body.protein) || 0,
      fat: Number(body.fat) || 0,
      carb: Number(body.carb) || 0,
      fiber: Number(body.fiber) || 0,
      sodium: Number(body.sodium) || 0,
      timeMin: Number(body.timeMin) || 0,
      baseServings: Number(body.baseServings) || 2,
      status: Number(body.status) === 0 ? 0 : 1,
    },
    ingredientRows,
    stepRows,
  }
}

// 把「基础字段 + 配方行/步骤行」组装成完整菜谱对象（分配行 id）
function buildRecipe(id, payload) {
  let ingredientRowId = nextGlobalRowId('ingredients')
  let stepRowId = nextGlobalRowId('steps')
  return {
    id,
    ...payload.base,
    ingredients: payload.ingredientRows.map((row) => ({
      id: ingredientRowId++,
      recipeId: id,
      ...row,
    })),
    steps: payload.stepRows.map((row) => ({
      id: stepRowId++,
      recipeId: id,
      ...row,
    })),
  }
}

// 新增菜谱：push 进内存数组，列表立刻能查到
function createRecipeHandler(config) {
  const payload = normalizeRecipePayload(parseBody(config))
  const recipe = buildRecipe(nextId(recipes), payload)
  recipes.push(recipe)
  return recipe
}

// 更新菜谱：替换内存数组里的那一条（配方行/步骤行重新生成）
function updateRecipeHandler(config, routeParams) {
  const index = recipes.findIndex((item) => item.id === Number(routeParams.id))
  if (index < 0) httpError(404, '菜谱不存在')
  const payload = normalizeRecipePayload(parseBody(config))
  const recipe = buildRecipe(recipes[index].id, payload)
  recipes.splice(index, 1, recipe)
  return recipe
}

// 删除菜谱：从内存数组移除
function deleteRecipeHandler(config, routeParams) {
  const index = recipes.findIndex((item) => item.id === Number(routeParams.id))
  if (index < 0) httpError(404, '菜谱不存在')
  const [removed] = recipes.splice(index, 1)
  return { id: removed.id }
}

// 更新上下架状态
function updateRecipeStatusHandler(config, routeParams) {
  const recipe = recipes.find((item) => item.id === Number(routeParams.id))
  if (!recipe) httpError(404, '菜谱不存在')
  const body = parseBody(config)
  recipe.status = Number(body.status) === 0 ? 0 : 1
  return { id: recipe.id, status: recipe.status }
}

// ---------- 一周计划 mock（S6）----------

// 内存数据：plans 一周一条；planItems 是格子里的菜（对应数据模型的 meal_plan / meal_plan_item）
const plans = []
const planItems = []
let planSeedId = 1
let planItemSeedId = 1

// 餐次排序权重：同一天内按 早餐 → 午餐 → 晚餐 排列
const MEAL_ORDER = { breakfast: 0, lunch: 1, dinner: 2 }

// 找某一周的计划，没有就创建（新增计划项时用）
function ensurePlan(weekStart) {
  let plan = plans.find((item) => item.weekStart === weekStart)
  if (!plan) {
    plan = { id: planSeedId++, familyId: 1, weekStart }
    plans.push(plan)
  }
  return plan
}

// 计算某道菜「每份」的预估成本（分）：
// 食材用量 × 每计价单位价格；g/ml 的 pricePerUnit 是"每 1000 单位"价格，需要 /1000
function calcRecipeCostFenByServing(recipe) {
  const totalFen = recipe.ingredients.reduce((sum, row) => {
    const ingredient = ingredients.find((item) => item.id === row.ingredientId)
    if (!ingredient) return sum
    const amount = Number(row.amount) || 0
    const isWeightOrVolume = ingredient.unitBase === 'g' || ingredient.unitBase === 'ml'
    const cost = isWeightOrVolume
      ? (ingredient.pricePerUnit * amount) / 1000
      : ingredient.pricePerUnit * amount
    return sum + cost
  }, 0)
  // 换算成"每份"成本：基础成本 / 默认份数
  return Math.round(totalFen / (recipe.baseServings || 1))
}

// 计划项返回给前端：join 菜谱摘要 + 每份成本（右栏汇总用）
function toPlanItemResponse(item) {
  const recipe = recipes.find((row) => row.id === item.recipeId)
  return {
    id: item.id,
    date: item.date,
    mealType: item.mealType,
    recipeId: item.recipeId,
    servings: item.servings,
    // 每份成本（分）：右栏金额 = Σ unitCostFen × servings
    unitCostFen: recipe ? calcRecipeCostFenByServing(recipe) : 0,
    recipe: recipe
      ? {
          id: recipe.id,
          title: recipe.title,
          cover: recipe.cover,
          calories: recipe.calories,
          method: recipe.method,
          difficulty: recipe.difficulty,
          timeMin: recipe.timeMin,
          baseServings: recipe.baseServings,
        }
      : { id: item.recipeId, title: '菜谱已删除', cover: '', calories: 0 },
  }
}

// 种子上周计划：让「复制上周」一进页面就能验收（日期相对"今天"动态生成）
function seedLastWeekPlan() {
  const currentWeekStart = getWeekStart(new Date())
  const lastWeekStart = addDays(currentWeekStart, -7)
  const plan = ensurePlan(lastWeekStart)
  const seedItems = [
    { offset: 0, mealType: 'breakfast', recipeId: 10, servings: 2 }, // 小米粥
    { offset: 0, mealType: 'dinner', recipeId: 2, servings: 3 }, // 红烧肉
    { offset: 1, mealType: 'lunch', recipeId: 1, servings: 2 }, // 番茄炒蛋
    { offset: 2, mealType: 'dinner', recipeId: 4, servings: 2 }, // 清蒸鲈鱼
    { offset: 3, mealType: 'lunch', recipeId: 3, servings: 3 }, // 宫保鸡丁
    { offset: 4, mealType: 'dinner', recipeId: 8, servings: 2 }, // 鱼香肉丝
  ]
  seedItems.forEach((item, index) => {
    planItems.push({
      id: planItemSeedId++,
      planId: plan.id,
      date: addDays(lastWeekStart, item.offset),
      mealType: item.mealType,
      recipeId: item.recipeId,
      servings: item.servings,
      sort: index,
    })
  })
}
seedLastWeekPlan()

// 查询某一周计划：按日期 + 餐次排序返回
function getPlanHandler(config) {
  const weekStart = String(config.params?.weekStart || getWeekStart(new Date()))
  const plan = plans.find((item) => item.weekStart === weekStart)
  const items = plan ? planItems.filter((item) => item.planId === plan.id) : []
  const sorted = [...items].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (MEAL_ORDER[a.mealType] ?? 0) - (MEAL_ORDER[b.mealType] ?? 0) ||
      a.id - b.id,
  )
  return { weekStart, items: sorted.map(toPlanItemResponse) }
}

// 添加计划项：定位到某一周 + 某一天 + 某一餐
function addPlanItemHandler(config) {
  const body = parseBody(config)
  const weekStart = String(body.weekStart || '').trim()
  if (!weekStart) businessError(400, '缺少周起始日期')
  if (!body.date || !body.mealType || !body.recipeId) businessError(400, '计划项参数不完整')
  if (!['breakfast', 'lunch', 'dinner'].includes(body.mealType)) businessError(400, '餐次不合法')

  const recipe = recipes.find((item) => item.id === Number(body.recipeId))
  if (!recipe) httpError(404, '菜谱不存在')

  const plan = ensurePlan(weekStart)
  const item = {
    id: planItemSeedId++,
    planId: plan.id,
    date: String(body.date),
    mealType: body.mealType,
    recipeId: recipe.id,
    // 份数限制在 1-10，和前端 el-input-number 保持一致
    servings: Math.max(1, Math.min(10, Number(body.servings) || 1)),
    sort: planItems.filter((row) => row.planId === plan.id).length,
  }
  planItems.push(item)
  return toPlanItemResponse(item)
}

// 修改计划项（S6 主要改份数）
function updatePlanItemHandler(config, routeParams) {
  const item = planItems.find((row) => row.id === Number(routeParams.id))
  if (!item) httpError(404, '计划项不存在')
  const body = parseBody(config)
  if (body.servings !== undefined) {
    item.servings = Math.max(1, Math.min(10, Number(body.servings) || 1))
  }
  return toPlanItemResponse(item)
}

// 删除计划项
function deletePlanItemHandler(config, routeParams) {
  const index = planItems.findIndex((row) => row.id === Number(routeParams.id))
  if (index < 0) httpError(404, '计划项不存在')
  const [removed] = planItems.splice(index, 1)
  return { id: removed.id }
}

// 复制整周计划（mock 端实现；页面按交付物要求走"前端深拷贝 + 批量新增"，此接口保留给真实后端实现）
function copyPlanHandler(config) {
  const body = parseBody(config)
  const fromWeekStart = String(body.fromWeekStart || '')
  const toWeekStart = String(body.toWeekStart || '')
  if (!fromWeekStart || !toWeekStart) businessError(400, '缺少周起始日期')

  const sourcePlan = plans.find((item) => item.weekStart === fromWeekStart)
  const sourceItems = sourcePlan ? planItems.filter((item) => item.planId === sourcePlan.id) : []
  const targetPlan = ensurePlan(toWeekStart)
  const sourceStart = parseDate(fromWeekStart)

  sourceItems.forEach((item) => {
    // 保持"星期几"不变：计算相差天数后加到目标周的周一上
    const offsetDays = Math.round((parseDate(item.date) - sourceStart) / 86400000)
    planItems.push({
      id: planItemSeedId++,
      planId: targetPlan.id,
      date: addDays(toWeekStart, offsetDays),
      mealType: item.mealType,
      recipeId: item.recipeId,
      servings: item.servings,
      sort: item.sort,
    })
  })
  return { copied: sourceItems.length, weekStart: toWeekStart }
}

// ---------- 采购清单 + 核算清单 mock（S7 重构）----------

// 内存数据：pantryItems 库存（S9 扩展增删改）、shoppingLists 采购清单、shoppingAccounts 核算清单、expenses 支出
const pantryItems = []
const shoppingLists = []
const shoppingAccounts = []
const expenses = []
let pantrySeedId = 1
let shoppingSeedId = 1
let shoppingItemSeedId = 1
let shoppingAccountSeedId = 1
let shoppingAccountItemSeedId = 1
let expenseSeedId = 1

// 演示用历史支出种子（S8 统计图表用）：预置近 7 周支出，让「近 4 / 近 8 周支出趋势」一进页面就有数据。
// 注意：当前周不预置，保留 S7「确认核算后才写支出」的验收路径（当前周支出 = 0，确认核算后再 +1 条）。
const EXPENSE_DEMO_AMOUNTS = [28600, 31250, 25800, 30120, 27400, 29500, 26300]

// 生成历史支出：index=0 表示上一周（周日在周内核算），依次往前推 7 周
function seedDemoExpenses() {
  const currentWeekStart = getWeekStart(new Date())
  EXPENSE_DEMO_AMOUNTS.forEach((amountFen, index) => {
    const weekStart = addDays(currentWeekStart, -(index + 1) * 7)
    expenses.push({
      id: expenseSeedId++,
      familyId: 1,
      date: addDays(weekStart, 6),
      amountFen,
      note: `采购核算 ${weekStart}`,
      categoryId: null,
    })
  })
}
seedDemoExpenses()

// ---------- 家庭设置 mock（S9）----------

// 家庭设置：成员数 / 周预算（分）/ 忌口食材 / 常备调料
// 默认常备调料沿用 S7 的 DEFAULT_PANTRY、忌口为空，保证"不改设置时采购清单结果与 S7 完全一致"
const family = {
  id: 1,
  name: '我的家庭',
  memberCount: 3,
  weekBudgetFen: 40000, // 周预算（分）：默认 ¥400
  preferences: [], // 忌口食材名称/别名（如「虾」，聚合时按别名归一）
  defaultPantry: [...DEFAULT_PANTRY], // 常备调料名称/别名（默认过滤，不写进采购清单）
}

/**
 * 把字符串数组去重并去掉空白项：设置页提交的忌口/常备调料都是名称数组
 * @param {unknown} value 任意值
 * @returns {string[]|null} 非法输入返回 null（表示本次不改该字段）
 */
function normalizeNameList(value) {
  if (!Array.isArray(value)) return null
  const names = value.map((item) => String(item).trim()).filter(Boolean)
  return [...new Set(names)]
}

// 查询家庭设置：工作台预算卡、统计预算线、采购聚合都读它
function getFamilyHandler() {
  return family
}

// 保存家庭设置：只更新传入的字段；数值做范围校验，名称数组去重
function updateFamilyHandler(config) {
  const body = parseBody(config)

  if (body.memberCount !== undefined) {
    const memberCount = Math.round(Number(body.memberCount))
    if (!(memberCount >= 1 && memberCount <= 10)) businessError(400, '家庭成员数需为 1-10')
    family.memberCount = memberCount
  }

  if (body.weekBudgetFen !== undefined) {
    const weekBudgetFen = Math.round(Number(body.weekBudgetFen))
    if (!Number.isFinite(weekBudgetFen) || weekBudgetFen < 0) businessError(400, '周预算不能为负数')
    family.weekBudgetFen = weekBudgetFen
  }

  const preferences = normalizeNameList(body.preferences)
  if (preferences) family.preferences = preferences

  const defaultPantry = normalizeNameList(body.defaultPantry)
  if (defaultPantry) family.defaultPantry = defaultPantry

  return family
}

const UNMERGEABLE_GROUP_NAME = '不可换算（按需购买）'

// 种子库存：让「建议采购量」一进页面就能看到库存抵扣效果（土豆/番茄部分抵扣、鸡蛋完全覆盖）
function seedPantry() {
  const today = formatDate(new Date())
  const seed = [
    { name: '土豆', amount: 400, unit: 'g' },
    { name: '番茄', amount: 150, unit: 'g' },
    { name: '鸡蛋', amount: 2, unit: '个' },
  ]
  seed.forEach((row) => {
    const ingredient = ingredients.find((item) => item.name === row.name)
    if (!ingredient) return
    pantryItems.push({
      id: pantrySeedId++,
      familyId: 1,
      ingredientId: ingredient.id,
      amount: row.amount,
      unit: row.unit,
      boughtAt: today,
      expireAt: addDays(today, ingredient.shelfLifeDays || 7),
    })
  })
}
seedPantry()

// 把库存行 join 上食材名称 / 品类 / 保质期，并算出"剩余天数"（负数表示已过期）
function toPantryRow(item) {
  const ingredient = ingredients.find((row) => row.id === item.ingredientId)
  const category = categories.find((row) => row.id === ingredient?.categoryId)
  const today = formatDate(new Date())
  return {
    id: item.id,
    familyId: item.familyId,
    ingredientId: item.ingredientId,
    name: ingredient ? ingredient.name : '未知食材',
    categoryId: ingredient?.categoryId ?? null,
    categoryName: category?.name || '其他',
    unitBase: ingredient?.unitBase || item.unit,
    shelfLifeDays: ingredient?.shelfLifeDays ?? 0,
    amount: item.amount,
    unit: item.unit,
    display: toDisplay(item.amount, item.unit),
    boughtAt: item.boughtAt,
    expireAt: item.expireAt,
    // 剩余天数：到期日 - 今天（都是 00:00 的本地日期，除以一天毫秒数）
    daysLeft: Math.round((parseDate(item.expireAt) - parseDate(today)) / 86400000),
  }
}

/**
 * 校验并整理库存表单（新增 / 编辑共用）
 * 规则：食材必须存在；数量 > 0；单位必须能换算成食材基准单位（保证聚合抵扣可用）；
 * 数量统一归一成整数最小单位（g/ml/个）；到期日缺省按「购买日 + 食材保质期」计算。
 * @param {object} body 请求体
 * @param {object} [currentItem] 编辑时的原记录（新增时为空）
 * @returns {{ ingredientId:number, amount:number, unit:string, boughtAt:string, expireAt:string }}
 */
function normalizePantryPayload(body, currentItem) {
  const ingredientId = Number(body.ingredientId ?? currentItem?.ingredientId)
  const ingredient = ingredients.find((row) => row.id === ingredientId)
  if (!ingredient) httpError(404, '食材不存在')

  const rawAmount = body.amount === undefined ? currentItem?.amount : body.amount
  const amount = Math.round(Number(rawAmount) || 0)
  if (amount <= 0) businessError(400, '数量必须大于 0')

  const rawUnit = body.unit ?? currentItem?.unit ?? ingredient.unitBase
  if (!canMerge(rawUnit, ingredient.unitBase)) businessError(400, '单位与食材基准单位不可换算')
  const normalized = normalize(amount, rawUnit)

  const boughtAt = String(body.boughtAt ?? currentItem?.boughtAt ?? formatDate(new Date()))
  const expireAt = String(
    body.expireAt ?? currentItem?.expireAt ?? addDays(boughtAt, ingredient.shelfLifeDays || 7),
  )
  return {
    ingredientId: ingredient.id,
    amount: normalized.amount,
    unit: normalized.unit,
    boughtAt,
    expireAt,
  }
}

/**
 * 库存查询：
 * - 不传 page → 返回数组（S7 采购聚合抵扣用，保持旧结构）
 * - 传 page → 返回分页对象（S9 库存页 ProTable 用）
 * 支持 keyword（食材名）与 categoryId 过滤；按到期日升序（临期/过期优先展示）。
 */
function getPantryHandler(config) {
  const params = config.params || {}
  const keyword = String(params.keyword || '').trim()
  const categoryId =
    params.categoryId === undefined || params.categoryId === '' ? null : Number(params.categoryId)

  let rows = pantryItems.map(toPantryRow)
  if (keyword) rows = rows.filter((row) => row.name.includes(keyword))
  if (categoryId !== null) rows = rows.filter((row) => row.categoryId === categoryId)

  // 到期日升序：快过期的排在前面，库存页一眼能看到要优先吃的食材
  rows.sort((a, b) => a.expireAt.localeCompare(b.expireAt) || a.id - b.id)

  if (params.page !== undefined && params.page !== '') return paginateList(rows, params)
  return rows
}

// 新增库存：同一食材不同批次分行记录（各自有购买日/到期日）
function createPantryHandler(config) {
  const payload = normalizePantryPayload(parseBody(config))
  const item = { id: pantrySeedId++, familyId: 1, ...payload }
  pantryItems.push(item)
  return toPantryRow(item)
}

// 编辑库存：只允许改数量 / 单位 / 购买日 / 到期日（食材不变）
function updatePantryHandler(config, routeParams) {
  const item = pantryItems.find((row) => row.id === Number(routeParams.id))
  if (!item) httpError(404, '库存记录不存在')
  Object.assign(item, normalizePantryPayload(parseBody(config), item))
  return toPantryRow(item)
}

// 删除库存
function deletePantryHandler(config, routeParams) {
  const index = pantryItems.findIndex((row) => row.id === Number(routeParams.id))
  if (index < 0) httpError(404, '库存记录不存在')
  const [removed] = pantryItems.splice(index, 1)
  return { id: removed.id }
}

// 组装聚合引擎的输入：mock 端从"后端数据"直接构建（前端则通过接口拼装，两边都喂给同一个纯函数）
function buildShoppingInput(weekStart) {
  const plan = plans.find((item) => item.weekStart === weekStart)
  const weekItems = plan
    ? planItems
        .filter((item) => item.planId === plan.id)
        .map((item) => ({
          recipeId: item.recipeId,
          servings: item.servings,
          date: item.date,
          mealType: item.mealType,
        }))
    : []

  const recipeMap = {}
  recipes.forEach((recipe) => {
    recipeMap[recipe.id] = {
      baseServings: recipe.baseServings,
      ingredients: recipe.ingredients.map((row) => ({
        ingredientId: row.ingredientId,
        amount: row.amount,
        unit: row.unit,
      })),
    }
  })

  const ingredientMap = {}
  ingredients.forEach((ingredient) => {
    ingredientMap[ingredient.id] = {
      id: ingredient.id,
      name: ingredient.name,
      aliases: ingredient.aliases,
      unitBase: ingredient.unitBase,
      pricePerUnit: ingredient.pricePerUnit,
      categoryId: ingredient.categoryId,
    }
  })

  return {
    weekItems,
    recipeMap,
    ingredientMap,
    categories: categories
      .filter((item) => item.type === 'ingredient')
      .map((item) => ({ id: item.id, name: item.name })),
    // 常备调料 / 忌口来自家庭设置（S9）：设置默认值等于 S7 的 DEFAULT_PANTRY + 空忌口
    defaultPantry: family.defaultPantry,
    stock: pantryItems.map((row) => ({
      ingredientId: row.ingredientId,
      amount: row.amount,
      unit: row.unit,
    })),
    preferences: family.preferences,
  }
}

// ===== 8 步聚合：mock 的 generate 内部同样调用聚合纯函数，返回"后端结果"供前端对照 =====
function buildShoppingAggregation(weekStart) {
  return aggregateShoppingList(buildShoppingInput(weekStart))
}

/** 把聚合结果加上清单项 id / 建议分量，变成可存储、可编辑的采购清单 */
function createShoppingList(weekStart) {
  const aggregation = buildShoppingAggregation(weekStart)
  return {
    id: shoppingSeedId++,
    familyId: 1,
    weekStart,
    status: 'draft',
    createdAt: formatDate(new Date()),
    groups: aggregation.groups.map((group) => ({
      ...group,
      items: group.items.map((item) => ({
        ...item,
        id: shoppingItemSeedId++,
        // 建议采购量 = 聚合结果（已扣库存），作为表单默认值，用户可自由修改
        suggestedAmount: item.amount,
        suggestedDisplay: item.display,
        source: 'plan',
        note: '',
      })),
    })),
    unmergeableGroup: {
      ...aggregation.unmergeableGroup,
      items: aggregation.unmergeableGroup.items.map((item) => ({
        ...item,
        id: shoppingItemSeedId++,
        suggestedAmount: item.amount,
        suggestedDisplay: item.display,
        source: 'plan',
        note: '',
      })),
    },
    summary: { ...aggregation.summary },
  }
}

// 重新汇总采购清单数字（改分量 / 手动添加 / 删除后调用）
function recalcShoppingSummary(list) {
  let itemCount = 0
  let estAmountFen = 0
  list.groups.forEach((group) => {
    group.items.forEach((item) => {
      itemCount += 1
      estAmountFen += item.priceFen
    })
  })
  list.unmergeableGroup.items.forEach((item) => {
    itemCount += 1
    estAmountFen += item.priceFen
  })
  list.summary = {
    itemCount,
    groupCount: list.groups.length,
    recipeCount: list.summary?.recipeCount || 0,
    estAmountFen,
  }
}

/** 按 id 找清单 + 清单项（改分量 / 删除用） */
function findShoppingItem(itemId) {
  const targetId = Number(itemId)
  for (const list of shoppingLists) {
    for (const group of list.groups) {
      const item = group.items.find((row) => row.id === targetId)
      if (item) return { list, group, item }
    }
    const unmergeableItem = list.unmergeableGroup.items.find((row) => row.id === targetId)
    if (unmergeableItem) return { list, group: list.unmergeableGroup, item: unmergeableItem }
  }
  return null
}

/** 计算一条采购项金额（分）：与聚合引擎的计价规则一致 */
function calcItemPriceFen(ingredient, amount, unit) {
  const price = Number(ingredient.pricePerUnit) || 0
  if (unit === 'g' || unit === 'ml') return Math.round((price * amount) / 1000)
  return Math.round(price * amount)
}

/** 采购清单必须是草稿状态才允许修改（确认后锁定） */
function ensureDraftShoppingList(list) {
  if (!list) httpError(404, '采购清单不存在')
  if (list.status !== 'draft') businessError(400, '采购清单已确认，不能继续修改')
  return list
}

// 查询某周采购清单：未生成返回 null
function getShoppingHandler(config) {
  const weekStart = String(config.params?.weekStart || getWeekStart(new Date()))
  return shoppingLists.find((item) => item.weekStart === weekStart) || null
}

// 生成/重新生成某周采购清单（已确认的清单不允许重新生成）
function generateShoppingHandler(config) {
  const body = parseBody(config)
  const weekStart = String(body.weekStart || getWeekStart(new Date()))
  const plan = plans.find((item) => item.weekStart === weekStart)
  const weeklyItemCount = plan ? planItems.filter((row) => row.planId === plan.id).length : 0
  if (weeklyItemCount === 0) businessError(400, '本周还没有排餐，请先去一周计划页排菜')

  const existing = shoppingLists.find((item) => item.weekStart === weekStart)
  if (existing?.status === 'confirmed') {
    businessError(400, '采购清单已确认，不能重新生成')
  }

  const list = createShoppingList(weekStart)
  if (existing) shoppingLists.splice(shoppingLists.indexOf(existing), 1, list)
  else shoppingLists.push(list)
  return list
}

// 修改采购项分量：建议量只是初始值，用户填多少就存多少（金额按食材均价重算）
function patchShoppingItemHandler(config, routeParams) {
  const found = findShoppingItem(routeParams.id)
  if (!found) httpError(404, '采购项不存在')
  ensureDraftShoppingList(found.list)

  const body = parseBody(config)
  const amount = Math.round(Number(body.amount) || 0)
  if (amount <= 0) businessError(400, '分量必须大于 0')

  const item = found.item
  item.amount = amount
  item.display = toDisplay(amount, item.unit)
  // 不可换算项无法按均价计价，金额保持 0；可换算项按整数最小单位重算金额（分）
  if (found.list.groups.includes(found.group)) {
    const ingredient = ingredients.find((row) => row.id === item.ingredientId)
    item.priceFen = ingredient ? calcItemPriceFen(ingredient, amount, item.unit) : 0
  } else {
    item.priceFen = 0
  }
  recalcShoppingSummary(found.list)
  return item
}

// 删除采购项（草稿状态才可删）
function deleteShoppingItemHandler(config, routeParams) {
  const found = findShoppingItem(routeParams.id)
  if (!found) httpError(404, '采购项不存在')
  ensureDraftShoppingList(found.list)

  const items = found.group.items
  const index = items.findIndex((row) => row.id === found.item.id)
  if (index >= 0) items.splice(index, 1)
  recalcShoppingSummary(found.list)
  return { id: found.item.id, summary: found.list.summary }
}

// 手动添加采购项：清单不存在时先建空草稿；已确认时拒绝
function addShoppingItemHandler(config) {
  const body = parseBody(config)
  const weekStart = String(body.weekStart || getWeekStart(new Date()))
  const ingredient = ingredients.find((item) => item.id === Number(body.ingredientId))
  if (!ingredient) httpError(404, '食材不存在')

  const amount = Math.round(Number(body.amount) || 0)
  if (amount <= 0) businessError(400, '分量必须大于 0')
  const unit = body.unit || ingredient.unitBase
  if (!canMerge(unit, ingredient.unitBase)) businessError(400, '单位与食材基准单位不可换算')
  const normalized = normalize(amount, unit)

  let list = shoppingLists.find((item) => item.weekStart === weekStart)
  if (!list) {
    list = {
      id: shoppingSeedId++,
      familyId: 1,
      weekStart,
      status: 'draft',
      createdAt: formatDate(new Date()),
      groups: [],
      unmergeableGroup: { categoryName: UNMERGEABLE_GROUP_NAME, items: [] },
      summary: { itemCount: 0, groupCount: 0, recipeCount: 0, estAmountFen: 0 },
    }
    shoppingLists.push(list)
  }
  ensureDraftShoppingList(list)

  // 按品类找分组，没有就新建
  let group = list.groups.find((item) => Number(item.categoryId) === Number(ingredient.categoryId))
  if (!group) {
    group = {
      categoryId: ingredient.categoryId,
      categoryName: categories.find((item) => item.id === ingredient.categoryId)?.name || '其他',
      items: [],
    }
    list.groups.push(group)
    list.groups.sort((a, b) => Number(a.categoryId) - Number(b.categoryId))
  }

  // 同食材 + 同单位已存在 → 分量与金额合并
  const priceFen = calcItemPriceFen(ingredient, normalized.amount, normalized.unit)
  const existing = group.items.find(
    (item) => item.ingredientId === ingredient.id && item.unit === normalized.unit,
  )
  if (existing) {
    existing.amount += normalized.amount
    existing.suggestedAmount += normalized.amount
    existing.display = toDisplay(existing.amount, existing.unit)
    existing.suggestedDisplay = toDisplay(existing.suggestedAmount, existing.unit)
    existing.priceFen += priceFen
    existing.source = 'manual'
  } else {
    group.items.push({
      id: shoppingItemSeedId++,
      key: `${ingredient.id}__${normalized.unit}`,
      ingredientId: ingredient.id,
      name: ingredient.name,
      amount: normalized.amount,
      unit: normalized.unit,
      display: toDisplay(normalized.amount, normalized.unit),
      suggestedAmount: normalized.amount,
      suggestedDisplay: toDisplay(normalized.amount, normalized.unit),
      priceFen,
      stockShort: false,
      source: 'manual',
      note: String(body.note || ''),
    })
    group.items.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
  }

  recalcShoppingSummary(list)
  return list
}

// 确认采购清单：状态置 confirmed 并锁定
function confirmShoppingHandler(config, routeParams) {
  const list = shoppingLists.find((item) => item.id === Number(routeParams.id))
  if (!list) httpError(404, '采购清单不存在')
  if (list.status !== 'draft') businessError(400, '该采购清单已确认')
  if (!list.summary.itemCount) businessError(400, '采购清单为空，不能确认')
  list.status = 'confirmed'
  list.confirmedAt = formatDate(new Date())
  return list
}

// ---------- 核算清单 ----------

/** 按周找核算清单 */
function findShoppingAccount(weekStart) {
  return shoppingAccounts.find((item) => item.weekStart === weekStart) || null
}

/** 重新汇总核算清单：实付合计 = 所有核算项金额（分）之和 */
function recalcAccountSummary(account) {
  const actualAmountFen = account.items.reduce((sum, item) => sum + item.priceFen, 0)
  account.summary = { itemCount: account.items.length, actualAmountFen }
}

/** 核算清单必须是草稿状态才允许修改（确认后锁定） */
function ensureDraftAccount(account) {
  if (!account) httpError(404, '核算清单不存在')
  if (account.status !== 'draft') businessError(400, '核算已确认，不能继续修改')
  return account
}

// 查询某周核算清单：未生成返回 null
function getShoppingAccountHandler(config) {
  const weekStart = String(config.params?.weekStart || getWeekStart(new Date()))
  return findShoppingAccount(weekStart)
}

// 从已确认的采购清单生成核算清单草稿：默认带出食材、分量、预估金额（用户可改）
function createShoppingAccountHandler(config) {
  const body = parseBody(config)
  const weekStart = String(body.weekStart || getWeekStart(new Date()))

  const shoppingList = shoppingLists.find((item) => item.weekStart === weekStart)
  if (!shoppingList) businessError(400, '请先生成采购清单')
  if (shoppingList.status !== 'confirmed') businessError(400, '请先确认采购清单，再开始核算')

  // 已生成过核算清单则直接返回（避免重复创建）
  const existing = findShoppingAccount(weekStart)
  if (existing) return existing

  const items = []
  shoppingList.groups.forEach((group) => {
    group.items.forEach((item) => {
      items.push({
        id: shoppingAccountItemSeedId++,
        ingredientId: item.ingredientId,
        name: item.name,
        amount: item.amount,
        unit: item.unit,
        display: toDisplay(item.amount, item.unit),
        priceFen: item.priceFen,
        source: 'list',
        note: item.note || '',
      })
    })
  })
  shoppingList.unmergeableGroup.items.forEach((item) => {
    items.push({
      id: shoppingAccountItemSeedId++,
      ingredientId: item.ingredientId,
      name: item.name,
      amount: item.amount,
      unit: item.unit,
      display: toDisplay(item.amount, item.unit),
      priceFen: 0,
      source: 'list',
      note: '按需购买',
    })
  })

  const account = {
    id: shoppingAccountSeedId++,
    familyId: 1,
    weekStart,
    shoppingListId: shoppingList.id,
    status: 'draft',
    items,
    summary: { itemCount: 0, actualAmountFen: 0 },
    createdAt: formatDate(new Date()),
  }
  recalcAccountSummary(account)
  shoppingAccounts.push(account)
  return account
}

// 修改核算项：分量 / 金额都可自由改（金额单位：分）
function patchShoppingAccountItemHandler(config, routeParams) {
  const body = parseBody(config)
  const weekStart = String(body.weekStart || '')
  const account = weekStart
    ? findShoppingAccount(weekStart)
    : shoppingAccounts.find((item) => item.items.some((row) => row.id === Number(routeParams.id)))
  ensureDraftAccount(account)

  const item = account.items.find((row) => row.id === Number(routeParams.id))
  if (!item) httpError(404, '核算项不存在')

  if (body.amount !== undefined) {
    const amount = Math.round(Number(body.amount) || 0)
    if (amount <= 0) businessError(400, '分量必须大于 0')
    item.amount = amount
    item.display = toDisplay(amount, item.unit)
  }
  if (body.priceFen !== undefined) {
    const priceFen = Math.round(Number(body.priceFen) || 0)
    if (priceFen < 0) businessError(400, '金额不能为负数')
    item.priceFen = priceFen
  }
  recalcAccountSummary(account)
  return item
}

// 手动添加核算项（采购时临时多买的东西）
function addShoppingAccountItemHandler(config) {
  const body = parseBody(config)
  const weekStart = String(body.weekStart || getWeekStart(new Date()))
  const account = findShoppingAccount(weekStart)
  ensureDraftAccount(account)

  const ingredient = ingredients.find((item) => item.id === Number(body.ingredientId))
  if (!ingredient) httpError(404, '食材不存在')
  const amount = Math.round(Number(body.amount) || 0)
  if (amount <= 0) businessError(400, '分量必须大于 0')
  const unit = body.unit || ingredient.unitBase
  if (!canMerge(unit, ingredient.unitBase)) businessError(400, '单位与食材基准单位不可换算')
  const normalized = normalize(amount, unit)
  // 金额不传则按食材均价估一个默认值，用户可在行内修改
  const priceFen =
    body.priceFen !== undefined
      ? Math.max(0, Math.round(Number(body.priceFen) || 0))
      : calcItemPriceFen(ingredient, normalized.amount, normalized.unit)

  // 同食材 + 同单位合并分量与金额
  const existing = account.items.find(
    (item) => item.ingredientId === ingredient.id && item.unit === normalized.unit,
  )
  if (existing) {
    existing.amount += normalized.amount
    existing.display = toDisplay(existing.amount, existing.unit)
    existing.priceFen += priceFen
    existing.source = 'manual'
  } else {
    account.items.push({
      id: shoppingAccountItemSeedId++,
      ingredientId: ingredient.id,
      name: ingredient.name,
      amount: normalized.amount,
      unit: normalized.unit,
      display: toDisplay(normalized.amount, normalized.unit),
      priceFen,
      source: 'manual',
      note: String(body.note || ''),
    })
  }
  recalcAccountSummary(account)
  return account
}

// 删除核算项
function deleteShoppingAccountItemHandler(config, routeParams) {
  const account = shoppingAccounts.find((item) =>
    item.items.some((row) => row.id === Number(routeParams.id)),
  )
  ensureDraftAccount(account)
  const index = account.items.findIndex((row) => row.id === Number(routeParams.id))
  account.items.splice(index, 1)
  recalcAccountSummary(account)
  return account
}

// 确认核算：锁定 + 按实付金额写一条支出记录
function confirmShoppingAccountHandler(config, routeParams) {
  const account = shoppingAccounts.find((item) => item.id === Number(routeParams.id))
  ensureDraftAccount(account)
  account.status = 'done'
  account.confirmedAt = formatDate(new Date())
  recalcAccountSummary(account)
  expenses.push({
    id: expenseSeedId++,
    familyId: 1,
    date: account.confirmedAt,
    amountFen: account.summary.actualAmountFen,
    note: `采购核算 ${account.weekStart}`,
    categoryId: null,
  })
  return account
}

// 支出列表（S8 统计会用到；验收"确认核算写入支出"）
function getExpensesHandler() {
  return expenses
}

// ---------- 统计接口 mock（S8）----------
// 数据来源：expenses（S7 确认核算写入）+ plans/planItems（一周计划）+ recipes（菜谱营养）；
// 所有 handler 只读内存数据，不改任何业务状态。

// 营养摄入的参考值：成年人日均推荐量（演示用固定标准，不属于 S9 家庭偏好）
const NUTRITION_RECOMMEND = { protein: 60, fat: 60, carb: 300, fiber: 25, sodium: 2000 }
// 与菜谱 nutrition 字段一一对应；数组顺序也是雷达图轴的顺序
const NUTRITION_KEYS = ['protein', 'fat', 'carb', 'fiber', 'sodium']

/**
 * 把 weeks 参数夹到 1–8 周：URL 参数都是字符串，非法值回退到默认 4 周（统计页默认"近 4 周"）
 * @param {unknown} value 查询参数
 * @returns {number} 合法周数
 */
function normalizeWeeks(value) {
  const weeks = Math.round(Number(value) || 4)
  return Math.max(1, Math.min(8, weeks))
}

/**
 * 生成「截止本周」的连续 weekStart 列表：近 4 周 → [3 周前的周一, …, 本周周一]
 * @param {number} weeks 周数
 * @returns {string[]} 周一日期列表（升序）
 */
function getRecentWeekStarts(weeks) {
  const currentWeekStart = getWeekStart(new Date())
  return Array.from({ length: weeks }, (_, index) =>
    addDays(currentWeekStart, (index - (weeks - 1)) * 7),
  )
}

/**
 * 判断日期是否落在某一周（周一 ~ 周日）；日期都是 YYYY-MM-DD 字符串，可以直接比较大小
 * @param {string} date 日期
 * @param {string} weekStart 周一日期
 * @returns {boolean}
 */
function isDateInWeek(date, weekStart) {
  return date >= weekStart && date <= addDays(weekStart, 6)
}

// 工作台概览：本周计划 / 支出 / 采购状态 / 待采购 Top5 / 临期库存 / 按天摘要
function getStatsOverviewHandler(config) {
  const weekStart = String(config.params?.weekStart || getWeekStart(new Date()))
  const plan = plans.find((item) => item.weekStart === weekStart)
  const items = plan ? planItems.filter((item) => item.planId === plan.id) : []

  // 卡片 1：已排餐数（本周 7 天 × 3 餐，mealTotal 固定 21 供页面显示分母）
  const mealPlanned = items.length

  // 卡片 2：本周计划预估金额 = Σ（每份成本 × 份数），全程整数分
  const planEstimateFen = items.reduce((sum, item) => {
    const recipe = recipes.find((row) => row.id === item.recipeId)
    return sum + (recipe ? calcRecipeCostFenByServing(recipe) * item.servings : 0)
  }, 0)

  // 卡片 3：本周已确认核算的实际支出（没有确认核算就是 0）
  const actualExpenseFen = expenses
    .filter((row) => isDateInWeek(row.date, weekStart))
    .reduce((sum, row) => sum + row.amountFen, 0)

  // 采购 / 核算状态：给工作台展示"下一步该做什么"（none → draft → confirmed → account-draft → done）
  const list = shoppingLists.find((item) => item.weekStart === weekStart)
  const account = shoppingAccounts.find((item) => item.weekStart === weekStart)
  let shoppingStatus = 'none'
  if (list) shoppingStatus = list.status === 'confirmed' ? 'confirmed' : 'draft'
  if (account) shoppingStatus = account.status === 'done' ? 'done' : 'account-draft'

  // 待采购 Top5：有采购清单时按预估金额降序取前 5；
  // 沿用采购清单页口径：只展示食材与分量，不展示金额（priceFen 仅用于排序）
  const topPending = []
  if (list) {
    const rows = []
    list.groups.forEach((group) => rows.push(...group.items))
    rows.push(...list.unmergeableGroup.items)
    rows.sort((a, b) => b.priceFen - a.priceFen)
    rows.slice(0, 5).forEach((item) => topPending.push({ name: item.name, display: item.display }))
  }

  // 临期库存：到期日在「今天 ~ 今天 + 3 天」之间（含今天）；库存记录由库存页维护
  const today = formatDate(new Date())
  const expiringItems = pantryItems
    .filter((item) => item.expireAt >= today && item.expireAt <= addDays(today, 3))
    .map((item) => {
      const ingredient = ingredients.find((row) => row.id === item.ingredientId)
      return {
        ingredientId: item.ingredientId,
        name: ingredient ? ingredient.name : '未知食材',
        display: toDisplay(item.amount, item.unit),
        expireAt: item.expireAt,
        // 剩余天数：两个 00:00 的本地日期相减，除以一天的毫秒数；用 Math.round 规避夏令时误差
        daysLeft: Math.round((parseDate(item.expireAt) - parseDate(today)) / 86400000),
      }
    })

  // 本周计划摘要：固定返回 7 天，工作台按天展示；meals 只带餐次 + 菜名，点击整行跳一周计划
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index)
    const dayItems = items.filter((item) => item.date === date)
    // 同一天内按 早餐 → 午餐 → 晚餐 排序，和一周计划页保持一致
    dayItems.sort(
      (a, b) => (MEAL_ORDER[a.mealType] ?? 0) - (MEAL_ORDER[b.mealType] ?? 0) || a.id - b.id,
    )
    return {
      date,
      weekday: getWeekdayLabel(date),
      mealCount: dayItems.length,
      meals: dayItems.map((item) => ({
        mealType: item.mealType,
        title: recipes.find((row) => row.id === item.recipeId)?.title || '菜谱已删除',
      })),
    }
  })

  return {
    weekStart,
    mealPlanned,
    mealTotal: 21,
    planEstimateFen,
    actualExpenseFen,
    // 周预算来自家庭设置（S9 接入）：工作台预算卡 / 剩余预算都读这个字段
    budgetFen: family.weekBudgetFen,
    shoppingStatus,
    pendingShoppingCount: list ? list.summary.itemCount : 0,
    topPending,
    expiringCount: expiringItems.length,
    expiringItems,
    days,
    recipeCount: recipes.filter((row) => row.status === 1).length,
  }
}

// 支出趋势：按周汇总 expenses（金额单位：分）；budget 取家庭设置周预算（S9 接入）
function getExpenseTrendHandler(config) {
  const weeks = normalizeWeeks(config.params?.weeks ?? 8)
  return getRecentWeekStarts(weeks).map((weekStart) => {
    // 该周内的支出合计（核算日期落在本周）
    const actual = expenses
      .filter((row) => isDateInWeek(row.date, weekStart))
      .reduce((sum, row) => sum + row.amountFen, 0)
    // 预算按"当前家庭周预算"平铺展示（历史周没有单独快照，演示场景够用）
    return { weekStart, budget: family.weekBudgetFen, actual }
  })
}

// 营养摄入：统计范围内「已排餐日」的日均营养 vs 成年人日均推荐值
function getNutritionHandler(config) {
  const weeks = normalizeWeeks(config.params?.weeks)
  const weekStarts = getRecentWeekStarts(weeks)
  // 范围内的计划项：先按 weekStart 找到计划 id，再筛出计划项
  const planIds = plans.filter((plan) => weekStarts.includes(plan.weekStart)).map((plan) => plan.id)
  const items = planItems.filter((item) => planIds.includes(item.planId))
  // 范围内没有排餐：返回 null，页面显示空态（不画空雷达图）
  if (items.length === 0) return null

  const totals = { protein: 0, fat: 0, carb: 0, fiber: 0, sodium: 0 }
  // 只统计"排过餐的日期"：范围内可能只有 1 周有数据，用范围总天数做分母会把均值拉得很低
  const mealDates = new Set()
  items.forEach((item) => {
    const recipe = recipes.find((row) => row.id === item.recipeId)
    if (!recipe) return
    mealDates.add(item.date)
    // 菜谱营养字段按「每份」存，× 份数才是一餐的总摄入
    NUTRITION_KEYS.forEach((key) => {
      totals[key] += (Number(recipe[key]) || 0) * (Number(item.servings) || 0)
    })
  })

  const dayCount = mealDates.size || 1
  const nutrition = {}
  NUTRITION_KEYS.forEach((key) => {
    nutrition[key] = {
      // 日均保留 1 位小数（g / mg 都不需要更高精度）
      actual: Math.round((totals[key] / dayCount) * 10) / 10,
      recommend: NUTRITION_RECOMMEND[key],
    }
  })
  return nutrition
}

// 品类占比：食材品类维度的金额（单位：分）
// 口径：优先用范围内已确认核算的实际金额；没有核算数据时回退为计划聚合的预估金额
function getCategoryShareHandler(config) {
  const weeks = normalizeWeeks(config.params?.weeks)
  const weekStarts = getRecentWeekStarts(weeks)
  const categoryAmount = new Map()

  // 1) 优先取范围内已确认核算的清单项（实际金额，最准确）
  const doneAccounts = shoppingAccounts.filter(
    (account) => account.status === 'done' && weekStarts.includes(account.weekStart),
  )
  doneAccounts.forEach((account) => {
    account.items.forEach((item) => {
      const ingredient = ingredients.find((row) => row.id === item.ingredientId)
      const category = categories.find((row) => row.id === ingredient?.categoryId)
      if (!category) return
      categoryAmount.set(
        category.name,
        (categoryAmount.get(category.name) || 0) + (Number(item.priceFen) || 0),
      )
    })
  })

  // 2) 回退：按计划预估金额（复用 S7 的 8 步聚合纯函数，不重复实现计价逻辑）
  if (doneAccounts.length === 0) {
    weekStarts.forEach((weekStart) => {
      const aggregation = buildShoppingAggregation(weekStart)
      aggregation.groups.forEach((group) => {
        const amount = group.items.reduce((sum, item) => sum + item.priceFen, 0)
        if (amount > 0)
          categoryAmount.set(
            group.categoryName,
            (categoryAmount.get(group.categoryName) || 0) + amount,
          )
      })
    })
  }

  return [...categoryAmount.entries()]
    .map(([categoryName, amount]) => ({ categoryName, amount }))
    .sort((a, b) => b.amount - a.amount)
}

// 菜谱分布：上架菜谱按烹饪方式统计数量（全库口径，不随时间范围变化）
function getRecipeDistributionHandler() {
  const counter = new Map()
  recipes
    .filter((recipe) => recipe.status === 1)
    .forEach((recipe) => counter.set(recipe.method, (counter.get(recipe.method) || 0) + 1))
  return [...counter.entries()]
    .map(([method, count]) => ({ method, count }))
    .sort((a, b) => b.count - a.count)
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
  { method: 'post', path: '/recipes', handler: createRecipeHandler },
  { method: 'get', path: '/recipes/:id', handler: getRecipeDetailHandler },
  { method: 'put', path: '/recipes/:id', handler: updateRecipeHandler },
  { method: 'delete', path: '/recipes/:id', handler: deleteRecipeHandler },
  { method: 'put', path: '/recipes/:id/status', handler: updateRecipeStatusHandler },
  { method: 'post', path: '/recipes/:id/favorite', handler: toggleFavoriteHandler },
  { method: 'get', path: '/categories', handler: getCategoriesHandler },
  { method: 'post', path: '/categories', handler: createCategoryHandler },
  { method: 'put', path: '/categories/:id', handler: updateCategoryHandler },
  { method: 'delete', path: '/categories/:id', handler: deleteCategoryHandler },
  { method: 'get', path: '/ingredients', handler: getIngredientsHandler },
  { method: 'post', path: '/ingredients', handler: createIngredientHandler },
  { method: 'put', path: '/ingredients/:id', handler: updateIngredientHandler },
  { method: 'delete', path: '/ingredients/:id', handler: deleteIngredientHandler },
  { method: 'get', path: '/plans', handler: getPlanHandler },
  { method: 'post', path: '/plans/items', handler: addPlanItemHandler },
  { method: 'put', path: '/plans/items/:id', handler: updatePlanItemHandler },
  { method: 'delete', path: '/plans/items/:id', handler: deletePlanItemHandler },
  { method: 'post', path: '/plans/copy', handler: copyPlanHandler },
  { method: 'get', path: '/pantry', handler: getPantryHandler },
  { method: 'post', path: '/pantry', handler: createPantryHandler },
  { method: 'put', path: '/pantry/:id', handler: updatePantryHandler },
  { method: 'delete', path: '/pantry/:id', handler: deletePantryHandler },
  { method: 'get', path: '/shopping', handler: getShoppingHandler },
  { method: 'post', path: '/shopping/generate', handler: generateShoppingHandler },
  { method: 'post', path: '/shopping/items', handler: addShoppingItemHandler },
  { method: 'patch', path: '/shopping/items/:id', handler: patchShoppingItemHandler },
  { method: 'delete', path: '/shopping/items/:id', handler: deleteShoppingItemHandler },
  { method: 'post', path: '/shopping/:id/confirm', handler: confirmShoppingHandler },
  { method: 'get', path: '/shopping/account', handler: getShoppingAccountHandler },
  { method: 'post', path: '/shopping/account', handler: createShoppingAccountHandler },
  { method: 'post', path: '/shopping/account/items', handler: addShoppingAccountItemHandler },
  {
    method: 'patch',
    path: '/shopping/account/items/:id',
    handler: patchShoppingAccountItemHandler,
  },
  {
    method: 'delete',
    path: '/shopping/account/items/:id',
    handler: deleteShoppingAccountItemHandler,
  },
  { method: 'post', path: '/shopping/account/:id/confirm', handler: confirmShoppingAccountHandler },
  { method: 'get', path: '/expenses', handler: getExpensesHandler },
  // S9 家庭设置：成员数 / 周预算 / 忌口 / 常备调料
  { method: 'get', path: '/family', handler: getFamilyHandler },
  { method: 'put', path: '/family', handler: updateFamilyHandler },
  // S8 数据统计：5 个只读统计接口
  { method: 'get', path: '/stats/overview', handler: getStatsOverviewHandler },
  { method: 'get', path: '/stats/expense-trend', handler: getExpenseTrendHandler },
  { method: 'get', path: '/stats/nutrition', handler: getNutritionHandler },
  { method: 'get', path: '/stats/category-share', handler: getCategoryShareHandler },
  { method: 'get', path: '/stats/recipe-distribution', handler: getRecipeDistributionHandler },
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
    // 关键：返回前深拷贝，模拟真实 HTTP 的"序列化边界"。
    // 否则 mock 内存对象会和页面状态共享引用——页面改数据、mock 也同步变，
    // 会导致「后端接口已经改过值，前端再赋同样值不触发响应式」这类假象（采购清单勾选就踩过）。
    return Promise.resolve(
      buildSuccessResponse(config, { code: 0, message: 'ok', data: deepClone(data) }),
    )
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
