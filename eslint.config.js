import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'

export default defineConfig([
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,js,mjs,jsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  {
    languageOptions: {
      globals: {
        ...globals.browser,
        // Element Plus 的函数式 API 由 unplugin-auto-import 在编译时自动注入，源码里没有 import；
        // 声明为只读全局变量，no-undef 才不会误报（对齐大事件项目的做法）
        ElMessage: 'readonly',
        ElMessageBox: 'readonly',
        ElLoading: 'readonly',
      },
    },
  },

  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],

  {
    rules: {
      // 路由页统一命名为 index.vue（如 views/login/index.vue），
      // 因此忽略 index 这个"单词"组件名；其余组件仍要求多单词命名
      'vue/multi-word-component-names': ['warn', { ignores: ['index'] }],
    },
  },

  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

  // 关闭与 Prettier 冲突的格式类规则：格式交给 Prettier，ESLint 只查质量问题
  skipFormatting,
])
