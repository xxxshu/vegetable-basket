<!--
  图表卡片（S8）：统一「标题 + 图表 / 空态 + 加载态」的外壳。
  用法：<ChartCard title="支出趋势" :option="trendOption" :loading="loading" :empty="!trend.length"
                   empty-text="还没有支出记录" empty-action-text="去采购核算" @empty-action="goShopping" />
  为什么单独封装：数据统计 4 张图 + 工作台迷你图共用同一套标题、高度、空态与 loading，
  避免每个页面重复写 ECharts 初始化与高度样式。
-->
<script setup>
import { ref, toRef } from 'vue'

import EmptyState from '@/components/EmptyState.vue'
import { useChart } from '@/composables/useChart'

const props = defineProps({
  // 卡片标题：不传则不渲染标题栏（工作台迷你图可以只用图表）
  title: { type: String, default: '' },
  // ECharts 配置：页面用 computed 根据接口数据生成；option 变化时 useChart 内部自动 setOption
  option: { type: Object, default: () => ({}) },
  // 图表高度（px）：统计页主图 300，工作台迷你折线 200
  height: { type: Number, default: 300 },
  // 加载中：用 Element Plus 的 v-loading 覆盖一层加载遮罩
  loading: { type: Boolean, default: false },
  // 空态：true 时不初始化 ECharts，直接显示 EmptyState（验收要求"无数据显示空态而非空图"）
  empty: { type: Boolean, default: false },
  // 空态文案
  emptyText: { type: String, default: '暂无数据' },
  // 空态引导按钮文案：不传则 EmptyState 不渲染按钮
  emptyActionText: { type: String, default: '' },
})

// 空态里的引导按钮被点击时通知父组件（比如跳转去排计划 / 去核算）
const emit = defineEmits(['empty-action'])

// 图表容器：空态时模板里不渲染它，所以容器 ref 会变成 null，useChart 据此 dispose 实例
const chartRef = ref(null)
// 把 props.option 转成 ref 交给 useChart：props 只读，toRef 不复制数据、仍保持响应式
const optionRef = toRef(props, 'option')

// 图表生命周期（初始化 / 尺寸自适应 / 销毁）统一交给 composable
useChart(chartRef, optionRef)
</script>

<template>
  <section class="chart-card">
    <!-- 标题栏：有标题或右侧插槽时才渲染，避免迷你图出现空标题行 -->
    <header v-if="title || $slots.extra" class="chart-card__header">
      <h3 v-if="title" class="chart-card__title">{{ title }}</h3>
      <div class="chart-card__extra"><slot name="extra" /></div>
    </header>

    <!-- 图表主体：固定高度；loading 遮罩由 v-loading 指令负责（数据请求期间不闪空态） -->
    <div v-loading="loading" class="chart-card__body" :style="{ height: `${height}px` }">
      <!-- 空态：不渲染 ECharts，避免出现"空图表 + 无数据"的双重占位 -->
      <EmptyState
        v-if="empty"
        :description="emptyText"
        :action-text="emptyActionText"
        @action="emit('empty-action')"
      />
      <!-- 图表容器：占满主体高度；useChart 在容器出现后 init，option 变化时自动重绘 -->
      <div v-else ref="chartRef" class="chart-card__canvas"></div>
    </div>
  </section>
</template>

<style scoped lang="scss">
// 卡片外壳：白底 + 细边框（与 PageContainer 的白色内容区区分层次，不用阴影避免嵌套过重）
.chart-card {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  padding: $spacing-md;
  background-color: $bg-white;
  border: 1px solid $border-color-light;
  border-radius: $radius-md;
}

// 标题栏：左标题右操作，两端对齐
.chart-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-sm;
}

// 卡片标题：与页面标题区分开，用常规字重偏大的字号
.chart-card__title {
  font-size: $font-size-base;
  font-weight: 600;
  color: $text-primary;
}

// 右侧操作区：留给页面放"查看全部"等按钮
.chart-card__extra {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
}

// 图表主体：固定高度 + 相对定位（v-loading 遮罩以它为定位上下文）
.chart-card__body {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

// 图表画布容器：ECharts 需要一个有明确宽高的父元素，canvas 会自动铺满
.chart-card__canvas {
  width: 100%;
  height: 100%;
}
</style>
