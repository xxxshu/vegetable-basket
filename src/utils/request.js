// 统一请求层：所有网络请求都必须经过这里（页面里禁止直接使用 axios）
// 职责：创建实例 → 挂载 Mock adapter（开发期）→ 请求/响应双拦截器
import axios from 'axios'

import mockAdapter from '@/mock'

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

// 3. 请求拦截器：S2 登录后在这里统一携带 token
request.interceptors.request.use(
  (config) => {
    // TODO(S2): 登录态做好后，在这里从 user store 取 token 写入请求头
    // config.headers.Authorization = `Bearer ${userStore.token}`
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
    // TODO(S2): 401 未登录 / token 过期 → 清空登录态并跳转登录页（依赖 router 与 user store）
    // 网络错误 / HTTP 非 2xx：优先展示后端返回的 message，没有则兜底"网络异常"
    ElMessage.error(error.response?.data?.message || '网络异常')
    return Promise.reject(error)
  },
)

export default request
