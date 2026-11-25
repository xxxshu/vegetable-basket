<!--
  数据统计页（S8）
  - 顶部时间范围切换：本周 / 近 4 周 / 近 8 周
  - 2×2 图表：支出趋势（折线）、营养摄入（雷达）、品类占比（环形）、菜谱分布（柱状）
  - 无数据显示空态；图表 resize / dispose 统一交给 ChartCard + useChart 处理
-->
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import {
  getCategoryShare,
  getExpenseTrend,
  getNutritionStats,
  getRecipeDistribution,
} from '@/api/stats'
import ChartCard from '@/components/ChartCard.vue'
import PageContainer from '@/components/PageContainer.vue'
import { getWeekStart } from '@/utils/date'
import { formatMoney } from '@/utils/format'

// 时间范围选项：weeks 是接口要的周数；页面只认 value，避免把数字散落在模板与请求里
const RANGE_OPTIONS = [
  { value: '1w', label: '本周', weeks: 1 },
  { value: '4w', label: '近 4 周', weeks: 4 },
  { value: '8w', label: '近 8 周', weeks: 8 },
]

// 雷达图的轴定义：与接口返回的 nutrition 字段一一对应（顺序即雷达五个顶点的顺序）
const NUTRITION_META = [
  { key: 'protein', label: '蛋白质(g)' },
  { key: 'fat', label: '脂肪(g)' },
  { key: 'carb', label: '碳水(g)' },
  { key: 'fiber', label: '膳食纤维(g)' },
  { key: 'sodium', label: '钠(mg)' },
]

// 图表配色：绿色系为主，和项目主色一致；饼图/柱状图共用
const CHART_COLORS = [
  '#4caf50',
  '#81c784',
  '#ffb74d',
  '#64b5f6',
  '#e57373',
  '#ba68c8',
  '#a1887f',
  '#90a4ae',
]

const router = useRouter()

// 默认近 4 周：mock 里 seeds 了历史支出与上周计划，首屏就能看到 4 个图有数据；切"本周"可验收空态
const range = ref('4w')
// 统计请求的 loading：4 张图共用（一次 Promise.all 拉齐，避免每张图各自 loading 造成错位）
const loading = ref(false)
// 支出趋势：[{ weekStart, budget, actual }]，actual/budget 单位分
const trend = ref([])
// 营养摄入：{ protein: { actual, recommend }, ... }；范围内没有排餐时为 null
const nutrition = ref(null)
// 品类占比：[{ categoryName, amount }]，amount 单位分
const categoryShare = ref([])
// 菜谱分布：[{ method, count }]
const recipeDistribution = ref([])

// 当前范围对应的周数（1 / 4 / 8）
const currentWeeks = computed(
  () => RANGE_OPTIONS.find((item) => item.value === range.value)?.weeks || 4,
)
// 当前范围的中文名：用于底部统计口径说明
const currentRangeLabel = computed(
  () => RANGE_OPTIONS.find((item) => item.value === range.value)?.label || '',
)

// 请求序号：快速切换时间范围时只接受"最后一次"请求的结果，避免旧响应晚到覆盖新范围的数据
let requestSeq = 0

/**
 * 拉取当前时间范围的全部统计数据
 * 副作用：更新 loading / trend / nutrition / categoryShare / recipeDistribution
 * 说明：4 个接口互不依赖，用 Promise.all 并发请求，总耗时约等于最慢的一个（200ms mock 延迟）
 */
async function fetchStats() {
  // 每次请求自增序号；响应回来时序号不一致说明已被更新的请求取代，直接丢弃
  const seq = ++requestSeq
  loading.value = true
  const weeks = currentWeeks.value
  const weekStart = getWeekStart(new Date())
  try {
    const [trendData, nutritionData, shareData, distributionData] = await Promise.all([
      getExpenseTrend({ weeks }),
      // 营养与品类占比按"范围内计划"聚合，传 weekStart + weeks 两个参数
      getNutritionStats({ weekStart, weeks }),
      getCategoryShare({ weekStart, weeks }),
      // 菜谱分布是全库口径，不随时间范围变化，无需参数
      getRecipeDistribution(),
    ])
    // 过期响应：不覆盖当前范围的数据
    if (seq !== requestSeq) return
    trend.value = trendData
    nutrition.value = nutritionData
    categoryShare.value = shareData
    recipeDistribution.value = distributionData
  } finally {
    // 只有最新请求才关闭 loading；被丢弃的旧请求不能关闭新请求的 loading
    if (seq === requestSeq) loading.value = false
  }
}

// 切换时间范围时重新拉取；immediate 不在这里用，初始加载放到 onMounted 更直观
watch(range, fetchStats)
onMounted(fetchStats)

