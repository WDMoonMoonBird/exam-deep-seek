# client/src/mobile —— /m 移动端 v1（foundation 交付说明）

> 契约：`docs/mobile-app/10-v1-implementation-contract.md`（施工契约）
> 范围：`docs/mobile-app/09-v1-scope-and-deferred-backlog.md`（零后端 v1、34 屏、管理端后置）
> 设计稿（只读）：`docs/mobile-app/preview/`；本目录样式迁移自 `preview/assets/screen.css` + `02-design-tokens.css`。

## 0. 归属（谁可以改什么）

| 路径 | 归属 | 说明 |
|---|---|---|
| `styles/`、`layout/`、`components/`、`features/`、`composables/` | foundation（T0） | 页面 Agent 只读；缺能力先找 Lead |
| `routes.js`、`client/src/router/index.js`、`client/src/main.js` | foundation（T0） | 页面 Agent 不改 |
| `views/public/**`、`views/platform/**` | T3 | 覆盖同名占位文件 |
| `views/student/**` | T1 | 覆盖同名占位文件（当前 11 个） |
| `views/teacher/**` | T2 | 覆盖同名占位文件（14 个） |

页面 Agent **不要**改 `routes.js`、共享组件、布局、样式；页面独有的样式写 `<style scoped>`（用令牌变量，不写死 hex）。

## 1. 页面骨架（所有页面统一）

```vue
<script setup>
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import { MEmpty, MSkeleton, MListRow } from '../../components/index.js';
</script>

<template>
  <MobileLayout role="student" active="home" bottom="tabbar">
    <MobileAppBar title="学生首页" />
    <main class="scroll">
      <div class="page">…</div>
    </main>
  </MobileLayout>
</template>
```

- `MobileLayout` 的 `role`：`''`（公共/平台页）/ `'student'` / `'teacher'`；有 role 时渲染底部 TabBar。
- `active`：`home` / `assignments` / `scores`（学生）/ `review`（教师）/ `me`。
- `bottom`：`'tabbar' | 'actionbar' | 'none'`；**有底部固定按钮时传 `actionbar`**，否则滚动区会被按钮盖住。缺省按 role 推断。
- 页面可放 `<header class="appbar">` / `<main class="scroll">` / `<div class="actionbar">` 等设计稿类名；也可用 `MobileAppBar` / `MobileActionBar`。
- **移动 CSS（含令牌）由 MobileLayout 统一引入**：页面必须使用 MobileLayout，否则样式不生效。
- 弹层（MSheet）必须渲染在 `.m-screen` 内（即页面模板内、MobileLayout 的插槽里），不要 teleport 到 body（会丢令牌）。

## 2. 共享组件 API（`components/index.js` 统一导出）

| 组件 | props / 用法 | 说明 |
|---|---|---|
| `MIcon` | `name` `size?`('sm'\|'lg'\|'xl') `label?` | 61 个设计稿线性图标；默认 aria-hidden。可用名：back / chevron-right / chevron-down / chevron-up / close / more / search / bell / plus / minus / check / home / assignments / review / user / users / scores / chart / activity / clock / calendar / filter / download / upload / refresh / share / code / qr / copy / edit / trash / star / alert / info / wifi-off / logout / moon / sun / settings / eye / link / file / folder / message / arrow-right / arrow-left / arrow-up / lock / play / grid / sort / external / book / zap / logo / x-circle / check-circle / inbox / archive / pin / rotate-ccw |
| `MSheet` | `v-model:open` `title` `subtitle?` `show-close?` `close-on-mask?`；插槽 #foot | 底部抽屉；答题卡/交卷确认用它 |
| `MEmpty` | `icon?` `title` `description?`；默认插槽放按钮 | 空态 |
| `MSkeleton` | `variant?`('card'\|'line'\|'text') `count?` | 骨架屏（loading 态） |
| `MStatusTag` | `type`(neutral/success/warning/danger/info/accent/solid) `dot?` `size?` `icon?`；插槽/文字 | 状态标签（文字+颜色双编码） |
| `MProgress` | `value` `max?` `tone?`(success/warning/danger) `size?` `label?` | 线性进度（aria progressbar） |
| `MRing` | `value` `max?` `size?`('sm') `tone?` `label?` `display?` | 环形进度 |
| `MScore` | `value` `total?` `size?`('md'\|'hero') `tone?` `tag?` `tag-type?` | 分数展示（不新增数据，仅样式） |
| `MField` | `label?` `for-id?` `required?` `hint?` `error?`；默认插槽放 input | 表单字段 |
| `MSeg` | `v-model` `options` `size?`('sm') `label?` | 分段切换（2–4 档） |
| `MChips` | `v-model` `options` `multiple?` `wrap?` `label?` | 横向筛选胶囊 |
| `MSearchBar` | `v-model` `placeholder?` `label?`；事件 `search` | 搜索框 |
| `MListRow` | `title` `subtitle?` `icon?` `icon-tone?` `to?` `clickable?` `chevron?` `tag?` `tag-type?` `selected?`；插槽 #left/#right/默认 | 列表行（外层自己包 `.list`） |
| `MobileAppBar` | `title` `subtitle?` `back?` `back-to?` `align?`('left') `solid?` `border?` `transparent?` `inverse?`；插槽 #left/#right/#title | 顶部导航（title 为页面唯一 h1） |
| `MobileTabBar` | `role` `active` `badges?` | 一般由 MobileLayout 自动渲染 |
| `MobileActionBar` | `column?` `hint?` `label?` | 底部固定动作条 |

