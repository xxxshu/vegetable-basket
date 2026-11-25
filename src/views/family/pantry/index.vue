<!--
  食材库存页（S9）
  - 列表：ProTable + 配置化搜索（食材名 / 品类）
  - 新增/编辑弹窗：选食材后自动带出保质期与基准单位，按「购买日 + 保质期」算到期日
  - 临期（≤3 天）与过期行整行高亮；库存会参与采购清单的「建议采购量」抵扣
-->
<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'

import { getCategories, getIngredients } from '@/api/dict'
import { createPantryItem, deletePantryItem, getPantryPage, updatePantryItem } from '@/api/pantry'
import PageContainer from '@/components/PageContainer.vue'
import ProTable from '@/components/ProTable.vue'
import SearchForm from '@/components/SearchForm.vue'
import { addDays, formatDate } from '@/utils/date'

// 表格 ref：新增 / 编辑 / 删除成功后调 reload() 刷新当前页
const tableRef = ref(null)

// 查询条件：必须用 ref 对象（SearchForm 的 v-model 需要整体同步）
const filters = ref({ keyword: '', categoryId: '' })

// 品类下拉：来自分类字典（type=ingredient），管理端新增品类后这里自动出现
const categoryOptions = ref([])
// 食材下拉：新增库存时选择食材，并用 unitBase / shelfLifeDays 自动带出单位和到期日
const ingredientOptions = ref([])

// 搜索项配置：品类选项是异步加载的，所以用 computed 保持响应式
const filterFields = computed(() => [
  { type: 'input', label: '食材', prop: 'keyword', placeholder: '搜索食材名', width: '200px' },
  {
    type: 'select',
    label: '品类',
    prop: 'categoryId',
    options: categoryOptions.value,
    width: '140px',
  },
])

// 表格列：状态列用 slot 渲染标签，操作列放编辑/删除按钮
const columns = [
  { prop: 'name', label: '食材', minWidth: 120 },
  { prop: 'categoryName', label: '品类', width: 100 },
  { prop: 'display', label: '数量', width: 110 },
  { prop: 'boughtAt', label: '购买日', width: 120 },
  { prop: 'expireAt', label: '到期日', width: 120 },
  { label: '状态', width: 130, slot: 'status' },
  { label: '操作', width: 140, slot: 'actions' },
]

// 弹窗状态：mode 区分新增/编辑；form 用一个对象承载所有字段
const dialog = reactive({
  visible: false,
  mode: 'create',
  submitting: false,
  form: {
    ingredientId: '',
    amount: 1,
    unit: 'g',
    boughtAt: '',
    expireAt: '',
  },
})

// 弹窗标题：编辑时显示食材名，方便确认改的是哪一行
const dialogTitle = computed(() => (dialog.mode === 'create' ? '新增库存' : '编辑库存'))

// 表单校验规则：食材/数量/购买日必填；到期日允许手动调整，不强制
const formRules = {
  ingredientId: [{ required: true, message: '请选择食材', trigger: 'change' }],
  amount: [{ required: true, message: '请输入数量', trigger: 'change' }],
  boughtAt: [{ required: true, message: '请选择购买日期', trigger: 'change' }],
}

const formRef = ref(null)
// 编辑时的行 id：新增时为 null
let editingId = null

// 新增弹窗里当前选中的食材：用于取基准单位与保质期
const selectedIngredient = computed(() =>
  ingredientOptions.value.find((item) => item.id === dialog.form.ingredientId),
)

/** 今天日期（YYYY-MM-DD）：新增库存时作为购买日默认值 */
function todayText() {
  return formatDate(new Date())
}

/**
 * 行状态文案与标签颜色
 * 规则：已过期 / 今天到期 → danger；≤3 天 → warning（临期）；其余正常
 * 注意：Element Plus 的 hidden-columns 会用 undefined 渲染一次列插槽，这里做空值保护
 * @param {object} row 库存行（含 daysLeft）
 * @returns {{ text: string, type: string }}
 */
function statusOf(row) {
  if (!row || row.daysLeft === undefined) return { text: '', type: 'info' }
  if (row.daysLeft < 0) return { text: `已过期 ${-row.daysLeft} 天`, type: 'danger' }
  if (row.daysLeft === 0) return { text: '今天到期', type: 'danger' }
  if (row.daysLeft <= 3) return { text: `临期 · 剩 ${row.daysLeft} 天`, type: 'warning' }
  return { text: `剩 ${row.daysLeft} 天`, type: 'success' }
}

