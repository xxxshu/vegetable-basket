<!--
  配置化表格（S5）：columns + api + params 驱动，内置分页 / loading / 空态。
  通用性约定：本组件不允许出现任何菜谱等业务字段；业务自定义列用「同名插槽」渲染。
  用法：
  <ProTable ref="tableRef" :columns="columns" :api="getRecipeList" :params="filters">
    <template #actions="{ row }"> ... </template>
  </ProTable>
-->
<script setup>
import { watch } from 'vue'

import EmptyState from '@/components/EmptyState.vue'
import { useTable } from '@/composables/useTable'

const props = defineProps({
  // 列配置：{ prop, label, width?, minWidth?, slot? }；配置 slot 时用同名插槽渲染该列
  columns: { type: Array, required: true },
  // 列表接口：params => Promise<{ list, total }>
  api: { type: Function, required: true },
  // 查询条件（不含分页）：变化时自动回到第 1 页并重新请求
  params: { type: Object, default: () => ({}) },
  // 行唯一键
  rowKey: { type: String, default: 'id' },
  // 空态文案
  emptyText: { type: String, default: '暂无数据' },
  // 行样式类名：支持字符串或 el-table 的 ({ row, rowIndex }) 函数，用于整行高亮（如临期库存）
  rowClassName: { type: [String, Function], default: '' },
})

// 表格状态：分页/加载/列表数据统一由 useTable 管理
const { loading, list, total, params: tableParams, getList } = useTable(props.api)

// 查询条件变化 → 合并进分页参数、回到第 1 页重新请求
// immediate 保证首次进入页面就加载第一页
watch(
  () => props.params,
  (value) => {
    Object.assign(tableParams, value, { page: 1 })
    getList()
  },
  { deep: true, immediate: true },
)

/** 翻页：页码由 v-model 更新，这里只负责请求 */
function handlePageChange() {
  getList()
}

/** 修改每页条数：回到第 1 页重新请求 */
function handleSizeChange() {
  tableParams.page = 1
  getList()
}

// 暴露 reload 给父组件：增删改之后调用 tableRef.value.reload() 刷新当前页
defineExpose({ reload: getList })
</script>

<template>
  <div class="pro-table">
    <!-- 表格：loading 遮罩 + 空态插槽 + 自定义列插槽 -->
    <el-table
      v-loading="loading"
      :data="list"
      :row-key="rowKey"
      :row-class-name="rowClassName"
      class="pro-table__table"
    >
      <!-- 按列配置渲染：配置了 slot 的列交给父组件同名插槽 -->
      <el-table-column
        v-for="column in columns"
        :key="column.prop || column.slot || column.label"
        :prop="column.prop"
        :label="column.label"
        :width="column.width"
        :min-width="column.minWidth"
      >
        <template v-if="column.slot" #default="scope">
          <slot :name="column.slot" v-bind="scope" />
        </template>
      </el-table-column>

      <!-- 空态：复用通用空态组件 -->
      <template #empty>
        <EmptyState :description="emptyText" />
      </template>
    </el-table>

    <!-- 分页：总数 / 每页条数 / 上下页 -->
    <div class="pro-table__pagination">
      <el-pagination
        v-model:current-page="tableParams.page"
        v-model:page-size="tableParams.pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="handlePageChange"
        @size-change="handleSizeChange"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
// 表格容器：纵向排列
.pro-table {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

// 分页：右对齐（后台列表常见布局）
.pro-table__pagination {
  display: flex;
  justify-content: flex-end;
}
</style>
