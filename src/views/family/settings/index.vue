<!--
  家庭设置页（S9）
  - 基础设置：家庭成员数、周预算（元，提交时转成分）
  - 饮食偏好：忌口食材、常备调料（多选 + 可输入别名；采购聚合时按名称/别名归一）
  - 保存后：工作台预算卡、统计预算线立即生效；采购清单需要重新生成才生效
-->
<script setup>
import { computed, onMounted, reactive, ref } from 'vue'

import { getIngredients } from '@/api/dict'
import { getFamily, updateFamily } from '@/api/family'
import PageContainer from '@/components/PageContainer.vue'

// 页面加载 / 保存状态：分别控制骨架屏与按钮 loading
const loading = ref(false)
const saving = ref(false)

// 表单数据：weekBudgetYuan 是「元」展示值，提交时 ×100 转成分存后端
const form = reactive({
  memberCount: 3,
  weekBudgetYuan: 400,
  preferences: [],
  defaultPantry: [],
})

// 食材字典名称：忌口 / 常备调料多选的选项来源
const ingredientNames = ref([])

// 下拉选项：食材名称 + 当前已选值（兼容 DEFAULT_PANTRY 里的「油/盐/糖」等别名，保证标签能正常回显）
const ingredientOptions = computed(() => [
  ...new Set([...ingredientNames.value, ...form.preferences, ...form.defaultPantry]),
])

const formRef = ref(null)

// 表单校验规则：成员数与周预算必填
const rules = {
  memberCount: [{ required: true, message: '请填写家庭成员数', trigger: 'change' }],
  weekBudgetYuan: [{ required: true, message: '请填写周预算', trigger: 'change' }],
}

/**
 * 加载家庭设置与食材字典
 * 副作用：更新 loading / form / ingredientNames
 */
async function loadSettings() {
  loading.value = true
  try {
    const [family, ingredientList] = await Promise.all([getFamily(), getIngredients()])
    // 元展示：分 / 100（40000 分 → 400 元）
    form.memberCount = family.memberCount
    form.weekBudgetYuan = family.weekBudgetFen / 100
    // 复制一份数组，避免直接改到接口返回对象
    form.preferences = [...family.preferences]
    form.defaultPantry = [...family.defaultPantry]
    ingredientNames.value = ingredientList.map((item) => item.name)
  } finally {
    loading.value = false
  }
}

onMounted(loadSettings)

/**
 * 保存设置
 * 副作用：调 PUT /family 成功后提示；预算/偏好立即被工作台、统计与后续采购生成读取
 */
async function handleSave() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    await updateFamily({
      memberCount: form.memberCount,
      // 元 → 分：四舍五入成整数分，避免 0.1 元这类小数误差
      weekBudgetFen: Math.round(Number(form.weekBudgetYuan || 0) * 100),
      preferences: form.preferences,
      defaultPantry: form.defaultPantry,
    })
    ElMessage.success('家庭设置已保存')
  } catch {
    // 失败提示由请求层统一弹出
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <PageContainer title="家庭设置">
    <!-- 右上角：保存按钮（表单在下方，也方便不用滚到底部就能保存） -->
    <template #extra>
      <el-button type="primary" :loading="saving" @click="handleSave">保存设置</el-button>
    </template>

    <!-- 加载中：骨架屏占位，避免表单先闪后填充 -->
    <el-skeleton v-if="loading" animated :rows="5" />

    <!-- 设置表单 -->
    <el-form
      v-else
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="110px"
      class="settings__form"
    >
      <!-- 基础设置：成员数（后续 S10 智能配菜份量参考） -->
      <el-form-item label="家庭成员数" prop="memberCount">
        <el-input-number v-model="form.memberCount" :min="1" :max="10" />
        <span class="settings__hint">1-10 人，后续智能配菜会按人数估算份量</span>
      </el-form-item>

      <!-- 基础设置：周预算（元） -->
      <el-form-item label="周预算" prop="weekBudgetYuan">
        <el-input-number
          v-model="form.weekBudgetYuan"
          :min="0"
          :max="100000"
          :precision="2"
          :step="10"
        />
        <span class="settings__unit">元 / 周</span>
        <span class="settings__hint">显示在工作台预算卡与统计支出趋势的预算线上</span>
      </el-form-item>

      <!-- 忌口：多选 + 可输入别名（例如输入「虾」，聚合时会按别名归一到基围虾） -->
      <el-form-item label="忌口食材" prop="preferences">
        <el-select
          v-model="form.preferences"
          multiple
          filterable
          allow-create
          default-first-option
          collapse-tags
          collapse-tags-tooltip
          placeholder="选择或输入忌口食材（如：虾）"
          class="settings__select"
        >
          <el-option v-for="name in ingredientOptions" :key="name" :label="name" :value="name" />
        </el-select>
        <p class="settings__help">
          生成采购清单时会过滤掉忌口食材；支持输入别名（如「虾」= 基围虾，聚合时自动归一）
        </p>
      </el-form-item>

      <!-- 常备调料：默认已带 DEFAULT_PANTRY，不写进采购清单 -->
      <el-form-item label="常备调料" prop="defaultPantry">
        <el-select
          v-model="form.defaultPantry"
          multiple
          filterable
          allow-create
          default-first-option
          collapse-tags
          collapse-tags-tooltip
          placeholder="默认不写进采购清单的调料"
          class="settings__select"
        >
          <el-option v-for="name in ingredientOptions" :key="name" :label="name" :value="name" />
        </el-select>
        <p class="settings__help">
          默认已包含油 / 盐 / 糖 / 生抽等；这些调料不会出现在采购清单里，避免清单被调料占满
        </p>
      </el-form-item>

      <!-- 生效时机提醒：已确认的采购清单锁定，不会因为改设置自动变化 -->
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="修改忌口 / 常备调料后，已确认的采购清单不会自动变化；重新生成采购清单后生效。"
      />
    </el-form>
  </PageContainer>
</template>

<style scoped lang="scss">
// 设置表单：限制最大宽度，避免在宽屏上输入框被拉得过长
.settings__form {
  max-width: 760px;
}

// 多选下拉：占满一行宽度
.settings__select {
  width: 100%;
}

// 单位：跟在输入框右侧
.settings__unit {
  margin-left: $spacing-sm;
  font-size: $font-size-base;
  color: $text-regular;
}

// 字段说明：小字弱化，跟在控件右侧
.settings__hint {
  margin-left: $spacing-md;
  font-size: $font-size-xs;
  color: $text-secondary;
}

// 字段帮助文案：单独占一行
.settings__help {
  width: 100%;
  margin-top: $spacing-xs;
  font-size: $font-size-xs;
  line-height: 1.5;
  color: $text-secondary;
}
</style>
