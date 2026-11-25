<!--
  登录页（对应 docs/开发文档.md 6.3 节）：
  1. 左侧品牌区 + 右侧 420px 登录卡；
  2. el-form 校验（用户名 5-12 位、密码 6-18 位）+ loading 防重复提交；
  3. 登录成功写入 Pinia（持久化），再按角色跳到对应首页；支持 ?redirect= 回跳。
-->
<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Lock, User } from '@element-plus/icons-vue'

import { useUserStore } from '@/stores'
import { getHomePathByRole } from '@/utils/permission'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

// 登录表单：reactive 对象直接 v-model 绑定到 el-input
const form = reactive({ username: '', password: '' })
// el-form 实例：提交前调用 validate() 做整体校验
const formRef = ref(null)
// 提交中状态：防止用户双击重复请求
const loading = ref(false)

// 校验规则：与开发文档 6.3「用户名 5-12 位、密码 6-18 位」保持一致
const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 5, max: 12, message: '用户名长度为 5-12 位', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 18, message: '密码长度为 6-18 位', trigger: 'blur' },
  ],
}

// 演示账号：方便答辩/验收时快速登录（真实项目不会把账号写死在前端）
const demoAccounts = [
  { role: '家庭用户', username: 'family', password: '123456' },
  { role: '管理员', username: 'admin', password: '123456' },
]

/**
 * 取登录成功后的跳转地址。
 * 优先回跳 ?redirect=（守卫在未登录时记录的原始地址）；
 * 只接受站内路径（以 / 开头且不是 //），防止 redirect 被利用跳到外部网站。
 * @param {string} role 当前登录角色
 * @returns {string} 跳转地址
 */
function getRedirectPath(role) {
  const redirect = route.query.redirect
  const isValidRedirect =
    typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
  return isValidRedirect ? redirect : getHomePathByRole(role)
}

/**
 * 一键填入演示账号：只改表单值，不自动提交。
 * @param {{ username: string, password: string }} account 演示账号
 */
function fillAccount(account) {
  form.username = account.username
  form.password = account.password
}

/**
 * 提交登录：表单校验 → 请求登录接口 → 写入 store → 按角色/回跳地址跳转。
 * 副作用：写入登录态（持久化）、提示成功、路由跳转。
 */