/**
 * 行样式：临期（≤3 天）整行高亮，过期行用更醒目的红色底
 * @param {{ row: object }} param0 el-table 的行参数
 * @returns {string} 行 class
 */
function rowClassName({ row }) {
  if (row.daysLeft < 0) return 'pantry-row--danger'
  if (row.daysLeft <= 3) return 'pantry-row--warning'
  return ''
}

/** 打开新增弹窗：重置表单，购买日默认今天 */
function openCreate() {
  editingId = null
  dialog.mode = 'create'
  dialog.form = {
    ingredientId: '',
    amount: 1,
    unit: 'g',
    boughtAt: todayText(),
    expireAt: '',
  }
  dialog.visible = true
}

/**
 * 打开编辑弹窗：回填当前行；食材不允许改（库存批次对应固定食材）
 * @param {object} row 当前库存行
 */
function openEdit(row) {
  editingId = row.id
  dialog.mode = 'edit'
  dialog.form = {
    ingredientId: row.ingredientId,
    amount: row.amount,
    unit: row.unit,
    boughtAt: row.boughtAt,
    expireAt: row.expireAt,
  }
  dialog.visible = true
}

/**
 * 按「购买日 + 食材保质期」重算到期日
 * 场景：新增时选食材 / 改购买日期后自动带出；用户仍可手动改到期日
 */
function recalcExpireAt() {
  const ingredient = selectedIngredient.value
  if (!ingredient || !dialog.form.boughtAt) return
  dialog.form.expireAt = addDays(dialog.form.boughtAt, ingredient.shelfLifeDays || 7)
}

// 选中食材变化：同步基准单位并重算到期日（编辑时食材不可改，不会触发）
watch(
  () => dialog.form.ingredientId,
  () => {
    const ingredient = selectedIngredient.value
    if (!ingredient) return
    dialog.form.unit = ingredient.unitBase
    recalcExpireAt()
  },
)

// 购买日期变化：到期日跟着重算
watch(
  () => dialog.form.boughtAt,
  () => {
    recalcExpireAt()
  },
)

/**
 * 保存库存（新增或编辑）
 * 副作用：调接口成功后关闭弹窗、刷新表格并提示
 */
async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  if (!(Number(dialog.form.amount) > 0)) {
    ElMessage.warning('数量必须大于 0')
    return
  }

  dialog.submitting = true
  try {
    const payload = {
      ingredientId: dialog.form.ingredientId,
      amount: dialog.form.amount,
      unit: dialog.form.unit,
      boughtAt: dialog.form.boughtAt,
      expireAt: dialog.form.expireAt || undefined,
    }
    if (dialog.mode === 'create') await createPantryItem(payload)
    else await updatePantryItem(editingId, payload)
    ElMessage.success(dialog.mode === 'create' ? '库存已新增' : '库存已更新')
    dialog.visible = false
    tableRef.value?.reload()
  } catch {
    // 失败提示由请求层统一弹出
  } finally {
    dialog.submitting = false
  }
}

/**
 * 删除库存：二次确认 → 调接口 → 刷新表格
 * @param {object} row 当前库存行
 */
