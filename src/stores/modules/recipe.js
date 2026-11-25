// 菜谱 store：目前负责「收藏 id 列表」，持久化到 localStorage（刷新页面收藏不丢）
// 说明：字典缓存（categories/ingredients）留给后续阶段按需扩展，不提前建空逻辑。
import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useRecipeStore = defineStore(
  'recipe',
  () => {
    // 收藏的菜谱 id 列表（只存 id，详情/列表数据仍从接口取）
    const favoriteIds = ref([])

    /**
     * 判断某道菜谱是否已收藏
     * @param {number|string} id 菜谱 id
     * @returns {boolean}
     */
    function isFavorite(id) {
      return favoriteIds.value.includes(Number(id))
    }

    /**
     * 设置收藏 / 取消收藏（接口成功后调用；含去重，避免重复 push）
     * @param {number|string} id 菜谱 id
     * @param {boolean} favorite true=收藏，false=取消收藏
     */
    function setFavorite(id, favorite) {
      const recipeId = Number(id)
      if (favorite) {
        if (!favoriteIds.value.includes(recipeId)) favoriteIds.value.push(recipeId)
        return
      }
      favoriteIds.value = favoriteIds.value.filter((item) => item !== recipeId)
    }

    /** 清空全部收藏（预留：后续"清空数据/切换账号"时使用） */
    function clearFavorites() {
      favoriteIds.value = []
    }

    return { favoriteIds, isFavorite, setFavorite, clearFavorites }
  },
  // persist: true → 收藏状态持久化到 localStorage（key = 'recipe'）
  { persist: true },
)
