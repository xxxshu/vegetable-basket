import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

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
