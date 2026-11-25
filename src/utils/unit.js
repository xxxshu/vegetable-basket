// 单位工具（S7 核心算法前置能力）
// 目标：把菜谱里的各种用量（g/kg/ml/L/个/根/把/只/片）归一成"能比较、能累加"的单位，
//       同时明确哪些单位之间**不能**强转（例如 2 根姜 ≠ 200g 姜）。
// 规则：
// - 重量：g / kg，统一归一到 g（1 kg = 1000 g）
// - 体积：ml / L，统一归一到 ml（1 L = 1000 ml）
// - 计数：个 / 根 / 把 / 只 / 片，只在「单位相同」时合并（根+根 可以，根+g 不可以）
export const UNIT_GROUPS = [
  { name: 'weight', units: ['g', 'kg'], base: 'g', factor: 1000 },
  { name: 'volume', units: ['ml', 'L'], base: 'ml', factor: 1000 },
  { name: 'count', units: ['个', '根', '把', '只', '片'], base: null, factor: 1 },
]

/**
 * 查找单位所属分组
 * @param {string} unit 单位
 * @returns {object|null} { name, units, base, factor }
 */
export function findUnitGroup(unit) {
  return UNIT_GROUPS.find((group) => group.units.includes(unit)) || null
}

/**
 * 取单位的"最基准单位"：g/kg → g；ml/L → ml；计数单位 → 自身；未知单位 → 自身
 * @param {string} unit 单位
 * @returns {string}
 */
export function getBaseUnit(unit) {
  const group = findUnitGroup(unit)
  if (!group) return unit
  // 计数类分组没有统一基准（个/根/把/只/片彼此不可换算），基准就是单位本身
  return group.base || unit
}

/**
 * 取单位换算到基准单位的倍数：kg→1000、L→1000、g/ml→1、计数单位→1
 * @param {string} unit 单位
 * @returns {number}
 */
export function getUnitFactor(unit) {
  const group = findUnitGroup(unit)
  if (!group) return 1
  return unit === 'kg' || unit === 'L' ? group.factor : 1
}

/**
 * 数量归一：把任意单位换算成"最小单位"的数量。
 * 结果四舍五入成整数，贯彻"用量一律整数克/毫升"的项目约定，避免浮点误差累积。
 * @param {number} amount 数量
 * @param {string} unit 单位
 * @returns {{ amount: number, unit: string }} 归一后的整数数量与单位
 */
export function normalize(amount, unit) {
  const value = Number(amount) || 0
  const factor = getUnitFactor(unit)
  // Math.round 保证结果是整数（如 0.5kg → 500g；300g×1/3 → 100g）
  return { amount: Math.round(value * factor), unit: getBaseUnit(unit) }
}

/**
 * 判断两个单位能否合并：
 * - 完全相同（个+个、根+根、g+g…）可以合并
 * - 同属重量（g/kg）或同属体积（ml/L）可以合并
 * - 计数单位之间（根 vs 个 vs 把…）不能合并
 * @param {string} unitA 单位 A
 * @param {string} unitB 单位 B
 * @returns {boolean}
 */
export function canMerge(unitA, unitB) {
  if (unitA === unitB) return true
  const groupA = findUnitGroup(unitA)
  const groupB = findUnitGroup(unitB)
  if (!groupA || !groupB) return false
  // 计数类分组没有统一基准，只有单位完全相同才算可合并
  if (groupA.name === 'count' || groupB.name === 'count') return false
  return groupA.name === groupB.name
}

/**
 * 把基准单位的数量转成展示文案：≥1000g 显示 kg、≥1000ml 显示 L
 * @param {number} amount 基准单位数量（整数）
 * @param {string} unit 基准单位
 * @returns {string} 例如 '1.2 kg'、'800 g'、'2 根'
 */
export function toDisplay(amount, unit) {
  const value = Number(amount) || 0
  // 去掉小数末尾多余的 0：1.20 → 1.2，1.00 → 1
  const format = (num) => num.toFixed(2).replace(/\.?0+$/, '')
  if (unit === 'g' && value >= 1000) return `${format(value / 1000)} kg`
  if (unit === 'ml' && value >= 1000) return `${format(value / 1000)} L`
  return `${Math.round(value)} ${unit}`
}
