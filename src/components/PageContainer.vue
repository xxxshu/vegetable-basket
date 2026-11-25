<!--
  页面容器：统一「页面标题 + 右侧操作区 + 内容」的排版。
  用法：<PageContainer title="菜谱库"><template #extra><el-button>新增</el-button></template>页面内容</PageContainer>
-->
<script setup>
defineProps({
  // 页面标题：每个页面必传，保持各页视觉一致
  title: { type: String, required: true },
})
</script>

<template>
  <!-- 页面容器：标题行 + 白色卡片内容区 -->
  <section class="page-container">
    <!-- 标题行：左侧标题，右侧操作区（extra 插槽没传时不占位） -->
    <header class="page-container__header">
      <h2 class="page-container__title">{{ title }}</h2>
      <div class="page-container__extra">
        <slot name="extra" />
      </div>
    </header>

    <!-- 内容区：页面主体内容都放在这里 -->
    <div class="page-container__body">
      <slot />
    </div>
  </section>
</template>

<style scoped lang="scss">
// 容器：标题与内容上下排列
.page-container {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

// 标题行：左右两端对齐
.page-container__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-md;
}

// 页面标题
.page-container__title {
  font-size: $font-size-lg;
  color: $text-primary;
}

// 右侧操作区：多个按钮横向排列
.page-container__extra {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-sm;
}

// 内容卡片：白底 + 圆角 + 阴影，和全局视觉语言一致
.page-container__body {
  padding: $spacing-lg;
  background-color: $bg-white;
  border-radius: $radius-md;
  box-shadow: $shadow-card;
}
</style>
