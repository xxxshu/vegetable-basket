<!--
  根组件：只保留路由出口。
  所有页面/布局都由路由决定（登录页、家庭端布局、管理端布局都挂在 router-view 里）。
  ElConfigProvider：把 Element Plus 组件的内置文案统一切成中文（如分页的「共 x 条」）。
-->
<script setup>
// Element Plus 中文语言包（该模块只有默认导出，注意用 default import）
import zhCn from 'element-plus/es/locale/lang/zh-cn'
</script>

<template>
  <!-- 全局配置 Element Plus 语言为中文 -->
  <el-config-provider :locale="zhCn">
    <!-- 路由出口：地址匹配到哪个页面就渲染哪个页面 -->
    <router-view />
  </el-config-provider>
</template>
