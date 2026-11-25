// 智能配菜推荐（S10，纯函数：给定输入 → 返回 Top7 推荐，不读写任何外部状态）
// 设计文档见 docs/开发文档.md 第 7.2 节，打分公式：
//   score = 3 × 库存命中食材数 + 2 × 预算匹配度 + 2 × 营养匹配度 + 1 × 难度匹配度
//   忌口命中 → 一票否决（直接排除，不参与排序）
// 为什么用规则而不是大模型：可解释、可测试、零成本，面试时能逐项讲清每个分怎么来的。
// 权重集中在 WEIGHTS 常量里，调参只改这里；每个分值都是 0~1 的归一化分数（库存命中数除外）。
import { NUTRITION_RECOMMEND } from '@/utils/constants'
import { formatDate } from '@/utils/date'
import { formatMoney } from '@/utils/format'

// 各维度权重：改动这里即可调整推荐倾向（例如更看重库存就调大 stock）
export const WEIGHTS = {
  stock: 3, // 每命中一种库存食材加 3 分
  budget: 2, // 预算匹配度（0~1）× 2
  nutrition: 2, // 营养缺口匹配度（0~1）× 2
  difficulty: 1, // 难度匹配度（0~1）× 1
}

// 一周 21 餐：用于把周预算均摊成「每餐预算」
const MEAL_SLOTS_PER_WEEK = 21

// 参与营养缺口加分的指标：只取「建议摄入下限」的三个指标。
// 脂肪 / 钠是上限指标（吃多了不好），不参与加分，避免推荐重油重盐的菜。
const NUTRIENT_META = [
  { key: 'protein', label: '蛋白质', unit: 'g' },
  { key: 'carb', label: '碳水', unit: 'g' },
  { key: 'fiber', label: '膳食纤维', unit: 'g' },
]

/** 把数值夹到 [min, max] 区间 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/** 保留两位小数（分数展示用） */
function round2(value) {
  return Math.round(value * 100) / 100
}

