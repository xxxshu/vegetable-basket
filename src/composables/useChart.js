// ECharts 生命周期 composable（S8）
// 职责：把「初始化 / 数据更新 / 尺寸自适应 / 销毁」集中到一处，页面与 ChartCard 都不重复写。
// 设计要点（也是面试追问点）：
// 1. 容器用 ref 传入：空态与图表用 v-if 切换时容器会被重建，所以监听 containerRef 懒初始化，
//    避免在 display:none / 宽高为 0 的容器上 init 导致图表尺寸为 0；
// 2. 用 ResizeObserver 监听容器尺寸：窗口缩放、栅格换列、侧栏折叠都会触发它，
//    比 window.resize 更准确（window 不变但容器变宽/变窄时 window.resize 不会触发）；
// 3. onBeforeUnmount 必须 disconnect + dispose：否则切换页面后 ResizeObserver 与 ECharts 实例会泄漏。
import { onBeforeUnmount, onMounted, watch } from 'vue'

import { echarts } from '@/utils/echarts'

/**
 * 绑定一个 ECharts 实例到容器上
 * @param {import('vue').Ref<HTMLElement|null>} containerRef 图表容器（模板 ref）
 * @param {import('vue').Ref<object>} optionRef ECharts 配置（通常是页面里的 computed）
 * @returns {void}
 */
export function useChart(containerRef, optionRef) {
  // ECharts 实例：null 表示还没初始化或已销毁
  let chart = null
  // 尺寸监听器：只在图表存在期间观察容器
  let resizeObserver = null

  /**
   * 把最新 option 写入图表
   * 为什么第二个参数传 true（notMerge）：切换时间范围后 series 数量/维度可能变化，
   * 合并旧配置会残留上一次的数据，notMerge 每次都按新配置重绘。
   */
  function render() {
    if (!chart) return
    chart.setOption(optionRef.value || {}, true)
  }

  /** 容器尺寸变化时让 ECharts 按新尺寸重排（柱宽、坐标轴、tooltip 位置都会跟着变） */
  function resize() {
    if (!chart) return
    chart.resize()
  }

  /**
   * 初始化图表并开始监听容器尺寸
   * @param {HTMLElement} element 图表容器
   */
  function init(element) {
    // 已经有实例（或容器还没渲染）时直接跳过，避免重复 init
    if (chart || !element) return
    chart = echarts.init(element)
    render()
    // ResizeObserver：容器尺寸变化（不只是窗口缩放）时触发 resize
    resizeObserver = new ResizeObserver(() => resize())
    resizeObserver.observe(element)
  }

  /** 销毁图表与监听器：组件卸载或空态切回来时调用，避免内存泄漏 */
  function dispose() {
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    if (chart) {
      chart.dispose()
      chart = null
    }
  }

  // 容器出现 → 初始化；容器被 v-if 移除 → 销毁（空态与图表切换时会走这里）
  watch(
    containerRef,
    (element) => {
      if (element) init(element)
      else dispose()
    },
    // flush: 'post' 保证 DOM 已经挂载/移除后再初始化或销毁
    { flush: 'post' },
  )

  // option 变化（切换时间范围、异步数据回来）时更新图表；deep 保证嵌套字段改动也能被监听到
  watch(optionRef, render, { deep: true })

  // 组件挂载时如果容器已经就绪，立即初始化（watch 的首次触发时机在不同场景下不完全一致，这里兜底）
  onMounted(() => {
    if (containerRef.value) init(containerRef.value)
  })

  // 组件卸载：必须销毁实例，否则页面来回切换会不断累积图表实例与 ResizeObserver
  onBeforeUnmount(dispose)
}
