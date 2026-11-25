<!--
  管理端 · 分类管理（S9）
  - 分类分两类：食材品类（采购分组、菜谱分类）、烹饪方式（菜谱做法）
  - 列表：ProTable + 配置化搜索；新增/编辑/删除
  - 删除校验：被食材或菜谱引用时后端拒绝（避免脏数据）
-->
<script setup>
import { computed, reactive, ref } from 'vue'

import { createCategory, deleteCategory, getCategoryPage, updateCategory } from '@/api/dict'
import PageContainer from '@/components/PageContainer.vue'
import ProTable from '@/components/ProTable.vue'
import SearchForm from '@/components/SearchForm.vue'

// 表格 ref：增删改后 reload 刷新当前页
const tableRef = ref(null)

// 查询条件：名称关键词 + 分类类型
const filters = ref({ keyword: '', type: '' })

// 类型下拉选项：与后端 CATEGORY_TYPES 约定一致
const TYPE_OPTIONS = [
  { label: '食材品类', value: 'ingredient' },
  { label: '烹饪方式', value: 'method' },
]

// 搜索项配置
const filterFields = [
  { type: 'input', label: '分类名称', prop: 'keyword', placeholder: '搜索分类名', width: '200px' },
  { type: 'select', label: '类型', prop: 'type', options: TYPE_OPTIONS, width: '140px' },
]

// 表格列：类型列用 slot 渲染中文标签，操作列放编辑/删除
const columns = [
  { prop: 'id', label: 'ID', width: 80 },
  { prop: 'name', label: '分类名称', minWidth: 160 },
  { label: '类型', width: 140, slot: 'type' },
  { prop: 'sort', label: '排序', width: 100 },
  { label: '操作', width: 150, slot: 'actions' },
]

// 弹窗状态：新增 / 编辑共用；编辑时类型不可改（已有数据引用）
const dialog = reactive({
  visible: false,
  mode: 'create',
  submitting: false,
  form: { name: '', type: 'ingredient', sort: 0 },
})

// 编辑中的分类 id
let editingId = null

// 弹窗标题
const dialogTitle = computed(() => (dialog.mode === 'create' ? '新增分类' : '编辑分类'))

// 表单校验规则
const formRules = {
  name: [{ required: true, message: '请输入分类名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择分类类型', trigger: 'change' }],
}

const formRef = ref(null)

/** 类型英文值 → 中文文案（空值保护：el-table 的 hidden-columns 会用 undefined 渲染一次插槽） */
function typeText(type) {
  if (!type) return ''
  return TYPE_OPTIONS.find((item) => item.value === type)?.label || '未知'
}

/** 打开新增弹窗：默认食材品类，排序 0 */
function openCreate() {
  editingId = null
  dialog.mode = 'create'
  dialog.form = { name: '', type: 'ingredient', sort: 0 }
  dialog.visible = true
}

/**
 * 打开编辑弹窗：回填当前行
 * @param {object} row 当前分类行
 */
function openEdit(row) {
  editingId = row.id
  dialog.mode = 'edit'
  dialog.form = { name: row.name, type: row.type, sort: row.sort }
  dialog.visible = true
}

/**
 * 保存分类（新增 / 编辑）
 * 副作用：成功后关闭弹窗并刷新表格
 */
async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  dialog.submitting = true
  try {
    if (dialog.mode === 'create') {
      await createCategory({ ...dialog.form })
      ElMessage.success('分类已新增')
    } else {
      // 编辑只传可改字段（类型不可改）
      await updateCategory(editingId, { name: dialog.form.name, sort: dialog.form.sort })
      ElMessage.success('分类已更新')
    }
    dialog.visible = false
    tableRef.value?.reload()
  } catch {
    // 失败提示由请求层统一弹出
  } finally {
    dialog.submitting = false
  }
}

/**
 * 删除分类：二次确认 → 调接口
 * 后端会校验引用关系（被食材/菜谱使用则拒绝）
 * @param {object} row 当前分类行
 */
async function handleDelete(row) {
  const confirmed = await ElMessageBox.confirm(
    `确定删除分类「${row.name}」吗？被食材或菜谱引用时无法删除。`,
    '删除确认',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  try {
    await deleteCategory(row.id)
    ElMessage.success('已删除')
    tableRef.value?.reload()
  } catch {
    // 失败提示由请求层统一弹出（例如"该烹饪方式已被菜谱使用"）
  }
}
</script>

<template>
  <PageContainer title="分类管理">
    <!-- 右上角：新增分类 -->
    <template #extra>
      <el-button type="primary" @click="openCreate">新增分类</el-button>
    </template>

    <!-- 搜索：名称 / 类型 -->
    <SearchForm v-model="filters" :fields="filterFields" :show-search="false" />

    <!-- 分类表格 -->
    <ProTable
      ref="tableRef"
      :columns="columns"
      :api="getCategoryPage"
      :params="filters"
      empty-text="暂无分类"
    >
      <!-- 类型列：中文标签 -->
      <template #type="{ row }">
        <el-tag
          :type="row.type === 'ingredient' ? 'success' : 'warning'"
          size="small"
          effect="plain"
        >
          {{ typeText(row.type) }}
        </el-tag>
      </template>

      <!-- 操作列：编辑 / 删除 -->
      <template #actions="{ row }">
        <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
        <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
      </template>
    </ProTable>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialog.visible" :title="dialogTitle" width="480px">
      <el-form ref="formRef" :model="dialog.form" :rules="formRules" label-width="90px">
        <el-form-item label="分类名称" prop="name">
          <el-input v-model="dialog.form.name" placeholder="请输入分类名称" maxlength="20" />
        </el-form-item>

        <!-- 类型：创建后不可修改（已有食材/菜谱引用） -->
        <el-form-item label="类型" prop="type">
          <el-select v-model="dialog.form.type" :disabled="dialog.mode === 'edit'">
            <el-option
              v-for="item in TYPE_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <p class="category-dialog__help">
            类型创建后不可修改；烹饪方式改名会同步更新已使用它的菜谱
          </p>
        </el-form-item>

        <el-form-item label="排序" prop="sort">
          <el-input-number v-model="dialog.form.sort" :min="0" :step="1" :precision="0" />
          <span class="category-dialog__hint">数字越小越靠前</span>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="dialog.submitting" @click="handleSubmit">
          保存
        </el-button>
      </template>
    </el-dialog>
  </PageContainer>
</template>

<style scoped lang="scss">
// 字段帮助文案：单独占一行的小字
.category-dialog__help {
  width: 100%;
  margin-top: $spacing-xs;
  font-size: $font-size-xs;
  line-height: 1.5;
  color: $text-secondary;
}

// 排序字段说明
.category-dialog__hint {
  margin-left: $spacing-sm;
  font-size: $font-size-xs;
  color: $text-secondary;
}
</style>
