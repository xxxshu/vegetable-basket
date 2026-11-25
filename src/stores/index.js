import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

// Pinia 实例（全项目唯一）：在 main.js 里 app.use(pinia) 挂载后才能使用 store
const pinia = createPinia()

// 注册持久化插件：store 里写 persist: true 后，刷新页面状态不丢（登录态靠它）
pinia.use(piniaPluginPersistedstate)

// 统一导出所有 store：页面/组件一律从 '@/stores' 引入，不直接引用 modules 下的文件
export { useUserStore } from './modules/user'

export default pinia
