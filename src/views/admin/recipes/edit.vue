<!--
  管理端 · 新增 / 编辑菜谱（S5）
  - 表单校验（必填拦截）+ 营养信息
  - 食材动态行（食材 / 用量 / 单位 / 可选 / 删除）、步骤动态列表（上移 / 下移 / 删除）
  - 封面：复用 UploadImage（本地预览），保存时把 File 转成 dataURL 存进 mock（无真实上传）
-->
<script setup>
// 组件显式命名：文件按开发文档交付物叫 edit.vue，组件名用多单词避免 lint 警告
defineOptions({ name: 'RecipeEditPage' })

import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { getCategories, getIngredients } from '@/api/dict'
import { createRecipe, getRecipeDetail, updateRecipe } from '@/api/recipe'
import PageContainer from '@/components/PageContainer.vue'
import UploadImage from '@/components/UploadImage.vue'
import { DIFFICULTY, METHODS, UNITS } from '@/utils/constants'

const route = useRoute()
const router = useRouter()

// 路由里有 id = 编辑模式；没有 id = 新增模式
const recipeId = computed(() => route.params.id)
const isEdit = computed(() => Boolean(recipeId.value))

// 表单实例 + 加载态 + 提交中状态
const formRef = ref(null)
const loading = ref(false)
const submitting = ref(false)

// 表单数据：新增时的默认值
const form = reactive({
  title: '',
  cover: '',
  categoryId: '',
  method: '',
  difficulty: '',
  description: '',
  timeMin: 20,
  baseServings: 2,
  calories: 0,
  protein: 0,
  fat: 0,
  carb: 0,
  fiber: 0,
  sodium: 0,
  // 食材动态行：每行 = 一条 recipe_ingredient
  ingredients: [{ ingredientId: '', amount: 100, unit: 'g', optional: false }],
  // 步骤动态列表：每行 = 一步
  steps: [{ content: '', durationMin: 3 }],
})

// 字典下拉数据
const ingredientOptions = ref([])
const categoryOptions = ref([])
const methodOptions = METHODS.map((name) => ({ label: name, value: name }))
const difficultyOptions = DIFFICULTY.map((name, index) => ({ label: name, value: index + 1 }))
const unitOptions = UNITS.map((unit) => ({ label: unit, value: unit }))

// 表单校验规则：只校验顶层必填项；食材/步骤这类动态行在提交时手动校验（规则不好覆盖数组下标变化）
const rules = {
  title: [{ required: true, message: '请输入菜谱名称', trigger: 'blur' }],
  categoryId: [{ required: true, message: '请选择分类', trigger: 'change' }],
  method: [{ required: true, message: '请选择烹饪方式', trigger: 'change' }],
  difficulty: [{ required: true, message: '请选择难度', trigger: 'change' }],
  timeMin: [{ required: true, message: '请输入耗时', trigger: 'blur' }],
  baseServings: [{ required: true, message: '请输入份数', trigger: 'blur' }],
  calories: [{ required: true, message: '请输入热量', trigger: 'blur' }],
}

/**
 * 把 UploadImage 回传的 File 转成 dataURL。
 * 为什么：mock 阶段没有真实上传接口，用 dataURL 存进内存数据，保存后编辑页仍能回显。
 * @param {File} file 本地选择的图片文件
 * @returns {Promise<string>} dataURL 字符串
 */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** 编辑模式：把详情数据回填到表单（食材/步骤映射成动态行格式） */
async function loadRecipeDetail() {
  const detail = await getRecipeDetail(recipeId.value)
  Object.assign(form, {
    title: detail.title,
    cover: detail.cover || '',
    categoryId: detail.categoryId,
    method: detail.method,
    difficulty: detail.difficulty,
    description: detail.description,
    timeMin: detail.timeMin,
    baseServings: detail.baseServings,
    calories: detail.calories,
    protein: detail.protein,
    fat: detail.fat,
    carb: detail.carb,
    fiber: detail.fiber,
    sodium: detail.sodium,
    ingredients: detail.ingredients.map((row) => ({
      ingredientId: row.ingredientId,
      amount: row.amount,
      unit: row.unit,
      optional: row.optional,
    })),
    steps: detail.steps.map((step) => ({
      content: step.content,
      durationMin: step.durationMin,
    })),
  })
}

// 首次进入：先加载字典（分类/食材），编辑模式再拉详情
onMounted(async () => {
  loading.value = true
  try {
    const [categories, ingredients] = await Promise.all([
      getCategories({ type: 'ingredient' }),
      getIngredients(),
    ])
    categoryOptions.value = categories.map((item) => ({ label: item.name, value: item.id }))
    ingredientOptions.value = ingredients.map((item) => ({ label: item.name, value: item.id }))
    if (isEdit.value) await loadRecipeDetail()
  } catch {
    // 错误提示由请求层统一弹出
  } finally {
    loading.value = false
  }
})

/** 添加一行食材 */
function addIngredient() {
  form.ingredients.push({ ingredientId: '', amount: 100, unit: 'g', optional: false })
}

/**
 * 删除一行食材（至少保留一行）
 * @param {number} index 行下标
 */
