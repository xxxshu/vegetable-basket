<!--
  采购清单 + 核算清单（S7 重构）：
  - 第一步「采购清单」：按一周计划聚合出食材与建议分量（库存抵扣后的建议值，可自由改）、可删/手动加，
    满意后点「确认清单」锁定；支持复制清单文本、导出 PDF。
  - 第二步「核算清单」：确认清单后自动带出食材/分量/预估金额，采购回来逐项改实际分量与金额、可删/手动加，
    点「确认核算」后锁定并写入一条支出记录。
  - 底部合计栏固定定位在视口底部，清单再长也不用滚到底。
  - 导出 PDF：离屏打印区域 → html2canvas → jsPDF（依赖按需动态加载）。
-->
<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { getCategories, getIngredients } from '@/api/dict'
import { getFamily } from '@/api/family'
import { getPantry } from '@/api/pantry'
import { getPlan } from '@/api/plan'
import { getRecipeDetail } from '@/api/recipe'
import EmptyState from '@/components/EmptyState.vue'
import PageContainer from '@/components/PageContainer.vue'
import { useShoppingStore } from '@/stores'
import { aggregateShoppingList } from '@/utils/aggregate'
import { UNITS } from '@/utils/constants'
import { addDays, formatWeekRange, getWeekStart } from '@/utils/date'
import { exportElementToPdf } from '@/utils/exportPdf'
import { formatMoney } from '@/utils/format'

const router = useRouter()
const route = useRoute()
const shoppingStore = useShoppingStore()

// 当前 Tab：purchase=采购清单，account=核算清单
const activeTab = ref('purchase')

// 当前查看的周（周一日期）与展示文案
const weekStart = ref(getWeekStart(new Date()))
const rangeText = computed(() => formatWeekRange(weekStart.value))
const isCurrentWeek = computed(() => weekStart.value === getWeekStart(new Date()))

// 前端预览相关：本周计划条数、加载态、聚合输入、聚合结果（computed 实时预览）
const planItemCount = ref(0)
const previewLoading = ref(false)
const previewInput = ref(null)
const preview = computed(() =>
  previewInput.value ? aggregateShoppingList(previewInput.value) : null,
)

// 采购清单 / 核算清单（store 里的 ref，模板直接使用）
const purchaseList = computed(() => shoppingStore.purchaseList)
const account = computed(() => shoppingStore.account)
const isPurchaseConfirmed = computed(() => shoppingStore.isPurchaseConfirmed)
const isAccountDone = computed(() => shoppingStore.isAccountDone)

// 是否显示底部固定栏（采购 Tab 有清单 / 核算 Tab 有核算单时才显示）
const hasFooter = computed(() =>
  activeTab.value === 'purchase' ? Boolean(purchaseList.value) : Boolean(account.value),
)

// 手动添加弹窗：mode 区分加在采购清单还是核算清单
const manualDialog = reactive({
  visible: false,
  mode: 'purchase',
  submitting: false,
  form: { ingredientId: '', amount: 500, unit: 'g', note: '' },
})
const ingredientOptions = ref([])
const unitOptions = UNITS.map((unit) => ({ label: unit, value: unit }))
// 选中食材后自动带出它的基准单位（如牛奶=ml、番茄=g），减少手动选单位的出错
watch(
  () => manualDialog.form.ingredientId,
  (ingredientId) => {
    const ingredient = ingredientOptions.value.find((item) => item.value === ingredientId)
    if (ingredient) manualDialog.form.unit = ingredient.unitBase
  },
)

// 导出 PDF 状态与离屏打印区域
const exporting = ref(false)
const printRef = ref(null)

// 预览清单弹窗：草稿状态下先完整预览（可滚动），再决定「再改改」或「确认清单」
const previewVisible = ref(false)
const confirming = ref(false)

/** 打开预览清单弹窗 */
function openPreviewDialog() {
  previewVisible.value = true
}

/** 预览弹窗点「再改改」：关闭弹窗回到编辑 */
function handlePreviewEdit() {
  previewVisible.value = false
}

/**
 * 拉取并组装「前端聚合」所需的输入数据：
 * 计划项 → 菜谱配方（详情接口）→ 食材字典 / 品类 / 库存
 * 副作用：更新 planItemCount / previewInput / previewLoading
 */
