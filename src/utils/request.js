// 统一请求层：所有网络请求都必须经过这里（页面里禁止直接使用 axios）
// 职责：创建实例 → 挂载 Mock adapter（开发期）→ 请求/响应双拦截器
// 注意：这里 import 了 router 与 user store，会和它们形成"互相引用"的循环依赖；
//       但都只在运行时（发请求/401 时）使用，不在模块顶层立即调用，因此不会有初始化问题。
import axios from 'axios'

import mockAdapter from '@/mock'
import router from '@/router'
import { useUserStore } from '@/stores'

// 并发 401 去重标志：多个请求同时过期时，只跳一次登录页、只提示一次
let isRedirecting = false

/**
 * 统一处理 401（未登录 / token 过期）。
 * 副作用：清空登录态、提示一次、跳转登录页（带上当前地址，登录后可回跳）。
 * 并发去重：isRedirecting 为 true 时直接返回，避免多个请求各自弹提示/重复跳转。
 */
function handleUnauthorized() {
  // 已经在处理中：后续并发的 401 直接忽略
  if (isRedirecting) return
  isRedirecting = true

  // 提示只弹一次：文案与"被拦截到登录页"的语义一致
  ElMessage.warning('登录已过期，请重新登录')

  // 清空 token / userInfo（动态路由由路由守卫在下次导航时清理）
  const userStore = useUserStore()
  userStore.resetAuth()

  const currentRoute = router.currentRoute.value
  // 已经在登录页就不用再跳，避免重复导航
  if (currentRoute.path === '/login') {
    isRedirecting = false
    return
  }
  router.replace({ path: '/login', query: { redirect: currentRoute.fullPath } }).finally(() => {
    // 跳转完成后释放标志，允许下一次真正需要时再跳
    isRedirecting = false
  })
}

// 1. 创建 axios 实例：baseURL 与 Mock 开关都来自环境变量（.env.development / .env.production）
const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
})

// 2. 开发期挂载 Mock adapter：把"真正发请求"这一步替换成内存数据模拟，业务代码零感知；
//    把 VITE_USE_MOCK 改成 false，请求就会走真实后端（业务代码一行都不用改）
if (import.meta.env.VITE_USE_MOCK === 'true') {
  request.defaults.adapter = mockAdapter
}

// 3. 请求拦截器：登录后每个请求自动携带 token
request.interceptors.request.use(
  (config) => {
    // 从 user store 取 token（持久化插件保证刷新页面后仍在）
    const userStore = useUserStore()
    if (userStore.token) {
      config.headers.Authorization = `Bearer ${userStore.token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// 4. 响应拦截器：统一"拆壳"与错误提示，页面只处理数据、不重复写成功/失败判断
request.interceptors.response.use(
  (response) => {
    const { code, message, data } = response.data
    // 业务成功：后端统一返回 { code: 0, message, data }，这里直接把 data 交给页面
    if (code === 0) return data
    // 业务失败（HTTP 200 但 code != 0）：统一提示，并抛出错误交给页面 catch
    ElMessage.error(message || '服务异常')
    return Promise.reject(new Error(message || '服务异常'))
  },
  (error) => {
    // 401 未登录 / token 过期：统一清理登录态并跳转登录页（并发请求只处理一次）
    if (error.response?.status === 401) {
      handleUnauthorized()
      return Promise.reject(error)
    }
    // 网络错误 / 其他 HTTP 非 2xx：优先展示后端返回的 message，没有则兜底"网络异常"
    ElMessage.error(error.response?.data?.message || '网络异常')
    return Promise.reject(error)
  },
)

export default request
