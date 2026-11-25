<!--
  图片选择组件（S3）：只做「本地选择 + 预览 + 回传 File」，不做真实上传。
  - :auto-upload="false"：选中文件后不自动发请求
  - URL.createObjectURL(file)：浏览器为本地文件生成临时地址，用 <img> 预览
  - v-model：选中后回传 File 对象（S5 保存菜谱时再真正上传）；也可传字符串回显已有封面
-->
<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { Plus } from '@element-plus/icons-vue'

const props = defineProps({
  // 双向绑定值：空字符串=未选择；File=本地新选文件；字符串=已有封面地址
  modelValue: { type: [String, Object], default: '' },
})
const emit = defineEmits(['update:modelValue'])

// 预览地址：可能是已有封面 URL（字符串），也可能是新选文件生成的临时 ObjectURL
const previewUrl = ref('')
// 当前持有的 ObjectURL：组件卸载或重新选择时释放，避免内存泄漏
let currentObjectUrl = ''

// 监听外部值变化：编辑表单回填已有封面时直接显示
watch(
  () => props.modelValue,
  (value) => {
    // 传字符串 → 当作已有封面地址回显
    if (typeof value === 'string') previewUrl.value = value
    // 清空 → 预览也清空
    if (!value) previewUrl.value = ''
  },
  { immediate: true },
)

/**
 * 释放上一次生成的 ObjectURL。
 * 为什么必须释放：ObjectURL 会一直占用浏览器内存，直到页面关闭或手动 revoke。
 */
function revokeObjectUrl() {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = ''
  }
}

/**
 * 选中文件后的回调（auto-upload=false 时只在本地触发，不会发网络请求）
 * @param {object} uploadFile Element Plus 包装的文件对象，raw 是原始 File
 */
function handleChange(uploadFile) {
  const file = uploadFile.raw
  if (!file) return

  // 1. 类型校验：只允许图片
  if (!file.type.startsWith('image/')) {
    ElMessage.error('请选择图片文件')
    return
  }
  // 2. 大小校验：2MB（真实上传时后端还应再校验一次）
  if (file.size > 2 * 1024 * 1024) {
    ElMessage.error('图片大小不能超过 2MB')
    return
  }

  // 3. 生成本地预览地址：先释放旧的，再为本次文件生成新的
  revokeObjectUrl()
  currentObjectUrl = URL.createObjectURL(file)
  previewUrl.value = currentObjectUrl

  // 4. 回传 File 给父组件：v-model 拿到的是原始文件，S5 保存时用 FormData 上传
  emit('update:modelValue', file)
}

// 组件卸载时释放 ObjectURL，避免内存泄漏
onBeforeUnmount(revokeObjectUrl)
</script>

<template>
  <!-- 上传容器：隐藏默认文件列表，用自定义预览块替代 -->
  <el-upload
    class="upload-image"
    :auto-upload="false"
    :show-file-list="false"
    accept="image/*"
    :on-change="handleChange"
  >
    <!-- 预览区：有图显示图片，无图显示加号占位 -->
    <div class="upload-image__box">
      <img v-if="previewUrl" :src="previewUrl" class="upload-image__preview" alt="封面预览" />
      <div v-else class="upload-image__placeholder">
        <el-icon class="upload-image__plus"><Plus /></el-icon>
        <span>点击选择图片</span>
      </div>
    </div>

    <!-- 提示文字：说明支持格式与"未真正上传" -->
    <template #tip>
      <p class="upload-image__tip">支持 JPG/PNG，建议 4:3，不超过 2MB（本地预览，未上传）</p>
    </template>
  </el-upload>
</template>

<style scoped lang="scss">
// 预览框：固定 4:3 比例，虚线边框提示可点击
.upload-image__box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 200px;
  height: 150px;
  overflow: hidden;
  cursor: pointer;
  background-color: $bg-page;
  border: 1px dashed $border-color;
  border-radius: $radius-md;
  transition: border-color 0.2s;

  &:hover {
    border-color: $color-primary;
  }
}

// 预览图片：铺满预览框且不变形
.upload-image__preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

// 占位内容：加号 + 文案，垂直排列
.upload-image__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $spacing-xs;
  font-size: $font-size-sm;
  color: $text-secondary;
}

// 加号图标：主色，突出"可点击"
.upload-image__plus {
  font-size: 24px;
  color: $color-primary;
}

// 提示文字：弱化处理
.upload-image__tip {
  margin-top: $spacing-sm;
  font-size: $font-size-xs;
  color: $text-secondary;
}
</style>