async function loadPreview() {
  previewLoading.value = true
  previewInput.value = null
  planItemCount.value = 0
  try {
    const plan = await getPlan({ weekStart: weekStart.value })
    planItemCount.value = plan.items.length
    if (plan.items.length === 0) return

    // 字典、库存、家庭设置并行请求：库存用于抵扣，家庭设置提供忌口与常备调料
    const [ingredientList, categoryList, stockList, familySetting] = await Promise.all([
      getIngredients(),
      getCategories({ type: 'ingredient' }),
      getPantry(),
      getFamily(),
    ])

    // 计划里涉及的菜谱去重后批量拿详情（详情里有配方行）
    const recipeIds = [...new Set(plan.items.map((item) => item.recipeId))]
    const detailResults = await Promise.allSettled(recipeIds.map((id) => getRecipeDetail(id)))
    const recipeMap = {}
    detailResults.forEach((result, index) => {
      if (result.status !== 'fulfilled') return
      const detail = result.value
      recipeMap[recipeIds[index]] = {
        baseServings: detail.baseServings,
        ingredients: detail.ingredients.map((row) => ({
          ingredientId: row.ingredientId,
          amount: row.amount,
          unit: row.unit,
        })),
      }
    })

    // 食材字典转成 id → 食材 的 Map（聚合引擎要求）
    const ingredientMap = {}
    ingredientList.forEach((ingredient) => {
      ingredientMap[ingredient.id] = {
        id: ingredient.id,
        name: ingredient.name,
        aliases: ingredient.aliases,
        unitBase: ingredient.unitBase,
        pricePerUnit: ingredient.pricePerUnit,
        categoryId: ingredient.categoryId,
      }
    })

    previewInput.value = {
      weekItems: plan.items.map((item) => ({
        recipeId: item.recipeId,
        servings: item.servings,
      })),
      recipeMap,
      ingredientMap,
      categories: categoryList.map((item) => ({ id: item.id, name: item.name })),
      // 常备调料 / 忌口来自家庭设置（S9）：与 mock 后端生成清单时读取的是同一份设置
      defaultPantry: familySetting.defaultPantry,
      stock: stockList.map((row) => ({
        ingredientId: row.ingredientId,
        amount: row.amount,
        unit: row.unit,
      })),
      preferences: familySetting.preferences,
    }
  } catch {
    // 预览失败不阻塞清单展示，只是没有预览数据
    previewInput.value = null
  } finally {
    previewLoading.value = false
  }
}

/** 同时刷新前端预览、采购清单与核算清单 */
async function loadAll() {
  await Promise.all([loadPreview(), shoppingStore.fetchAll(weekStart.value)])
}

// 周切换：回到采购清单 Tab 并重新加载
watch(weekStart, () => {
  activeTab.value = 'purchase'
  loadAll()
})

// 切到核算 Tab 时：若采购清单已确认但核算清单还没生成，自动带出核算草稿
watch(activeTab, async (tab) => {
  if (tab !== 'account') return
  if (shoppingStore.isPurchaseConfirmed && !shoppingStore.account) await ensureAccount()
})

// 首次进入：加载数据 + 手动添加的食材选项 + 处理从一周计划页跳转的自动生成
onMounted(async () => {
  await loadAll()
  try {
    const ingredientList = await getIngredients()
    ingredientOptions.value = ingredientList.map((item) => ({
      label: item.name,
      value: item.id,
      unitBase: item.unitBase,
    }))
  } catch {
    ingredientOptions.value = []
  }
  if (route.query.generate === '1') {
    if (planItemCount.value > 0 && !shoppingStore.purchaseList) await handleGenerate()
    router.replace({ path: '/shopping' })
  }
})

/** 切换上一周 / 下一周 */
function changeWeek(offset) {
  weekStart.value = addDays(weekStart.value, offset * 7)
}

/** 回到本周 */
function goCurrentWeek() {
  weekStart.value = getWeekStart(new Date())
}

/** 去一周计划页排菜 */
function goPlan() {
  router.push('/plan')
}

/** 确保核算清单存在（已确认采购清单时自动生成草稿） */
async function ensureAccount() {
  if (!shoppingStore.isPurchaseConfirmed || shoppingStore.account) return
  try {
    await shoppingStore.createAccount()
  } catch {
    // 失败提示由请求层统一弹出
  }
}

/** 切到核算 Tab（未生成时自动生成） */
async function goAccount() {
  activeTab.value = 'account'
  await ensureAccount()
}

/**
 * 前端预览与后端生成结果对照（开发期一致性校验）
 * @param {object} serverList 生成接口返回的清单
 */
function comparePreviewWithServer(serverList) {
  if (!preview.value || !serverList?.summary) return
  const front = preview.value.summary
  const server = serverList.summary
  const isConsistent =
    front.itemCount === server.itemCount &&
    front.estAmountFen === server.estAmountFen &&
    front.groupCount === server.groupCount
  if (isConsistent) {
    console.info('[采购清单] 前端预览与后端生成结果一致：', front)
  } else {
    console.warn('[采购清单] 前后端聚合结果不一致：', { front, server })
  }
}

/** 生成 / 重新生成清单：调接口 → 与前端预览对照 → 提示 */
async function handleGenerate() {
  if (planItemCount.value === 0) {
    ElMessage.warning('本周还没有排餐，请先去一周计划页安排')
    return
  }
  try {
    const generated = await shoppingStore.generate(weekStart.value)
    comparePreviewWithServer(generated)
    activeTab.value = 'purchase'
    ElMessage.success('已生成本周采购清单')
  } catch {
    // 失败提示由请求层统一弹出
  }
}

/**
 * 修改采购项分量（表单改的是本地展示值，接口按后端重算的金额/展示刷新；失败回滚旧值）
 * @param {object} item 采购项
 * @param {number} value 新分量
 * @param {number} oldValue 修改前的分量
 */
async function handlePurchaseAmountChange(item, value, oldValue) {
  const amount = Math.round(Number(value) || 0)
  if (amount <= 0) {
    item.amount = oldValue
    ElMessage.warning('分量必须大于 0')
    return
  }
  try {
    await shoppingStore.updatePurchaseAmount(item, amount)
  } catch {
    item.amount = oldValue
  }
}

