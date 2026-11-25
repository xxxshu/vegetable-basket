// 路由权限工具：只做纯函数式的数据处理，不依赖 router / store，方便阅读与复用
// 数据流：完整路由表 asyncRoutes → filterRoutesByRole(按角色过滤) → addRoute 动态注册
//        过滤后的路由表再 → toMenuTree → S3 的 AppMenu 渲染菜单

/**
 * 把父子路径拼成绝对路径：父 '/' + 子 'dashboard' → '/dashboard'
 * @param {string} parentPath 父级绝对路径
 * @param {string} path 当前路由的 path
 * @returns {string} 绝对路径
 */
function resolvePath(parentPath, path) {
  // 子路由已经写成绝对路径（以 / 开头）时直接使用
  if (path.startsWith('/')) return path
  // 相对路径拼接后去掉可能出现的重复斜杠
  return `${parentPath}/${path}`.replace(/\/{2,}/g, '/')
}

/**
 * 按角色过滤路由表（递归过滤）。
 * 规则：路由声明了 meta.roles 时必须包含当前角色；父路由过滤后没有任何子路由则整条丢弃。
 * @param {Array} routes 完整路由表
 * @param {string} role 当前角色 family / admin
 * @returns {Array} 当前角色可注册的路由表（新数组，不修改原表）
 */
export function filterRoutesByRole(routes, role) {
  const result = []
  routes.forEach((route) => {
    // 没有声明 roles 的路由默认所有角色可见（例如以后的公共页面）
    const roles = route.meta?.roles
    if (roles && !roles.includes(role)) return

    // 浅拷贝当前路由：避免把过滤后的 children 写回原路由表，导致二次过滤出错
    const nextRoute = { ...route }
    if (route.children) {
      nextRoute.children = filterRoutesByRole(route.children, role)
      // 父路由只是"布局壳"，子路由全被过滤后没有存在的意义
      if (nextRoute.children.length === 0) return
    }
    result.push(nextRoute)
  })
  return result
}

/**
 * 把路由表转成菜单树（S3 的 AppMenu 直接渲染它）。
 * 规则：meta.hidden 的详情页不进菜单；没有 title 的布局路由不生成菜单项，把子菜单提升到顶层。
 * @param {Array} routes 已按角色过滤后的路由表
 * @param {string} parentPath 父级绝对路径
 * @returns {Array<{ path: string, title: string, icon: string, children: Array }>}
 */
export function toMenuTree(routes, parentPath = '') {
  const menus = []
  routes.forEach((route) => {
    const fullPath = resolvePath(parentPath, route.path)
    const children = route.children ? toMenuTree(route.children, fullPath) : []

    // 隐藏路由（如菜谱详情）不显示在菜单里
    if (route.meta?.hidden) return

    // 布局路由没有 title：不生成菜单项，直接把子菜单铺到上一层
    if (!route.meta?.title) {
      menus.push(...children)
      return
    }
    menus.push({
      path: fullPath,
      title: route.meta.title,
      icon: route.meta.icon || '',
      children,
    })
  })
  return menus
}

/**
 * 把路由路径转成匹配用的正则：
 * 静态段原样匹配；:id 匹配一段任意字符串；:id? 表示这一段可以没有
 * 例：/recipes/:id → /^\/recipes\/[^/]+\/?$/；/admin/recipes/edit/:id? → 允许末段省略
 * @param {string} routePath 路由 path（可含动态段）
 * @returns {RegExp}
 */
function routeToRegExp(routePath) {
  let pattern = '^'
  routePath
    .split('/')
    .filter(Boolean)
    .forEach((segment) => {
      if (segment.startsWith(':')) {
        const isOptional = segment.endsWith('?')
        pattern += isOptional ? '(?:/[^/]+)?' : '/[^/]+'
        return
      }
      // 静态段：转义正则特殊字符后原样匹配
      pattern += `/${segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
    })
  return new RegExp(`${pattern}/?$`)
}

/**
 * 收集完整路由表里所有叶子路由的绝对路径（用于区分"无权限"与"页面不存在"）
 * @param {Array} routes 完整路由表（asyncRoutes）
 * @param {string} parentPath 父级绝对路径
 * @returns {string[]} 绝对路径列表
 */
export function getAllRoutePaths(routes, parentPath = '') {
  const paths = []
  routes.forEach((route) => {
    const fullPath = resolvePath(parentPath, route.path)
    // 有 children 的布局路由只收集叶子，布局本身不是可访问地址
    if (route.children) paths.push(...getAllRoutePaths(route.children, fullPath))
    else paths.push(fullPath)
  })
  return paths
}

/**
 * 判断地址是否存在于"完整路由表"中。
 * 用途：守卫里命中 404 时，若地址其实存在（只是当前角色未注册），应提示"无权限"而不是"页面不存在"。
 * @param {Array} routes 完整路由表（asyncRoutes）
 * @param {string} path 当前访问的地址
 * @returns {boolean}
 */
export function isKnownRoutePath(routes, path) {
  return getAllRoutePaths(routes).some((routePath) => routeToRegExp(routePath).test(path))
}

/**
 * 登录后的默认首页：管理员进管理端，家庭用户进工作台
 * @param {string} role 当前角色
 * @returns {string} 首页路径
 */
export function getHomePathByRole(role) {
  return role === 'admin' ? '/admin/recipes' : '/dashboard'
}