Composables：

```js
import { useMobileToast } from '../../composables/useMobileToast.js';
const toast = useMobileToast();
toast.show('已保存');            // 2.4s 后自动消失
toast.show('提交失败', { duration: 3200 });

import { useCountdown } from '../../composables/useCountdown.js';
const { text, expired, parts } = useCountdown(assignment.deadline);
// text: 「2 天 3 小时」「7 小时 27 分」「已截止」…
```

## 3. CSS / 类名（设计稿同名，全部限定 `.m-screen` 内）

- 布局：`appbar` `scroll` `page` `app` `actionbar` `tabbar` `sec` `hero` `page-title`
- 容器：`card` `list` `rowitem` `stats` `stat` `banner` `empty` `sheet` `mask` `toast`
- 控件：`btn`(+`--primary/--secondary/--soft/--ghost/--danger/--sm/--lg/--block`) `tag` `chips/chip` `seg` `field/label/input/textarea/help/error-text` `switch` `check` `radio` `option`
- 数据：`bar` `ring` `score-hero` `score-chip` `qnum/qgrid/qlegend` `steps/step`
- 代码：`codebox/codebar/codebody/codeline` `diffcard/diffhead/diffbody/diffline` `selmenu/codetoolbar`
- 工具类：`muted` `subtle` `strong` `tnum` `mono` `row` `between` `grow` `stack` `g8` `mt16` `ellipsis` `clamp-2` `sr-only` `hidden` 等
- 响应式：设计基准 390×844，360–430 可用；触控目标 ≥44px（`.chip/.seg button/.btn--sm` 等已用伪元素补命中区）。
- 主题：浅/深色由 `html[data-theme]` 驱动（`useTheme`），页面不要写死颜色。

## 4. 路由与守卫（已实现，页面只读）

路由表见 `routes.js`（31 条契约路由 + `/m/**` 兜底 404，全部懒加载；管理端不注册）。

| 场景 | 行为 |
|---|---|
| 未登录访问 `/m/student/**`、`/m/teacher/**` | → `/m/login?redirect=<原地址>`；登录成功后按 `redirect` 回跳（仅接受 `/m/` 站内地址） |
| 已登录学生访问教师页（或反之） | → `/m/403`（保留登录态，不踢回桌面 /login） |
| 超级管理员访问任意 `/m/*` | → `/m/403?reason=admin`（"移动端暂不提供管理端，请用电脑端"）；403 页按 `route.query.reason === 'admin'` 渲染该文案 |
| 未知 `/m/xxx` | 移动 404（公开，不会跳登录） |
| 401（登录态过期） | main.js 已适配：`/m` 下跳 `/m/login?expired=1`（桌面仍跳 `/login?expired=1`） |

登录页（T3）成功后的跳转约定：读 `route.query.redirect`（校验 `/m/` 前缀）→ 否则按角色 `/m/student/home` / `/m/teacher/home` / 超管提示 / `/m`。
错误页（T3）：`/m/404`、`/m/403`、`/m/500`；403 需支持 `reason=admin`。

## 5. v1 数据铁律（页面 Agent 必读）

- 只用契约 §6 白名单接口，经 `client/src/api/request.js`（自动 token/schoolId）；**不新增 axios 实例、不调用 /admin、不调用聚合/催交/通知/批量 by ids review 等延期接口**。
- 延期能力统一用 `features/mobileFeatures.js` 开关（v1 除 `multiSchoolLogin` 全为 false）：false 时不渲染、不请求、不显示假数据。
- 页面必须有三态：loading（MSkeleton）/ empty（MEmpty）/ error（banner 或 MEmpty + 重试）；错误不白屏、不吞错。
- 不显示排名/班均/最高分/百分位/等级分布/分数构成/逐题满分分母/AI 通用题分项/打回/均分/催交/题库使用次数/免登录接力/伪造 requestId。
- 成绩只来自 published；未出分不显示分数。
- 教师审核：通用题不请求 `project` 接口；实训题才可请求 `/teacher/submissions/:id/project`。
- 批量：逐条 `PUT /teacher/submissions/:id/review`（并发 3–5）+ 一次 `PUT /teacher/submissions/publish { submissionIds }`；显示进度与失败重试；不承诺原子。

## 6. 验证

```bash
cd client && npm run build          # 必须通过
npx eslint src/mobile               # 仓库根有 eslint 配置（缺陷类规则）
```

桌面零回归：移动 CSS 全部在 `.m-screen` 作用域内，且只在 /m 页面 chunk 加载；桌面路由/守卫/样式未改（`router/index.js` 仅新增 `/m` 分支与路由；`main.js` 仅 401 目标按当前路径区分）。
