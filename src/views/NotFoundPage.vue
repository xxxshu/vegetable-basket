<!--
  404 页面：动态路由注册完成后，由守卫追加的兜底路由渲染。
  只有未命中任何业务路由时才会走到这里（未登录时已被守卫拦到登录页）。
-->
<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

/**
 * 返回登录后的首页（'/' 会按角色重定向到工作台或管理端）。
 */
function goHome() {
  router.replace('/')
}
</script>

<template>
  <!-- 整页居中容器 -->
  <main class="not-found">
    <!-- 404 卡片：大号 404 + 说明 + 返回按钮 -->
    <section class="not-found__card">
      <p class="not-found__code">404</p>
      <h1 class="not-found__title">页面不存在</h1>
      <p class="not-found__desc">地址可能输错了，或者该页面已经下线。</p>
      <el-button type="primary" @click="goHome">返回首页</el-button>
    </section>
  </main>
</template>

<style scoped lang="scss">
// 整页容器：占满视口并居中卡片
.not-found {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: $spacing-lg;
  background-color: $bg-page;
}

// 404 卡片：白底圆角卡片，内容垂直排列
.not-found__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $spacing-md;
  width: 520px;
  max-width: 100%;
  padding: $spacing-xxl $spacing-xl;
  text-align: center;
  background-color: $bg-white;
  border-radius: $radius-lg;
  box-shadow: $shadow-card;
}

// 404 数字：主色大字号，作为视觉主体
.not-found__code {
  font-size: 72px;
  font-weight: 700;
  line-height: 1;
  color: $color-primary;
}

// 标题
.not-found__title {
  font-size: $font-size-lg;
  color: $text-primary;
}

// 说明文字
.not-found__desc {
  font-size: $font-size-base;
  color: $text-regular;
}
</style>
