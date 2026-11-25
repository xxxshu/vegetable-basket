<!--
  智能配菜抽屉（S10）
  - 打开时并行请求「推荐结果」与「本周计划」：推荐来自 mock 的真实数据加权计算
  - Top7 卡片：菜谱卡 + 推荐分 + 1~2 条可读理由 + 每份成本
  - 「加入计划」弹小窗选日期/餐次/份数，默认本周第一个空餐次，确认后写入一周计划
  - 算法本体在 utils/recommend.js（纯函数），本组件只负责展示与交互
-->
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { addPlanItem, getPlan } from '@/api/plan'
import { getRecommendations } from '@/api/recommend'
import EmptyState from '@/components/EmptyState.vue'
import RecipeCard from '@/components/RecipeCard.vue'
import { MEAL_LABEL } from '@/utils/constants'
import { getWeekDates, getWeekdayLabel, getWeekStart } from '@/utils/date'
import { formatMoney } from '@/utils/format'

const props = defineProps({
  // 抽屉显示状态（v-model）
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'added'])

// 抽屉 v-model：内部关闭时通知父组件
const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const router = useRouter()

// 推荐列表 / 加载状态
const loading = ref(false)
const list = ref([])
// 当前查看的周（周一日期）：推荐与"加入计划"都落到本周
const weekStart = ref(getWeekStart(new Date()))
// 本周已排计划项：用于算"第一个空餐次"与加入后的本地同步
const planItems = ref([])

// 加入计划弹窗状态
const addVisible = ref(false)
const submitting = ref(false)
// 当前要加入的推荐项（含 recipe / score / reasons）
const current = ref(null)
// 加入计划表单：默认本周第一个空餐次
const form = reactive({ date: '', mealType: 'dinner', servings: 2 })

// 餐次选项：从常量 MEAL_LABEL 生成 [{value,label}]，避免模板里再写映射
const MEAL_OPTIONS = Object.entries(MEAL_LABEL).map(([value, label]) => ({ value, label }))
// 一周固定 7 天 × 3 餐（用于找空餐次）
const PLAN_MEAL_TYPES = ['breakfast', 'lunch', 'dinner']

// 本周 7 天：[{ date, weekday }]，用于日期下拉
const weekDays = computed(() =>
  getWeekDates(weekStart.value).map((date) => ({ date, weekday: getWeekdayLabel(date) })),
)

// 本周所有"空餐次"（某天某餐还没有任何菜），按日期 + 早/中/晚顺序
const emptySlots = computed(() => {
  const used = new Set(planItems.value.map((item) => `${item.date}_${item.mealType}`))
  const slots = []
  weekDays.value.forEach((day) => {
    PLAN_MEAL_TYPES.forEach((mealType) => {
      if (!used.has(`${day.date}_${mealType}`)) slots.push({ date: day.date, mealType })
    })
  })
  return slots
})

// 默认落点：本周第一个空餐次；整周排满时退回周一晚餐（用户仍可手动改）
const defaultSlot = computed(
  () => emptySlots.value[0] || { date: weekDays.value[0]?.date || '', mealType: 'dinner' },
)

/**
 * 加载推荐与本周计划
 * 副作用：更新 loading / list / planItems / weekStart
 * 说明：两个请求互不依赖（推荐要读计划里的营养缺口，但由 mock 内部读取，
 * 前端只额外拉计划用于"空餐次"判断）
 */
async function loadRecommendations() {
  loading.value = true
  try {
    weekStart.value = getWeekStart(new Date())
    const [recommendations, plan] = await Promise.all([
      getRecommendations({ weekStart: weekStart.value }),
      getPlan({ weekStart: weekStart.value }),
    ])
    list.value = recommendations
    planItems.value = plan.items
  } catch {
    // 失败提示由请求层统一弹出，这里只保证不残留旧数据
    list.value = []
    planItems.value = []
  } finally {
    loading.value = false
  }
}