/** 删除采购项（二次确认） */
async function handleRemovePurchaseItem(item) {
  const confirmed = await ElMessageBox.confirm(
    `确定从采购清单删除「${item.name}」吗？`,
    '删除提示',
    {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return
  try {
    await shoppingStore.removePurchaseItem(item)
    ElMessage.success('已删除')
  } catch {
    // 失败提示由请求层统一弹出
  }
}

/** 预览弹窗里点「确认清单」：锁定清单（弹窗本身就是确认步骤，不再叠加二次确认框） */
async function handleConfirmPurchase() {
  if (!shoppingStore.purchaseItemCount) {
    ElMessage.warning('采购清单为空，不能确认')
    return
  }
  confirming.value = true
  try {
    await shoppingStore.confirmPurchase()
    previewVisible.value = false
    ElMessage.success('采购清单已确认，现在可以复制清单、导出 PDF 或去核算')
  } catch {
    // 失败提示由请求层统一弹出
  } finally {
    confirming.value = false
  }
}

/**
 * 修改核算项实际分量（失败回滚）
 * @param {object} item 核算项
 * @param {number} oldValue 修改前分量
 */
async function handleAccountAmountChange(item, oldValue) {
  const amount = Math.round(Number(item.amount) || 0)
  if (amount <= 0) {
    item.amount = oldValue
    ElMessage.warning('分量必须大于 0')
    return
  }
  try {
    await shoppingStore.updateAccountAmount(item, amount)
  } catch {
    item.amount = oldValue
  }
}

/**
 * 修改核算项金额（页面输入元，接口/存储用分；四舍五入避免浮点误差）
 * @param {object} item 核算项
 * @param {number} yuan 输入金额（元）
 */
async function handleAccountPriceChange(item, yuan) {
  const priceFen = Math.round((Number(yuan) || 0) * 100)
  try {
    await shoppingStore.updateAccountPrice(item, priceFen)
  } catch {
    // 失败提示由请求层统一弹出
  }
}

/** 删除核算项（二次确认） */
async function handleRemoveAccountItem(item) {
  const confirmed = await ElMessageBox.confirm(
    `确定从核算清单删除「${item.name}」吗？`,
    '删除提示',
    {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return
  try {
    await shoppingStore.removeAccountItem(item)
    ElMessage.success('已删除')
  } catch {
    // 失败提示由请求层统一弹出
  }
}

/** 确认核算：锁定并按实付金额写入支出 */
async function handleConfirmAccount() {
  if (!account.value) return
  const confirmed = await ElMessageBox.confirm(
    `确认核算后将锁定，并按实付金额 ${formatMoney(shoppingStore.accountTotalFen)} 写入支出记录。是否继续？`,
    '确认核算',
    { type: 'warning', confirmButtonText: '确认', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return
  try {
    await shoppingStore.confirmAccount()
    ElMessage.success(`核算已完成，实付 ${formatMoney(shoppingStore.accountTotalFen)} 已记入支出`)
  } catch {
    // 失败提示由请求层统一弹出
  }
}

/**
 * 打开手动添加弹窗
 * @param {'purchase'|'account'} mode 加到哪份清单
 */
function openManualDialog(mode) {
  manualDialog.mode = mode
  Object.assign(manualDialog.form, { ingredientId: '', amount: 500, unit: 'g', note: '' })
  manualDialog.visible = true
}

/** 手动添加确认：校验 → 调对应接口 → 关闭弹窗 */
async function handleManualConfirm() {
  if (!manualDialog.form.ingredientId) {
    ElMessage.warning('请选择食材')
    return
  }
  if (!(Number(manualDialog.form.amount) > 0)) {
    ElMessage.warning('分量必须大于 0')
    return
  }
  manualDialog.submitting = true
  try {
    const payload = {
      ingredientId: manualDialog.form.ingredientId,
      amount: manualDialog.form.amount,
      unit: manualDialog.form.unit,
      note: manualDialog.form.note,
    }
    if (manualDialog.mode === 'purchase') await shoppingStore.addPurchaseItem(payload)
    else await shoppingStore.addAccountItem(payload)
    ElMessage.success('已添加')
    manualDialog.visible = false
  } catch {
    // 失败提示由请求层统一弹出
  } finally {
    manualDialog.submitting = false
  }
}

/** 分 → 元（核算金额输入框展示用） */
function fenToYuan(fen) {
  return Math.round(Number(fen) || 0) / 100
}

/**
 * 生成采购清单纯文本（复制用）：采购清单只包含食材名与分量，不展示金额
 * @returns {string}
 */
function buildListText() {
  if (!purchaseList.value) return ''
  const lines = ['家庭菜篮子 · 采购清单', `周期：${rangeText.value}`, '']
  purchaseList.value.groups.forEach((group) => {
    lines.push(`【${group.categoryName}】`)
    group.items.forEach((item) => {
      lines.push(`  ${item.name}  ${item.display}`)
    })
  })
  const unmergeable = purchaseList.value.unmergeableGroup
  if (unmergeable.items.length) {
    lines.push(`【${unmergeable.categoryName}】`)
    unmergeable.items.forEach((item) => {
      lines.push(`  ${item.name}  ${item.display}  按需购买`)
    })
  }
  lines.push('', `共 ${shoppingStore.purchaseItemCount} 项`)
  return lines.join('\n')
}

/** 兜底复制：老浏览器没有 Clipboard API 时用隐藏 textarea + execCommand */
function fallbackCopy(text) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  return copied
}

/** 复制采购清单文本到剪贴板（核算清单不提供复制/导出） */
async function handleCopy() {
  if (activeTab.value !== 'purchase') return
  const text = buildListText()
  if (!text) {
    ElMessage.warning('当前没有可复制的采购清单')
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('采购清单已复制到剪贴板')
  } catch {
    // 剪贴板权限被拒时走兜底方案
    if (fallbackCopy(text)) ElMessage.success('采购清单已复制到剪贴板')
    else ElMessage.error('复制失败，请手动选择文本复制')
  }
}

/** 导出采购清单为 PDF（离屏打印区域 → html2canvas → jsPDF；核算清单不提供导出） */
async function handleExportPdf() {
  if (activeTab.value !== 'purchase' || !printRef.value) return
  exporting.value = true
  try {
    await nextTick()
    await exportElementToPdf(printRef.value, `采购清单-${weekStart.value}.pdf`)
    ElMessage.success('PDF 已导出')
  } catch (error) {
    console.warn('[采购清单] PDF 导出失败：', error)
    ElMessage.error('PDF 导出失败，请重试')
  } finally {
    exporting.value = false
  }
}

/** 离屏打印区域的行数据：采购清单按品类分组（只含食材名与分量） */
const printRows = computed(() => {
  const rows = []
  if (!purchaseList.value) return rows
  purchaseList.value.groups.forEach((group) => {
    rows.push({ type: 'group', key: `g-${group.categoryId}`, text: group.categoryName })
    group.items.forEach((item) => {
      rows.push({ type: 'item', key: `i-${item.id}`, name: item.name, display: item.display })
    })
  })
  const unmergeable = purchaseList.value.unmergeableGroup
  if (unmergeable.items.length) {
    rows.push({ type: 'group', key: 'g-unmergeable', text: unmergeable.categoryName })
    unmergeable.items.forEach((item) => {
      rows.push({ type: 'item', key: `u-${item.id}`, name: item.name, display: item.display })
    })
  }
  return rows
})
</script>

<template>
  <!-- 页面容器：右上角放周切换 -->
  <PageContainer title="采购清单">
    <template #extra>
      <el-button @click="changeWeek(-1)">上周</el-button>
      <span class="shopping__range">{{ rangeText }}</span>
      <el-button @click="changeWeek(1)">下周</el-button>
      <el-button v-if="!isCurrentWeek" plain @click="goCurrentWeek">回到本周</el-button>
    </template>

    <!-- 双 Tab：采购清单 / 核算清单 -->
    <el-tabs v-model="activeTab" class="shopping__tabs">
      <!-- ================= 采购清单 Tab ================= -->
      <el-tab-pane label="采购清单" name="purchase">
        <!-- 加载中 -->
        <div v-if="previewLoading || shoppingStore.loading" class="shopping__loading">
          <el-skeleton animated :rows="6" />
        </div>

        <!-- 本周没排餐且未生成清单：引导去排计划 -->
        <EmptyState
          v-else-if="!purchaseList && planItemCount === 0"
          description="本周还没有排餐，先去一周计划排好菜再生成采购清单吧"
          action-text="去排计划"
          @action="goPlan"
        />

        <!-- 有排餐但还没生成清单：展示前端预览 + 生成按钮 -->
        <div v-else-if="!purchaseList" class="shopping__preview">
          <h3 class="shopping__preview-title">本周计划已就绪，清单还未生成</h3>
          <p v-if="preview" class="shopping__preview-text">
            前端实时预览：共 {{ preview.summary.itemCount }} 项、覆盖
            {{ preview.summary.recipeCount }} 道菜，预估金额
            <strong>{{ formatMoney(preview.summary.estAmountFen) }}</strong>
          </p>
          <p class="shopping__preview-hint">
            生成后按库存给出建议采购量，可逐项修改分量；生成时还会与前端预览做一致性对照（控制台日志）
          </p>
          <el-button type="primary" @click="handleGenerate">生成采购清单</el-button>
        </div>

        <!-- 清单主体 -->
        <template v-else>
          <!-- 状态提示：草稿可改 / 已确认只读 -->
          <el-alert
            v-if="isPurchaseConfirmed"
            type="success"
            :closable="false"
            title="采购清单已确认（已锁定）：可切到「核算清单」录入实际购买情况"
            class="shopping__alert"
          />
          <el-alert
            v-else
            type="info"
            :closable="false"
            title="清单为草稿：分量可改、可增删食材；确认清单后将锁定"
            class="shopping__alert"
          />

          <!-- 按品类分组的清单 -->
          <div class="shopping__groups">
            <section
              v-for="group in purchaseList.groups"
              :key="group.categoryId"
              class="shopping__group"
            >
              <header class="shopping__group-head">
                <h3 class="shopping__group-title">{{ group.categoryName }}</h3>
                <span class="shopping__group-count">{{ group.items.length }} 项</span>
              </header>
              <div v-for="item in group.items" :key="item.id" class="shopping__row">
                <span class="shopping__name">{{ item.name }}</span>
                <!-- 草稿：分量是表单，可自由修改；已确认：只读展示 -->
                <el-input-number
                  v-if="!isPurchaseConfirmed"
                  :model-value="item.amount"
                  :min="1"
                  :max="100000"
                  size="small"
                  class="shopping__amount-input"
                  @change="(value, oldValue) => handlePurchaseAmountChange(item, value, oldValue)"
                />
                <span v-else class="shopping__amount-text">{{ item.display }}</span>
                <span v-if="!isPurchaseConfirmed" class="shopping__unit">{{ item.unit }}</span>
                <!-- 建议采购量：来自计划聚合（已扣库存），只做提示；确认后无需再提示 -->
                <span
                  v-if="item.suggestedDisplay && !isPurchaseConfirmed"
                  class="shopping__suggest"
                >
                  建议 {{ item.suggestedDisplay }}
                </span>
                <el-tag v-if="item.stockShort" type="warning" size="small" effect="plain">
                  库存不足
                </el-tag>
                <el-tag v-if="item.source === 'manual'" type="info" size="small" effect="plain">
                  手动
                </el-tag>
                <el-button
                  v-if="!isPurchaseConfirmed"
                  link
                  type="danger"
                  size="small"
                  class="shopping__remove"
                  @click="handleRemovePurchaseItem(item)"
                >
                  删除
                </el-button>
              </div>
            </section>

            <!-- 不可换算分组：根/把/片等单独一行，分量也可改 -->
            <section v-if="purchaseList.unmergeableGroup.items.length > 0" class="shopping__group">
              <header class="shopping__group-head">
                <h3 class="shopping__group-title">
                  {{ purchaseList.unmergeableGroup.categoryName }}
                </h3>
                <span class="shopping__group-hint">
                  根 / 把 / 片等无法换算为克/毫升，按需购买
                </span>
              </header>
              <div
                v-for="item in purchaseList.unmergeableGroup.items"
                :key="item.id"
                class="shopping__row"
              >
                <span class="shopping__name">{{ item.name }}</span>
                <el-input-number
                  v-if="!isPurchaseConfirmed"
                  :model-value="item.amount"
                  :min="1"
                  :max="100000"
                  size="small"
                  class="shopping__amount-input"
                  @change="(value, oldValue) => handlePurchaseAmountChange(item, value, oldValue)"
                />
                <span v-else class="shopping__amount-text">{{ item.display }}</span>
                <span v-if="!isPurchaseConfirmed" class="shopping__unit">{{ item.unit }}</span>
                <span class="shopping__note">按需购买</span>
                <el-button
                  v-if="!isPurchaseConfirmed"
                  link
                  type="danger"
                  size="small"
                  class="shopping__remove"
                  @click="handleRemovePurchaseItem(item)"
                >
                  删除
                </el-button>
              </div>
            </section>
          </div>

          <!-- 草稿状态可重新生成 -->
          <div v-if="!isPurchaseConfirmed" class="shopping__regenerate">
            <el-button @click="handleGenerate">重新生成清单</el-button>
          </div>
        </template>
      </el-tab-pane>

      <!-- ================= 核算清单 Tab ================= -->
      <el-tab-pane label="核算清单" name="account">
        <!-- 采购清单还没确认：先引导确认 -->
        <EmptyState
          v-if="!isPurchaseConfirmed"
          description="核算前需要先确认采购清单，确认后系统会自动带出食材与建议分量"
          action-text="去确认采购清单"
          @action="activeTab = 'purchase'"
        />

        <!-- 已确认但核算草稿还没生成：显示加载 -->
        <div v-else-if="!account" class="shopping__loading">
          <el-skeleton animated :rows="6" />
        </div>

        <!-- 核算清单主体 -->
        <template v-else>
          <el-alert
            v-if="isAccountDone"
            type="success"
            :closable="false"
            :title="`核算已完成（${account.confirmedAt}）：实付 ${formatMoney(shoppingStore.accountTotalFen)} 已写入支出记录`"
            class="shopping__alert"
          />
          <el-alert
            v-else
            type="info"
            :closable="false"
            title="核对本次实际购买的食材、分量与金额（都可修改），确认后锁定并写入支出"
            class="shopping__alert"
          />

          <section class="shopping__group">
            <header class="shopping__group-head">
              <h3 class="shopping__group-title">核算明细</h3>
              <span class="shopping__group-count">{{ account.items.length }} 项</span>
            </header>

            <!-- 核算表头：明确区分「分量」和「金额」两列表单；完成后隐藏操作列 -->
            <div
              class="shopping__table-head"
              :class="
                isAccountDone
                  ? 'shopping__table-head--account-done'
                  : 'shopping__table-head--account'
              "
            >
              <span>食材</span>
              <span>实际分量</span>
              <span>实际金额（元）</span>
              <span v-if="!isAccountDone">操作</span>
            </div>

            <!-- 核算明细行：食材 / 分量表单+单位 / 金额表单+元 / 操作（完成后三列） -->
            <div
              v-for="item in account.items"
              :key="item.id"
              class="shopping__row"
              :class="isAccountDone ? 'shopping__row--account-done' : 'shopping__row--account'"
            >
              <span class="shopping__name">
                {{ item.name }}
                <em v-if="item.note" class="shopping__note">{{ item.note }}</em>
              </span>

              <!-- 分量表单：输入框后跟单位（g/ml/个…），与金额区分 -->
              <div class="shopping__field">
                <el-input-number
                  v-if="!isAccountDone"
                  v-model="item.amount"
                  :min="1"
                  :max="100000"
                  size="small"
                  class="shopping__amount-input"
                  @change="(value, oldValue) => handleAccountAmountChange(item, oldValue)"
                />
                <span v-else class="shopping__amount-text">{{ item.display }}</span>
                <span v-if="!isAccountDone" class="shopping__field-unit">{{ item.unit }}</span>
              </div>

              <!-- 金额表单：输入框后跟"元"，内部仍按分存储 -->
              <div class="shopping__field">
                <el-input-number
                  v-if="!isAccountDone"
                  :model-value="fenToYuan(item.priceFen)"
                  :min="0"
                  :precision="2"
                  :step="0.5"
                  size="small"
                  class="shopping__price-input"
                  @change="(value) => handleAccountPriceChange(item, value)"
                />
                <span v-else class="shopping__price">{{ formatMoney(item.priceFen) }}</span>
                <span v-if="!isAccountDone" class="shopping__field-unit">元</span>
              </div>

              <div v-if="!isAccountDone" class="shopping__actions">
                <el-tag v-if="item.source === 'manual'" type="info" size="small" effect="plain">
                  手动
                </el-tag>
                <el-button
                  v-if="!isAccountDone"
                  link
                  type="danger"
                  size="small"
                  @click="handleRemoveAccountItem(item)"
                >
                  删除
                </el-button>
              </div>
            </div>
          </section>
        </template>
      </el-tab-pane>
    </el-tabs>

    <!-- 底部合计栏：固定定位在视口底部，清单再长也不用滚到底；没有清单时不显示 -->
    <div v-if="hasFooter" class="shopping__footer-fixed">
      <div class="shopping__footer">
        <template v-if="activeTab === 'purchase'">
          <!-- 采购清单不展示金额，底部只显示条目数 -->
          <span class="shopping__footer-item">共 {{ shoppingStore.purchaseItemCount }} 项</span>
          <div class="shopping__footer-actions">
            <!-- 草稿：只能手动添加 / 预览清单；确认后才开放复制、导出、去核算 -->
            <template v-if="!isPurchaseConfirmed">
              <el-button @click="openManualDialog('purchase')">手动添加</el-button>
              <el-button type="primary" @click="openPreviewDialog">预览清单</el-button>
            </template>
            <template v-else>
              <el-button @click="handleCopy">复制清单</el-button>
              <el-button :loading="exporting" @click="handleExportPdf">导出 PDF</el-button>
              <el-button type="success" @click="goAccount">去核算</el-button>
            </template>
          </div>
        </template>

        <template v-else>
          <span class="shopping__footer-item">
            实付合计
            <strong class="shopping__footer-amount">{{
              formatMoney(shoppingStore.accountTotalFen)
            }}</strong>
          </span>
          <span class="shopping__footer-item">共 {{ shoppingStore.accountItemCount }} 项</span>
          <div class="shopping__footer-actions">
            <!-- 核算清单不需要复制/导出 PDF，只保留录入与确认操作 -->
            <el-button v-if="!isAccountDone" @click="openManualDialog('account')">
              手动添加
            </el-button>
            <el-button v-if="!isAccountDone" type="primary" @click="handleConfirmAccount">
              确认核算
            </el-button>
            <el-tag v-else type="success" size="large">已完成核算</el-tag>
          </div>
        </template>
      </div>
    </div>

    <!-- 离屏打印区域：导出采购清单 PDF（只含食材名与分量，不含金额） -->
    <div ref="printRef" class="shopping__print">
      <h2 class="shopping__print-title">家庭菜篮子 · 采购清单</h2>
      <p class="shopping__print-meta">周期：{{ rangeText }}</p>
      <table class="shopping__print-table">
        <thead>
          <tr>
            <th>食材</th>
            <th>分量</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in printRows" :key="row.key">
            <tr v-if="row.type === 'group'">
              <td colspan="2" class="shopping__print-group">{{ row.text }}</td>
            </tr>
            <tr v-else>
              <td>{{ row.name }}</td>
              <td>{{ row.display }}</td>
            </tr>
          </template>
        </tbody>
      </table>
      <p class="shopping__print-total">共 {{ shoppingStore.purchaseItemCount }} 项</p>
    </div>

    <!-- 预览清单弹窗：草稿状态下先完整预览（可上下滚动），再决定「再改改」或「确认清单」 -->
    <el-dialog
      v-model="previewVisible"
      title="预览采购清单"
      width="640px"
      :close-on-click-modal="false"
      class="shopping__preview-dialog"
    >
      <div v-if="purchaseList" class="shopping__preview-dialog-body">
        <p class="shopping__preview-dialog-meta">
          周期：{{ rangeText }} · 共 {{ shoppingStore.purchaseItemCount }} 项
        </p>
        <!-- 按品类分组展示（只读，不含金额） -->
        <div
          v-for="group in purchaseList.groups"
          :key="group.categoryId"
          class="shopping__preview-dialog-group"
        >
          <h4 class="shopping__preview-dialog-title">{{ group.categoryName }}</h4>
          <div v-for="item in group.items" :key="item.id" class="shopping__preview-dialog-row">
            <span class="shopping__preview-dialog-name">{{ item.name }}</span>
            <span class="shopping__preview-dialog-amount">{{ item.display }}</span>
            <!-- 预览只展示食材与分量；库存不足等提示只在采购清单里展示 -->
            <el-tag v-if="item.source === 'manual'" type="info" size="small" effect="plain">
              手动
            </el-tag>
          </div>
        </div>
        <!-- 不可换算分组同样在预览里展示 -->
        <div
          v-if="purchaseList.unmergeableGroup.items.length > 0"
          class="shopping__preview-dialog-group"
        >
          <h4 class="shopping__preview-dialog-title">不可换算单位</h4>
          <div
            v-for="item in purchaseList.unmergeableGroup.items"
            :key="item.id"
            class="shopping__preview-dialog-row"
          >
            <span class="shopping__preview-dialog-name">{{ item.name }}</span>
            <span class="shopping__preview-dialog-amount">{{ item.display }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="handlePreviewEdit">再改改</el-button>
        <el-button type="primary" :loading="confirming" @click="handleConfirmPurchase">
          确认清单
        </el-button>
      </template>
    </el-dialog>

    <!-- 手动添加弹窗：采购清单/核算清单共用，隐藏弹窗时复用 -->
    <el-dialog
      v-model="manualDialog.visible"
      :title="manualDialog.mode === 'purchase' ? '手动添加采购项' : '手动添加核算项'"
      width="420px"
    >
      <el-form label-width="72px">
        <el-form-item label="食材">
          <el-select
            v-model="manualDialog.form.ingredientId"
            placeholder="请选择食材"
            filterable
            class="shopping__dialog-field"
          >
            <el-option
              v-for="item in ingredientOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="分量">
          <el-input-number v-model="manualDialog.form.amount" :min="1" :max="100000" />
        </el-form-item>
        <el-form-item label="单位">
          <el-select v-model="manualDialog.form.unit" class="shopping__dialog-unit">
            <el-option
              v-for="item in unitOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="manualDialog.form.note" placeholder="可填写品牌 / 规格等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="manualDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="manualDialog.submitting" @click="handleManualConfirm">
          添加
        </el-button>
      </template>
    </el-dialog>
  </PageContainer>
</template>

<style scoped lang="scss">
// 周范围文字
.shopping__range {
  font-size: $font-size-base;
  color: $text-regular;
}

// Tab 内容与底部固定栏留出间距，避免最后一行被固定栏盖住
.shopping__tabs {
  padding-bottom: 96px;
}

// 状态提示条
.shopping__alert {
  margin-bottom: $spacing-md;
}

// 加载容器：给骨架屏留内边距
.shopping__loading {
  padding: $spacing-lg;
}

// 预览面板：未生成清单时展示前端聚合结果
.shopping__preview {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
  align-items: flex-start;
  padding: $spacing-xl;
  background-color: $bg-page;
  border-radius: $radius-md;
}

// 预览标题
.shopping__preview-title {
  font-size: $font-size-lg;
  color: $text-primary;
}

// 预览数字
.shopping__preview-text {
  font-size: $font-size-base;
  color: $text-regular;

  strong {
    color: $color-primary-dark;
  }
}

// 预览说明：弱化文字
.shopping__preview-hint {
  font-size: $font-size-xs;
  color: $text-secondary;
}

// 分组容器
.shopping__groups {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

// 单个品类分组：浅灰底卡片
.shopping__group {
  padding: $spacing-md $spacing-lg;
  background-color: $bg-page;
  border-radius: $radius-md;
}

// 分组头部：品类名 + 条目数
.shopping__group-head {
  display: flex;
  align-items: baseline;
  gap: $spacing-sm;
  padding-bottom: $spacing-sm;
  margin-bottom: $spacing-sm;
  border-bottom: 1px dashed $border-color;
}

// 分组标题
.shopping__group-title {
  font-size: $font-size-md;
  color: $text-primary;
}

// 分组条目数
.shopping__group-count {
  font-size: $font-size-xs;
  color: $text-secondary;
}

// 不可换算提示文字
.shopping__group-hint {
  font-size: $font-size-xs;
  color: $color-accent;
}

// 清单项：一行展示名称/分量表单/单位/建议量/金额/标签/操作
.shopping__row {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-xs 0;
  font-size: $font-size-sm;
  border-bottom: 1px solid rgba($border-color-light, 0.6);

  &:last-child {
    border-bottom: none;
  }
}

// 食材名：固定宽度，保证分量列对齐
.shopping__name {
  min-width: 96px;
  color: $text-primary;
}

// 分量输入框宽度
.shopping__amount-input {
  width: 130px;
}

// 已确认/已核算时的分量文本
.shopping__amount-text {
  min-width: 90px;
  color: $text-regular;
}

// 单位文字
.shopping__unit {
  min-width: 32px;
  color: $text-secondary;
}

// 建议采购量提示
.shopping__suggest {
  font-size: $font-size-xs;
  color: $text-secondary;
}

// 金额（只读）
.shopping__price {
  min-width: 80px;
  color: $color-primary-dark;
}

// 核算金额输入框
.shopping__price-input {
  width: 130px;
}

// 核算表头：与核算行保持同样的 4 列网格，明确每列表单含义
.shopping__table-head {
  display: grid;
  gap: $spacing-sm;
  align-items: center;
  padding: $spacing-xs 0;
  font-size: $font-size-xs;
  color: $text-secondary;
  border-bottom: 1px dashed $border-color;
}

// 核算表头列宽
.shopping__table-head--account {
  grid-template-columns: minmax(120px, 1.2fr) 220px 220px 120px;
}

// 核算完成后：没有操作列，表头只保留 3 列
.shopping__table-head--account-done {
  grid-template-columns: minmax(120px, 1.2fr) 220px 220px;
}

// 核算行：食材 / 实际分量 / 实际金额 / 操作 四列对齐
.shopping__row--account {
  display: grid;
  grid-template-columns: minmax(120px, 1.2fr) 220px 220px 120px;
  align-items: center;
}

// 核算完成后：只保留 3 列（无操作列）
.shopping__row--account-done {
  display: grid;
  grid-template-columns: minmax(120px, 1.2fr) 220px 220px;
  align-items: center;
}

// 表单组：输入框 + 单位文字（用于区分分量/金额）
.shopping__field {
  display: flex;
  gap: $spacing-xs;
  align-items: center;
}

// 表单后缀：分量后显示 g/ml…，金额后显示"元"
.shopping__field-unit {
  min-width: 24px;
  font-size: $font-size-xs;
  color: $text-secondary;
}

// 核算操作列
.shopping__actions {
  display: flex;
  gap: $spacing-xs;
  align-items: center;
}

// 备注：显示在食材名下方，小号弱化
.shopping__note {
  display: block;
  font-size: $font-size-xs;
  font-style: normal;
  color: $text-secondary;
}

// 删除按钮：推到最右侧
.shopping__remove {
  margin-left: auto;
}

// 重新生成按钮容器
.shopping__regenerate {
  display: flex;
  justify-content: flex-end;
  margin-top: $spacing-md;
}

// 固定底部栏：白底 + 顶部阴影
.shopping__footer {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-lg;
  align-items: center;
  padding: $spacing-md $spacing-lg;
  background-color: $bg-white;
  border-top: 1px solid $border-color-light;
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.06);
}

// 合计项文字
.shopping__footer-item {
  font-size: $font-size-sm;
  color: $text-regular;
}

// 合计金额：主色强调
.shopping__footer-amount {
  font-size: $font-size-lg;
  color: $color-primary;
}

// 底部操作按钮
.shopping__footer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-sm;
  align-items: center;
  margin-left: auto;
}

// 固定底部栏容器：固定在视口底部，左右与页面内边距对齐
.shopping__footer-fixed {
  position: fixed;
  right: $spacing-lg;
  bottom: 0;
  left: $spacing-lg;
  z-index: 20;
  border-radius: $radius-md $radius-md 0 0;
  overflow: hidden;
}

// 弹窗下拉宽度
.shopping__dialog-field {
  width: 100%;
}

// 弹窗单位宽度
.shopping__dialog-unit {
  width: 120px;
}

// 离屏打印区域：固定在屏幕外，供 html2canvas 截图（页面不可见）
.shopping__print {
  position: fixed;
  top: 0;
  left: -10000px;
  width: 760px;
  padding: 24px;
  color: #333;
  background-color: #fff;
}

// 打印标题
.shopping__print-title {
  margin-bottom: 8px;
  font-size: 22px;
  text-align: center;
}

// 打印周期
.shopping__print-meta {
  margin-bottom: 16px;
  font-size: 12px;
  color: #666;
  text-align: center;
}

// 打印表格
.shopping__print-table {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;

  th,
  td {
    padding: 6px 8px;
    text-align: left;
    border-bottom: 1px solid #ddd;
  }

  th {
    font-weight: 600;
    background-color: #f5f7fa;
  }
}

// 打印分组行
.shopping__print-group {
  font-weight: 600;
  background-color: #fafafa;
}

// 打印合计行
.shopping__print-total {
  margin-top: 16px;
  font-size: 15px;
  font-weight: 600;
  text-align: right;
}

// 预览弹窗内容区：限制高度并允许上下滚动，保证长清单也能完整预览
.shopping__preview-dialog-body {
  max-height: 52vh;
  padding-right: $spacing-xs;
  overflow-y: auto;
}

// 预览弹窗顶部信息
.shopping__preview-dialog-meta {
  padding-bottom: $spacing-sm;
  margin-bottom: $spacing-sm;
  font-size: $font-size-xs;
  color: $text-secondary;
  border-bottom: 1px dashed $border-color;
}

// 预览分组
.shopping__preview-dialog-group {
  margin-bottom: $spacing-md;
}

// 预览分组标题
.shopping__preview-dialog-title {
  margin-bottom: $spacing-xs;
  font-size: $font-size-sm;
  font-weight: 600;
  color: $text-primary;
}

// 预览行：食材名 + 分量 + 标签
.shopping__preview-dialog-row {
  display: flex;
  gap: $spacing-sm;
  align-items: center;
  padding: $spacing-xs 0;
  font-size: $font-size-sm;
  border-bottom: 1px solid rgba($border-color-light, 0.6);

  &:last-child {
    border-bottom: none;
  }
}

// 预览食材名
.shopping__preview-dialog-name {
  flex: 1;
  color: $text-regular;
}

// 预览分量
.shopping__preview-dialog-amount {
  min-width: 96px;
  color: $text-primary;
}
</style>
