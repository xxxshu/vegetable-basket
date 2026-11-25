<!--
  管理端 · 食材字典管理（S9）
  - 列表：ProTable + 搜索（名称/别名、品类），分页
  - 新增/编辑：名称、品类、基准单位、单价（元）、保质期、别名
  - 删除：被菜谱 / 库存 / 采购核算引用时后端拒绝
  - 说明：单价内部按「分」存，页面按「元」展示与录入；g/ml 的单价口径是每 1000 单位（每 kg / 每 L）
-->
<script setup>
import { computed, onMounted, reactive, ref } from 'vue'

import {
  createIngredient,
  deleteIngredient,
  getCategories,
  getIngredientPage,
  updateIngredient,
} from '@/api/dict'
import PageContainer from '@/components/PageContainer.vue'
import ProTable from '@/components/ProTable.vue'
import SearchForm from '@/components/SearchForm.vue'

// 表格 ref：增删改后 reload
const tableRef = ref(null)

// 查询条件：关键词（名称/别名）+ 品类
const filters = ref({ keyword: '', categoryId: '' })

// 食材品类下拉：来自分类字典（type=ingredient）
const categoryOptions = ref([])

// 搜索项配置：品类选项异步加载，用 computed 保持响应式
const filterFields = computed(() => [
  {
    type: 'input',
    label: '名称/别名',
    prop: 'keyword',
    placeholder: '搜索食材名或别名',
    width: '200px',
  },
  {
    type: 'select',
    label: '品类',
    prop: 'categoryId',
    options: categoryOptions.value,
    width: '140px',
  },
])

// 基准单位选项：与食材数据 model 一致（g / ml / 个）
const UNIT_OPTIONS = [
  { label: 'g（克）', value: 'g' },
  { label: 'ml（毫升）', value: 'ml' },
  { label: '个', value: '个' },
]

// 表格列：单价/别名用 slot 处理展示格式，操作列放编辑/删除
const columns = [
  { prop: 'name', label: '食材名称', minWidth: 140 },
  { prop: 'categoryName', label: '品类', width: 100 },
  { prop: 'unitBase', label: '基准单位', width: 100 },
  { label: '单价(元)', width: 120, slot: 'price' },
  { prop: 'shelfLifeDays', label: '保质期(天)', width: 110 },
  { label: '别名', minWidth: 180, slot: 'aliases' },
  { label: '操作', width: 150, slot: 'actions' },
]

// 弹窗状态：价格字段用 priceYuan 展示（提交时 ×100 转成分）
const dialog = reactive({
  visible: false,
  mode: 'create',
  submitting: false,
  form: {
    name: '',
    categoryId: '',
    unitBase: 'g',
    priceYuan: 0,
    shelfLifeDays: 7,
    aliasesText: '',
  },
})

// 编辑中的食材 id
let editingId = null

// 弹窗标题
const dialogTitle = computed(() => (dialog.mode === 'create' ? '新增食材' : '编辑食材'))

// 表单校验规则：名称/品类/基准单位/单价/保质期必填
const formRules = {
  name: [{ required: true, message: '请输入食材名称', trigger: 'blur' }],
  categoryId: [{ required: true, message: '请选择食材品类', trigger: 'change' }],
  unitBase: [{ required: true, message: '请选择基准单位', trigger: 'change' }],
  priceYuan: [{ required: true, message: '请输入单价', trigger: 'change' }],
  shelfLifeDays: [{ required: true, message: '请输入保质期天数', trigger: 'change' }],
}

const formRef = ref(null)

/** 单价展示：分 → 元（保留 2 位小数，如 700 分 → ¥7.00）；空值保护 hidden-columns 的 undefined 渲染 */
function priceText(fen) {
  if (fen === undefined || fen === null) return ''
  return `¥${((Number(fen) || 0) / 100).toFixed(2)}`
}

/** 打开新增弹窗：默认单位 g、保质期 7 天 */
function openCreate() {
  editingId = null
  dialog.mode = 'create'
  dialog.form = {
    name: '',
    categoryId: '',
    unitBase: 'g',
    priceYuan: 0,
    shelfLifeDays: 7,
    aliasesText: '',
  }
  dialog.visible = true
}

/**
 * 打开编辑弹窗：把分转成元、别名数组转成逗号分隔文本
 * @param {object} row 当前食材行
 */
function openEdit(row) {
  editingId = row.id
  dialog.mode = 'edit'
  dialog.form = {
    name: row.name,
    categoryId: row.categoryId,
    unitBase: row.unitBase,
    priceYuan: (Number(row.pricePerUnit) || 0) / 100,
    shelfLifeDays: row.shelfLifeDays,
    aliasesText: (row.aliases || []).join('，'),
  }
  dialog.visible = true
}

/** 别名文本 → 数组：支持中文逗号/英文逗号/顿号分隔 */
function parseAliases(text) {
  return String(text || '')
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * 保存食材（新增 / 编辑）
 * 副作用：成功后关闭弹窗并刷新表格
 */
async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  dialog.submitting = true
  try {
    const payload = {
      name: dialog.form.name,
      categoryId: dialog.form.categoryId,
      unitBase: dialog.form.unitBase,
      // 元 → 分：四舍五入成整数分
      pricePerUnit: Math.round(Number(dialog.form.priceYuan || 0) * 100),
      shelfLifeDays: dialog.form.shelfLifeDays,
      aliases: parseAliases(dialog.form.aliasesText),
    }
    if (dialog.mode === 'create') {
      await createIngredient(payload)
      ElMessage.success('食材已新增')
    } else {
      await updateIngredient(editingId, payload)
      ElMessage.success('食材已更新')
    }
    dialog.visible = false
    tableRef.value?.reload()
  } catch {
    // 失败提示由请求层统一弹出（例如"已被菜谱引用，不能修改基准单位"）
  } finally {
    dialog.submitting = false
  }
}

