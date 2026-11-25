<!--
  空状态组件：统一「插图 + 说明文案 + 引导按钮」的空态样式。
  用法：<EmptyState description="本周还没有排计划" action-text="去排计划" @action="goPlan" />
-->
<script setup>
defineProps({
  // 空态说明文案
  description: { type: String, default: '暂无数据' },
  // 引导按钮文案：不传则不渲染按钮（有些空态不需要操作）
  actionText: { type: String, default: '' },
})

// 点击引导按钮时通知父组件执行跳转/打开弹窗等操作
const emit = defineEmits(['action'])
</script>

<template>
  <!-- 空态容器：居中显示插画与文案 -->
  <div class="empty-state">
    <el-empty :description="description" :image-size="96">
      <!-- 只有传了按钮文案才渲染引导按钮 -->
      <el-button v-if="actionText" type="primary" plain @click="emit('action')">
        {{ actionText }}
      </el-button>
    </el-empty>
  </div>
</template>

<style scoped lang="scss">
// 空态容器：上下留白，内容默认居中
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: $spacing-xl 0;
}
</style>
