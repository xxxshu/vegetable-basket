<!--
  根组件：只保留路由出口。
  所有页面/布局都由路由决定（S0 只有占位页，S2 起换成 FamilyLayout / AdminLayout 等）。
-->
<template>
  <!-- 路由出口：地址匹配到哪个页面就渲染哪个页面 -->
  <router-view />
</template>
