// 手写防抖（必补知识，不引入 lodash 等依赖）
// 用途：把「连续触发只执行最后一次 + 可取消」封装成可复用的组合式函数，
//       例如菜谱库的关键词搜索：连续打字只在停下来 300ms 后发 1 次请求。
import { onScopeDispose } from 'vue'

/**
 * 创建防抖函数
 * @param {Function} callback 真正要执行的函数
 * @param {number} delay 延迟时间（毫秒），默认 300
 * @returns {{ run: (...args: any[]) => void, cancel: () => void }}
 *   run    —— 触发一次（会重置计时器，只有最后一次生效）
 *   cancel —— 取消尚未执行的计时器（例如点「重置」时立即清空）
 */
export function useDebounce(callback, delay = 300) {
  // 保存 setTimeout 的返回值，用于后续 clearTimeout
  let timer = null

  /** 取消尚未执行的回调：没有计时器时什么都不做 */
  function cancel() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  /**
   * 触发防抖：每次调用都先取消上一次计时器，再重新计时；
   * 这样只有"最后一次调用"会在 delay 后真正执行 callback。
   */
  function run(...args) {
    cancel()
    timer = setTimeout(() => {
      // 先清空 timer，避免回调内部再次调用 cancel 时误清
      timer = null
      callback(...args)
    }, delay)
  }

  // 组件卸载（作用域销毁）时自动取消：避免计时器在组件销毁后触发回调造成报错/泄漏
  onScopeDispose(cancel)

  return { run, cancel }
}
