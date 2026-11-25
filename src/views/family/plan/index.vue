<!--
  一周计划（S6，核心页）：
  - 周切换（watch 周起始日重新请求）+ 7 天 × 3 餐网格（早餐/午餐/晚餐）
  - 右栏汇总用 computed 实时计算：已排餐数 / 预估金额 / 总热量 / 日均热量
  - 点「+ 添加」→ 选菜抽屉 → 选份数 → 保存；「改」改份数、「删」移除
  - 复制上周：取上周 items → 手写 deepClone → 批量新增（注释说明为什么必须深拷贝）
-->
<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { addPlanItem, deletePlanItem, getPlan, updatePlanItem } from '@/api/plan'
import MealCell from '@/components/MealCell.vue'
import PageContainer from '@/components/PageContainer.vue'
import RecipePickerDrawer from '@/components/RecipePickerDrawer.vue'
import { deepClone } from '@/utils/deepClone'
import { MEAL_LABEL } from '@/utils/constants'
import {
  addDays,
  formatWeekRange,
  getWeekDates,
  getWeekStart,
  getWeekdayLabel,
  isToday,
} from '@/utils/date'
import { formatMoney } from '@/utils/format'

const router = useRouter()

// 餐次顺序：与 MealCell 的渲染顺序一致
const mealTypes = ['breakfast', 'lunch', 'dinner']

// 当前查看的周（周一日期）；切换周时 watch 会重新请求
const weekStart = ref(getWeekStart(new Date()))
// 本周 7 天日期数组（周一开始）
const weekDates = computed(() => getWeekDates(weekStart.value))
// 周范围文案：2026-11-24 ~ 11-30
const rangeText = computed(() => formatWeekRange(weekStart.value))
// 是否正在看"本周"（用于显示"回到本周"按钮）
const isCurrentWeek = computed(() => weekStart.value === getWeekStart(new Date()))

// 计划项与加载状态
const items = ref([])
const loading = ref(false)

/**
 * 拉取当前周的计划
 * 副作用：更新 items / loading
 */