// 抽屉每次打开时重新拉取：库存/预算/计划可能已变化，推荐结果要跟着更新
watch(
  () => props.modelValue,
  (open) => {
    if (open) loadRecommendations()
  },
)

/**
 * 打开「加入计划」弹窗
 * @param {object} item 当前推荐项
 */
function openAddDialog(item) {
  current.value = item
  form.date = defaultSlot.value.date
  form.mealType = defaultSlot.value.mealType
  form.servings = 2
  addVisible.value = true
}

/**
 * 确认加入计划
 * 副作用：调 addPlanItem 成功后关闭弹窗、本地同步 planItems、通知父组件刷新工作台
 */
async function handleAdd() {
  if (!current.value) return
  submitting.value = true
  try {
    const addedItem = await addPlanItem({
      weekStart: weekStart.value,
      date: form.date,
      mealType: form.mealType,
      recipeId: current.value.recipe.id,
      servings: form.servings,
    })
    // 本地同步：下一道菜默认落到下一个空餐次（不重新请求，交互更顺）
    planItems.value = [...planItems.value, addedItem]
    ElMessage.success(
      `已把「${current.value.recipe.title}」加入 ${form.date.slice(5)} ${MEAL_LABEL[form.mealType]}`,
    )
    addVisible.value = false
    // 通知工作台刷新概览（已排餐数 / 预估金额等）
    emit('added')
  } catch {
    // 失败提示由请求层统一弹出
  } finally {
    submitting.value = false
  }
}

/**
 * 查看推荐菜谱详情：先关闭抽屉再跳转，避免返回时抽屉还开着
 * @param {number} id 菜谱 id
 */
function goDetail(id) {
  visible.value = false
  router.push(`/recipes/${id}`)
}
</script>

<template>
  <!-- 推荐抽屉：宽度固定，底部放权重说明 -->
  <el-drawer v-model="visible" title="智能配菜" size="640px">
    <!-- 算法说明：答辩/面试时能直接解释"为什么是这些菜" -->
    <p class="recommend__intro">
      按「库存命中 ×3 + 预算 ×2 + 营养缺口 ×2 + 难度 ×1」加权打分；忌口命中一票否决。
      规则可解释、不接大模型，每道菜都给出推荐理由。
    </p>

    <!-- 推荐列表：每项一张菜谱卡 + 分数 + 理由 + 操作 -->
    <div v-loading="loading" class="recommend__list">
      <article v-for="(item, index) in list" :key="item.recipe.id" class="recommend__item">
        <!-- 排名徽标：Top7 序号 -->
        <span class="recommend__rank">{{ index + 1 }}</span>

        <!-- 菜谱卡：复用 S4 的 RecipeCard（隐藏收藏按钮） -->
        <div class="recommend__card">
          <RecipeCard
            :recipe="item.recipe"
            :favorite="false"
            :show-favorite="false"
            @click="goDetail(item.recipe.id)"
          />
        </div>

        <!-- 推荐信息：分数 / 理由 / 成本 / 操作 -->
        <div class="recommend__info">
          <div class="recommend__title-row">
            <span class="recommend__title">{{ item.recipe.title }}</span>
            <el-tag type="success" size="small" effect="plain">推荐分 {{ item.score }}</el-tag>
          </div>

          <!-- 1~2 条可读理由（库存命中 / 营养缺口 / 预算 / 难度） -->
          <ul class="recommend__reasons">
            <li v-for="reason in item.reasons" :key="reason">{{ reason }}</li>
          </ul>

          <p class="recommend__meta">
            每份成本约 {{ formatMoney(item.costPerServingFen) }} · 库存命中
            {{ item.scoreDetail.stockHits }} 种
          </p>

          <div class="recommend__actions">
            <el-button size="small" @click="goDetail(item.recipe.id)">查看详情</el-button>
            <el-button size="small" type="primary" @click="openAddDialog(item)">
              加入计划
            </el-button>
          </div>
        </div>
      </article>

      <!-- 空态：没有可推荐菜谱时给出引导 -->
      <EmptyState
        v-if="!loading && list.length === 0"
        description="暂时没有可推荐的菜谱，先去菜谱库看看或调整家庭设置"
      />
    </div>

    <!-- 底部权重说明：方便答辩时讲清打分口径 -->
    <template #footer>
      <p class="recommend__footer">
        权重：库存命中 3 · 预算匹配 2 · 营养缺口 2 · 难度 1；忌口命中一票否决
      </p>
    </template>
  </el-drawer>

  <!-- 加入计划弹窗：默认本周第一个空餐次，可手动调整 -->
  <el-dialog v-model="addVisible" title="加入本周计划" width="460px" append-to-body>
    <p class="recommend__selected">已选：{{ current?.recipe.title }}</p>
    <el-form label-width="72px">
      <el-form-item label="日期">
        <el-select v-model="form.date" class="recommend__field">
          <el-option
            v-for="day in weekDays"
            :key="day.date"
            :label="`${day.weekday} ${day.date.slice(5)}`"
            :value="day.date"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="餐次">
        <el-select v-model="form.mealType" class="recommend__field">
          <el-option
            v-for="option in MEAL_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="份数">
        <el-input-number v-model="form.servings" :min="1" :max="10" />
      </el-form-item>
    </el-form>
    <p class="recommend__hint">默认填入本周第一个空餐次；加入后可在「一周计划」继续调整。</p>

    <template #footer>
      <el-button @click="addVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleAdd">确定加入</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