// 各图是否空态：加载中不算空（避免请求期间闪一下"暂无数据"）
const trendEmpty = computed(() => !loading.value && trend.value.length === 0)
const nutritionEmpty = computed(() => !loading.value && !nutrition.value)
const categoryEmpty = computed(() => !loading.value && categoryShare.value.length === 0)
const distributionEmpty = computed(() => !loading.value && recipeDistribution.value.length === 0)

// 支出趋势（折线图）：横轴 = 周一日期，纵轴 = 金额（元）
const trendOption = computed(() => {
  // x 轴只显示 MM-DD，周次含义在 tooltip/统计说明里解释
  const labels = trend.value.map((row) => row.weekStart.slice(5))
  // 接口金额是分，坐标轴统一换成元（保留 2 位，tooltip 再用 formatMoney 还原成 ¥ 格式）
  const actualValues = trend.value.map((row) => Number(((row.actual || 0) / 100).toFixed(2)))
  // 预算来自家庭设置（S9 已接入）：有预算数据才追加预算虚线，避免画一条 0 值假线
  const hasBudget = trend.value.some((row) => row.budget !== null && row.budget !== undefined)
  const series = [
    {
      name: '实际支出',
      type: 'line',
      smooth: true,
      symbolSize: 8,
      data: actualValues,
      lineStyle: { width: 3, color: CHART_COLORS[0] },
      itemStyle: { color: CHART_COLORS[0] },
      areaStyle: { color: 'rgba(76, 175, 80, 0.12)' },
    },
  ]
  // 预算数据存在时才加第二条线（S9 家庭设置接入后自动生效，页面不用改）
  if (hasBudget) {
    series.push({
      name: '预算',
      type: 'line',
      smooth: true,
      symbolSize: 6,
      data: trend.value.map((row) => Number(((row.budget || 0) / 100).toFixed(2))),
      lineStyle: { width: 2, type: 'dashed', color: CHART_COLORS[2] },
      itemStyle: { color: CHART_COLORS[2] },
    })
  }
  return {
    color: CHART_COLORS,
    tooltip: {
      trigger: 'axis',
      // tooltip 里的值（元）乘 100 还原成分，再交给 formatMoney 统一展示
      valueFormatter: (value) => formatMoney(Math.round(Number(value) * 100)),
    },
    legend: { show: hasBudget, top: 0, right: 0 },
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: labels },
    yAxis: { type: 'value', axisLabel: { formatter: (value) => `¥${value}` } },
    series,
  }
})

// 营养摄入（雷达图）：实际日均 vs 推荐日均
const nutritionOption = computed(() => {
  const data = nutrition.value
  if (!data) return {}
  // 每个轴单独设置上限：推荐值 1.5 倍与实际值 1.2 倍取大，保证实际点不会顶到轴边缘
  const indicators = NUTRITION_META.map((meta) => {
    const { actual, recommend } = data[meta.key]
    const max = Math.max(Math.ceil(recommend * 1.5), Math.ceil(actual * 1.2), 1)
    return { name: meta.label, max }
  })
  return {
    color: [CHART_COLORS[0], CHART_COLORS[7]],
    tooltip: { trigger: 'item' },
    legend: { top: 0, right: 0, data: ['实际日均', '推荐日均'] },
    radar: {
      indicator: indicators,
      radius: '62%',
      splitNumber: 4,
      axisName: { color: '#606266', fontSize: 12 },
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            name: '实际日均',
            // 按 NUTRITION_META 顺序取值，保证与 indicator 轴顺序一致
            value: NUTRITION_META.map((meta) => data[meta.key].actual),
            areaStyle: { color: 'rgba(76, 175, 80, 0.25)' },
            lineStyle: { width: 2 },
          },
          {
            name: '推荐日均',
            value: NUTRITION_META.map((meta) => data[meta.key].recommend),
            lineStyle: { type: 'dashed', width: 1.5 },
            itemStyle: { color: CHART_COLORS[7] },
          },
        ],
      },
    ],
  }
})

// 品类占比（环形图）：金额单位分，tooltip 用 formatMoney 转元
const categoryOption = computed(() => ({
  color: CHART_COLORS,
  tooltip: {
    trigger: 'item',
    // formatter 自己拼：显示"品类：金额（占比）"，金额按分 → 元
    formatter: (params) =>
      `${params.name}：${formatMoney(Math.round(params.value))}<br/>占比 ${params.percent}%`,
  },
  legend: { orient: 'vertical', right: 0, top: 'middle', itemWidth: 10, itemHeight: 10 },
  series: [
    {
      name: '品类金额',
      type: 'pie',
      // 环形图：radius 两个值分别是内半径与外半径，中间留空更像仪表盘
      radius: ['42%', '64%'],
      center: ['38%', '50%'],
      avoidLabelOverlap: true,
      label: { show: false },
      emphasis: { label: { show: true, fontWeight: 'bold' } },
      data: categoryShare.value.map((row) => ({ name: row.categoryName, value: row.amount })),
    },
  ],
}))

