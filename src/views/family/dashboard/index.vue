<!--
  工作台（S8 概览版）
  - 顶部 4 张卡片：已排餐数 / 本周预估 / 本周实际支出 / 临期食材
  - 左侧：本周计划摘要（按天，点击跳一周计划）+ 近 4 周支出迷你折线
  - 右侧：待采购 Top5（点击跳采购清单）+ 临期提醒
  - 说明：周预算、库存临期维护属于 S9（家庭设置 / 库存 CRUD），本页只读当前已有数据
-->
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { getExpenseTrend, getStatsOverview } from '@/api/stats'
import ChartCard from '@/components/ChartCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import PageContainer from '@/components/PageContainer.vue'
import { MEAL_LABEL } from '@/utils/constants'
import { getWeekStart } from '@/utils/date'
import { formatMoney } from '@/utils/format'

// 采购/核算状态文案：卡片副标题用它告诉用户"下一步该做什么"
const SHOPPING_STATUS_TEXT = {
  none: '还没有生成采购清单',
  draft: '采购清单待确认',
  confirmed: '采购清单已确认，待去核算',
  'account-draft': '核算清单待确认',
  done: '本周采购已完成核算',
}

const router = useRouter()

// 工作台一次拉两份数据：概览（卡片/摘要/Top5/临期）+ 近 4 周支出（迷你折线）
const loading = ref(false)
const overview = ref(null)
const trend = ref([])

/** 跳转到指定页面（卡片 click 统一走这里，避免模板里散落 router.push） */
function go(path) {
  if (path) router.push(path)
}

/**
 * 拉取工作台数据
 * 副作用：更新 loading / overview / trend
 */
async function fetchDashboard() {
  loading.value = true
  try {
    const [overviewData, trendData] = await Promise.all([
      getStatsOverview({ weekStart: getWeekStart(new Date()) }),
      getExpenseTrend({ weeks: 4 }),
    ])
    overview.value = overviewData
    trend.value = trendData
  } finally {
    // 失败时错误提示由请求层统一弹出，这里只负责收尾 loading
    loading.value = false
  }
}
onMounted(fetchDashboard)

// 是否已排餐：决定"本周计划摘要"显示列表还是空态
const hasPlan = computed(() => (overview.value?.mealPlanned || 0) > 0)
// 本周 7 天摘要：[{ date, weekday, mealCount, meals }]
const days = computed(() => overview.value?.days || [])
// 待采购 Top5：[{ name, display }]
const topPending = computed(() => overview.value?.topPending || [])
// 临期食材：[{ name, display, expireAt, daysLeft }]
const expiringItems = computed(() => overview.value?.expiringItems || [])

// 4 张统计卡：value 已在 computed 里格式化好，模板只负责渲染
const statCards = computed(() => [
  {
    key: 'meal',
    label: '已排餐数',
    value: `${overview.value?.mealPlanned ?? 0}`,
    suffix: `/ ${overview.value?.mealTotal ?? 21}`,
    hint: '本周 7 天 × 3 餐',
    to: '/plan',
  },
  {
    key: 'estimate',
    label: '本周预估',
    value: formatMoney(overview.value?.planEstimateFen || 0),
    suffix: '',
    hint: '按计划食材均价估算',
    to: '/plan',
  },
  {
    key: 'expense',
    label: '本周实际支出',
    value: formatMoney(overview.value?.actualExpenseFen || 0),
    suffix: '',
    // 支出卡片副标题直接展示采购状态，用户一眼知道下一步
    hint: SHOPPING_STATUS_TEXT[overview.value?.shoppingStatus] || SHOPPING_STATUS_TEXT.none,
    to: '/shopping',
  },
  {
    key: 'expiring',
    label: '临期食材',
    value: `${overview.value?.expiringCount ?? 0} 项`,
    suffix: '',
    hint: '3 天内到期（库存管理 S9 上线后可维护）',
    // 当前没有临期项时不跳转，避免点进"建设中"的库存页
    to: expiringItems.value.length > 0 ? '/pantry' : '',
  },
])

// 近 4 周支出迷你折线：只保留实际支出一条线，去掉图例/标题，节省工作台空间
const trendOption = computed(() => {
  const labels = trend.value.map((row) => row.weekStart.slice(5))
  // 金额分 → 元（坐标轴单位），tooltip 再还原成 ¥ 格式
  const values = trend.value.map((row) => Number(((row.actual || 0) / 100).toFixed(2)))
  return {
    color: ['#4caf50'],
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value) => formatMoney(Math.round(Number(value) * 100)),
    },
    grid: { left: 8, right: 12, top: 16, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labels,
      axisLabel: { color: '#909399', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#909399', fontSize: 11, formatter: (value) => `¥${value}` },
      splitLine: { lineStyle: { type: 'dashed' } },
    },
    series: [
      {
        name: '支出',
        type: 'line',
        smooth: true,
        symbolSize: 6,
        data: values,
        lineStyle: { width: 2 },
        areaStyle: { color: 'rgba(76, 175, 80, 0.12)' },
      },
    ],
  }
})
</script>

