// 金额展示工具（项目约定：金额内部一律用「分」存整数，展示时再转元，避免浮点误差）

/**
 * 分 → 元展示：28640 → '¥286.4'；28600 → '¥286'
 * 规则：整元不带小数，否则保留最多 2 位小数
 * @param {number} fen 金额（分）
 * @param {boolean} [withSymbol] 是否带 ¥ 符号，默认 true
 * @returns {string}
 */
export function formatMoney(fen, withSymbol = true) {
  const yuan = (Number(fen) || 0) / 100
  const text = Number.isInteger(yuan) ? yuan.toFixed(0) : yuan.toFixed(2).replace(/0$/, '')
  return withSymbol ? `¥${text}` : text
}