// 菜谱分布（柱状图）：横轴 = 烹饪方式，纵轴 = 上架菜谱数量
const distributionOption = computed(() => ({
  color: [CHART_COLORS[1]],
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
  xAxis: {
    type: 'category',
    // 8 种烹饪方式在窄屏可能挤，这里让 ECharts 自动隔一个显示，tooltip 仍能看全
    axisLabel: { color: '#606266' },
    data: recipeDistribution.value.map((row) => row.method),
  },
  yAxis: { type: 'value', minInterval: 1 },
  series: [
    {
      name: '菜谱数量',
      type: 'bar',
      barMaxWidth: 32,
      data: recipeDistribution.value.map((row) => row.count),
      itemStyle: { borderRadius: [4, 4, 0, 0] },
      label: { show: true, position: 'top', color: '#606266' },
    },
  ],
}))
</script>

<template>
  <PageContainer title="数据统计">
    <!-- 右上角操作区：时间范围切换（本周 / 近 4 周 / 近 8 周） -->
    <template #extra>
      <el-radio-group v-model="range" size="default">
        <el-radio-button v-for="item in RANGE_OPTIONS" :key="item.value" :value="item.value">
          {{ item.label }}
        </el-radio-button>
      </el-radio-group>
    </template>

    <!-- 2×2 图表网格：每张图的标题 / 高度 / loading / 空态由 ChartCard 统一处理 -->
    <div class="stats__grid">
      <!-- 图 1：支出趋势（折线） -->
      <ChartCard
        title="支出趋势（元）"
        :option="trendOption"
        :loading="loading"
        :empty="trendEmpty"
        empty-text="还没有支出记录，确认核算后这里会按周汇总"
        empty-action-text="去采购核算"
        @empty-action="router.push('/shopping')"
      />
      <!-- 图 2：营养摄入（雷达） -->
      <ChartCard
        title="营养摄入（已排餐日均）"
        :option="nutritionOption"
        :loading="loading"
        :empty="nutritionEmpty"
        empty-text="当前范围内还没有排餐数据，先排菜再来看营养"
        empty-action-text="去排计划"
        @empty-action="router.push('/plan')"
      />
      <!-- 图 3：品类占比（环形） -->
      <ChartCard
        title="品类占比"
        :option="categoryOption"
        :loading="loading"
        :empty="categoryEmpty"
        empty-text="当前范围内还没有可统计的食材金额"
        empty-action-text="去排计划"
        @empty-action="router.push('/plan')"
      />
      <!-- 图 4：菜谱分布（柱状） -->
      <ChartCard
        title="菜谱分布（按烹饪方式）"
        :option="distributionOption"
        :loading="loading"
        :empty="distributionEmpty"
        empty-text="菜谱库还没有上架菜谱"
      />
    </div>

    <!-- 统计口径说明：答辩/面试时能逐条讲清"每个数字怎么来的" -->
    <div class="stats__hint">
      <span class="stats__hint-title">统计口径（当前范围：{{ currentRangeLabel }}）</span>
      <span>① 支出趋势：每周「确认核算」写入的支出合计；预算虚线来自家庭设置里的周预算。</span>
      <span
        >② 营养摄入：范围内已排餐日期的日均摄入 vs 成年人日均推荐值（菜谱营养按每份 × 份数）。</span
      >
      <span>③ 品类占比：优先按已确认核算的实际金额；没有核算数据时回退为计划食材的预估金额。</span>
      <span>④ 菜谱分布：菜谱库上架菜谱按烹饪方式计数，为全库口径，不随时间范围变化。</span>
    </div>
  </PageContainer>
</template>

<style scoped lang="scss">
// 图表网格：宽屏两列，窄屏一列（窄屏换列时容器宽度会变，ResizeObserver 负责让图表重排）
.stats__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: $spacing-md;
}

// 窄屏 / 小窗口：单列展示，避免图表被挤到不可读
@media (max-width: 1024px) {
  .stats__grid {
    grid-template-columns: 1fr;
  }
}

// 统计口径说明：弱化展示，不抢图表注意力
.stats__hint {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
  margin-top: $spacing-md;
  font-size: $font-size-sm;
  line-height: 1.6;
  color: $text-secondary;
}

// 说明标题：比正文稍重，便于扫读
.stats__hint-title {
  color: $text-regular;
  font-weight: 600;
}
</style>