<template>
  <PageContainer title="工作台">
    <!-- 右上角快捷入口：工作台最常见的两个动作 -->
    <template #extra>
      <el-button @click="go('/recipes')">去菜谱库</el-button>
      <el-button type="primary" @click="go('/plan')">去排计划</el-button>
    </template>

    <div class="dashboard">
      <!-- 第一行：4 张统计卡（有 to 的卡片可点击跳转） -->
      <div class="dashboard__cards">
        <article
          v-for="card in statCards"
          :key="card.key"
          class="stat-card"
          :class="{ 'stat-card--link': card.to }"
          @click="go(card.to)"
        >
          <p class="stat-card__label">{{ card.label }}</p>
          <p class="stat-card__value">
            {{ card.value }}
            <!-- 分母（/21 餐）用弱化字号，数字主次分明 -->
            <span v-if="card.suffix" class="stat-card__suffix">{{ card.suffix }}</span>
          </p>
          <p class="stat-card__hint">{{ card.hint }}</p>
        </article>
      </div>

      <!-- 第二行：左侧计划摘要 + 迷你折线，右侧待采购 Top5 + 临期提醒 -->
      <div class="dashboard__main">
        <div class="dashboard__left">
          <!-- 本周计划摘要：按天列出已排菜品，点击整行跳一周计划 -->
          <section class="panel">
            <header class="panel__header">
              <h3 class="panel__title">本周计划摘要</h3>
              <el-button link type="primary" @click="go('/plan')">查看一周计划</el-button>
            </header>
            <!-- 空态：本周未排餐时引导去排计划（可先复制上周） -->
            <EmptyState
              v-if="!loading && !hasPlan"
              description="本周还没有排计划，先去排菜或复制上周"
              action-text="去排计划"
              @action="go('/plan')"
            />
            <!-- 计划列表：每天一行，已排的菜用标签展示 -->
            <ul v-else class="day-list">
              <li v-for="day in days" :key="day.date" class="day-list__item" @click="go('/plan')">
                <div class="day-list__date">
                  <span class="day-list__weekday">{{ day.weekday }}</span>
                  <span class="day-list__md">{{ day.date.slice(5) }}</span>
                </div>
                <div class="day-list__meals">
                  <template v-if="day.mealCount">
                    <el-tag
                      v-for="meal in day.meals"
                      :key="`${meal.mealType}-${meal.title}`"
                      size="small"
                      type="info"
                      class="day-list__tag"
                    >
                      {{ MEAL_LABEL[meal.mealType] }} · {{ meal.title }}
                    </el-tag>
                  </template>
                  <span v-else class="day-list__empty">未安排</span>
                </div>
              </li>
            </ul>
          </section>

          <!-- 近 4 周支出迷你折线：图表高度统一由 ChartCard 控制 -->
          <ChartCard
            title="近 4 周支出"
            :option="trendOption"
            :loading="loading"
            :empty="!loading && trend.length === 0"
            height="200"
            empty-text="还没有支出记录"
            empty-action-text="去采购核算"
            @empty-action="go('/shopping')"
          />
        </div>

        <aside class="dashboard__side">
          <!-- 待采购 Top5：来自本周采购清单，按预估金额降序取前 5 -->
          <section class="panel">
            <header class="panel__header">
              <h3 class="panel__title">待采购 Top5</h3>
              <el-button link type="primary" @click="go('/shopping')">去采购清单</el-button>
            </header>
            <EmptyState
              v-if="!loading && topPending.length === 0"
              description="还没有采购清单，生成后可查看待买食材"
              action-text="去生成清单"
              @action="go('/shopping')"
            />
            <ul v-else class="simple-list">
              <li
                v-for="(item, index) in topPending"
                :key="`${item.name}-${index}`"
                class="simple-list__item"
                @click="go('/shopping')"
              >
                <span class="simple-list__index">{{ index + 1 }}</span>
                <span class="simple-list__name">{{ item.name }}</span>
                <span class="simple-list__meta">{{ item.display }}</span>
              </li>
            </ul>
          </section>

          <!-- 临期提醒：3 天内到期；库存管理属 S9，本页只读种子库存 -->
          <section class="panel">
            <header class="panel__header">
              <h3 class="panel__title">临期提醒</h3>
              <el-tag v-if="expiringItems.length" type="warning" size="small">
                {{ expiringItems.length }} 项
              </el-tag>
            </header>
            <EmptyState
              v-if="!loading && expiringItems.length === 0"
              description="暂无临期食材（库存管理将在 S9 上线）"
            />
            <ul v-else class="simple-list">
              <li v-for="item in expiringItems" :key="item.ingredientId" class="simple-list__item">
                <span class="simple-list__name">{{ item.name }}</span>
                <span class="simple-list__meta">{{ item.display }}</span>
                <span class="simple-list__danger">剩 {{ item.daysLeft }} 天</span>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  </PageContainer>
