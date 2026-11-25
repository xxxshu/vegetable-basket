<!--
  通用菜单组件：由路由表自动生成，不写死任何菜单项。
  - 数据流：完整路由表 → filterRoutesByRole 按角色过滤 → toMenuTree 转菜单树
  - 被 FamilyLayout（horizontal 顶部菜单）与 AdminLayout（vertical 侧边栏，可折叠）复用
-->
<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  Box,
  Calendar,
  Dish,
  Grid,
  Odometer,
  Setting,
  ShoppingCart,
  TrendCharts,
} from '@element-plus/icons-vue'

import { asyncRoutes } from '@/router/routes'
import { useUserStore } from '@/stores'
import { filterRoutesByRole, toMenuTree } from '@/utils/permission'

const props = defineProps({
  // horizontal = 顶部导航菜单；vertical = 侧边栏菜单
  mode: { type: String, default: 'horizontal' },
  // 仅 vertical 生效：折叠后只显示图标（el-menu 自带 tooltip 显示标题）
  collapse: { type: Boolean, default: false },
  // 当前布局对应的路由根节点 name：家庭端只看 FamilyRoot 子树，管理端只看 AdminRoot 子树
  rootName: { type: String, required: true },
})

const route = useRoute()
const userStore = useUserStore()

// 图标名 → 组件 的映射：路由 meta.icon 里存的是字符串，渲染时再转成真实图标组件
const MENU_ICONS = { Box, Calendar, Dish, Grid, Odometer, Setting, ShoppingCart, TrendCharts }

// 菜单数据：完整路由表 → 按角色过滤 → 只取当前布局的子树 → 转菜单树（纯函数，不发请求）
const menus = computed(() => {
  const allowedRoutes = filterRoutesByRole(asyncRoutes, userStore.role)
  const rootRoute = allowedRoutes.find((item) => item.name === props.rootName)
  return rootRoute ? toMenuTree([rootRoute]) : []
})

// 当前高亮菜单：跟随地址栏变化（el-menu 的 :default-active 是响应式的）
const activePath = computed(() => route.path)

/**
 * 根据路由 meta.icon 取图标组件
 * @param {string} iconName 路由里配置的图标名
 * @returns {object|null} Element Plus 图标组件，没有配置时返回 null
 */
function getIcon(iconName) {
  return MENU_ICONS[iconName] || null
}
</script>

<template>
  <!-- 菜单容器：:router 开启后，点击菜单项的 index 即跳转对应路径 -->
  <el-menu
    class="app-menu"
    :mode="mode"
    :default-active="activePath"
    :collapse="mode === 'vertical' && collapse"
    :collapse-transition="false"
    :router="true"
    :ellipsis="mode === 'horizontal' ? false : true"
  >
    <!-- 遍历菜单树：有子菜单的分组用 el-sub-menu，普通菜单项用 el-menu-item -->
    <template v-for="item in menus" :key="item.path">
      <el-sub-menu v-if="item.children.length > 0" :index="item.path">
        <!-- 分组标题：图标 + 文案（折叠时文案进 tooltip） -->
        <template #title>
          <el-icon v-if="item.icon"><component :is="getIcon(item.icon)" /></el-icon>
          <span>{{ item.title }}</span>
        </template>
        <!-- 分组内的子菜单项 -->
        <el-menu-item v-for="child in item.children" :key="child.path" :index="child.path">
          <el-icon v-if="child.icon"><component :is="getIcon(child.icon)" /></el-icon>
          <template #title>{{ child.title }}</template>
        </el-menu-item>
      </el-sub-menu>

      <el-menu-item v-else :index="item.path">
        <!-- 图标放在默认插槽，标题放在 title 插槽：折叠时 el-menu 会自动处理标题显隐 -->
        <el-icon v-if="item.icon"><component :is="getIcon(item.icon)" /></el-icon>
        <template #title>{{ item.title }}</template>
      </el-menu-item>
    </template>
  </el-menu>
</template>

<style scoped lang="scss">
// 菜单基础样式：背景透明，由外层布局决定底色
.app-menu {
  background-color: transparent;
}
</style>