async function handleLogin() {
  // 1. 表单校验：validate() 校验失败会 reject，这里转成 false 后直接中断（错误文案由 el-form 展示）
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  // 2. 打开 loading：重复点击按钮时不会重复发请求
  loading.value = true
  try {
    await userStore.login({ username: form.username, password: form.password })
    ElMessage.success(`欢迎回来，${userStore.userInfo.nickname}`)
    // 3. 跳转：动态路由由全局守卫在导航时按角色注册
    await router.replace(getRedirectPath(userStore.role))
  } catch {
    // 登录失败的错误提示已由 request.js 的响应拦截器统一弹出，这里只负责恢复按钮状态
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <!-- 整页两栏容器：左侧品牌区 + 右侧登录卡 -->
  <div class="login">
    <!-- 左侧品牌区：桌面端展示项目定位，窄屏由样式隐藏 -->
    <aside class="login__brand">
      <div class="login__brand-inner">
        <p class="login__brand-badge">家庭菜篮子计划系统</p>
        <h1 class="login__brand-title">这周吃什么，<br />交给计划来安排</h1>
        <p class="login__brand-desc">
          菜谱 → 一周计划 → 采购清单 → 预算与营养报表，一条链路全部打通。
        </p>
        <ul class="login__brand-list">
          <li>按周排餐，自动汇总要买的食材</li>
          <li>预算、热量、营养一目了然</li>
          <li>食材别名归一 + 库存抵扣，少买不浪费</li>
        </ul>
      </div>
    </aside>

    <!-- 右侧登录卡：420px 宽度，垂直居中 -->
    <section class="login__panel">
      <div class="login__card">
        <h2 class="login__title">登录</h2>
        <p class="login__subtitle">家庭用户与管理端共用一个入口，登录后自动进入对应端</p>

        <!-- 登录表单：用户名 + 密码，输入框内回车也能直接提交 -->
        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          size="large"
          @keyup.enter="handleLogin"
        >
          <el-form-item label="用户名" prop="username">
            <el-input
              v-model="form.username"
              :prefix-icon="User"
              placeholder="请输入用户名（5-12 位）"
              clearable
            />
          </el-form-item>

          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              :prefix-icon="Lock"
              type="password"
              placeholder="请输入密码（6-18 位）"
              show-password
              clearable
            />
          </el-form-item>

          <!-- 提交按钮：loading 期间不可重复点击 -->
          <el-form-item>
            <el-button type="primary" class="login__submit" :loading="loading" @click="handleLogin">
              登 录
            </el-button>
          </el-form-item>
        </el-form>

        <!-- 演示账号：点击一键填入，方便验收与答辩演示 -->
        <div class="login__accounts">
          <p class="login__accounts-label">演示账号（点击填入）</p>
          <el-button
            v-for="account in demoAccounts"
            :key="account.username"
            plain
            size="small"
            @click="fillAccount(account)"
          >
            {{ account.role }}：{{ account.username }} / {{ account.password }}
          </el-button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
// 整页容器：左右两栏、占满视口；页面底色取全局变量
.login {
  display: flex;
  min-height: 100vh;
  background-color: $bg-page;
}

// 左侧品牌区：主色渐变背景 + 白色文字，桌面端占一半宽度
.login__brand {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: $spacing-xxl;
  color: $bg-white;
  background: linear-gradient(
    135deg,
    $color-primary-dark 0%,
    $color-primary 55%,
    $color-primary-light 100%
  );
}

// 品牌内容限宽：大屏下文字不会被拉得过长
.login__brand-inner {
  max-width: 420px;
}

// 品牌徽标：半透明白色底，突出产品名
.login__brand-badge {
  display: inline-block;
  padding: $spacing-xs $spacing-md;
  margin-bottom: $spacing-lg;
  font-size: $font-size-sm;
  background-color: rgba($bg-white, 0.18);
  border-radius: 999px;
}

// 品牌主标题：页面最大字号，撑住视觉重心
.login__brand-title {
  font-size: 36px;
  line-height: 1.35;
  color: $bg-white;
}

// 品牌副标题：说明产品核心链路
.login__brand-desc {
  margin-top: $spacing-md;
  font-size: $font-size-md;
  line-height: 1.8;
  color: rgba($bg-white, 0.86);
}

// 品牌能力点列表：每条前面加一个小圆点
.login__brand-list {
  margin-top: $spacing-xl;

  li {
    position: relative;
    padding-left: $spacing-md;
    margin-bottom: $spacing-sm;
    font-size: $font-size-base;
    color: rgba($bg-white, 0.92);

    &::before {
      position: absolute;
      top: 9px;
      left: 0;
      width: 6px;
      height: 6px;
      content: '';
      background-color: $color-accent;
      border-radius: 50%;
    }
  }
}

// 右侧登录区：宽度占一半，内容居中
.login__panel {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 50%;
  padding: $spacing-xl;
}

// 登录卡：白底 + 大圆角 + 阴影，宽度固定 420px（小屏自适应）
.login__card {
  width: 420px;
  max-width: 100%;
  padding: $spacing-xl;
  background-color: $bg-white;
  border-radius: $radius-lg;
  box-shadow: $shadow-card;
}

// 登录标题
.login__title {
  font-size: $font-size-xl;
  color: $text-primary;
}

// 登录副标题：弱化文字，说明登录入口规则
.login__subtitle {
  margin-top: $spacing-xs;
  margin-bottom: $spacing-lg;
  font-size: $font-size-sm;
  color: $text-secondary;
}

// 提交按钮：占满登录卡宽度，点击区域更大
.login__submit {
  width: 100%;
}

// 演示账号区域：与表单拉开距离
.login__accounts {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-sm;
  padding-top: $spacing-md;
  margin-top: $spacing-md;
  border-top: 1px dashed $border-color-light;
}

// 演示账号说明文字：占满一行
.login__accounts-label {
  width: 100%;
  font-size: $font-size-xs;
  color: $text-secondary;
}

// 窄屏适配：隐藏左侧品牌区，登录卡独占一屏
@media (max-width: 900px) {
  .login__brand {
    display: none;
  }

  .login__panel {
    width: 100%;
  }
}
</style>
