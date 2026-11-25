<!--
  餐次格子（S6）：一周计划里「某天 × 某一餐」的格子内容。
  - 显示该格子里的菜名与份数，提供「改份数」「删」操作
  - 空格子显示「未安排」+「+ 添加」入口
  - 只负责展示与抛事件，数据/接口由计划页处理
-->
<script setup>
defineProps({
  // 日期 YYYY-MM-DD
  date: { type: String, required: true },
  // 餐次 breakfast / lunch / dinner（事件里带回给父组件）
  mealType: { type: String, required: true },
  // 该格子里的计划项（已 join 菜谱信息）
  items: { type: Array, default: () => [] },
})

const emit = defineEmits(['add', 'edit', 'remove'])
</script>

<template>
  <!-- 格子容器：虚线边框区分每一餐 -->
  <div class="meal-cell">
    <!-- 已排的菜：菜名 + 份数 + 操作 -->
    <template v-if="items.length > 0">
      <div v-for="item in items" :key="item.id" class="meal-cell__item">
        <span class="meal-cell__title">{{ item.recipe.title }}</span>
        <span class="meal-cell__servings">×{{ item.servings }}</span>
        <span class="meal-cell__actions">
          <el-button link type="primary" size="small" @click="emit('edit', item)">改</el-button>
          <el-button link type="danger" size="small" @click="emit('remove', item)">删</el-button>
        </span>
      </div>
    </template>

    <!-- 空格子提示 -->
    <p v-else class="meal-cell__empty">未安排</p>

    <!-- 添加入口：把当前日期/餐次抛给父组件，父组件打开选菜抽屉 -->
    <el-button link class="meal-cell__add" @click="emit('add', { date, mealType })">
      + 添加
    </el-button>
  </div>
</template>

<style scoped lang="scss">
// 格子：白底 + 虚线边框，最小高度保证网格整齐
.meal-cell {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
  min-height: 92px;
  padding: $spacing-sm $spacing-md;
  background-color: $bg-white;
  border: 1px dashed $border-color;
  border-radius: $radius-sm;
  transition: border-color 0.2s;

  &:hover {
    border-color: $color-primary-light;
  }
}

// 一条已排的菜：菜名 + 份数 + 操作横排
.meal-cell__item {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
  font-size: $font-size-sm;
}

// 菜名：超出省略
.meal-cell__title {
  flex: 1;
  overflow: hidden;
  color: $text-primary;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// 份数：主色强调
.meal-cell__servings {
  color: $color-primary-dark;
}

// 操作按钮：靠右
.meal-cell__actions {
  flex-shrink: 0;
}

// 空格子提示
.meal-cell__empty {
  font-size: $font-size-sm;
  color: $text-placeholder;
}

// 添加入口：小号链接按钮
.meal-cell__add {
  align-self: flex-start;
  padding: 0;
  font-size: $font-size-xs;
}
</style>
