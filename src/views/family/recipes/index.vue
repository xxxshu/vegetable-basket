<!--
  菜谱库（前台，S4）：
  - 搜索筛选：通用 SearchForm（关键词防抖 300ms + 烹饪方式 + 品类 + 难度 + 排序 + 重置）
  - 卡片网格 4 列 + 分页 + 骨架屏 + 空态/错误重试
  - 收藏状态来自 recipe store（持久化）
-->
<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { getRecipeList, toggleFavorite } from '@/api/recipe'
import EmptyState from '@/components/EmptyState.vue'
import PageContainer from '@/components/PageContainer.vue'
import RecipeCard from '@/components/RecipeCard.vue'
import SearchForm from '@/components/SearchForm.vue'
import { useDebounce } from '@/composables/useDebounce'
import { useRecipeStore } from '@/stores'
import { DIFFICULTY, ING_CATEGORIES, METHODS } from '@/utils/constants'

const router = useRouter()
const recipeStore = useRecipeStore()

// 筛选条件：ref 对象便于 SearchForm 通过 v-model 整体同步
const filters = ref({
  keyword: '',
  method: '',
  categoryId: '',
  difficulty: '',
  sort: 'default',
})

// 排序选项：与 mock 的 sort 契约一致
const sortOptions = [
  { label: '默认排序', value: 'default' },
  { label: '耗时从短到长', value: 'time-asc' },
  { label: '耗时从长到短', value: 'time-desc' },
  { label: '热量从低到高', value: 'calories-asc' },
  { label: '热量从高到低', value: 'calories-desc' },
]
// 下拉选项：复用全局字典常量；品类 id = 下标 + 1（与 mock categories.json 的 id 一致）
const methodOptions = METHODS.map((name) => ({ label: name, value: name }))
const difficultyOptions = DIFFICULTY.map((name, index) => ({ label: name, value: index + 1 }))
const categoryOptions = ING_CATEGORIES.map((name, index) => ({ label: name, value: index + 1 }))

// 搜索表单配置（SearchForm 消费）：结构与开发文档 6.3 的搜索区一致
const filterFields = [
  {
    type: 'input',
    label: '关键词',
    prop: 'keyword',
    placeholder: '搜索菜名 / 简介',
    width: '220px',
  },
  { type: 'select', label: '烹饪方式', prop: 'method', options: methodOptions, width: '130px' },
  { type: 'select', label: '品类', prop: 'categoryId', options: categoryOptions, width: '120px' },
  { type: 'select', label: '难度', prop: 'difficulty', options: difficultyOptions, width: '110px' },
  { type: 'select', label: '排序', prop: 'sort', options: sortOptions, width: '150px' },
]

// 列表数据与加载状态
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(12)
const loading = ref(false)
const loadFailed = ref(false)

/**
 * 拉取当前条件下的菜谱列表
 * 副作用：更新 list/total/loading/loadFailed
 */
