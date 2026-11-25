// 采购清单 / 核算清单 store（S7 重构）：保存当前周两份清单的状态与所有写操作
// 采购清单：草稿可改 → 确认后锁定；核算清单：确认清单后自动生成，确认核算后锁定并写支出
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  addShoppingAccountItem,
  addShoppingItem,
  confirmShoppingAccount,
  confirmShoppingList,
  createShoppingAccount,
  deleteShoppingAccountItem,
  deleteShoppingItem,
  generateShoppingList,
  getShoppingAccount,
  getShoppingList,
  updateShoppingAccountItem,
  updateShoppingItem,
} from '@/api/shopping'

export const useShoppingStore = defineStore('shopping', () => {
  // 采购清单：{ id, weekStart, status: 'draft'|'confirmed', groups, unmergeableGroup, summary }
  const purchaseList = ref(null)
  // 核算清单：{ id, weekStart, status: 'draft'|'done', items, summary }
  const account = ref(null)
  // 当前周起始日
  const weekStart = ref('')
  // 列表加载中
  const loading = ref(false)

  // 采购清单预估合计（分）：直接由清单项累加，改分量后无需重新请求即可实时更新
  const purchaseTotalFen = computed(() => {
    if (!purchaseList.value) return 0
    const groupsTotal = purchaseList.value.groups.reduce(
      (sum, group) => sum + group.items.reduce((groupSum, item) => groupSum + item.priceFen, 0),
      0,
    )
    const unmergeableTotal = purchaseList.value.unmergeableGroup.items.reduce(
      (sum, item) => sum + item.priceFen,
      0,
    )
    return groupsTotal + unmergeableTotal
  })

  // 采购清单条目数
  const purchaseItemCount = computed(() => {
    if (!purchaseList.value) return 0
    return (
      purchaseList.value.groups.reduce((sum, group) => sum + group.items.length, 0) +
      purchaseList.value.unmergeableGroup.items.length
    )
  })

  // 是否已确认采购清单（确认后锁定，可去核算）
  const isPurchaseConfirmed = computed(() => purchaseList.value?.status === 'confirmed')

  // 核算清单实付合计（分）：直接由核算项累加
  const accountTotalFen = computed(() => {
    if (!account.value) return 0
    return account.value.items.reduce((sum, item) => sum + item.priceFen, 0)
  })

  // 核算条目数
  const accountItemCount = computed(() => account.value?.items.length || 0)

  // 是否已完成核算（完成后锁定）
  const isAccountDone = computed(() => account.value?.status === 'done')

  /** 同时拉取某一周的采购清单与核算清单（未生成的为 null） */
  async function fetchAll(week) {
    weekStart.value = week
    loading.value = true
    try {
      const [purchase, shoppingAccount] = await Promise.all([
        getShoppingList({ weekStart: week }),
        getShoppingAccount({ weekStart: week }),
      ])
      purchaseList.value = purchase
      account.value = shoppingAccount
    } catch {
      purchaseList.value = null
      account.value = null
    } finally {
      loading.value = false
    }
  }

  /** 单独刷新采购清单（删除后保证统计同步） */
  async function refreshPurchaseList() {
    purchaseList.value = await getShoppingList({ weekStart: weekStart.value })
  }

  /**
   * 生成 / 重新生成采购清单
   * @param {string} week 周一日期
   */
  async function generate(week = weekStart.value) {
    const generated = await generateShoppingList({ weekStart: week })
    weekStart.value = week
    purchaseList.value = generated
    account.value = null
    return generated
  }

  /**
   * 修改采购项分量：接口成功后再更新本地数据（金额/展示由后端返回）
   * @param {object} item 采购项
   * @param {number} amount 新分量
   */
  async function updatePurchaseAmount(item, amount) {
    const updated = await updateShoppingItem(item.id, amount)
    Object.assign(item, updated)
  }

  /** 手动添加采购项（返回整份清单，直接替换） */
  async function addPurchaseItem(data) {
    purchaseList.value = await addShoppingItem({ weekStart: weekStart.value, ...data })
    return purchaseList.value
  }

  /** 删除采购项 */
  async function removePurchaseItem(item) {
    await deleteShoppingItem(item.id)
    await refreshPurchaseList()
  }

  /** 确认采购清单（锁定） */
  async function confirmPurchase() {
    purchaseList.value = await confirmShoppingList(purchaseList.value.id)
    return purchaseList.value
  }

  /** 从已确认采购清单生成核算草稿（重复调用返回已有草稿） */
  async function createAccount() {
    account.value = await createShoppingAccount({ weekStart: weekStart.value })
    return account.value
  }

  /**
   * 修改核算项分量
   * @param {object} item 核算项
   * @param {number} amount 新分量（整数最小单位）
   */
  async function updateAccountAmount(item, amount) {
    const updated = await updateShoppingAccountItem(item.id, { amount })
    Object.assign(item, updated)
  }

  /**
   * 修改核算项金额
   * @param {object} item 核算项
   * @param {number} priceFen 新金额（分）
   */
  async function updateAccountPrice(item, priceFen) {
    const updated = await updateShoppingAccountItem(item.id, { priceFen })
    Object.assign(item, updated)
  }

  /** 手动添加核算项 */
  async function addAccountItem(data) {
    account.value = await addShoppingAccountItem({ weekStart: weekStart.value, ...data })
    return account.value
  }

  /** 删除核算项 */
  async function removeAccountItem(item) {
    account.value = await deleteShoppingAccountItem(item.id)
    return account.value
  }

  /** 确认核算：锁定 + 写入支出 */
  async function confirmAccount() {
    account.value = await confirmShoppingAccount(account.value.id)
    return account.value
  }

  return {
    purchaseList,
    account,
    weekStart,
    loading,
    purchaseTotalFen,
    purchaseItemCount,
    isPurchaseConfirmed,
    accountTotalFen,
    accountItemCount,
    isAccountDone,
    fetchAll,
    refreshPurchaseList,
    generate,
    updatePurchaseAmount,
    addPurchaseItem,
    removePurchaseItem,
    confirmPurchase,
    createAccount,
    updateAccountAmount,
    updateAccountPrice,
    addAccountItem,
    removeAccountItem,
    confirmAccount,
  }
})
