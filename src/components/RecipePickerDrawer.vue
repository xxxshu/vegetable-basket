<!--
  选菜抽屉（S6）：点计划格子后弹出，复用 S4 的菜谱卡片挑选菜谱。
  - 抽屉内：关键词搜索（防抖）+ 菜谱卡片列表（分页）
  - 选中菜谱后在底部选份数 → 确定，把 { recipe, servings } 抛给计划页
-->
<script setup>
import { computed, ref, watch } from 'vue'

import { getRecipeList } from '@/api/recipe'
import EmptyState from '@/components/EmptyState.vue'
import RecipeCard from '@/components/RecipeCard.vue'
import { useDebounce } from '@/composables/useDebounce'
import { MEAL_LABEL } from '@/utils/constants'
import { getWeekdayLabel } from '@/utils/date'

const props = defineProps({
  // 抽屉显示状态（v-model）
  modelValue: { type: Boolean, default: false },
  // 当前格子的日期与餐次：只用于标题显示
  date: { type: String, default: '' },
  mealType: { type: String, default: 'dinner' },
})

const emit = defineEmits(['update:modelValue', 'confirm'])

// 抽屉 v-model：内部修改时通知父组件
const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

// 抽屉标题：周三 · 晚餐 选菜
const drawerTitle = computed(() => {
  const weekday = props.date ? getWeekdayLabel(props.date) : '计划'
  const mealLabel = MEAL_LABEL[props.mealType] || ''
  return `${weekday} · ${mealLabel} 选菜`
})

// 搜索与列表状态
const keyword = ref('')
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 12
const loading = ref(false)
// 当前选中的菜谱与份数
const selectedRecipe = ref(null)
const servings = ref(2)

// 关键词防抖 300ms：连续输入只发最后一次请求
const { run: runSearch } = useDebounce(() => {
  page.value = 1
  fetchList()
}, 300)

watch(keyword, () => runSearch())

/**
 * 拉取菜谱列表（复用 S4 列表接口）
 * 副作用：更新 list / total / loading
 */
async function fetchList() {
  loading.value = true
  try {
    const data = await getRecipeList({ keyword: keyword.value, page: page.value, pageSize })
    list.value = data.list
    total.value = data.total
  } catch {
    list.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

/**
 * 选中一张菜谱卡片
 * @param {object} recipe 菜谱摘要
 */
function selectRecipe(recipe) {
  selectedRecipe.value = recipe
}

/**
 * 翻页
 */
function handlePageChange() {
  fetchList()
}

/**
 * 确定：把选中的菜谱与份数交给父组件（计划页负责调接口）
 */
function handleConfirm() {
  if (!selectedRecipe.value) return
  emit('confirm', { recipe: selectedRecipe.value, servings: servings.value })
  visible.value = false
}

// 抽屉打开时：重置选择状态并加载列表
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    selectedRecipe.value = null
    servings.value = 2
    page.value = 1
    fetchList()
  },
)
</script>

<template>
  <!-- 选菜抽屉：宽度固定，底部固定操作区 -->
  <el-drawer v-model="visible" :title="drawerTitle" size="720px">
    <!-- 搜索区 -->
    <el-input v-model="keyword" class="picker__search" placeholder="搜索菜名 / 简介" clearable />

    <!-- 菜谱卡片列表：复用 RecipeCard，选菜场景隐藏收藏按钮 -->
    <div v-loading="loading" class="picker__grid">
      <div
        v-for="recipe in list"
        :key="recipe.id"
        class="picker__item"
        :class="{ 'is-selected': selectedRecipe?.id === recipe.id }"
        @click="selectRecipe(recipe)"
      >
        <RecipeCard :recipe="recipe" :favorite="false" :show-favorite="false" />
      </div>
    </div>

    <!-- 空态 -->
    <EmptyState v-if="!loading && list.length === 0" description="没有找到符合条件的菜谱" />

    <!-- 分页 -->
    <div v-if="!loading && list.length > 0" class="picker__pagination">
      <el-pagination
        v-model:current-page="page"
        :total="total"
        :page-size="pageSize"
        layout="total, prev, pager, next"
        background
        small
        @current-change="handlePageChange"
      />
    </div>

    <!-- 底部操作：已选菜谱 + 份数 + 按钮 -->
    <template #footer>
      <div class="picker__footer">
        <span class="picker__selected">
          {{ selectedRecipe ? `已选：${selectedRecipe.title}` : '请选择一道菜' }}
        </span>
        <span class="picker__servings-label">份数</span>
        <el-input-number v-model="servings" :min="1" :max="10" class="picker__servings" />
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :disabled="!selectedRecipe" @click="handleConfirm">
          确定
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped lang="scss">
// 搜索框：与下方卡片留出间距
.picker__search {
  margin-bottom: $spacing-md;
}

// 卡片网格：抽屉里 3 列
.picker__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: $spacing-md;
  min-height: 200px;

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

// 选中态：主色描边高亮
.picker__item {
  cursor: pointer;
  border-radius: $radius-md;
  outline: 2px solid transparent;
  outline-offset: 2px;
  transition: outline-color 0.2s;
}

// 选中高亮
.picker__item.is-selected {
  outline-color: $color-primary;
}

// 分页：居中
.picker__pagination {
  display: flex;
  justify-content: center;
  margin-top: $spacing-md;
}

// 底部操作区：横向排列
.picker__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: $spacing-sm;
}

// 已选菜名：靠左显示，可省略
.picker__selected {
  flex: 1;
  overflow: hidden;
  color: $text-regular;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// 份数标签
.picker__servings-label {
  font-size: $font-size-sm;
  color: $text-secondary;
}

// 份数输入框宽度
.picker__servings {
  width: 120px;
}
</style>
