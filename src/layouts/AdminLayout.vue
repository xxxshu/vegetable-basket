<!--
  管理端布局（S3）：左侧菜单栏 + 顶部面包屑/用户下拉 + 内容区。
  - 侧栏：logo + 由路由表生成的菜单，可折叠（折叠后只显示图标）
  - 顶部：折叠按钮 + 面包屑 + 用户下拉（退出登录）
  - 内容：<router-view /> 渲染当前页面
-->
<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, Expand, Fold, Food, SwitchButton } from '@element-plus/icons-vue'

import AppMenu from '@/components/AppMenu.vue'
import { resetDynamicRoutes } from '@/router/guard'
import { useUserStore } from '@/stores'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

// 侧栏折叠状态：true 时只显示图标（常见后台交互）
const isCollapse = ref(false)

// 昵称：优先昵称，兜底用户名
const nickname = computed(
  () => userStore.userInfo?.nickname || userStore.userInfo?.username || '未登录',
)
// 文字头像：取昵称第一个字
const avatarText = computed(() => nickname.value.slice(0, 1))
// 当前角色文案
const roleText = computed(() => (userStore.role === 'admin' ? '管理员' : '家庭用户'))

// 面包屑：取当前路由匹配链上所有带 meta.title 的记录（布局路由本身没有 title，自动跳过）
const breadcrumbs = computed(() =>
  route.matched.filter((item) => item.meta?.title).map((item) => item.meta.title),
)

/**
 * 点击 logo 回到角色首页（'/' 会按角色重定向到管理端首页）
 */
function goHome() {
  router.replace('/')
}

/**
 * 下拉菜单命令分发：目前只有退出登录
 * @param {string} command el-dropdown-item 的 command 值
 */
function handleCommand(command) {
  if (command === 'logout') handleLogout()
}

/**
 * 退出登录：二次确认 → 清空登录态 → 清理动态路由 → 回登录页
 * 副作用：本地持久化登录态被清空、路由表恢复初始状态
 */
async function handleLogout() {
  const confirmed = await ElMessageBox.confirm('确定要退出登录吗？', '温馨提示', {
    type: 'warning',
    confirmButtonText: '退出',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  // 1. 清空 token / userInfo
  userStore.logout()
  // 2. 清掉按角色注册的动态路由
  resetDynamicRoutes(router)
  // 3. 提示并回登录页
  ElMessage.success('已退出登录')
  router.replace('/login')
}
</script>

<template>
  <!-- 管理端整体容器：左侧菜单 + 右侧内容 -->
  <el-container class="admin-layout">
    <!-- 左侧菜单栏：折叠宽度 64px，展开 220px -->
    <el-aside class="admin-layout__aside" :width="isCollapse ? '64px' : '220px'">
      <!-- 品牌区：图标 + 名称（折叠时只留图标） -->
      <div class="admin-layout__brand" @click="goHome">
        <el-icon class="admin-layout__logo"><Food /></el-icon>
        <span v-show="!isCollapse" class="admin-layout__brand-text">菜篮子 · 管理端</span>
      </div>

      <!-- 侧边菜单：由路由表生成，折叠时只显示图标（只看管理端路由子树） -->
      <AppMenu mode="vertical" :collapse="isCollapse" root-name="AdminRoot" />
    </el-aside>

    <!-- 右侧主体：顶部栏 + 内容区 -->
    <el-container class="admin-layout__body">
      <!-- 顶部栏：折叠按钮 + 面包屑 + 用户下拉 -->
      <el-header class="admin-layout__header" height="64px">
        <div class="admin-layout__header-left">
          <!-- 折叠按钮：图标随状态切换 -->
          <el-button text class="admin-layout__collapse" @click="isCollapse = !isCollapse">
            <el-icon>
              <Fold v-if="!isCollapse" />
              <Expand v-else />
            </el-icon>
          </el-button>

          <!-- 面包屑：首页 + 当前路由匹配链标题 -->
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-for="title in breadcrumbs" :key="title">
              {{ title }}
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <!-- 用户下拉：显示昵称与角色，可退出登录 -->
        <el-dropdown trigger="click" @command="handleCommand">
          <span class="admin-layout__user-trigger">
            <el-avatar :size="28" class="admin-layout__avatar">{{ avatarText }}</el-avatar>
            <span class="admin-layout__nickname">{{ nickname }}</span>
            <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled>{{ roleText }}</el-dropdown-item>
              <el-dropdown-item command="logout" divided>
                <el-icon><SwitchButton /></el-icon>
                退出登录
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>

      <!-- 内容区：路由页面渲染在这里 -->
      <el-main class="admin-layout__main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped lang="scss">
// 整体布局：横向排布，撑满视口
.admin-layout {
  min-height: 100vh;
}

// 左侧栏：白底 + 右侧分割线，宽度变化有过渡动画
.admin-layout__aside {
  overflow: hidden;
  background-color: $bg-white;
  border-right: 1px solid $border-color-light;
  transition: width 0.2s;
}

// 品牌区：高度与顶部栏一致，水平居中
.admin-layout__brand {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  height: 64px;
  padding: 0 $spacing-md;
  overflow: hidden;
  cursor: pointer;
  user-select: none;
}

// 品牌图标：主色
.admin-layout__logo {
  flex-shrink: 0;
  font-size: 22px;
  color: $color-primary;
}

// 品牌名称：不换行，折叠时由 v-show 隐藏
.admin-layout__brand-text {
  font-size: $font-size-md;
  font-weight: 600;
  color: $text-primary;
  white-space: nowrap;
}

// 右侧主体：纵向排布
.admin-layout__body {
  min-width: 0;
}

// 顶部栏：白底 + 底边线，左右两端对齐
.admin-layout__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 $spacing-lg;
  background-color: $bg-white;
  border-bottom: 1px solid $border-color-light;
}

// 顶部栏左侧：折叠按钮 + 面包屑
.admin-layout__header-left {
  display: flex;
  align-items: center;
  gap: $spacing-md;
}

// 折叠按钮：去掉默认内边距，图标更紧凑
.admin-layout__collapse {
  padding: 0 $spacing-xs;
  font-size: 18px;
}

// 用户下拉触发器：头像 + 昵称 + 箭头
.admin-layout__user-trigger {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  cursor: pointer;
  outline: none;
}

// 文字头像：主色浅底 + 主色文字
.admin-layout__avatar {
  color: $color-primary-dark;
  background-color: rgba($color-primary, 0.15);
}

// 昵称
.admin-layout__nickname {
  font-size: $font-size-base;
  color: $text-regular;
}

// 内容区：浅灰底 + 统一内边距
.admin-layout__main {
  padding: $spacing-lg;
  background-color: $bg-page;
}

// 侧边菜单：去掉 el-menu 默认右边框
:deep(.el-menu) {
  border-right: none;
}

// 选中菜单项：主色文字 + 主色浅底
:deep(.el-menu-item.is-active) {
  color: $color-primary;
  background-color: rgba($color-primary, 0.08);
}
</style>
