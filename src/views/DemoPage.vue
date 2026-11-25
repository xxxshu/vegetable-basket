<!--
  临时演示页（S3 验收用）：只展示公共组件（PageContainer / EmptyState / UploadImage），
  不写任何业务逻辑。S4/S5 真实页面接入后本页与 /demo 路由一起删除。
-->
<script setup>
import { computed, ref } from 'vue'

import EmptyState from '@/components/EmptyState.vue'
import PageContainer from '@/components/PageContainer.vue'
import UploadImage from '@/components/UploadImage.vue'

// UploadImage 的 v-model：空字符串=未选择，File 对象=本地已选文件
const cover = ref('')

// 把 v-model 的值翻译成可读文案，证明组件真的把 File 回传给了父组件
const coverText = computed(() => {
  if (!cover.value) return '尚未选择图片'
  if (typeof cover.value === 'string') return `当前封面地址：${cover.value}`
  return `已选文件：${cover.value.name}（${Math.round(cover.value.size / 1024)} KB，本地预览，未上传）`
})

/**
 * 空态引导按钮点击：真实页面里会跳转去排计划/生成清单，这里只弹提示演示交互
 */
function handleEmptyAction() {
  ElMessage.info('空态引导按钮已点击（真实页面会跳转到对应操作）')
}
</script>

<template>
  <!-- 页面容器：统一样式，extra 插槽演示右侧操作区 -->
  <PageContainer title="公共组件演示（临时页）">
    <template #extra>
      <el-button plain>示例操作</el-button>
    </template>

    <!-- 空态组件演示 -->
    <section class="demo__section">
      <h3 class="demo__title">EmptyState 空态</h3>
      <EmptyState
        description="本周还没有排计划"
        action-text="去排计划"
        @action="handleEmptyAction"
      />
    </section>

    <!-- 上传组件演示 -->
    <section class="demo__section">
      <h3 class="demo__title">UploadImage 图片选择（本地预览，未真正上传）</h3>
      <UploadImage v-model="cover" />
      <p class="demo__text">{{ coverText }}</p>
    </section>
  </PageContainer>
</template>

<style scoped lang="scss">
// 每一块演示区：用虚线与下一块分隔
.demo__section {
  padding: $spacing-md 0;
  border-bottom: 1px dashed $border-color-light;

  &:last-child {
    border-bottom: none;
  }
}

// 演示区小标题
.demo__title {
  margin-bottom: $spacing-md;
  font-size: $font-size-md;
  color: $text-primary;
}

// v-model 回传值说明文字
.demo__text {
  margin-top: $spacing-sm;
  font-size: $font-size-sm;
  color: $text-regular;
}
</style>
