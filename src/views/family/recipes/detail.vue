<!--
  菜谱详情（前台，S4）：
  - 顶部封面 + 信息条（难度 / 热量 / 耗时 / 份数 / 营养）
  - 左侧食材清单（可勾选核对，可选食材有标记）
  - 右侧步骤时间线
  - 收藏（写入 recipe store，刷新后保留）
  - 说明：「加入本周计划」属 S6，本阶段不做
-->
<script setup>
// 组件名显式声明为多单词：文件按开发文档交付物命名为 detail.vue，但 Vue 组件名用 RecipeDetailPage
// （避免 eslint 的 vue/multi-word-component-names 警告）
defineOptions({ name: 'RecipeDetailPage' })

import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Star, StarFilled, Timer } from '@element-plus/icons-vue'

import { getRecipeDetail, toggleFavorite } from '@/api/recipe'
import EmptyState from '@/components/EmptyState.vue'
import PageContainer from '@/components/PageContainer.vue'
import { useRecipeStore } from '@/stores'

const route = useRoute()
const router = useRouter()
const recipeStore = useRecipeStore()

// 菜谱详情数据与加载状态
const detail = ref(null)
const loading = ref(false)
const loadFailed = ref(false)
// 已勾选核对的食材行 id：用 Set 存放，修改时整体替换以触发响应式更新
const checkedIngredientIds = ref(new Set())

// 难度文案与标签颜色：接口 difficulty 1/2/3 对应 简单/普通/困难
const difficultyText = computed(
  () => ['简单', '普通', '困难'][(detail.value?.difficulty || 1) - 1] || '未知',
)
const difficultyType = computed(
  () => ['success', 'warning', 'danger'][(detail.value?.difficulty || 1) - 1] || 'info',
)
// 封面占位文字：没有封面图时显示菜名首字
const coverText = computed(() => detail.value?.title?.slice(0, 1) || '菜')
// 是否已收藏：以 recipe store 的持久化状态为准
const favorite = computed(() => (detail.value ? recipeStore.isFavorite(detail.value.id) : false))

/**
 * 拉取菜谱详情
 * @param {number|string} id 菜谱 id
 * 副作用：更新 detail / loading / loadFailed，并清空食材勾选状态
 */