async function fetchPlan() {
  loading.value = true
  try {
    const data = await getPlan({ weekStart: weekStart.value })
    items.value = data.items
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
}

// 周切换：周起始日变化就重新请求（watch 是 S6 必补知识的落点之一）
watch(weekStart, fetchPlan)

// 首次进入：加载本周计划
onMounted(fetchPlan)

/**
 * 切换上一周 / 下一周
 * @param {number} offset -1=上周，1=下周
 */
function changeWeek(offset) {
  weekStart.value = addDays(weekStart.value, offset * 7)
}

/** 回到本周 */
function goCurrentWeek() {
  weekStart.value = getWeekStart(new Date())
}

// 按「日期 + 餐次」组织数据，模板里直接取 itemsByCell[date][mealType]
const itemsByCell = computed(() => {
  const map = {}
  weekDates.value.forEach((date) => {
    map[date] = { breakfast: [], lunch: [], dinner: [] }
  })
  items.value.forEach((item) => {
    if (map[item.date]?.[item.mealType]) map[item.date][item.mealType].push(item)
  })
  return map
})

// 右栏汇总：全部由 computed 从计划项实时计算（改份数/增删后自动更新）
const summary = computed(() => {
  // 已排餐数：计划项条数（每格可放多道菜，按"道"计数）
  const placedCount = items.value.length
  // 预估金额（分）：Σ 每份成本 × 份数
  const totalCostFen = items.value.reduce((sum, item) => sum + item.unitCostFen * item.servings, 0)
  // 总热量：Σ 每份热量 × 份数；日均 = 总热量 / 7 天
  const totalCalories = items.value.reduce(
    (sum, item) => sum + (item.recipe.calories || 0) * item.servings,
    0,
  )
  return {
    placedCount,
    totalMeals: 21,
    totalCostFen,
    totalCalories,
    dailyCalories: Math.round(totalCalories / 7),
  }
})

// 选菜抽屉状态：记录"正在给哪一天、哪一餐选菜"
const picker = reactive({ visible: false, date: '', mealType: 'breakfast' })

/**
 * 点「+ 添加」：打开选菜抽屉
 * @param {{ date: string, mealType: string }} payload MealCell 抛出的格子信息
 */
function handleAdd({ date, mealType }) {
  Object.assign(picker, { visible: true, date, mealType })
}

/**
 * 抽屉确定：添加计划项 → 刷新计划（汇总自动更新）
 * @param {{ recipe: object, servings: number }} payload
 */
async function handlePickerConfirm({ recipe, servings }) {
  try {
    await addPlanItem({
      weekStart: weekStart.value,
      date: picker.date,
      mealType: picker.mealType,
      recipeId: recipe.id,
      servings,
    })
    ElMessage.success('已加入计划')
    await fetchPlan()
  } catch {
    // 失败提示由请求层统一弹出
  }
}

/**
 * 修改份数：弹输入框 → 调接口 → 刷新（右栏汇总实时变化）
 * @param {object} item 计划项
 */
async function handleEdit(item) {
  const value = await ElMessageBox.prompt(`修改「${item.recipe.title}」的份数`, '修改份数', {
    inputValue: String(item.servings),
    inputPattern: /^([1-9]|10)$/,
    inputErrorMessage: '请输入 1-10 的整数',
    confirmButtonText: '保存',
    cancelButtonText: '取消',
  })
    .then((result) => result.value)
    .catch(() => null)
  if (!value) return

  try {
    await updatePlanItem(item.id, { servings: Number(value) })
    ElMessage.success('份数已更新')
    await fetchPlan()
  } catch {
    // 失败提示由请求层统一弹出
  }
}

/**
 * 移除计划项：二次确认 → 调接口 → 刷新
 * @param {object} item 计划项
 */
async function handleRemove(item) {
  const confirmed = await ElMessageBox.confirm(`确定移除「${item.recipe.title}」吗？`, '移除提示', {
    type: 'warning',
    confirmButtonText: '移除',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  try {
    await deletePlanItem(item.id)
    ElMessage.success('已移除')
    await fetchPlan()
  } catch {
    // 失败提示由请求层统一弹出
  }
}

/**
 * 生成采购清单：跳转到采购清单页并自动触发生成（S7 接入）
 * 采购清单页会检查本周是否已生成，未生成且本周有排餐则自动生成
 */
function goShopping() {
  router.push({ path: '/shopping', query: { generate: '1' } })
}

/**
 * 复制上周：取上周 items → 深拷贝 → 映射到本周日期 → 批量新增
 * 必须深拷贝的原因：接口返回的 items 是对象引用，直接改日期/复用会互相影响；
 * 深拷贝后本周数据与上周完全独立（验收项：改本周不影响上周）。
 */
async function handleCopyLastWeek() {
  const lastWeekStart = addDays(weekStart.value, -7)
  try {
    const lastPlan = await getPlan({ weekStart: lastWeekStart })
    if (lastPlan.items.length === 0) {
      ElMessage.warning('上一周没有排餐数据，无法复制')
      return
    }
    const confirmed = await ElMessageBox.confirm(
      `将上一周的 ${lastPlan.items.length} 项计划复制到本周？${items.value.length > 0 ? '（本周已有排餐，复制会追加）' : ''}`,
      '复制上周',
      { type: 'warning', confirmButtonText: '复制', cancelButtonText: '取消' },
    )
      .then(() => true)
      .catch(() => false)
    if (!confirmed) return

    // 1. 手写深拷贝：克隆上周数据（含嵌套的 recipe 对象），与上周彻底解耦
    const clonedItems = deepClone(lastPlan.items)
    // 2. 映射成本周的批量新增参数：保持星期几不变（日期 +7 天），去掉旧 id 交给后端重新分配
    const payloads = clonedItems.map((item) => ({
      weekStart: weekStart.value,
      date: addDays(item.date, 7),
      mealType: item.mealType,
      recipeId: item.recipeId,
      servings: item.servings,
    }))
    // 3. 批量新增（Promise.all 并发发送，全部成功后再刷新）
    await Promise.all(payloads.map((payload) => addPlanItem(payload)))
    ElMessage.success(`已复制 ${payloads.length} 项计划`)
    await fetchPlan()
  } catch {
    // 失败提示由请求层统一弹出
  }
}
</script>

<template>
  <!-- 页面容器：右上角放周切换与复制操作 -->
  <PageContainer title="一周计划">
    <template #extra>
      <el-button @click="changeWeek(-1)">上周</el-button>
      <span class="plan__range">{{ rangeText }}</span>
      <el-button @click="changeWeek(1)">下周</el-button>
      <el-button v-if="!isCurrentWeek" plain @click="goCurrentWeek">回到本周</el-button>
      <el-button @click="handleCopyLastWeek">复制上周</el-button>
      <el-button type="primary" @click="goShopping">生成采购清单</el-button>
    </template>

    <!-- 空周提示 -->
    <p v-if="items.length === 0 && !loading" class="plan__empty-tip">
      本周还没有排餐，点击格子里的「+ 添加」开始安排吧
    </p>

    <!-- 主体：左侧 7×3 网格 + 右侧汇总 -->
    <div v-loading="loading" class="plan">
      <!-- 网格：第一列是星期，后三列是三餐 -->
      <div class="plan__grid">
        <div class="plan__corner"></div>
        <div v-for="meal in mealTypes" :key="meal" class="plan__head">
          {{ MEAL_LABEL[meal] }}
        </div>

        <template v-for="date in weekDates" :key="date">
          <!-- 星期 + 日期：今天高亮 -->
          <div class="plan__day" :class="{ 'is-today': isToday(date) }">
            <p class="plan__weekday">{{ getWeekdayLabel(date) }}</p>
            <p class="plan__date">{{ date.slice(5) }}</p>
          </div>
          <!-- 某天的三餐格子 -->
          <MealCell
            v-for="meal in mealTypes"
            :key="`${date}-${meal}`"
            :date="date"
            :meal-type="meal"
            :items="itemsByCell[date][meal]"
            @add="handleAdd"
            @edit="handleEdit"
            @remove="handleRemove"
          />
        </template>
      </div>

      <!-- 右栏汇总：全部由 computed 计算 -->
      <aside class="plan__summary">
        <h3 class="plan__summary-title">本周汇总</h3>
        <div class="plan__summary-row">
          <span>已排餐数</span>
          <strong>{{ summary.placedCount }} / {{ summary.totalMeals }}</strong>
        </div>
        <div class="plan__summary-row">
          <span>预估金额</span>
          <strong>{{ formatMoney(summary.totalCostFen) }}</strong>
        </div>
        <div class="plan__summary-row">
          <span>总热量</span>
          <strong>{{ summary.totalCalories }} kcal</strong>
        </div>
        <div class="plan__summary-row">
          <span>日均热量</span>
          <strong>{{ summary.dailyCalories }} kcal</strong>
        </div>
        <p class="plan__summary-hint">金额按食材均价估算（每份成本 × 份数）</p>
      </aside>
    </div>

    <!-- 选菜抽屉 -->
    <RecipePickerDrawer
      v-model="picker.visible"
      :date="picker.date"
      :meal-type="picker.mealType"
      @confirm="handlePickerConfirm"
    />
  </PageContainer>
</template>

<style scoped lang="scss">
// 周范围文字：居中显示
.plan__range {
  font-size: $font-size-base;
  color: $text-regular;
}

// 空周提示：浅色提示条
.plan__empty-tip {
  padding: $spacing-sm $spacing-md;
  margin-bottom: $spacing-md;
  font-size: $font-size-sm;
  color: $color-primary-dark;
  background-color: rgba($color-primary, 0.08);
  border-radius: $radius-sm;
}

// 主体：左网格 + 右汇总
.plan {
  display: flex;
  gap: $spacing-lg;
  align-items: flex-start;
}

// 网格：星期列 + 三餐列，单元格间距 8px
.plan__grid {
  display: grid;
  flex: 1;
  grid-template-columns: 72px repeat(3, minmax(0, 1fr));
  gap: $spacing-sm;
  min-width: 0;
}

// 表头：早餐 / 午餐 / 晚餐
.plan__head {
  padding-bottom: $spacing-xs;
  font-size: $font-size-sm;
  font-weight: 600;
  color: $text-regular;
  text-align: center;
}

// 星期格子：垂直居中显示
.plan__day {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 92px;
  color: $text-regular;
  background-color: $bg-page;
  border-radius: $radius-sm;
}

// 今天：主色文字 + 主色浅底
.plan__day.is-today {
  color: $color-primary-dark;
  background-color: rgba($color-primary, 0.12);
}

// 星期文案
.plan__weekday {
  font-size: $font-size-sm;
  font-weight: 600;
}

// 日期文案
.plan__date {
  font-size: $font-size-xs;
  color: $text-secondary;
}

// 右栏汇总：固定宽度，随滚动保持可见
.plan__summary {
  position: sticky;
  top: 80px;
  flex-shrink: 0;
  width: 240px;
  padding: $spacing-lg;
  background-color: $bg-page;
  border-radius: $radius-md;
}

// 汇总标题
.plan__summary-title {
  margin-bottom: $spacing-md;
  font-size: $font-size-md;
  color: $text-primary;
}

// 汇总行：左右两端对齐
.plan__summary-row {
  display: flex;
  justify-content: space-between;
  padding: $spacing-xs 0;
  font-size: $font-size-sm;
  color: $text-regular;

  strong {
    color: $text-primary;
  }
}

// 汇总说明：弱化文字
.plan__summary-hint {
  margin-top: $spacing-md;
  font-size: $font-size-xs;
  color: $text-secondary;
}
</style>