</template>

<style scoped lang="scss">
// 工作台整体：上下两段（卡片行 → 主体两栏）
.dashboard {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

// 统计卡行：宽屏 4 列，窄屏 2 列
.dashboard__cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: $spacing-md;
}

@media (max-width: 900px) {
  .dashboard__cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

// 单张统计卡：白底细边框，与图表卡片视觉一致
.stat-card {
  padding: $spacing-md;
  background-color: $bg-white;
  border: 1px solid $border-color-light;
  border-radius: $radius-md;
}

// 可点击的卡片：hover 时描边变主题色，提示可以跳转
.stat-card--link {
  cursor: pointer;
  transition: border-color 0.2s;

  &:hover {
    border-color: $color-primary;
  }
}

// 卡片标题：弱化颜色
.stat-card__label {
  font-size: $font-size-sm;
  color: $text-secondary;
}

// 卡片主数值：大号加粗，是工作台第一眼信息
.stat-card__value {
  margin-top: $spacing-xs;
  font-size: $font-size-lg;
  font-weight: 700;
  color: $text-primary;
}

// 主数值后缀（如 /21 餐）：小字号弱化
.stat-card__suffix {
  margin-left: $spacing-xs;
  font-size: $font-size-sm;
  font-weight: 400;
  color: $text-secondary;
}

// 卡片副标题：说明数值口径或采购状态
.stat-card__hint {
  margin-top: $spacing-xs;
  font-size: $font-size-xs;
  color: $text-secondary;
}

// 主体两栏：左宽右窄（计划摘要 + 折线 / Top5 + 临期）
.dashboard__main {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  gap: $spacing-md;
  align-items: start;
}

// 窄屏：两栏改成一栏
@media (max-width: 1024px) {
  .dashboard__main {
    grid-template-columns: 1fr;
  }
}

// 左栏：计划摘要在上、迷你折线在下
.dashboard__left {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

// 右栏：Top5 与临期提醒上下排列
.dashboard__side {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

// 面板外壳：白底细边框（与统计卡统一）
.panel {
  padding: $spacing-md;
  background-color: $bg-white;
  border: 1px solid $border-color-light;
  border-radius: $radius-md;
}

// 面板标题行：左标题右操作
.panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-sm;
  margin-bottom: $spacing-sm;
}

// 面板标题
.panel__title {
  font-size: $font-size-base;
  font-weight: 600;
  color: $text-primary;
}

// 按天计划列表：每天一行，hover 提示可点击
.day-list {
  display: flex;
  flex-direction: column;
}

.day-list__item {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-sm 0;
  border-top: 1px solid $border-color-light;
  cursor: pointer;

  &:hover {
    background-color: rgba($color-primary, 0.04);
  }
}

// 日期块：星期 + 月日，固定宽度让 7 行对齐
.day-list__date {
  display: flex;
  flex-direction: column;
  width: 48px;
  flex-shrink: 0;
}

// 星期文案
.day-list__weekday {
  font-size: $font-size-sm;
  color: $text-primary;
}

// 月日：更小更浅
.day-list__md {
  font-size: $font-size-xs;
  color: $text-secondary;
}

// 当天菜品标签区：自动换行
.day-list__meals {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-xs;
}

// 菜品标签：内容过长时省略
.day-list__tag {
  max-width: 100%;
}

// 未安排文案：弱化
.day-list__empty {
  font-size: $font-size-sm;
  color: $text-placeholder;
}

// 简单列表（Top5 / 临期）：竖排
.simple-list {
  display: flex;
  flex-direction: column;
}

.simple-list__item {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-xs 0;
  font-size: $font-size-sm;
  color: $text-regular;
  border-top: 1px solid $border-color-light;
  cursor: pointer;

  &:hover {
    background-color: rgba($color-primary, 0.04);
  }
}

// 序号徽标：Top5 用，圆形数字
.simple-list__index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  font-size: $font-size-xs;
  color: $bg-white;
  background-color: $color-primary;
  border-radius: 50%;
}

// 食材名：占满剩余宽度
.simple-list__name {
  flex: 1;
  color: $text-primary;
}

// 分量/到期日：右侧弱化
.simple-list__meta {
  font-size: $font-size-xs;
  color: $text-secondary;
}

// 临期剩余天数：警示色
.simple-list__danger {
  font-size: $font-size-xs;
  color: $color-accent;
}
</style>