async function fetchList() {
  loading.value = true
  loadFailed.value = false
  try {
    const data = await getRecipeList({
      ...filters.value,
      page: page.value,
      pageSize: pageSize.value,
    })
    list.value = data.list
    total.value = data.total
  } catch {
    // 错误提示已由 request.js 响应拦截器统一弹出，这里只负责展示重试入口
    list.value = []
    total.value = 0
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

// 关键词防抖 300ms：连续输入只发最后一次请求（手写防抖见 composables/useDebounce.js）
const { run: runSearch, cancel: cancelSearch } = useDebounce(() => {
  page.value = 1
  fetchList()
}, 300)

/**
 * 监听筛选条件变化：
 * - 只有关键词变化 → 走防抖（避免每敲一个字就请求）
 * - 其它条件变化 / 多个条件同时变化 → 立即重置到第 1 页并请求（并取消未执行的防抖）
 */
watch(
  () => ({ ...filters.value }),
  (next, prev) => {
    const onlyKeywordChanged =
      next.keyword !== prev.keyword &&
      next.method === prev.method &&
      next.categoryId === prev.categoryId &&
      next.difficulty === prev.difficulty &&
      next.sort === prev.sort

    if (onlyKeywordChanged) {
      runSearch()
      return
    }
    cancelSearch()
    page.value = 1
    fetchList()
  },
)

/** 回车立即搜索：取消防抖计时器，立刻按当前条件请求 */
function handleSearchNow() {
  cancelSearch()
  page.value = 1
  fetchList()
}

/**
 * 清空全部筛选条件：回到默认值，由上面的 watch 统一处理"回到第 1 页 + 重新请求"
 * （先取消防抖，避免关键词的防抖计时器再补一次请求）
 */
function handleClearFilters() {
  cancelSearch()
  filters.value = {
    keyword: '',
    method: '',
    categoryId: '',
    difficulty: '',
    sort: 'default',
  }
}

/** 翻页：请求新页数据并回到页面顶部 */
function handlePageChange() {
  fetchList()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** 修改每页条数：回到第 1 页重新请求 */
function handleSizeChange() {
  page.value = 1
  fetchList()
}

/**
 * 切换收藏：先调接口，成功后再写 recipe store（失败时状态不变，错误提示由拦截器弹出）
 * @param {object} recipe 菜谱摘要
 */
async function handleToggleFavorite(recipe) {
  const nextFavorite = !recipeStore.isFavorite(recipe.id)
  try {
    await toggleFavorite(recipe.id)
    recipeStore.setFavorite(recipe.id, nextFavorite)
  } catch {
    // 请求失败：不修改收藏状态（提示已由请求层统一弹出）
  }
}

/**
 * 进入菜谱详情
 * @param {object} recipe 菜谱摘要
 */
function goDetail(recipe) {
  router.push(`/recipes/${recipe.id}`)
}

// 首次进入页面：加载第 1 页数据
onMounted(fetchList)
</script>

<template>
  <!-- 页面容器：标题 + 右上角统计，内容区放搜索和卡片 -->
  <PageContainer title="菜谱库">
    <template #extra>
      <span class="recipes__count">共 {{ total }} 道菜谱</span>
    </template>

    <!-- 搜索筛选区：通用 SearchForm（实时查询 + 关键词防抖；隐藏"查询"按钮） -->
    <SearchForm
      v-model="filters"
      :fields="filterFields"
      :show-search="false"
      @search="handleSearchNow"
      @reset="cancelSearch"
    />

    <!-- 错误态：请求失败，提供重新加载 -->
    <EmptyState
      v-if="loadFailed"
      description="菜谱加载失败，请稍后重试"
      action-text="重新加载"
      @action="fetchList"
    />

    <!-- 空态：没有符合条件的数据，引导清空筛选 -->
    <EmptyState
      v-else-if="!loading && list.length === 0"
      description="没有找到符合条件的菜谱"
      action-text="清空筛选"
      @action="handleClearFilters"
    />

    <!-- 骨架屏：加载中显示与卡片同形的占位 -->
    <div v-else-if="loading" class="recipes__grid">
      <div v-for="n in 8" :key="n" class="recipes__skeleton">
        <el-skeleton animated>
          <template #template>
            <el-skeleton-item variant="image" class="recipes__skeleton-cover" />
            <div class="recipes__skeleton-body">
              <el-skeleton-item variant="h3" style="width: 60%" />
              <el-skeleton-item variant="text" style="width: 90%" />
              <el-skeleton-item variant="text" style="width: 45%" />
            </div>
          </template>
        </el-skeleton>
      </div>
    </div>

    <!-- 卡片网格：4 列（窄屏自适应） -->
    <div v-else class="recipes__grid">
      <RecipeCard
        v-for="recipe in list"
        :key="recipe.id"
        :recipe="recipe"
        :favorite="recipeStore.isFavorite(recipe.id)"
        @click="goDetail"
        @toggle-favorite="handleToggleFavorite"
      />
    </div>

    <!-- 分页：有数据时才显示 -->
    <div v-if="!loading && list.length > 0" class="recipes__pagination">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[12, 24, 36]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="handlePageChange"
        @size-change="handleSizeChange"
      />
    </div>
  </PageContainer>
</template>

<style scoped lang="scss">
// 右上角计数文字
.recipes__count {
  font-size: $font-size-sm;
  color: $text-secondary;
}

// 卡片网格：4 列等宽，窄屏自动减少列数
.recipes__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: $spacing-md;

  @media (max-width: 1200px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
}

// 骨架卡片：白底 + 边框，与真实卡片尺寸接近
.recipes__skeleton {
  overflow: hidden;
  background-color: $bg-white;
  border: 1px solid $border-color-light;
  border-radius: $radius-md;
  box-shadow: $shadow-card;
}

// 骨架封面占位高度
.recipes__skeleton-cover {
  height: 150px;
}

// 骨架信息区留白
.recipes__skeleton-body {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  padding: $spacing-md;
}

// 分页：居中展示
.recipes__pagination {
  display: flex;
  justify-content: center;
  margin-top: $spacing-lg;
}
</style>