async function fetchDetail(id) {
  loading.value = true
  loadFailed.value = false
  detail.value = null
  checkedIngredientIds.value = new Set()
  try {
    detail.value = await getRecipeDetail(id)
  } catch {
    // 错误提示已由请求层统一弹出，这里只负责展示重试入口
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

/**
 * 切换某个食材行的勾选核对状态
 * @param {number} rowId 配方行 id
 */
function toggleIngredient(rowId) {
  const next = new Set(checkedIngredientIds.value)
  if (next.has(rowId)) next.delete(rowId)
  else next.add(rowId)
  checkedIngredientIds.value = next
}

/**
 * 切换收藏：先调接口，成功后再写 store（失败不改变状态）
 */
async function handleToggleFavorite() {
  if (!detail.value) return
  const nextFavorite = !favorite.value
  try {
    await toggleFavorite(detail.value.id)
    recipeStore.setFavorite(detail.value.id, nextFavorite)
  } catch {
    // 请求失败：保持原状态（提示已由请求层统一弹出）
  }
}

/** 返回菜谱库列表 */
function goBack() {
  router.push('/recipes')
}

// 首次进入：按路由参数加载详情
onMounted(() => fetchDetail(route.params.id))
// 支持从一道菜切到另一道菜（路由参数变化）时重新加载
watch(
  () => route.params.id,
  (id) => {
    if (id) fetchDetail(id)
  },
)
</script>

<template>
  <!-- 页面容器：右上角放返回与收藏操作 -->
  <PageContainer title="菜谱详情">
    <template #extra>
      <el-button @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
        返回列表
      </el-button>
      <el-button
        v-if="detail"
        :type="favorite ? 'warning' : 'default'"
        plain
        @click="handleToggleFavorite"
      >
        <el-icon>
          <StarFilled v-if="favorite" />
          <Star v-else />
        </el-icon>
        {{ favorite ? '已收藏' : '收藏' }}
      </el-button>
    </template>

    <!-- 加载中：骨架屏 -->
    <el-skeleton v-if="loading" animated :rows="8" />

    <!-- 加载失败：空态 + 重试 -->
    <EmptyState
      v-else-if="loadFailed"
      description="菜谱详情加载失败，请稍后重试"
      action-text="重新加载"
      @action="fetchDetail(route.params.id)"
    />

    <!-- 详情内容 -->
    <article v-else-if="detail" class="detail">
      <!-- 顶部封面 + 基本信息 -->
      <section class="detail__hero">
        <div class="detail__cover">
          <img
            v-if="detail.cover"
            class="detail__cover-img"
            :src="detail.cover"
            :alt="detail.title"
          />
          <span v-else class="detail__cover-placeholder">{{ coverText }}</span>
        </div>
        <div class="detail__cover-info">
          <h2 class="detail__title">{{ detail.title }}</h2>
          <p class="detail__desc">{{ detail.description }}</p>
          <div class="detail__tags">
            <el-tag type="info" effect="plain">{{ detail.categoryName }}</el-tag>
            <!-- 烹饪方式与品类同名时（如「主食」类的主食菜）只显示一次，避免重复标签 -->
            <el-tag v-if="detail.method !== detail.categoryName" type="success" effect="plain">
              {{ detail.method }}
            </el-tag>
            <el-tag :type="difficultyType" effect="plain">{{ difficultyText }}</el-tag>
          </div>
        </div>
      </section>

      <!-- 信息条：热量 / 耗时 / 份数 / 三大营养素 -->
      <section class="detail__stats">
        <div class="detail__stat">
          <span class="detail__stat-value">{{ detail.calories }}</span>
          <span class="detail__stat-label">kcal / 份</span>
        </div>
        <div class="detail__stat">
          <el-icon><Timer /></el-icon>
          <span class="detail__stat-value">{{ detail.timeMin }}</span>
          <span class="detail__stat-label">分钟</span>
        </div>
        <div class="detail__stat">
          <span class="detail__stat-value">{{ detail.baseServings }}</span>
          <span class="detail__stat-label">份</span>
        </div>
        <div class="detail__stat detail__stat--nutrition">
          蛋白质 {{ detail.protein }}g · 脂肪 {{ detail.fat }}g · 碳水 {{ detail.carb }}g · 膳食纤维
          {{ detail.fiber }}g
        </div>
      </section>

      <!-- 两列布局：左侧食材清单，右侧步骤时间线 -->
      <div class="detail__columns">
        <!-- 食材清单：可勾选核对，可选食材有标记 -->
        <section class="detail__section">
          <h3 class="detail__section-title">
            食材清单
            <span class="detail__section-hint"
              >（{{ detail.ingredients.length }} 项，可勾选核对）</span
            >
          </h3>
          <ul class="detail__ingredients">
            <li v-for="row in detail.ingredients" :key="row.id" class="detail__ingredient">
              <el-checkbox
                :model-value="checkedIngredientIds.has(row.id)"
                @change="toggleIngredient(row.id)"
              >
                <span class="detail__ingredient-name">{{ row.name }}</span>
                <span class="detail__ingredient-amount">{{ row.amount }} {{ row.unit }}</span>
                <el-tag v-if="row.optional" size="small" type="info" effect="plain">可选</el-tag>
              </el-checkbox>
            </li>
          </ul>
        </section>

        <!-- 步骤时间线 -->
        <section class="detail__section">
          <h3 class="detail__section-title">烹饪步骤</h3>
          <el-timeline>
            <el-timeline-item
              v-for="step in detail.steps"
              :key="step.id"
              :timestamp="`第 ${step.order} 步 · 约 ${step.durationMin} 分钟`"
              placement="top"
              type="primary"
            >
              {{ step.content }}
            </el-timeline-item>
          </el-timeline>
        </section>
      </div>
    </article>
  </PageContainer>
</template>

<style scoped lang="scss">
// 详情整体：纵向排列
.detail {
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
}

// 顶部：封面 + 基础信息横向排列
.detail__hero {
  display: flex;
  gap: $spacing-lg;
}

// 封面：固定宽度，4:3
.detail__cover {
  flex-shrink: 0;
  width: 280px;
  height: 200px;
  overflow: hidden;
  border-radius: $radius-md;
}

// 真实封面图
.detail__cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

// 封面占位：主色渐变 + 菜名首字
.detail__cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 72px;
  font-weight: 700;
  color: $bg-white;
  background: linear-gradient(
    135deg,
    $color-primary-dark 0%,
    $color-primary 60%,
    $color-primary-light 100%
  );
}

// 封面右侧信息
.detail__cover-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: $spacing-sm;
  justify-content: center;
}

// 菜名
.detail__title {
  font-size: $font-size-xl;
  color: $text-primary;
}

// 简介
.detail__desc {
  font-size: $font-size-base;
  color: $text-regular;
}

// 标签行
.detail__tags {
  display: flex;
  gap: $spacing-sm;
}

// 信息条：浅灰底 + 圆角，横排展示关键数据
.detail__stats {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-lg;
  align-items: center;
  padding: $spacing-md $spacing-lg;
  background-color: $bg-page;
  border-radius: $radius-md;
}

// 单个统计项：数字 + 单位
.detail__stat {
  display: flex;
  align-items: baseline;
  gap: $spacing-xs;
  color: $text-regular;
}

// 统计数字：主色加粗
.detail__stat-value {
  font-size: $font-size-lg;
  font-weight: 600;
  color: $color-primary;
}

// 统计单位
.detail__stat-label {
  font-size: $font-size-sm;
  color: $text-secondary;
}

// 营养素一行：跟随信息条右侧
.detail__stat--nutrition {
  margin-left: auto;
  font-size: $font-size-sm;
  color: $text-secondary;
}

// 两列内容区：食材 1fr + 步骤 1.4fr
.detail__columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
  gap: $spacing-xl;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
}

// 单个区块
.detail__section {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

// 区块标题
.detail__section-title {
  font-size: $font-size-md;
  color: $text-primary;
}

// 标题旁的提示文字
.detail__section-hint {
  font-size: $font-size-xs;
  font-weight: 400;
  color: $text-secondary;
}

// 食材列表：去掉默认列表样式
.detail__ingredients {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}

// 单个食材行
.detail__ingredient {
  padding: $spacing-sm $spacing-md;
  background-color: $bg-page;
  border-radius: $radius-sm;
}

// 食材名：主文字色
.detail__ingredient-name {
  margin-right: $spacing-sm;
  color: $text-primary;
}

// 食材用量：辅助色
.detail__ingredient-amount {
  margin-right: $spacing-sm;
  color: $text-secondary;
}
</style>
