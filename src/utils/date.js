// 日期工具（S6 一周计划用；全部以「YYYY-MM-DD 字符串」在页面/接口间传递，避免时区偏移）
// 约定：一周从周一开始（getWeekStart 返回周一）

/** 补零：9 → '09' */
function pad(value) {
  return String(value).padStart(2, '0')
}

/**
 * 把 Date 或日期字符串格式化为 YYYY-MM-DD（使用本地时区）
 * 注意：不要用 toISOString()，它会转成 UTC，东八区可能少一天
 * @param {Date|string} date 日期
 * @returns {string} YYYY-MM-DD
 */
export function formatDate(date) {
  const target = date instanceof Date ? date : parseDate(date)
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`
}

/**
 * 把 YYYY-MM-DD 解析为本地时区的 Date（当天 00:00:00）
 * @param {string} dateStr YYYY-MM-DD
 * @returns {Date}
 */
export function parseDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * 日期加减天数
 * @param {string} dateStr YYYY-MM-DD
 * @param {number} days 正数加、负数减
 * @returns {string} 计算后的 YYYY-MM-DD
 */
export function addDays(dateStr, days) {
  const date = parseDate(dateStr)
  date.setDate(date.getDate() + days)
  return formatDate(date)
}

/**
 * 取某日期所在周的周一
 * @param {Date|string} [date] 默认今天
 * @returns {string} 周一日期 YYYY-MM-DD
 */
export function getWeekStart(date = new Date()) {
  const target = date instanceof Date ? new Date(date) : parseDate(date)
  // getDay(): 周日=0，周一=1 … 周六=6 → 周日要回退 6 天，其余回退 day-1 天
  const weekday = target.getDay()
  const diff = weekday === 0 ? -6 : 1 - weekday
  target.setDate(target.getDate() + diff)
  return formatDate(target)
}

/**
 * 取一周的 7 天日期数组（从周一开始）
 * @param {string} weekStart 周一日期 YYYY-MM-DD
 * @returns {string[]} 7 个 YYYY-MM-DD
 */
export function getWeekDates(weekStart) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
}

/**
 * 周范围展示文案：2026-11-24 ~ 11-30
 * @param {string} weekStart 周一日期
 * @returns {string}
 */
export function formatWeekRange(weekStart) {
  const start = parseDate(weekStart)
  const end = parseDate(addDays(weekStart, 6))
  const startText = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`
  const endText = `${pad(end.getMonth() + 1)}-${pad(end.getDate())}`
  return `${startText} ~ ${endText}`
}

/** 星期文案（周一开始） */
export const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/**
 * 取日期对应的星期文案
 * @param {string} dateStr YYYY-MM-DD
 * @returns {string} 周一 / 周二 …
 */
export function getWeekdayLabel(dateStr) {
  const date = parseDate(dateStr)
  // getDay() 周日=0，转成"周一开始"的下标：周一=0 … 周日=6
  return WEEKDAY_LABELS[(date.getDay() + 6) % 7]
}

/**
 * 判断日期是否是今天（周计划里高亮当天行用）
 * @param {string} dateStr YYYY-MM-DD
 * @returns {boolean}
 */
export function isToday(dateStr) {
  return dateStr === formatDate(new Date())
}
