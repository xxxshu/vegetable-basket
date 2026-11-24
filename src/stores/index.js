import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

// Pinia 实例（全项目唯一）：在 main.js 里 app.use(pinia) 挂载后才可使用 store
const pinia = createPinia()

// 注册持久化插件：store 里写 persist: true 后，刷新页面状态不丢（S2 的登录态会用到）
pinia.use(piniaPluginPersistedstate)

export default pinia
