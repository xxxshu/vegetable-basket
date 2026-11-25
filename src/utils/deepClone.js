// 手写深拷贝（S6 必补知识，不使用 JSON.parse(JSON.stringify())）
// 用途：复制上周计划时，把"上周的 items"完整复制一份再改日期/批量新增；
//       不深拷贝的话，修改本周数据会连带改到上周（对象引用共享）。
// 支持：数组 / 普通对象 / Date / 循环引用（WeakMap 缓存，避免无限递归和重复拷贝）
export function deepClone(value, cache = new WeakMap()) {
  // 基本类型（string / number / boolean / null / undefined / symbol）直接返回
  if (value === null || typeof value !== 'object') return value

  // 循环引用：同一个对象第二次出现时直接复用已克隆的副本
  if (cache.has(value)) return cache.get(value)

  // Date 单独处理：new Date(原时间戳) 才是真正的值拷贝（直接赋值仍是同一引用）
  if (value instanceof Date) return new Date(value.getTime())

  // 数组与对象：先创建空容器并放进 cache，再递归拷贝每个键
  const cloned = Array.isArray(value) ? [] : {}
  cache.set(value, cloned)

  Object.keys(value).forEach((key) => {
    // 用 cache 透传，保证同一对象在结果里只克隆一份且循环引用不断链
    cloned[key] = deepClone(value[key], cache)
  })

  return cloned
}

export default deepClone
