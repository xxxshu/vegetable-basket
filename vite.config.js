import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// 开发期 /api 兜底：Mock 关闭且还没接真实后端时，接口请求直接返回 404 JSON。
// 为什么需要：Vite 对未知的 GET 请求会做 SPA fallback（返回 index.html），
// /api 请求会被当成页面请求返回 200 HTML，导致无法验证"关闭 Mock 后请求确实发到了网络"。
// 接入真实后端时可删除本插件（或改用 server.proxy 转发到后端）。
function devApiNotFoundPlugin() {
  return {
    name: 'dev-api-not-found',
    // apply: 'serve' 表示只在 pnpm dev 时生效，构建生产包时自动跳过
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // 只拦截接口前缀，其它请求继续交给 Vite 处理（页面、静态资源、HMR 等）
        if (req.url && req.url.startsWith('/api/')) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ code: 404, message: '接口不存在：当前未配置真实后端' }))
          return
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    // Element Plus 的"函数式 API"按需自动导入：在 .vue 里直接写 ElMessage 即可，
    // 编译时会自动补上 import，避免每个页面重复手写引入语句
    AutoImport({
      resolvers: [ElementPlusResolver()],
      // 本项目不使用 TypeScript，关闭自动生成的类型声明文件（否则会多出 auto-imports.d.ts）
      dts: false,
    }),
    // Element Plus 的"模板组件"按需自动注册：模板里写 <el-button> 即可，
    // 组件与对应样式按需注入，因此 main.js 不需要 app.use(ElementPlus) 全量注册
    Components({
      resolvers: [ElementPlusResolver()],
      dts: false,
    }),
    devApiNotFoundPlugin(),
  ],
  resolve: {
    alias: {
      // 路径别名：源码里用 @/xxx 指向 src/xxx，避免 ../../../ 这种难以维护的相对路径
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // 全局注入 Sass 变量：任何 <style lang="scss"> 里都能直接用 $color-primary 等变量，
        // 不必每个文件手写 @use。variables.scss 只放变量（不产出 CSS），所以不会重复打包样式
        additionalData: `@use "@/styles/variables.scss" as *;\n`,
      },
    },
  },
})
