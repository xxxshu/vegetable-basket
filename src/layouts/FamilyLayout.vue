<!--
  家庭端布局（S3）：顶部导航 + 内容区。
  - 顶部：logo（回首页）+ 由路由表生成的菜单 + 用户下拉（退出登录）
  - 内容：<router-view /> 渲染当前页面
-->
<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowDown, Food, SwitchButton } from '@element-plus/icons-vue'

import AppMenu from '@/components/AppMenu.vue'
import { resetDynamicRoutes } from '@/router/guard'
import { useUserStore } from '@/stores'

const router = useRouter()
const userStore = useUserStore()

// 昵称：优先昵称，兜底用户名
const nickname = computed(
  () => userStore.userInfo?.nickname || userStore.userInfo?.username || '未登录',
)
// 文字头像：取昵称第一个字（本阶段还没有真实头像）
const avatarText = computed(() => nickname.value.slice(0, 1))
// 当前角色文案：展示在用户下拉里
const roleText = computed(() => (userStore.role === 'admin' ? '管理员' : '家庭用户'))

/**
 * 点击 logo 回到角色首页：'/' 会按角色重定向（家庭 → 工作台，管理 → 管理端）
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
 * 副作用：本地持久化的登录态被清空、路由表恢复初始状态
 */
async function handleLogout() {
  const confirmed = await ElMessageBox.confirm('确定要退出登录吗？', '温馨提示', {
    type: 'warning',
    confirmButtonText: '退出',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  // 用户点了取消：什么都不做
  if (!confirmed) return

  // 1. 清空 token / userInfo（持久化数据同步清空）
  userStore.logout()
  // 2. 清掉按角色注册的动态路由，避免换角色登录后还能进入旧角色页面
  resetDynamicRoutes(router)
  // 3. 提示并回到登录页
  ElMessage.success('已退出登录')
  router.replace('/login')
}
</script>

<template>
  <!-- 家庭端整体容器：顶部导航 + 内容区 -->
  <el-container class="family-layout">
    <!-- 顶部导航栏 -->
    <el-header class="family-layout__header" height="64px">
      <!-- 品牌区：点击回首页 -->
      <div class="family-layout__brand" @click="goHome">
        <el-icon class="family-layout__logo"><Food /></el-icon>
        <span class="family-layout__brand-text">家庭菜篮子</span>
      </div>

      <!-- 顶部菜单：由路由表生成，当前地址自动高亮（只看家庭端路由子树） -->
      <AppMenu class="family-layout__menu" mode="horizontal" root-name="FamilyRoot" />

      <!-- 用户下拉：显示昵称与角色，可退出登录 -->
      <el-dropdown class="family-layout__user" trigger="click" @command="handleCommand">
        <span class="family-layout__user-trigger">
          <el-avatar :size="28" class="family-layout__avatar">{{ avatarText }}</el-avatar>
          <span class="family-layout__nickname">{{ nickname }}</span>
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
    <el-main class="family-layout__main">
      <router-view />
    </el-main>
  </el-container>
</template>

<style scoped lang="scss">
// 整体布局：纵向排布，撑满视口
.family-layout {
  min-height: 100vh;
}

// 顶部导航：白底 + 底边线，吸顶滚动时不遮挡内容
.family-layout__header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: $spacing-lg;
  padding: 0 $spacing-lg;
  background-color: $bg-white;
  border-bottom: 1px solid $border-color-light;
}

// 品牌区：图标 + 名称，可点击回首页
.family-layout__brand {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  cursor: pointer;
  user-select: none;
}

// 品牌图标：主色
.family-layout__logo {
  font-size: 22px;
  color: $color-primary;
}

// 品牌名称：加粗，作为页面左上角标识
.family-layout__brand-text {
  font-size: $font-size-md;
  font-weight: 600;
  color: $text-primary;
  white-space: nowrap;
}

// 菜单：占据剩余空间
.family-layout__menu {
  flex: 1;
  min-width: 0;
}

// 用户下拉触发器：头像 + 昵称 + 箭头
.family-layout__user-trigger {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  cursor: pointer;
  outline: none;
}

// 文字头像：主色浅底 + 主色文字
.family-layout__avatar {
  color: $color-primary-dark;
  background-color: rgba($color-primary, 0.15);
}

// 昵称：限制宽度避免把菜单挤走
.family-layout__nickname {
  max-width: 120px;
  overflow: hidden;
  font-size: $font-size-base;
  color: $text-regular;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// 内容区：浅灰底 + 统一内边距
.family-layout__main {
  padding: $spacing-lg;
  background-color: $bg-page;
}

// 顶部菜单样式微调：去掉默认底边线，选中项用主色下划线
:deep(.el-menu--horizontal) {
  border-bottom: none;
  background-color: transparent;
}

// 选中菜单项：主色文字 + 主色下划线
:deep(.el-menu--horizontal .el-menu-item.is-active) {
  color: $color-primary;
  border-bottom: 2px solid $color-primary;
}
</style>
