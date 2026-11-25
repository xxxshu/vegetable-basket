<!--
  管理端 · 菜谱管理（S5）
  - 搜索：配置化 SearchForm（关键词 / 分类 / 难度）
  - 表格：配置化 ProTable（分页 / loading / 空态，自定义列用插槽）
  - 操作：新增、编辑、上下架、删除（二次确认）
-->
<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { deleteRecipe, getRecipeList, updateRecipeStatus } from '@/api/recipe'
import PageContainer from '@/components/PageContainer.vue'
import ProTable from '@/components/ProTable.vue'
import SearchForm from '@/components/SearchForm.vue'
import { DIFFICULTY, ING_CATEGORIES } from '@/utils/constants'

const router = useRouter()

// 查询条件：ref 对象便于 SearchForm 通过 v-model 整体同步；ProTable 监听它变化后自动回到第 1 页查询
const filters = ref({ keyword: '', categoryId: '', difficulty: '' })

// 搜索项配置（SearchForm 消费）：分类 id = 下标 + 1，与 mock 契约一致
const filterFields = [
  { type: 'input', label: '关键词', prop: 'keyword', placeholder: '搜索菜名', width: '220px' },
  {
    type: 'select',
    label: '分类',
    prop: 'categoryId',
    options: ING_CATEGORIES.map((name, index) => ({ label: name, value: index + 1 })),
    width: '140px',
  },
  {
    type: 'select',
    label: '难度',
    prop: 'difficulty',
    options: DIFFICULTY.map((name, index) => ({ label: name, value: index + 1 })),
    width: '140px',
  },
]

// 表格列配置（ProTable 消费）：配置 slot 的列用下方同名插槽渲染
const columns = [
  { prop: 'cover', label: '封面', width: 90, slot: 'cover' },
  { prop: 'title', label: '菜名', minWidth: 160 },
  { prop: 'categoryName', label: '分类', width: 100 },
  { prop: 'difficulty', label: '难度', width: 90, slot: 'difficulty' },
  { prop: 'calories', label: '热量(kcal/份)', width: 130 },
  { prop: 'status', label: '状态', width: 90, slot: 'status' },
  { label: '操作', width: 220, slot: 'actions' },
]

const tableRef = ref(null)

/** 难度文案 */
const difficultyText = (value) => ['简单', '普通', '困难'][value - 1] || '未知'
/** 难度标签颜色 */
const difficultyType = (value) => ['success', 'warning', 'danger'][value - 1] || 'info'

/** 新增菜谱：跳编辑页（无 id 即新增模式） */
function goCreate() {
  router.push('/admin/recipes/edit')
}

/**
 * 编辑菜谱
 * @param {object} row 当前行数据
 */
function goEdit(row) {
  router.push(`/admin/recipes/edit/${row.id}`)
}

/**
 * 上下架切换
 * @param {object} row 当前行数据
 * 副作用：调接口成功后刷新表格（重新请求当前页）
 */
async function handleToggleStatus(row) {
  const nextStatus = row.status === 1 ? 0 : 1
  try {
    await updateRecipeStatus(row.id, nextStatus)
    ElMessage.success(nextStatus === 1 ? '已上架' : '已下架')
    tableRef.value?.reload()
  } catch {
    // 失败提示由请求层统一弹出
  }
}

/**
 * 删除菜谱：二次确认 → 调接口 → 刷新表格
 * @param {object} row 当前行数据
 */
async function handleDelete(row) {
  const confirmed = await ElMessageBox.confirm(
    `确定删除菜谱「${row.title}」吗？删除后不可恢复。`,
    '删除确认',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  try {
    await deleteRecipe(row.id)
    ElMessage.success('删除成功')
    tableRef.value?.reload()
  } catch {
    // 失败提示由请求层统一弹出
  }
}
</script>

<template>
  <!-- 页面容器：右上角放新增按钮 -->
  <PageContainer title="菜谱管理">
    <template #extra>
      <el-button type="primary" @click="goCreate">新增菜谱</el-button>
    </template>

    <!-- 搜索：配置化表单（实时查询，不显示"查询"按钮） -->
    <SearchForm v-model="filters" :fields="filterFields" :show-search="false" />

    <!-- 表格：配置化 ProTable -->
    <ProTable
      ref="tableRef"
      :columns="columns"
      :api="getRecipeList"
      :params="filters"
      empty-text="暂无菜谱"
    >
      <!-- 封面列：有图显示图，无图显示菜名首字占位 -->
      <template #cover="{ row }">
        <div class="admin-recipes__cover">
          <img v-if="row.cover" :src="row.cover" :alt="row.title" />
          <span v-else>{{ row.title?.slice(0, 1) }}</span>
        </div>
      </template>

      <!-- 难度列 -->
      <template #difficulty="{ row }">
        <el-tag :type="difficultyType(row.difficulty)" size="small" effect="plain">
          {{ difficultyText(row.difficulty) }}
        </el-tag>
      </template>

      <!-- 状态列 -->
      <template #status="{ row }">
        <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
          {{ row.status === 1 ? '已上架' : '已下架' }}
        </el-tag>
      </template>

      <!-- 操作列：编辑 / 上下架 / 删除 -->
      <template #actions="{ row }">
        <el-button link type="primary" @click="goEdit(row)">编辑</el-button>
        <el-button
          link
          :type="row.status === 1 ? 'warning' : 'success'"
          @click="handleToggleStatus(row)"
        >
          {{ row.status === 1 ? '下架' : '上架' }}
        </el-button>
        <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
      </template>
    </ProTable>
  </PageContainer>
</template>

<style scoped lang="scss">
// 封面缩略图：固定小尺寸，无图时用主色浅底 + 菜名首字
.admin-recipes__cover {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 42px;
  overflow: hidden;
  font-size: $font-size-md;
  font-weight: 600;
  color: $color-primary-dark;
  background-color: rgba($color-primary, 0.12);
  border-radius: $radius-sm;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}
</style>