function removeIngredient(index) {
  if (form.ingredients.length === 1) {
    ElMessage.warning('至少保留一条食材')
    return
  }
  form.ingredients.splice(index, 1)
}

/** 添加一个步骤 */
function addStep() {
  form.steps.push({ content: '', durationMin: 3 })
}

/**
 * 删除一个步骤（至少保留一步）
 * @param {number} index 步骤下标
 */
function removeStep(index) {
  if (form.steps.length === 1) {
    ElMessage.warning('至少保留一个步骤')
    return
  }
  form.steps.splice(index, 1)
}

/**
 * 上移 / 下移步骤
 * @param {number} index 当前步骤下标
 * @param {number} offset -1=上移，1=下移
 */
function moveStep(index, offset) {
  const target = index + offset
  if (target < 0 || target >= form.steps.length) return
  const [step] = form.steps.splice(index, 1)
  form.steps.splice(target, 0, step)
}

/**
 * 提交保存：表单校验 → 动态行校验 → 封面转换 → 调新增/更新接口 → 回列表
 * 副作用：写 mock 内存数据、跳转列表页
 */
async function handleSubmit() {
  // 1. 顶层字段校验（必填未填时阻止提交并展示错误）
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  // 2. 食材/步骤动态行校验
  const invalidIngredient = form.ingredients.some(
    (row) => !row.ingredientId || !(Number(row.amount) > 0),
  )
  if (invalidIngredient) {
    ElMessage.error('请完善食材信息（食材与用量必填）')
    return
  }
  const invalidStep = form.steps.some((step) => !String(step.content).trim())
  if (invalidStep) {
    ElMessage.error('请填写完整的步骤内容')
    return
  }

  submitting.value = true
  try {
    // 3. 封面：新选择的 File 转 dataURL；已有地址字符串直接使用
    const cover = form.cover instanceof File ? await fileToDataUrl(form.cover) : form.cover
    const payload = {
      ...form,
      cover,
      ingredients: form.ingredients.map((row) => ({ ...row })),
      steps: form.steps.map((step, index) => ({
        content: step.content.trim(),
        durationMin: step.durationMin ?? 0,
        order: index + 1,
      })),
    }

    // 4. 按模式调用新增 / 更新接口
    if (isEdit.value) await updateRecipe(recipeId.value, payload)
    else await createRecipe(payload)

    ElMessage.success(isEdit.value ? '保存成功' : '新增成功')
    router.push('/admin/recipes')
  } catch {
    // 失败提示由请求层统一弹出
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <!-- 页面容器：右上角放保存 / 返回 -->
  <PageContainer :title="isEdit ? '编辑菜谱' : '新增菜谱'">
    <template #extra>
      <el-button @click="router.push('/admin/recipes')">返回列表</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
    </template>

    <!-- 表单：加载字典/详情时显示 loading 遮罩 -->
    <el-form
      ref="formRef"
      v-loading="loading"
      :model="form"
      :rules="rules"
      label-width="96px"
      class="recipe-edit"
    >
      <!-- 顶部：基础信息 + 封面上传 -->
      <div class="recipe-edit__top">
        <div class="recipe-edit__basic">
          <el-form-item label="菜谱名称" prop="title">
            <el-input
              v-model="form.title"
              placeholder="请输入菜谱名称"
              maxlength="30"
              show-word-limit
            />
          </el-form-item>
          <el-form-item label="分类" prop="categoryId">
            <el-select
              v-model="form.categoryId"
              placeholder="请选择分类"
              class="recipe-edit__field"
            >
              <el-option
                v-for="item in categoryOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="烹饪方式" prop="method">
            <el-select
              v-model="form.method"
              placeholder="请选择烹饪方式"
              class="recipe-edit__field"
            >
              <el-option
                v-for="item in methodOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="难度" prop="difficulty">
            <el-select
              v-model="form.difficulty"
              placeholder="请选择难度"
              class="recipe-edit__field"
            >
              <el-option
                v-for="item in difficultyOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="耗时(分钟)" prop="timeMin">
            <el-input-number v-model="form.timeMin" :min="1" :max="600" />
          </el-form-item>
          <el-form-item label="份数" prop="baseServings">
            <el-input-number v-model="form.baseServings" :min="1" :max="10" />
          </el-form-item>
          <el-form-item label="简介">
            <el-input
              v-model="form.description"
              type="textarea"
              :rows="2"
              maxlength="80"
              show-word-limit
              placeholder="一句话介绍这道菜"
            />
          </el-form-item>
        </div>

        <!-- 封面：复用 UploadImage（本地预览） -->
        <div class="recipe-edit__cover">
          <p class="recipe-edit__cover-label">封面图</p>
          <UploadImage v-model="form.cover" />
        </div>
      </div>

      <!-- 营养信息（每份） -->
      <el-divider content-position="left">营养信息（每份）</el-divider>
      <div class="recipe-edit__nutrition">
        <el-form-item label="热量(kcal)" prop="calories">
          <el-input-number v-model="form.calories" :min="0" :max="5000" />
        </el-form-item>
        <el-form-item label="蛋白质(g)">
          <el-input-number v-model="form.protein" :min="0" :max="500" />
        </el-form-item>
        <el-form-item label="脂肪(g)">
          <el-input-number v-model="form.fat" :min="0" :max="500" />
        </el-form-item>
        <el-form-item label="碳水(g)">
          <el-input-number v-model="form.carb" :min="0" :max="500" />
        </el-form-item>
        <el-form-item label="纤维(g)">
          <el-input-number v-model="form.fiber" :min="0" :max="100" />
        </el-form-item>
        <el-form-item label="钠(mg)">
          <el-input-number v-model="form.sodium" :min="0" :max="10000" />
        </el-form-item>
      </div>

      <!-- 食材动态行 -->
      <el-divider content-position="left">食材清单</el-divider>
      <div class="recipe-edit__rows">
        <div
          v-for="(row, index) in form.ingredients"
          :key="`ingredient-${index}`"
          class="recipe-edit__row"
        >
          <el-select
            v-model="row.ingredientId"
            class="recipe-edit__ingredient"
            placeholder="选择食材"
            filterable
          >
            <el-option
              v-for="item in ingredientOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <el-input-number
            v-model="row.amount"
            class="recipe-edit__amount"
            :min="1"
            :max="100000"
            controls-position="right"
          />
          <el-select v-model="row.unit" class="recipe-edit__unit">
            <el-option
              v-for="item in unitOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <el-checkbox v-model="row.optional">可选</el-checkbox>
          <el-button link type="danger" @click="removeIngredient(index)">删除</el-button>
        </div>
        <el-button plain class="recipe-edit__add" @click="addIngredient">+ 添加食材</el-button>
      </div>

      <!-- 步骤动态列表：支持上移 / 下移 / 删除 -->
      <el-divider content-position="left">烹饪步骤</el-divider>
      <div class="recipe-edit__steps">
        <div v-for="(step, index) in form.steps" :key="`step-${index}`" class="recipe-edit__step">
          <span class="recipe-edit__step-order">{{ index + 1 }}</span>
          <el-input
            v-model="step.content"
            type="textarea"
            :rows="2"
            class="recipe-edit__step-content"
            placeholder="请输入步骤内容"
          />
          <el-input-number
            v-model="step.durationMin"
            class="recipe-edit__step-duration"
            :min="0"
            :max="600"
            controls-position="right"
          />
          <span class="recipe-edit__step-unit">分钟</span>
          <el-button link :disabled="index === 0" @click="moveStep(index, -1)">上移</el-button>
          <el-button link :disabled="index === form.steps.length - 1" @click="moveStep(index, 1)">
            下移
          </el-button>
          <el-button link type="danger" @click="removeStep(index)">删除</el-button>
        </div>
        <el-button plain class="recipe-edit__add" @click="addStep">+ 添加步骤</el-button>
      </div>
    </el-form>
  </PageContainer>
</template>

<style scoped lang="scss">
// 顶部区域：左侧基础信息 + 右侧封面
.recipe-edit__top {
  display: flex;
  gap: $spacing-xl;
}

// 基础信息：占满剩余宽度
.recipe-edit__basic {
  flex: 1;
  min-width: 0;
}

// 下拉框占满表单项宽度
.recipe-edit__field {
  width: 100%;
}

// 封面区：固定宽度
.recipe-edit__cover {
  flex-shrink: 0;
  width: 220px;
}

// 封面区标签
.recipe-edit__cover-label {
  margin-bottom: $spacing-sm;
  font-size: $font-size-base;
  color: $text-regular;
}

// 营养信息：两列网格排布
.recipe-edit__nutrition {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 $spacing-lg;
}

// 动态行容器
.recipe-edit__rows,
.recipe-edit__steps {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}

// 一条食材行：横向排列
.recipe-edit__row {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-sm $spacing-md;
  background-color: $bg-page;
  border-radius: $radius-sm;
}

// 食材下拉宽度
.recipe-edit__ingredient {
  width: 200px;
}

// 用量输入宽度
.recipe-edit__amount {
  width: 130px;
}

// 单位下拉宽度
.recipe-edit__unit {
  width: 90px;
}

// 一条步骤：序号 + 内容 + 时长 + 操作
.recipe-edit__step {
  display: flex;
  align-items: flex-start;
  gap: $spacing-sm;
  padding: $spacing-sm $spacing-md;
  background-color: $bg-page;
  border-radius: $radius-sm;
}

// 步骤序号：圆形徽标
.recipe-edit__step-order {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-top: 6px;
  font-size: $font-size-sm;
  color: $bg-white;
  background-color: $color-primary;
  border-radius: 50%;
}

// 步骤内容：占满剩余宽度
.recipe-edit__step-content {
  flex: 1;
}

// 步骤时长输入
.recipe-edit__step-duration {
  width: 110px;
}

// 分钟单位文字
.recipe-edit__step-unit {
  margin-top: 6px;
  font-size: $font-size-sm;
  color: $text-secondary;
}

// 添加行按钮：左对齐、宽度自适应
.recipe-edit__add {
  align-self: flex-start;
}
</style>
