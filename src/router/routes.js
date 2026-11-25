// 完整路由表（对应 docs/开发文档.md 6.1 节）
// 设计：S2 起采用「动态注册」——登录页先注册，业务路由登录后按角色过滤再 addRoute；
// 未注册的地址在路由层面根本不存在，比 v-if 隐藏菜单更安全。
// S3 起：'/' 与 '/admin' 已指向真实布局（FamilyLayout / AdminLayout）。

// 布局组件懒加载：只有进入该布局时才加载对应 chunk
const FamilyLayout = () => import('@/layouts/FamilyLayout.vue')
const AdminLayout = () => import('@/layouts/AdminLayout.vue')

// 页面统一懒加载：访问到该地址时才加载对应 chunk（S4 起逐步替换为真实页面组件）
const PlaceholderPage = () => import('@/views/PlaceholderPage.vue')
const LoginPage = () => import('@/views/login/index.vue')
const NotFoundPage = () => import('@/views/NotFoundPage.vue')
// 临时演示页：S3 用于验收公共组件，S5 起公共组件已在真实页面使用，演示页已删除
// S4 菜谱库：列表 + 详情
const RecipeList = () => import('@/views/family/recipes/index.vue')
const RecipeDetail = () => import('@/views/family/recipes/detail.vue')
// S5 管理端菜谱：列表 + 新增/编辑
const AdminRecipeList = () => import('@/views/admin/recipes/index.vue')
const AdminRecipeEdit = () => import('@/views/admin/recipes/edit.vue')
// S6 一周计划
const MealPlan = () => import('@/views/family/plan/index.vue')

// 不需要登录即可访问的路由（具体放行逻辑在守卫里）
export const constantRoutes = [
  {
    path: '/login',
    name: 'Login',
    component: LoginPage,
    meta: { title: '登录' },
  },
]

// 需要登录 + 按角色动态注册的路由：meta.roles 决定谁能看到、meta.title/icon 给菜单用
export const asyncRoutes = [
  {
    path: '/',
    name: 'FamilyRoot',
    component: FamilyLayout,
    redirect: '/dashboard',
    meta: { roles: ['family', 'admin'] },
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: PlaceholderPage,
        meta: { title: '工作台', icon: 'Odometer', roles: ['family', 'admin'] },
      },
      {
        path: 'recipes',
        name: 'Recipes',
        component: RecipeList,
        meta: { title: '菜谱库', icon: 'Dish', roles: ['family', 'admin'] },
      },
      {
        // 详情页不出现在菜单里，只能从列表点进来
        path: 'recipes/:id',
        name: 'RecipeDetail',
        component: RecipeDetail,
        meta: { title: '菜谱详情', roles: ['family', 'admin'], hidden: true },
      },
      {
        path: 'plan',
        name: 'Plan',
        component: MealPlan,
        meta: { title: '一周计划', icon: 'Calendar', roles: ['family'] },
      },
      {
        path: 'shopping',
        name: 'Shopping',
        component: PlaceholderPage,
        meta: { title: '采购清单', icon: 'ShoppingCart', roles: ['family'] },
      },
      {
        path: 'pantry',
        name: 'Pantry',
        component: PlaceholderPage,
        meta: { title: '食材库存', icon: 'Box', roles: ['family'] },
      },
      {
        path: 'stats',
        name: 'Stats',
        component: PlaceholderPage,
        meta: { title: '数据统计', icon: 'TrendCharts', roles: ['family', 'admin'] },
      },
      {
        path: 'settings',
        name: 'Settings',
        component: PlaceholderPage,
        meta: { title: '家庭设置', icon: 'Setting', roles: ['family'] },
      },
    ],
  },
  {
    path: '/admin',
    name: 'AdminRoot',
    component: AdminLayout,
    redirect: '/admin/recipes',
    meta: { roles: ['admin'] },
    children: [
      {
        path: 'recipes',
        name: 'AdminRecipes',
        component: AdminRecipeList,
        meta: { title: '菜谱管理', icon: 'Dish', roles: ['admin'] },
      },
      {
        path: 'recipes/edit/:id?',
        name: 'AdminRecipeEdit',
        component: AdminRecipeEdit,
        meta: { title: '编辑菜谱', roles: ['admin'], hidden: true },
      },
      {
        path: 'categories',
        name: 'AdminCategories',
        component: PlaceholderPage,
        meta: { title: '分类管理', icon: 'Grid', roles: ['admin'] },
      },
      {
        path: 'ingredients',
        name: 'AdminIngredients',
        component: PlaceholderPage,
        meta: { title: '食材字典', icon: 'Box', roles: ['admin'] },
      },
    ],
  },
]

// 404 兜底：不放进初始路由表，等守卫完成动态注册后最后 addRoute（保证最后匹配）
export const notFoundRoute = {
  path: '/:pathMatch(.*)*',
  name: 'NotFound',
  component: NotFoundPage,
  meta: { title: '页面不存在' },
}
