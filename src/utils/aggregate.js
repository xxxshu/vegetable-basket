// 采购清单聚合引擎（S7 核心算法，纯函数：给定输入 → 返回清单，不读写任何外部状态）
// 设计文档见 docs/开发文档.md 7.1 节，8 个步骤全部在本文件内完成：
//   ① 收集：遍历计划 → 菜谱食材 → × 份数
//   ② 归一：别名 → 标准食材
//   ③ 合并：按「食材 + 基准单位」用 Map 累加
//   ④ 换算：g/kg、ml/L 归一到最小单位；不可换算单位单独处理
//   ⑤ 过滤：排除常备调料、忌口食材
//   ⑥ 抵扣：减库存，不足记 0 并标记 stockShort
//   ⑦ 分组：按食材品类分组、组内数量降序
//   ⑧ 计价：数量 × 均价（全程整数克/毫升 + 整数分，避免浮点误差）
import { canMerge, getBaseUnit, normalize, toDisplay } from '@/utils/unit'

// 不可换算分组的展示名（根/把/片/只 等无法与 g/ml 换算的用量放这里）
export const UNMERGEABLE_GROUP_NAME = '不可换算（按需购买）'

/** 数字展示：保留两位再去掉末尾 0（1.20 → 1.2） */
function formatNumber(value) {
  return value.toFixed(2).replace(/\.?0+$/, '')
}

/**
 * 构建「名称/别名 → 标准食材」索引：用于把 "西红柿" 这类别名归一成标准食材「番茄」
 * @param {object} ingredientMap id → 食材对象
 * @returns {{ byName: Map<string, object>, byId: Map<number, object> }}
 */
function buildIngredientIndex(ingredientMap) {
  const byName = new Map()
  const byId = new Map()
  Object.values(ingredientMap).forEach((ingredient) => {
    byId.set(Number(ingredient.id), ingredient)
    // 标准名 + 全部别名都指向同一个食材对象
    byName.set(ingredient.name, ingredient)
    ingredient.aliases?.forEach((alias) => byName.set(alias, ingredient))
  })
  return { byName, byId }
}

/**
 * 把配置里的"名称"（常备调料 / 忌口）解析成食材 id 集合；解析不到的忽略
 * @param {string[]} names 名称或别名列表
 * @param {Map<string, object>} byName 名称索引
 * @returns {Set<number>}
 */
function resolveNameSet(names, byName) {
  const ids = new Set()
  names.forEach((name) => {
    const ingredient = byName.get(name)
    if (ingredient) ids.add(Number(ingredient.id))
  })
  return ids
}

/**
 * 计算一条采购项金额（分）
 * 约定：pricePerUnit 单位是「分 / 计价单位」——g/ml 按每 1000 单位，个按每个
 * @param {object} ingredient 食材
 * @param {number} amount 基准单位数量（整数）
 * @param {string} unit 基准单位
 * @returns {number} 金额（分，整数）
 */
function calcItemPriceFen(ingredient, amount, unit) {
  const price = Number(ingredient.pricePerUnit) || 0
  if (unit === 'g' || unit === 'ml') return Math.round((price * amount) / 1000)
  // 个 等计数单位：pricePerUnit 就是每个的价格
  return Math.round(price * amount)
}

/**
 * 聚合采购清单（纯函数）
 * @param {object} input 输入数据
 * @param {Array<{ recipeId:number|string, servings:number, date?:string, mealType?:string }>} input.weekItems 本周计划项
 * @param {object} input.recipeMap id → { baseServings, ingredients: [{ ingredientId?, name?, amount, unit, perServings? }] }
 * @param {object} input.ingredientMap id → { id, name, aliases, unitBase, pricePerUnit, categoryId }
 * @param {Array<{ id:number|string, name:string }>} [input.categories] 食材品类（决定分组顺序与名称）
 * @param {string[]} [input.defaultPantry] 家庭常备调料名（可用别名，如 油/盐/糖）
 * @param {Array<{ ingredientId:number|string, amount:number, unit:string }>} [input.stock] 库存
 * @param {string[]} [input.preferences] 忌口食材名（可用别名）
 * @returns {{
 *   groups: Array<{ categoryId:number|string, categoryName:string, items:Array<object> }>,
 *   unmergeableGroup: { categoryName:string, items:Array<object> },
 *   summary: { itemCount:number, groupCount:number, recipeCount:number, estAmountFen:number }
 * }}
 */