async function handleDelete(row) {
  const confirmed = await ElMessageBox.confirm(
    `确定删除「${row.name}」这条库存记录吗？`,
    '删除确认',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  try {
    await deletePantryItem(row.id)
    ElMessage.success('已删除')
    tableRef.value?.reload()
  } catch {
    // 失败提示由请求层统一弹出
  }
}

// 页面挂载：并行拉取品类 + 食材字典（搜索下拉 / 新增弹窗共用）
onMounted(async () => {
  try {
    const [categoryList, ingredientList] = await Promise.all([
      getCategories({ type: 'ingredient' }),
      getIngredients(),
    ])
    categoryOptions.value = categoryList.map((item) => ({ label: item.name, value: item.id }))
    ingredientOptions.value = ingredientList.map((item) => ({
      id: item.id,
      name: item.name,
      unitBase: item.unitBase,
      shelfLifeDays: item.shelfLifeDays,
    }))
  } catch {
    // 字典加载失败不影响库存列表展示（错误提示由请求层统一弹出）
  }
})
</script>

<template>
  <PageContainer title="食材库存">
    <!-- 右上角：新增库存 -->
    <template #extra>
      <el-button type="primary" @click="openCreate">新增库存</el-button>
    </template>

    <!-- 搜索区：食材名 / 品类（实时查询，无查询按钮） -->
    <SearchForm v-model="filters" :fields="filterFields" :show-search="false" />

    <!-- 库存表格：临期/过期行整行高亮；操作列编辑/删除 -->
    <ProTable
      ref="tableRef"
      :columns="columns"
      :api="getPantryPage"
      :params="filters"
      :row-class-name="rowClassName"
      empty-text="暂无库存，先录入食材库存"
    >
      <!-- 状态列：按剩余天数显示正常/临期/过期标签 -->
      <template #status="{ row }">
        <el-tag :type="statusOf(row).type" size="small" effect="plain">
          {{ statusOf(row).text }}
        </el-tag>
      </template>

      <!-- 操作列：编辑 / 删除 -->
      <template #actions="{ row }">
        <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
        <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
      </template>
    </ProTable>

    <!-- 口径说明：库存怎么影响采购清单 -->
    <p class="pantry__hint">
      库存会参与采购清单的「建议采购量」抵扣：库存足够的食材不出现在清单里，部分抵扣会标「库存不足」。
    </p>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialog.visible" :title="dialogTitle" width="560px">
      <el-form ref="formRef" :model="dialog.form" :rules="formRules" label-width="96px">
        <!-- 食材：编辑时锁定，避免把已有库存批次改成别的食材 -->
        <el-form-item label="食材" prop="ingredientId">
          <el-select
            v-model="dialog.form.ingredientId"
            filterable
            :disabled="dialog.mode === 'edit'"
            placeholder="选择食材"
            class="pantry-dialog__select"
          >
            <el-option
              v-for="item in ingredientOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            >
              <span>{{ item.name }}</span>
              <span class="pantry-dialog__option-extra">
                {{ item.unitBase }} · 保质期 {{ item.shelfLifeDays }} 天
              </span>
            </el-option>
          </el-select>
        </el-form-item>

        <!-- 数量：按食材基准单位录入，后端会归一成整数最小单位 -->
        <el-form-item label="数量" prop="amount">
          <el-input-number
            v-model="dialog.form.amount"
            :min="1"
            :step="1"
            :precision="0"
            class="pantry-dialog__number"
          />
          <span class="pantry-dialog__unit">{{ dialog.form.unit }}</span>
          <span class="pantry-dialog__hint">整数（g / ml / 个）</span>
        </el-form-item>

        <!-- 购买日期：默认今天 -->
        <el-form-item label="购买日期" prop="boughtAt">
          <el-date-picker
            v-model="dialog.form.boughtAt"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择购买日期"
            class="pantry-dialog__date"
          />
        </el-form-item>

        <!-- 到期日期：按购买日 + 食材保质期自动算，可手动调整 -->
        <el-form-item label="到期日期" prop="expireAt">
          <el-date-picker
            v-model="dialog.form.expireAt"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="按保质期自动计算"
            class="pantry-dialog__date"
          />
          <p class="pantry-dialog__help">默认按「购买日期 + 食材保质期」计算，可手动调整</p>
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
.pantry__hint {
  margin-top: $spacing-md;
  font-size: $font-size-sm;
  color: $text-secondary;
}

// 弹窗下拉 / 日期控件：统一占满一行
.pantry-dialog__select,
.pantry-dialog__date {
  width: 100%;
}

// 数量输入框：固定宽度，右侧跟单位
.pantry-dialog__number {
  width: 180px;
}

// 数量单位：跟在输入框右侧
.pantry-dialog__unit {
  margin-left: $spacing-sm;
  font-size: $font-size-base;
  color: $text-regular;
}

// 输入项说明：小字弱化
.pantry-dialog__hint {
  margin-left: $spacing-sm;
  font-size: $font-size-xs;
  color: $text-secondary;
}

// 到期日说明：单独占一行的小字
.pantry-dialog__help {
  width: 100%;
  font-size: $font-size-xs;
  color: $text-secondary;
}

// 下拉选项右侧补充信息（单位 / 保质期）
.pantry-dialog__option-extra {
  float: right;
  margin-left: $spacing-md;
  font-size: $font-size-xs;
  color: $text-secondary;
}

// 临期行高亮：浅橙底色，提示尽快食用
:deep(.pantry-row--warning > td) {
  background-color: rgba($color-accent, 0.1) !important;
}

// 过期行高亮：浅红底色，比临期更醒目
:deep(.pantry-row--danger > td) {
  background-color: rgba($color-danger, 0.08) !important;
}
</style>
