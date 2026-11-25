// 认证相关接口：登录、获取当前用户信息
// 页面不允许直接写 axios，所有请求都通过这里 → utils/request.js
import request from '@/utils/request'

/**
 * 登录
 * @param {{ username: string, password: string }} data 登录表单
 * @returns {Promise<{ token: string, userInfo: object }>}
 */
export function login(data) {
  return request.post('/auth/login', data)
}

/**
 * 获取当前登录用户信息（刷新后恢复会话 / 校验 token 是否有效）
 * @returns {Promise<object>} 用户信息
 */
export function getMe() {
  return request.get('/auth/me')
}
