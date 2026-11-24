<!--
  S0 占位页，作用有三个：
  1. 证明工程骨架（Vue 3 + Vue Router + Pinia + Element Plus + Sass）已经跑通；
  2. 提供"测试 Element Plus"按钮，验证组件与函数式 API 的自动导入是否生效；
  3. S1/S2 引入真实页面后，本文件删除。
-->
<script setup>
// 技术栈清单：只用于展示，不参与响应式更新，所以用普通 const 而不是 ref
const techList = ['Vue 3', 'Vite 8', 'Vue Router', 'Pinia', 'Element Plus', 'Sass']

/**
 * 点击"测试 Element Plus"按钮时触发。
 * 用途：验证 ElMessage 的自动导入（本文件源码里没有 import { ElMessage }）
 * 参数：无
 * 返回值：无
 * 副作用：在页面顶部弹出一条成功提示，约 3 秒后自动消失
 */
function handleTestMessage() {
  // 成功提示：文字带 ✅，验收时一眼确认"函数式 API 已加载、样式也生效"
  ElMessage.success('Element Plus 自动导入已生效 ✅')
}
</script>

<template>
  <!-- 整页居中容器：S2 起会换成 FamilyLayout / AdminLayout，这里只是 S0 的临时外壳 -->
  <main class="placeholder">
    <!-- 品牌卡片：项目名 + 一句话定位 + 技术栈 + 验收入口 -->
    <section class="placeholder__card">
      <!-- 阶段徽标：标明当前处于阶段 0，避免和后续真实页面混淆 -->
      <p class="placeholder__badge">S0 · 工程骨架</p>

      <!-- 项目名与定位：取自 AGENTS.md 第 0 节的"一句话"定位 -->
      <h1 class="placeholder__title">家庭菜篮子计划系统</h1>
      <p class="placeholder__desc">把"这周吃什么"变成"要买什么、花多少钱"</p>

      <!-- 技术栈标签：模板里没有 import 任何组件，el-tag 由 unplugin-vue-components 自动注册 -->
      <div class="placeholder__tags">
        <!-- 逐个渲染技术栈：key 用技术名即可，列表内容固定且不会重复 -->
        <el-tag v-for="tech in techList" :key="tech" effect="plain" round>{{ tech }}</el-tag>
      </div>

      <!-- 验收按钮：点击后调用 ElMessage，验证函数式 API 的自动导入与样式注入 -->
      <el-button type="primary" size="large" @click="handleTestMessage">
        测试 Element Plus
      </el-button>

      <!-- 下一步提示：告诉验收者 S0 之后还要做什么，避免"页面空了以为没做完" -->
      <p class="placeholder__hint">项目骨架已就绪 —— 下一阶段：请求层 + Mock + 环境变量（S1）</p>
    </section>
  </main>
</template>

<style scoped lang="scss">
// 整页容器：占满视口并让卡片居中；padding 用全局 Sass 变量，验证变量注入是否生效
.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: $spacing-lg;
}

// 品牌卡片：白底 + 大圆角 + 阴影，S3 的 PageContainer 会沿用这套视觉语言
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

// 阶段徽标：主色文字 + 主色浅底，用胶囊形状和正文拉开层级
.placeholder__badge {
  padding: $spacing-xs $spacing-md;
  font-size: $font-size-sm;
  color: $color-primary-dark;
  background-color: rgba($color-primary, 0.12);
  border-radius: 999px;
}

// 项目标题：整页最大的视觉焦点
.placeholder__title {
  font-size: $font-size-xl;
  color: $text-primary;
}

// 一句话定位：辅助说明项目解决什么问题
.placeholder__desc {
  font-size: $font-size-md;
  color: $text-regular;
}

// 技术栈标签容器：允许换行，窄屏也能完整展示
.placeholder__tags {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-sm;
  justify-content: center;
}

// 下一步提示：弱化处理，避免抢主按钮的注意力
.placeholder__hint {
  margin-top: $spacing-sm;
  font-size: $font-size-sm;
  color: $text-secondary;
}
</style>
