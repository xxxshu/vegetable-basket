<!--
  配置化搜索表单（S5）：用 fields 描述"有哪些查询项"，避免每个列表页复制一套 el-form。
  用法：
  <SearchForm v-model="filters" :fields="filterFields" :show-search="false" @search="handleSearch" @reset="handleReset" />
  fields 项：{ type: 'input' | 'select' | 'number', label, prop, placeholder?, options?, width? }
-->
<script setup>
import { reactive, watch } from 'vue'

const props = defineProps({
  // 查询条件对象（v-model）
  modelValue: { type: Object, required: true },
  // 查询项配置
  fields: { type: Array, required: true },
  // 是否显示「查询」按钮：实时刷新的列表可关掉，只保留重置
  showSearch: { type: Boolean, default: true },
})

const emit = defineEmits(['update:modelValue', 'search', 'reset'])

// 本地表单：与父组件 modelValue 双向同步，避免直接修改父组件对象
const form = reactive({ ...props.modelValue })

// 父组件重置/初始化时，把值同步回本地表单
watch(
  () => props.modelValue,
  (value) => Object.assign(form, value),
  { deep: true },
)

// 本地表单任一字段变化 → 通过 v-model 通知父组件（父组件据此触发查询/防抖）
watch(form, () => emit('update:modelValue', { ...form }), { deep: true })

/**
 * 重置处理：所有字段回到默认值（defaultValue，未配置则空字符串），
 * 通过 v-model 同步给父组件，由父组件按自身策略重新查询（实时列表 / 防抖列表都适用）。
 */
function handleReset() {
  props.fields.forEach((field) => {
    form[field.prop] = field.defaultValue ?? ''
  })
  emit('reset')
}
</script>

<template>
  <!-- 搜索表单：按 fields 配置渲染查询项 + 操作按钮 -->
  <el-form class="search-form" :inline="true" @submit.prevent>
    <!-- 按字段配置渲染：input / select / number 三种类型 -->
    <el-form-item v-for="field in fields" :key="field.prop" :label="field.label">
      <!-- 文本输入 -->
      <el-input
        v-if="field.type === 'input'"
        v-model="form[field.prop]"
        :placeholder="field.placeholder || '请输入'"
        :style="{ width: field.width || '220px' }"
        clearable
        @keyup.enter="emit('search')"
      />
      <!-- 下拉选择 -->
      <el-select
        v-else-if="field.type === 'select'"
        v-model="form[field.prop]"
        :placeholder="field.placeholder || '全部'"
        :style="{ width: field.width || '140px' }"
        clearable
      >
        <el-option
          v-for="option in field.options || []"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </el-select>
      <!-- 数字输入 -->
      <el-input-number
        v-else-if="field.type === 'number'"
        v-model="form[field.prop]"
        :min="field.min ?? 0"
        :max="field.max ?? 9999"
        :style="{ width: field.width || '140px' }"
      />
    </el-form-item>

    <!-- 操作按钮：查询（可选） + 重置 -->
    <el-form-item>
      <el-button v-if="showSearch" type="primary" @click="emit('search')">查询</el-button>
      <el-button @click="handleReset">重置</el-button>
    </el-form-item>
  </el-form>
</template>

<style scoped lang="scss">
// 表单底部留一点间距，与下方表格分开
.search-form {
  margin-bottom: $spacing-sm;
}
</style>
