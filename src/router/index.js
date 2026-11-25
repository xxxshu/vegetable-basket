// 路由实例：初始路由表为空，登录页等常量路由由守卫初始化时注册，业务路由登录后按角色动态 addRoute
import { createRouter, createWebHistory } from 'vue-router'

import { setupRouterGuard } from './guard'

const router = createRouter({
  // history 模式：地址栏是真实路径（不带 #），部署时服务器需回退到 index.html
  history: createWebHistory(import.meta.env.BASE_URL),
  // 初始空表：未登录时只有守卫注册的 /login 可访问，访问其它地址会被拦截
  routes: [],
})

// 安装全局守卫（登录校验 + 动态路由注册 + 404 兜底 + 无权限提示）
setupRouterGuard(router)

export default router