// 算法说明：浅色底 + 小字，弱化但可读
.recommend__intro {
  padding: $spacing-sm $spacing-md;
  margin-bottom: $spacing-md;
  font-size: $font-size-sm;
  line-height: 1.6;
  color: $text-regular;
  background-color: rgba($color-primary, 0.06);
  border-radius: $radius-sm;
}

// 推荐列表：纵向排列，加载时保持最小高度避免抖动
.recommend__list {
  display: flex;
  flex-direction: column;
  min-height: 240px;
}

// 单条推荐：排名 + 菜谱卡 + 信息三列
.recommend__item {
  display: flex;
  gap: $spacing-md;
  padding: $spacing-md 0;
  border-top: 1px solid $border-color-light;
}

// 排名徽标：圆形数字，主色底
.recommend__rank {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  margin-top: $spacing-xs;
  font-size: $font-size-sm;
  font-weight: 700;
  color: $bg-white;
  background-color: $color-primary;
  border-radius: 50%;
}

// 菜谱卡：抽屉内固定宽度，保证三列排版稳定
.recommend__card {
  flex-shrink: 0;
  width: 180px;
}

// 右侧信息区：纵向排列
.recommend__info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: $spacing-xs;
  min-width: 0;
}

// 标题行：菜名 + 推荐分标签
.recommend__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-sm;
}

// 菜名：加粗单行省略
.recommend__title {
  overflow: hidden;
  font-size: $font-size-md;
  font-weight: 600;
  color: $text-primary;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// 推荐理由列表：去掉默认列表样式，前面加小圆点
.recommend__reasons {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: $spacing-md;
  font-size: $font-size-sm;
  line-height: 1.5;
  color: $text-regular;
  list-style: disc;
}

// 成本 / 库存命中：辅助信息
.recommend__meta {
  font-size: $font-size-xs;
  color: $text-secondary;
}

// 操作按钮行
.recommend__actions {
  display: flex;
  gap: $spacing-sm;
  margin-top: $spacing-xs;
}

// 底部权重说明：小字居中
.recommend__footer {
  font-size: $font-size-xs;
  color: $text-secondary;
  text-align: center;
}

// 弹窗里"已选菜谱"
.recommend__selected {
  margin-bottom: $spacing-md;
  font-size: $font-size-base;
  color: $text-primary;
}

// 弹窗下拉：占满一行
.recommend__field {
  width: 100%;
}

// 弹窗底部提示：小字弱化
.recommend__hint {
  font-size: $font-size-xs;
  color: $text-secondary;
}
</style>