/**
 * 删除食材：二次确认 → 调接口（后端校验引用关系）
 * @param {object} row 当前食材行
 */
async function handleDelete(row) {
  const confirmed = await ElMessageBox.confirm(
    `确定删除食材「${row.name}」吗？被菜谱 / 库存 / 采购核算引用时无法删除。`,
    '删除确认',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  try {
    await deleteIngredient(row.id)
    ElMessage.success('已删除')
    tableRef.value?.reload()
  } catch {
    // 失败提示由请求层统一弹出
  }
}

// 页面挂载：加载食材品类下拉
onMounted(async () => {
  try {
    const categoryList = await getCategories({ type: 'ingredient' })
    categoryOptions.value = categoryList.map((item) => ({ label: item.name, value: item.id }))
  } catch {
    // 字典加载失败不影响列表展示
  }
})
</script>

<template>
  <PageContainer title="食材字典">
    <!-- 右上角：新增食材 -->
    <template #extra>
      <el-button type="primary" @click="openCreate">新增食材</el-button>
    </template>

    <!-- 搜索：名称/别名、品类 -->
    <SearchForm v-model="filters" :fields="filterFields" :show-search="false" />

    <!-- 食材表格 -->
    <ProTable
      ref="tableRef"
      :columns="columns"
      :api="getIngredientPage"
      :params="filters"
      empty-text="暂无食材"
    >
      <!-- 单价列：分 → 元展示 -->
      <template #price="{ row }">
        {{ priceText(row.pricePerUnit) }}
      </template>

      <!-- 别名列：数组 → 标签，没有别名显示“—”. -->
      <template #aliases="{ row }">
        <template v-if="row.aliases?.length">
          <el-tag
            v-for="alias in row.aliases"
            :key="alias"
            size="small"
            type="info"
            effect="plain"
            class="ingredient-row__alias"
          >
            {{ alias }}
          </el-tag>
        </template>
        <span v-else class="ingredient-row__empty">—</span>
      </template>

      <!-- 操作列：编辑 / 删除 -->
      <template #actions="{ row }">
        <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
        <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
      </template>
    </ProTable>

    <!-- 单价口径说明：答辩/面试要能解释为什么 g/ml 的单价按 1000 单位算 -->
    <p class="ingredients__hint">
      单价口径：g / ml 的单价是「每 1000 单位（每 kg / 每 L）」的价格；个的单价是每个价格。
      食材被菜谱引用后不能修改基准单位；单价与保质期修改后，后续生成的采购清单会使用新值。
    </p>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialog.visible" :title="dialogTitle" width="560px">
      <el-form ref="formRef" :model="dialog.form" :rules="formRules" label-width="96px">
        <el-form-item label="食材名称" prop="name">
          <el-input v-model="dialog.form.name" placeholder="请输入食材名称" maxlength="20" />
        </el-form-item>

        <el-form-item label="食材品类" prop="categoryId">
          <el-select v-model="dialog.form.categoryId" placeholder="选择品类" class="dialog-width">
            <el-option
              v-for="item in categoryOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="基准单位" prop="unitBase">
          <el-select v-model="dialog.form.unitBase" class="dialog-width">
            <el-option
              v-for="item in UNIT_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <p class="dialog-help">已被菜谱引用的食材不能修改基准单位（会把历史用量口径改坏）</p>
        </el-form-item>

        <el-form-item label="单价(元)" prop="priceYuan">
          <el-input-number
            v-model="dialog.form.priceYuan"
            :min="0"
            :max="100000"
            :precision="2"
            :step="1"
            class="dialog-width"
          />
          <p class="dialog-help">g/ml 填「每 kg / 每 L」价格；个填每个价格</p>
        </el-form-item>

        <el-form-item label="保质期(天)" prop="shelfLifeDays">
          <el-input-number
            v-model="dialog.form.shelfLifeDays"
            :min="1"
            :max="3650"
            :step="1"
            :precision="0"
          />
        </el-form-item>

        <el-form-item label="别名" prop="aliasesText">
          <el-input
            v-model="dialog.form.aliasesText"
            placeholder="多个别名用逗号分隔，如：西红柿，番茄"
          />
          <p class="dialog-help">别名用于采购聚合时的名称归一（例如「西红柿」= 番茄）</p>
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
// 口径说明：弱化展示
.ingredients__hint {
  margin-top: $spacing-md;
  font-size: $font-size-sm;
  line-height: 1.6;
  color: $text-secondary;
}

// 别名标签：多个标签自动换行留间距
.ingredient-row__alias {
  margin-right: $spacing-xs;
}

// 无别名占位
.ingredient-row__empty {
  color: $text-placeholder;
}

// 弹窗控件：占满一行
.dialog-width {
  width: 100%;
}

// 字段帮助文案：单独占一行的小字
.dialog-help {
  width: 100%;
  margin-top: $spacing-xs;
  font-size: $font-size-xs;
  line-height: 1.5;
  color: $text-secondary;
}
</style>