export function aggregateShoppingList({
  weekItems = [],
  recipeMap = {},
  ingredientMap = {},
  categories = [],
  defaultPantry = [],
  stock = [],
  preferences = [],
} = {}) {
  const { byName, byId } = buildIngredientIndex(ingredientMap)

  // ===== ⑤ 过滤所需：常备调料 / 忌口 的食材 id 集合 =====
  const pantryIds = resolveNameSet(defaultPantry, byName)
  const preferenceIds = resolveNameSet(preferences, byName)

  // ===== ⑥ 抵扣所需：库存按「食材 + 基准单位」汇总 =====
  const stockMap = new Map()
  stock.forEach((row) => {
    const ingredient = byId.get(Number(row.ingredientId))
    if (!ingredient) return
    // 库存单位与食材基准单位可换算时才抵扣（例如 kg → g）
    if (!canMerge(row.unit, ingredient.unitBase)) return
    const normalized = normalize(row.amount, row.unit)
    const key = `${ingredient.id}__${ingredient.unitBase}`
    const current = stockMap.get(key) || 0
    stockMap.set(key, current + normalized.amount)
  })

  // ===== ① 收集 + ② 归一 + ③ 合并（重量/体积） =====
  // key = 食材id + 基准单位 → 需要购买的数量（整数最小单位）
  const mergedMap = new Map()
  // 不可换算的用量：key = 食材id → { ingredient, parts: [{ amount, unit }] }
  const unmergeableMap = new Map()
  // 参与聚合的菜谱 id（用于 summary.recipeCount）
  const recipeIds = new Set()

  weekItems.forEach((weekItem) => {
    const recipe = recipeMap[weekItem.recipeId]
    if (!recipe) return
    recipeIds.add(Number(weekItem.recipeId))

    // 份数比例：计划份数 / 配方默认份数；保留乘法后再四舍五入成整数
    const servings = Number(weekItem.servings) || 0
    const baseServings = Number(recipe.baseServings) || 1
    const ratio = servings / baseServings

    recipe.ingredients.forEach((row) => {
      // ② 归一：优先用 ingredientId；没有 id 时按名称/别名反查（支持"西红柿/番茄"合并）
      const ingredient = row.ingredientId
        ? byId.get(Number(row.ingredientId))
        : byName.get(row.name)
      if (!ingredient) return

      // × 份数：先算再多四舍五入到整数（用量一律整数克/毫升，避免浮点误差）
      const rawAmount = Math.round((Number(row.amount) || 0) * ratio)
      if (rawAmount <= 0) return

      // ④ 换算：单位与食材基准单位可换算 → 归一到基准单位参与合并
      if (canMerge(row.unit, ingredient.unitBase)) {
        const normalized = normalize(rawAmount, row.unit)
        const baseUnit = getBaseUnit(row.unit)
        const key = `${ingredient.id}__${baseUnit}`
        const current = mergedMap.get(key) || { ingredient, unit: baseUnit, amount: 0 }
        current.amount += normalized.amount
        mergedMap.set(key, current)
        return
      }

      // 不可换算单位（如 生姜 3 片 / 大葱 1 根）：单独收集，最后放到"不可换算"分组
      const current = unmergeableMap.get(ingredient.id) || { ingredient, parts: [] }
      current.parts.push({ amount: rawAmount, unit: row.unit })
      unmergeableMap.set(ingredient.id, current)
    })
  })

  // ===== ⑤ 过滤 + ⑥ 抵扣 + ⑧ 计价 =====
  const categoryMap = new Map(categories.map((category) => [Number(category.id), category]))
  const groupedItems = new Map() // categoryId → items[]

  mergedMap.forEach((merged) => {
    const { ingredient } = merged
    const ingredientId = Number(ingredient.id)

    // ⑤ 过滤：常备调料 / 忌口 不出现在采购清单里
    if (pantryIds.has(ingredientId) || preferenceIds.has(ingredientId)) return

    // ⑥ 抵扣库存：部分抵扣后剩余数量，并标记「库存不足」
    const stockKey = `${ingredientId}__${merged.unit}`
    const availableStock = stockMap.get(stockKey) || 0
    const deducted = Math.min(availableStock, merged.amount)
    const amount = merged.amount - deducted
    // 库存已经覆盖：本周不需要买，直接不出现
    if (amount <= 0) return
    stockMap.set(stockKey, availableStock - deducted)

    // ⑧ 计价：整数数量 × 均价；价格同样用整数分
    const priceFen = calcItemPriceFen(ingredient, amount, merged.unit)
    const categoryId = Number(ingredient.categoryId)
    const items = groupedItems.get(categoryId) || []
    items.push({
      key: `${ingredientId}__${merged.unit}`,
      ingredientId,
      name: ingredient.name,
      amount,
      unit: merged.unit,
      display: toDisplay(amount, merged.unit),
      priceFen,
      stockShort: deducted > 0,
    })
    groupedItems.set(categoryId, items)
  })

  // ===== ⑦ 分组 + 组内数量降序 =====
  const groups = []
  groupedItems.forEach((items, categoryId) => {
    // 组内按数量降序（同数量时按名称，保证结果稳定可断言）
    items.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
    groups.push({
      categoryId,
      categoryName: categoryMap.get(categoryId)?.name || '其他',
      items,
    })
  })
  // 分组顺序跟随品类字典顺序（id 小在前）
  groups.sort((a, b) => Number(a.categoryId) - Number(b.categoryId))

  // 不可换算分组：按「食材 + 单位」逐行成组（根 / 把 / 片 等各占一行），便于用户逐行修改分量
  const unmergeableItems = []
  unmergeableMap.forEach((entry) => {
    const ingredientId = Number(entry.ingredient.id)
    // 常备调料 / 忌口同样要过滤掉
    if (pantryIds.has(ingredientId) || preferenceIds.has(ingredientId)) return
    entry.parts.forEach((part) => {
      unmergeableItems.push({
        ingredientId,
        name: entry.ingredient.name,
        amount: part.amount,
        unit: part.unit,
        display: `${part.amount} ${part.unit}`,
        // 不可换算无法按均价准确计价 → 标 0 并提示"按需购买"
        priceFen: 0,
        note: '按需购买',
      })
    })
  })
  unmergeableItems.sort((a, b) => a.name.localeCompare(b.name) || a.unit.localeCompare(b.unit))

  // ===== 汇总 =====
  const mergedItemCount = groups.reduce((sum, group) => sum + group.items.length, 0)
  const estAmountFen = groups.reduce(
    (sum, group) => sum + group.items.reduce((groupSum, item) => groupSum + item.priceFen, 0),
    0,
  )

  return {
    groups,
    unmergeableGroup: {
      categoryName: UNMERGEABLE_GROUP_NAME,
      items: unmergeableItems,
    },
    summary: {
      // 清单条目数（可购买条目 + 不可换算条目）
      itemCount: mergedItemCount + unmergeableItems.length,
      groupCount: groups.length,
      recipeCount: recipeIds.size,
      estAmountFen,
    },
  }
}

// 供外部断言/调试使用的格式化方法（避免页面里再写浮点运算）
export { formatNumber }
