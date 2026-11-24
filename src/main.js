// 应用入口：只负责"装配"（创建实例、挂载插件、引入全局样式），不写任何业务逻辑
import { createApp } from 'vue'

// 全局样式：CSS 重置 + 全局基础样式，整个应用只引入一次
import '@/styles/index.scss'

import App from './App.vue'
import router from './router'
// Pinia 实例（已在 stores/index.js 中创建并注册持久化插件）
import pinia from './stores'

// 1. 创建根组件实例
const app = createApp(App)

// 2. 挂载 Pinia：之后页面里才能 useXxxStore()
app.use(pinia)

// 3. 挂载路由：App.vue 里的 <router-view /> 才会按地址渲染对应页面
app.use(router)

// Element Plus 的组件与样式由 vite.config.js 里的 unplugin 自动按需注入，
// 因此这里不需要 import 'element-plus/dist/index.css'（全量样式体积大，且与按需方案重复）

// 4. 挂载到 index.html 中的 #app 节点
app.mount('#app')