/** 营养数值展示：整数不带小数，否则保留 1 位（28.5g） */
function formatNutrient(value) {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/**
 * 构建「名称/别名 → 食材 id」索引：用于把忌口里的「虾」解析成「基围虾」的 id
 * @param {object} ingredientMap id → 食材对象
 * @returns {Map<string, number>}
 */
function buildIngredientNameIndex(ingredientMap) {
  const byName = new Map()
  Object.values(ingredientMap).forEach((ingredient) => {
    if (!ingredient) return
    byName.set(ingredient.name, Number(ingredient.id))
    ;(ingredient.aliases || []).forEach((alias) => byName.set(alias, Number(ingredient.id)))
  })
  return byName
}

/**
 * 把家庭设置里的忌口名称解析成食材 id 集合（支持别名；解析不到的忽略）
 * @param {string[]} preferences 忌口名称/别名
 * @param {object} ingredientMap id → 食材对象
 * @returns {Set<number>}
 */
function resolvePreferenceIds(preferences, ingredientMap) {
  const byName = buildIngredientNameIndex(ingredientMap)
  const ids = new Set()
  preferences.forEach((name) => {
    const id = byName.get(String(name).trim())
    if (id) ids.add(id)
  })
  return ids
}

/**
 * 收集有库存的食材 id（数量 > 0 才算）
 * @param {Array<{ ingredientId: number, amount: number }>} pantryStock 库存
 * @returns {Set<number>}
 */
function collectStockIngredientIds(pantryStock) {
  const ids = new Set()
  pantryStock.forEach((row) => {
    if ((Number(row.amount) || 0) > 0) ids.add(Number(row.ingredientId))
  })
  return ids
}

/**
 * 统计一道菜命中了多少种库存食材（按食材 id 去重）
 * @param {object} recipe 菜谱（含 ingredients）
 * @param {Set<number>} stockIds 有库存的食材 id
 * @param {object} ingredientMap id → 食材对象（取名称用于推荐理由）
 * @returns {{ count: number, names: string[] }}
 */
function countStockHits(recipe, stockIds, ingredientMap) {
  const hitIds = new Set()
  recipe.ingredients.forEach((row) => {
    const ingredientId = Number(row.ingredientId)
    if (stockIds.has(ingredientId)) hitIds.add(ingredientId)
  })
  return {
    count: hitIds.size,
    names: [...hitIds].map((id) => ingredientMap[id]?.name || '食材'),
  }
}

/**
 * 计算本周计划的「日均营养」
 * 口径与数据统计页一致：只统计排过餐的日期，按天求平均
 * @param {Array<{ recipeId: number, servings: number, date?: string }>} planItems 本周计划项
 * @param {Map<number, object>} recipeMap id → 菜谱
 * @returns {{ protein: number, carb: number, fiber: number }}
 */
function buildPlanNutritionPerDay(planItems, recipeMap) {
  const totals = { protein: 0, carb: 0, fiber: 0 }
  const mealDates = new Set()

  planItems.forEach((item) => {
    const recipe = recipeMap.get(Number(item.recipeId))
    if (!recipe) return
    if (item.date) mealDates.add(item.date)
    NUTRIENT_META.forEach((meta) => {
      // 菜谱营养按「每份」存，× 份数才是一餐的总摄入
      totals[meta.key] += (Number(recipe[meta.key]) || 0) * (Number(item.servings) || 0)
    })
  })

  // 没有排餐时按 0 计（营养缺口 = 100%，推荐会优先营养更全面的菜）
  const dayCount = mealDates.size || 1
  return {
    protein: totals.protein / dayCount,
    carb: totals.carb / dayCount,
    fiber: totals.fiber / dayCount,
  }
}

/**
 * 预算匹配度（0~1）：以「周预算 ÷ 21 餐」为每餐基准，每份成本越低分越高
 * 规则：成本 = 0 → 1 分；成本 = 每餐预算 → 0.5 分；成本 ≥ 每餐预算 × 2 → 0 分
 * @param {object} recipe 菜谱（含 costPerServingFen）
 * @param {{ weekBudgetFen?: number }} family 家庭设置
 * @returns {number}
 */
function calcBudgetScore(recipe, family) {
  const weekBudgetFen = Number(family?.weekBudgetFen) || 0
  const perMealBudgetFen = weekBudgetFen / MEAL_SLOTS_PER_WEEK
  // 没有设置预算：该维度统一得 0 分（不因为"没预算"乱加分）
  if (perMealBudgetFen <= 0) return 0

  const costFen = Number(recipe.costPerServingFen) || 0
  return clamp(1 - costFen / (perMealBudgetFen * 2), 0, 1)
}

/**
 * 营养匹配度（0~1）：本周哪项营养缺口大，就给富含该营养的菜加分
 * 每个指标的贡献 = 本周缺口比例 × 菜谱该营养占推荐值比例，最后取平均
 * @param {object} recipe 菜谱（含 protein/carb/fiber）
 * @param {{ protein: number, carb: number, fiber: number }} planNutrition 本周日均营养
 * @returns {number}
 */
function calcNutritionScore(recipe, planNutrition) {
  const total = NUTRIENT_META.reduce((sum, meta) => {
    const recommend = NUTRITION_RECOMMEND[meta.key] || 1
    // 缺口比例：本周日均离推荐值还差多少（0~1）
    const gap = clamp(1 - (Number(planNutrition[meta.key]) || 0) / recommend, 0, 1)
    // 这道菜能补多少：每份含量占推荐值的比例（0~1）
    const recipeRatio = clamp((Number(recipe[meta.key]) || 0) / recommend, 0, 1)
    return sum + gap * recipeRatio
  }, 0)
  return total / NUTRIENT_META.length
}

/**
 * 难度匹配度（0~1）：工作日偏好简单菜，周末给中性分
 * 工作日：简单 1 / 普通 0.67 / 困难 0.33；周末：统一 0.6
 * @param {object} recipe 菜谱
 * @param {string} today 今天日期 YYYY-MM-DD
 * @returns {{ score: number, isWeekday: boolean }}
 */
function calcDifficultyScore(recipe, today) {
  const [year, month, day] = today.split('-').map(Number)
  const weekday = new Date(year, month - 1, day).getDay()
  const isWeekday = weekday >= 1 && weekday <= 5
  if (!isWeekday) return { score: 0.6, isWeekday }
  const difficulty = Number(recipe.difficulty) || 1
  return { score: clamp((4 - difficulty) / 3, 0, 1), isWeekday }
}

/**
 * 找本周缺口最大的营养指标
 * @param {object} recipe 菜谱
 * @param {{ protein: number, carb: number, fiber: number }} planNutrition 本周日均营养
 * @returns {{ label: string, unit: string, value: number, gap: number } | null}
 */
function findLargestNutritionGap(recipe, planNutrition) {
  let largest = null
  NUTRIENT_META.forEach((meta) => {
    const recommend = NUTRITION_RECOMMEND[meta.key] || 1
    const gap = clamp(1 - (Number(planNutrition[meta.key]) || 0) / recommend, 0, 1)
    const value = Number(recipe[meta.key]) || 0
    if (value <= 0) return
    if (!largest || gap > largest.gap) largest = { ...meta, value, gap }
  })
  return largest
}

/**
 * 生成 1~2 条可读的推荐理由（答辩/面试时可以直接照着讲）
 * 优先级：库存命中 → 营养缺口 → 预算 → 工作日难度
 * @param {object} context 推荐上下文
 * @returns {string[]} 理由列表（最多 2 条）
 */
function buildReasons(context) {
  const { recipe, stockHits, planNutrition, budgetScore, isWeekday } = context
  const reasons = []

  // 理由 1：能消耗库存（最直观的"省钱不浪费"）
  if (stockHits.count > 0) {
    const names = stockHits.names
    reasons.push(
      names.length > 2
        ? `可用掉库存里的${names.slice(0, 2).join('、')}等 ${names.length} 样食材`
        : `可用掉库存里的${names.join('、')}`,
    )
  }

  // 理由 2：本周该营养缺口大，这道菜能补
  const gap = findLargestNutritionGap(recipe, planNutrition)
  if (reasons.length < 2 && gap && gap.gap >= 0.15) {
    reasons.push(`本周${gap.label}摄入偏少，这道菜每份含 ${formatNutrient(gap.value)}${gap.unit}`)
  }

  // 备选理由：预算内 / 工作日简单菜（保证每道菜至少有 1 条理由）
  if (reasons.length === 0 && budgetScore >= 0.75) {
    reasons.push(`每份成本约 ${formatMoney(recipe.costPerServingFen)}，在周预算内`)
  }
  if (reasons.length === 0 && isWeekday && Number(recipe.difficulty) === 1) {
    reasons.push('工作日推荐简单易做的菜')
  }
  if (reasons.length === 0) {
    reasons.push('营养搭配均衡，适合加入本周计划')
  }

  return reasons.slice(0, 2)
}

/**
 * 把菜谱转成卡片需要的摘要字段（不把完整配方与步骤返回给前端）
 * @param {object} recipe 完整菜谱
 * @returns {object}
 */
function toRecipeSummary(recipe) {
  return {
    id: recipe.id,
    title: recipe.title,
    cover: recipe.cover,
    description: recipe.description,
    categoryName: recipe.categoryName,
    method: recipe.method,
    difficulty: recipe.difficulty,
    calories: recipe.calories,
    timeMin: recipe.timeMin,
    baseServings: recipe.baseServings,
  }
}

/**
 * 智能配菜推荐（纯函数）
 * @param {object} input 输入数据
 * @param {Array<object>} input.recipes 全部菜谱（含 status/营养/ingredients/costPerServingFen；函数内部只推荐 status=1）
 * @param {object} input.ingredientMap id → { id, name, aliases, unitBase, pricePerUnit, categoryId }
 * @param {Array<{ ingredientId: number, amount: number, unit: string }>} [input.pantryStock] 库存
 * @param {string[]} [input.preferences] 忌口名称/别名
 * @param {{ weekBudgetFen?: number, memberCount?: number }} [input.family] 家庭设置
 * @param {Array<{ recipeId: number, servings: number, date?: string }>} [input.planItems] 本周计划项
 * @param {string} [input.today] 今天日期 YYYY-MM-DD（默认取当前日期）
 * @param {number} [input.topN] 返回条数（默认 7）
 * @returns {Array<{
 *   recipe: object,
 *   score: number,
 *   costPerServingFen: number,
 *   scoreDetail: { stockHits: number, budget: number, nutrition: number, difficulty: number },
 *   stockHitNames: string[],
 *   reasons: string[],
 * }>}
 */
export function recommendRecipes({
  recipes = [],
  ingredientMap = {},
  pantryStock = [],
  preferences = [],
  family = {},
  planItems = [],
  today = formatDate(new Date()),
  topN = 7,
} = {}) {
  const recipeMap = new Map(recipes.map((recipe) => [Number(recipe.id), recipe]))
  const stockIds = collectStockIngredientIds(pantryStock)
  const preferenceIds = resolvePreferenceIds(preferences, ingredientMap)
  // 本周日均营养：所有候选菜谱共用同一份"缺口"上下文
  const planNutrition = buildPlanNutritionPerDay(planItems, recipeMap)

  const scored = []
  recipes.forEach((recipe) => {
    // 只推荐上架菜谱（管理端下架的菜谱不进推荐）
    if (Number(recipe.status) !== 1) return
    // 忌口一票否决：菜谱任意食材命中忌口就直接排除
    const hasPreference = recipe.ingredients.some((row) =>
      preferenceIds.has(Number(row.ingredientId)),
    )
    if (hasPreference) return

    const stockHits = countStockHits(recipe, stockIds, ingredientMap)
    const budgetScore = calcBudgetScore(recipe, family)
    const nutritionScore = calcNutritionScore(recipe, planNutrition)
    const difficulty = calcDifficultyScore(recipe, today)

    // 加权总分：库存命中数本来就是整数，其余三项都是 0~1 归一化分数
    const score =
      WEIGHTS.stock * stockHits.count +
      WEIGHTS.budget * budgetScore +
      WEIGHTS.nutrition * nutritionScore +
      WEIGHTS.difficulty * difficulty.score

    scored.push({
      recipe,
      score,
      budgetScore,
      nutritionScore,
      difficultyScore: difficulty.score,
      isWeekday: difficulty.isWeekday,
      stockHits,
    })
  })

  // 排序：总分高优先；同分时库存命中多优先；再按 id 升序保证结果稳定
  scored.sort(
    (a, b) =>
      b.score - a.score || b.stockHits.count - a.stockHits.count || a.recipe.id - b.recipe.id,
  )

  // 条数限制在 1~20，避免调用方传离谱值
  const limit = Math.max(1, Math.min(20, Number(topN) || 7))
  return scored.slice(0, limit).map((item) => ({
    recipe: toRecipeSummary(item.recipe),
    score: round2(item.score),
    costPerServingFen: Number(item.recipe.costPerServingFen) || 0,
    scoreDetail: {
      stockHits: item.stockHits.count,
      budget: round2(item.budgetScore),
      nutrition: round2(item.nutritionScore),
      difficulty: round2(item.difficultyScore),
    },
    stockHitNames: item.stockHits.names,
    reasons: buildReasons({
      recipe: item.recipe,
      stockHits: item.stockHits,
      planNutrition,
      budgetScore: item.budgetScore,
      isWeekday: item.isWeekday,
    }),
  }))
}
