<!--
  通用占位页：S2 用它验证「路由 + 登录 + 角色隔离」链路。
  S3–S10 会按阶段把路由表里的 component 换成真实页面，届时本文件可删除。
-->
<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

// 页面标题统一取自路由 meta.title：换页面不用改占位页代码
const pageTitle = computed(() => route.meta?.title || '页面')
// 当前完整地址：验收时一眼确认守卫/跳转是否落在预期路由上
const currentPath = computed(() => route.fullPath)
</script>

<template>
  <!-- 整页居中容器：S3 换成真实布局后，这里会变成布局内的页面内容区 -->
  <main class="placeholder">
    <!-- 占位卡片：路由地址 + 页面标题 + 阶段说明 -->
    <section class="placeholder__card">
      <!-- 当前路由徽标：直接显示地址，方便核对跳转结果 -->
      <p class="placeholder__badge">{{ currentPath }}</p>

      <!-- 页面标题：来自路由 meta.title，证明动态注册的路由已生效 -->
      <h1 class="placeholder__title">{{ pageTitle }} · 建设中</h1>

      <!-- 说明文字：告诉验收者本阶段做了什么 -->
      <p class="placeholder__desc">路由、登录与权限已打通，页面内容将在后续阶段实现。</p>

      <!-- 阶段提示：标明当前进度 -->
      <p class="placeholder__hint">页面建设中，后续阶段将逐步实现真实内容</p>
    </section>
  </main>
</template>

<style scoped lang="scss">
// 整页容器：在布局内容区里占位，不再撑满整个视口
.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: $spacing-lg;
}

// 占位卡片：白底 + 大圆角 + 阴影，与登录卡保持同一套视觉语言
.placeholder__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $spacing-md;
  width: 640px;
  max-width: 100%;
  padding: $spacing-xxl $spacing-xl;
  text-align: center;
  background-color: $bg-white;
  border-radius: $radius-lg;
  box-shadow: $shadow-card;
}

// 路由地址徽标：等宽字体显示当前地址，便于核对
.placeholder__badge {
  padding: $spacing-xs $spacing-md;
  font-family: Consolas, Monaco, monospace;
  font-size: $font-size-sm;
  color: $color-primary-dark;
  background-color: rgba($color-primary, 0.12);
  border-radius: 999px;
}

// 页面标题
.placeholder__title {
  font-size: $font-size-xl;
  color: $text-primary;
}

// 说明文字
.placeholder__desc {
  font-size: $font-size-md;
  color: $text-regular;
}

// 阶段提示：弱化处理，不抢标题注意力
.placeholder__hint {
  font-size: $font-size-sm;
  color: $text-secondary;
}
</style>
