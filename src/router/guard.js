// 全局路由守卫：登录拦截 + 按角色动态注册路由 + 404 兜底 + 无权限提示
// 执行顺序（每次导航）：白名单 → 是否登录 → 是否有用户信息 → 动态路由是否已注册 → 无权限检测
import { useUserStore } from '@/stores'
import { filterRoutesByRole, getHomePathByRole, isKnownRoutePath } from '@/utils/permission'

import { asyncRoutes, constantRoutes, notFoundRoute } from './routes'

// 白名单：不登录也能访问的地址
const WHITE_LIST = ['/login']

// 已动态注册的路由 name 列表：退出登录/切换角色时按 name 逐个 removeRoute
let registeredRouteNames = []
// 当前动态路由是按哪个角色注册的：角色变化时必须重新注册
let registeredRole = ''

/**
 * 注册常量路由（登录页）。只执行一次，放在守卫初始化时。
 * @param {object} router 路由实例
 */
function registerConstantRoutes(router) {
  constantRoutes.forEach((route) => {
    if (!router.hasRoute(route.name)) router.addRoute(route)
  })
}

/**
 * 清理已注册的动态路由。
 * 退出登录或切换角色时必须调用，否则上一个角色注册的页面还能被访问。
 * @param {object} router 路由实例
 */
export function resetDynamicRoutes(router) {
  registeredRouteNames.forEach((name) => {
    if (router.hasRoute(name)) router.removeRoute(name)
  })
  registeredRouteNames = []
  registeredRole = ''
}

/**
 * 按角色过滤并注册业务路由，最后补 404 兜底（兜底必须最后注册才能最后匹配）。
 * @param {object} router 路由实例
 * @param {string} role 当前角色
 */
function registerDynamicRoutes(router, role) {
  filterRoutesByRole(asyncRoutes, role).forEach((route) => {
    router.addRoute(route)
    registeredRouteNames.push(route.name)
  })
  router.addRoute(notFoundRoute)
  registeredRouteNames.push(notFoundRoute.name)
  registeredRole = role
}

/**
 * 当前导航是否命中了 404 兜底路由
 * @param {object} to 目标路由对象
 * @returns {boolean}
 */
function isNotFoundRoute(to) {
  return to.matched.length === 0 || to.matched[to.matched.length - 1].name === 'NotFound'
}

/**
 * 安装全局前置守卫。
 * @param {object} router 路由实例
 */
export function setupRouterGuard(router) {
  // 初始路由表是空的，先把登录页注册进去，否则 /login 本身也匹配不到
  registerConstantRoutes(router)

  router.beforeEach(async (to) => {
    const userStore = useUserStore()

    // 1. 白名单：未登录可访问；已登录访问 /login 直接按角色回首页
    if (WHITE_LIST.includes(to.path)) {
      if (userStore.token) return getHomePathByRole(userStore.role)
      return true
    }

    // 2. 没有 token：拦截到登录页，并把原地址放进 redirect，登录后可以回跳
    if (!userStore.token) {
      resetDynamicRoutes(router)
      return { path: '/login', query: { redirect: to.fullPath } }
    }

    // 3. 有 token 但没有用户信息（极端情况：本地只存了 token）：用 /auth/me 恢复
    if (!userStore.userInfo) {
      try {
        const userInfo = await userStore.fetchUserInfo()
        userStore.setUser(userInfo)
      } catch {
        // token 已失效：清空登录态，回登录页
        userStore.resetAuth()
        resetDynamicRoutes(router)
        return { path: '/login', query: { redirect: to.fullPath } }
      }
    }

    // 4. 动态路由还没注册，或角色变了：按角色注册后重新走一次当前导航
    if (registeredRole !== userStore.role) {
      resetDynamicRoutes(router)
      registerDynamicRoutes(router, userStore.role)
      return { ...to, replace: true }
    }

    // 5. 命中 404：如果该地址在完整路由表里存在，说明是"当前角色无权访问"
    if (isNotFoundRoute(to) && isKnownRoutePath(asyncRoutes, to.path)) {
      ElMessage.warning('无权限访问该页面')
      return getHomePathByRole(userStore.role)
    }

    return true
  })
}
