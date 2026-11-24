// 路由实例：S0 阶段只放一条占位路由，用于验证"地址 → 页面"链路能跑通；
// 完整路由表、meta.roles 权限、动态注册、404 兜底都留到 S2 实现
import { createRouter, createWebHistory } from 'vue-router'

// 占位页：S0 验收用，S1/S2 引入真实页面后删除
// 文件名取 PlaceholderPage（多单词），以符合 ESLint 的 vue/multi-word-component-names 规则
import PlaceholderPage from '@/views/PlaceholderPage.vue'

const router = createRouter({
  // history 模式：地址栏是 /recipes 这种真实路径（不带 #），部署时需要服务器回退到 index.html
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'Placeholder',
      component: PlaceholderPage,
      // meta.title 约定从 S2 起用于浏览器标题与面包屑，这里先占位
      meta: { title: '项目骨架' },
    },
  ],
})

export default router
