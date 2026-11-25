<!--
  菜谱卡片（S4）：列表页与后续 S6 选菜抽屉复用。
  - 封面：mock 阶段 cover 为空，用「菜名首字 + 主色渐变」占位；有图时显示图片
  - 信息：菜名 / 简介 / 难度 / 热量 / 耗时 / 品类 + 烹饪方式标签
  - 收藏：点击按钮切换收藏（阻止冒泡，避免触发卡片跳详情）
-->
<script setup>
import { computed } from 'vue'
import { Star, StarFilled, Timer } from '@element-plus/icons-vue'

const props = defineProps({
  // 列表接口返回的菜谱摘要
  recipe: { type: Object, required: true },
  // 当前是否已收藏（由父组件从 recipe store 传入）
  favorite: { type: Boolean, default: false },
})

const emit = defineEmits(['click', 'toggle-favorite'])

// 封面占位文字：取菜名第一个字（无封面图时展示）
const coverText = computed(() => props.recipe.title?.slice(0, 1) || '菜')
// 难度文案：接口 difficulty 1/2/3 对应 简单/普通/困难
const difficultyText = computed(
  () => ['简单', '普通', '困难'][props.recipe.difficulty - 1] || '未知',
)
// 难度标签颜色：简单绿 / 普通橙 / 困难红
const difficultyType = computed(
  () => ['success', 'warning', 'danger'][props.recipe.difficulty - 1] || 'info',
)

/**
 * 点击收藏按钮：把菜谱交给父组件处理（父组件负责调接口 + 更新 store）
 */
function handleToggleFavorite() {
  emit('toggle-favorite', props.recipe)
}
</script>

<template>
  <!-- 整张卡片可点击：进入菜谱详情 -->
  <article class="recipe-card" @click="emit('click', recipe)">
    <!-- 封面区：有图显示图片，无图用渐变占位 + 菜名首字 -->
    <div class="recipe-card__cover">
      <img v-if="recipe.cover" class="recipe-card__img" :src="recipe.cover" :alt="recipe.title" />
      <span v-else class="recipe-card__cover-placeholder">{{ coverText }}</span>

      <!-- 收藏按钮：绝对定位在封面右上角，点击时阻止冒泡 -->
      <button
        class="recipe-card__favorite"
        :class="{ 'is-active': favorite }"
        type="button"
        :title="favorite ? '取消收藏' : '收藏'"
        @click.stop="handleToggleFavorite"
      >
        <el-icon>
          <StarFilled v-if="favorite" />
          <Star v-else />
        </el-icon>
      </button>
    </div>

    <!-- 信息区：菜名 / 简介 / 元信息 / 标签 -->
    <div class="recipe-card__body">
      <h3 class="recipe-card__title">{{ recipe.title }}</h3>
      <p class="recipe-card__desc">{{ recipe.description }}</p>

      <!-- 难度 + 热量 + 耗时 -->
      <div class="recipe-card__meta">
        <el-tag :type="difficultyType" size="small" effect="plain">{{ difficultyText }}</el-tag>
        <span class="recipe-card__meta-item">{{ recipe.calories }} kcal/份</span>
        <span class="recipe-card__meta-item">
          <el-icon><Timer /></el-icon>
          {{ recipe.timeMin }} 分钟
        </span>
      </div>

      <!-- 标签：品类 + 烹饪方式 -->
      <div class="recipe-card__tags">
        <el-tag size="small" type="info" effect="plain">{{ recipe.categoryName }}</el-tag>
        <el-tag size="small" type="success" effect="plain">{{ recipe.method }}</el-tag>
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
// 卡片：白底 + 圆角 + 阴影，悬停微微上浮提示可点击
.recipe-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  cursor: pointer;
  background-color: $bg-white;
  border: 1px solid $border-color-light;
  border-radius: $radius-md;
  box-shadow: $shadow-card;
  transition:
    transform 0.2s,
    box-shadow 0.2s;

  &:hover {
    transform: translateY(-3px);
    box-shadow: $shadow-hover;
  }
}

// 封面区：固定 4:3 比例
.recipe-card__cover {
  position: relative;
  height: 150px;
  overflow: hidden;
}

// 真实封面图：铺满不变形
.recipe-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

// 封面占位：主色渐变 + 菜名首字（mock 阶段还没有真实图片）
.recipe-card__cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 44px;
  font-weight: 700;
  color: $bg-white;
  background: linear-gradient(
    135deg,
    $color-primary-dark 0%,
    $color-primary 60%,
    $color-primary-light 100%
  );
}

// 收藏按钮：圆形半透明底，收藏后变金色
.recipe-card__favorite {
  position: absolute;
  top: $spacing-sm;
  right: $spacing-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  font-size: 16px;
  color: $bg-white;
  cursor: pointer;
  background-color: rgba(0, 0, 0, 0.28);
  border: none;
  border-radius: 50%;

  &.is-active {
    color: #f7ba2a;
  }
}

// 信息区：内容纵向排列
.recipe-card__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: $spacing-xs;
  padding: $spacing-md;
}

// 菜名：单行省略
.recipe-card__title {
  overflow: hidden;
  font-size: $font-size-md;
  color: $text-primary;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// 简介：最多两行，超出省略
.recipe-card__desc {
  display: -webkit-box;
  overflow: hidden;
  font-size: $font-size-sm;
  color: $text-secondary;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

// 元信息行：难度标签 + 热量 + 耗时
.recipe-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: $spacing-sm;
  margin-top: $spacing-xs;
}

// 元信息文字：小号辅助色
.recipe-card__meta-item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: $font-size-xs;
  color: $text-secondary;
}

// 标签行：品类 + 烹饪方式
.recipe-card__tags {
  display: flex;
  gap: $spacing-xs;
  margin-top: $spacing-xs;
}
</style>
