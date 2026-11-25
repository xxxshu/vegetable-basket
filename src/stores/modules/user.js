// 用户登录态 store：token / userInfo / role + 登录、退出、恢复会话
// 持久化：使用 pinia-plugin-persistedstate，刷新页面后登录态不丢（localStorage，key = 'user'）
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { getMe, login as loginApi } from '@/api/auth'

export const useUserStore = defineStore(
  'user',
  () => {
    // 登录令牌：request.js 的请求拦截器会把它放进 Authorization 请求头
    const token = ref('')
    // 用户信息：id / username / nickname / avatar / role
    const userInfo = ref(null)
    // 角色是 userInfo 的派生数据：用 computed 保证永远不会和 userInfo 不一致
    const role = computed(() => userInfo.value?.role || '')

    /**
     * 登录：调用登录接口，成功后写入 token 与用户信息。
     * @param {{ username: string, password: string }} form 登录表单
     * @returns {Promise<object>} 接口返回的 { token, userInfo }
     * 副作用：写入 store（持久化插件自动同步到 localStorage）
     */
    async function login(form) {
      const data = await loginApi(form)
      token.value = data.token
      userInfo.value = data.userInfo
      return data
    }

    /**
     * 用当前 token 重新拉取用户信息：刷新页面后若只剩 token，可用它恢复登录态。
     * @returns {Promise<object>} 用户信息
     */
    async function fetchUserInfo() {
      return getMe()
    }

    /**
     * 设置用户信息（登录、恢复会话时使用）。
     * @param {object} user 用户信息对象
     */
    function setUser(user) {
      userInfo.value = user
    }

    /**
     * 退出登录：清空登录态。
     * 注意：动态路由的清理由路由守卫在下次导航时负责（退出后跳登录页即触发）。
     */
    function logout() {
      resetAuth()
    }

    /**
     * 清空登录态：退出登录与 401 登录过期共用这一处清理逻辑，避免两处写法不一致。
     */
    function resetAuth() {
      token.value = ''
      userInfo.value = null
    }

    return { token, userInfo, role, login, fetchUserInfo, setUser, logout, resetAuth }
  },
  // persist: true → 该 store 的状态持久化到 localStorage（刷新页面登录态不丢）
  { persist: true },
)
