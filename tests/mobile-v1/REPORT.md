# v1 移动端独立验收报告（T4）

> 仓库：`/Users/you/My Projects/My Vue/Exam-DeepSeek` ｜ 分支 `feat/mobile-app` ｜ 评审对象：**工作区未提交实现**
> 依据：`docs/mobile-app/10-v1-implementation-contract.md`（施工契约）、`docs/mobile-app/09-v1-scope-and-deferred-backlog.md`（v1 范围/D1–D14）
> 原则：独立验证实现，不以页面 Agent 自测为准；只写入 `tests/mobile-v1/**`，未修改 `client/src/mobile/**`、共享文件、server/prisma，未执行 git commit/push。
> 产物：本报告 + `tests/mobile-v1/artifacts/`（JSON 证据 + 截图）；脚本可复跑（见 §9）。

---

## 1. 结论

| 项 | 结论 |
|---|---|
| **总体判定** | **有条件通过（PASS with 4 P1）**：v1 功能与边界实现基本达标，可进入 Lead 集成；**建议先处理 4 条 P1（含 1 条 CI 门禁红 + 1 条交付流程项）再合入** |
| P0（阻断） | **0** |
| P1（重要） | **4**：① 学生「我的」缺字号偏好（09 §4 范围项）② 全仓 `verify-frontend` 因 mobile 代码 3 项 FAIL（桌面零回归门禁未绿）③ 批量审核未过滤实训题、通用 review 存在接口语义风险 ④ T4 产物 `tests/` 被 `.gitignore` 忽略（P1-4） |
| P2（可后续） | **5**：mobileFeatures 未被消费、/m/doc 延期文案、字号实现未收敛共享、scoped 颜色字面量、契约路由计数笔误 |
| 零后端改造 | ✅ 成立（见 §4） |
| 路由/页面 | ✅ 31 条契约路由 + /m 兜底 404 全部存在；34 个实体页面文件齐全；`/m/admin/**` 未注册且不可达 |
| 构建 / lint | ✅ `npm run build` exit 0（50.44s）；`npx eslint src/mobile` exit 0 |
| 运行时冒烟 | ✅ 33 次页面加载：0 控制台错误、0 横向溢出、0 h1 例外；13/13 守卫通过；6/6 三态通过；34 次 API 请求全部命中白名单、0 延期接口 |
| 共享组件/上轮问题 | ✅ MSheet 关闭按钮 **44×44**、Esc/遮罩关闭、dialog+aria-modal 均通过；MobileLayout `role` 门控 TabBar 正确；教师字号偏好可持久化；设计稿评审 P1（MSheet 32px 命中区）已修复 |

**一句话结论**：实现质量高于"占位页"水平，路由/守卫/API 边界非常干净；当前阻碍集中在**范围项遗漏（学生字号）**与**新增代码未通过既有全仓门禁**，均为可快速修复项，不含功能阻断。

---

## 2. 验收环境与判定口径

| 项 | 值 |
|---|---|
| 静态服务 | Vite dev server：`cd client && npm run dev -- --port 5174 --host 127.0.0.1` → `http://127.0.0.1:5174/exam/` |
| API | **全部 Playwright route mock**（不依赖后端）；envelope `{code:0,message:'ok',data}` |
| 浏览器 | Playwright 1.60.0（`client/node_modules`）+ Chromium headless，390×844（isMobile/hasTouch），360×800 抽查 |
| 身份种子 | `localStorage.token='mock-token'` + `user.role` ∈ student/teacher/super_admin，形状对齐 `stores/user.js` / `request.js` |
| 判定 | 每页：`.m-screen` 挂载、可见 h1 恰 1 个、无 console/pageerror、documentElement 无横向溢出；守卫看最终 URL；API 看实际请求 URL；三态看骨架/错误/空态文案 |

---

## 3. 验收结果总表

| # | 检查项 | 结果 | 关键证据 |
|---|---|---|---|
| 1 | 零后端 / 依赖边界 | ✅ | `git diff --name-only HEAD` 仅 `client/src/main.js`、`client/src/router/index.js`；`server/**`、`prisma/**`、迁移 **0**；`client/package.json`、lockfile diff 为空 |
| 2 | 静态边界（延期 API/依赖） | ✅ 16/16 PASS | `artifacts/static-check.json`：无 /admin、urge、handoff、notification、scores/overview、batch-review、batch-publish、export-review、requestId、排名/均分类接口字符串；无 Vant/Monaco/Tiptap/antd/axios import；无新 axios 实例；mobileFeatures 默认仅 `multiSchoolLogin=true` |
| 3 | 路由表 | ✅ | 31 条契约路由全部存在 + 1 条 `/m/:pathMatch(.*)*` 且最后注册；**无 `/m/admin/**` 注册**；32 条 route 全部 `() => import()` 且组件文件落盘 |
| 4 | 34 实体页面 | ✅ | `views/**/*.vue = 34`（公共/平台 9 + 学生 11 + 教师 14）；31 路由页均有 h1 来源与 `MobileLayout/.m-screen`（学生 Answer 的 3 个子态屏由 Answer 页承载） |
| 5 | 页面冒烟 | ✅ 33/33 | 31 契约路由 + 2 页 360 抽查：全部挂载、h1=1、0 控制台错误、0 横向溢出（`artifacts/smoke.json` → `pages[]`） |
| 6 | 守卫 | ✅ 13/13 | 未登录→`/m/login?redirect=`（学生/教师两例）；角色不符→`/m/403`（双向）；超管→`/m/403?reason=admin`；`/m/admin`、`/m/admin/monitor` 未登录→移动 404；未知 /m→404；**401→`/m/login?expired=1`**；超管 403 文案含「电脑端」；桌面 `/`、`/login` 不渲染 `.m-screen` |
| 7 | 三态（延迟/失败/空） | ✅ 6/6 | 学生作业列表 延迟（骨架 13 个）/失败（「作业加载失败…重新加载」）/空（「还没有收到作业」）；教师审核队列 延迟/失败；题库 空态 均通过 |
| 8 | API 边界（运行时） | ✅ | 33 页共 **34 次 API 请求**（student 13 / teacher 21 / public 0），全部命中契约白名单；**0 次**延期接口；通用题审核详情**未请求** `/project`（仅实训题分支） |
| 9 | 禁用文案（源码+DOM 双查） | ✅ | 源码：去注释后无延期 API；模板关键词命中 3 条均属合法例外（Error500 明确"不展示请求编号"、AssignmentDetail「取最高分」计分口径、ReviewDetail「AI 分项」仅实训题分支）。DOM：18 页 `innerText+textContent` 双查 0 命中（`artifacts/dom-text-audit.json`）；仅 /m/doc 文案遗留（P2-2） |
| 10 | 共享组件 | ✅ | MSheet：打开后 `.sheet.open`、位于 `.m-screen` 内、`role=dialog aria-modal=true`、关闭按钮 **44×44**、Esc 关闭、遮罩点击关闭全通过；MobileTabBar：public 0 / student 4 / teacher 4；教师字号（标准/大/特大）选择后 `localStorage.m-font-size=large`、`--m-fs-body=16.5px` |
| 11 | 构建 | ✅ | `npm run build` exit 0（50.44s，monaco 本地化 CDN 串 0；仅既有 chunk >500KB 告警） |
| 12 | Lint | ✅ | `npx eslint src/mobile` exit 0（无输出） |
| 13 | 桌面零回归（全仓门禁） | ❌ 3 项 FAIL | `node client/scripts/verify-frontend.mjs --no-build`：**71 checks / 3 failed**，均由新增 mobile 代码触发（详见 P1-2）；其余 68 项 PASS，桌面入口冒烟通过 |
| 14 | 设计稿评审 P1 复核 | ✅ | 原设计稿 `.sheet-close` 32px 命中宽问题在实现中改为 **44×44**（`client/src/mobile/styles/mobile.css:542`），运行实测 44×44 |

**不可达/不存在项**：`/m/admin`、`/m/admin/monitor` 均落到移动 404（未登录）；超管访问 `/m/admin` 走 `/m/403?reason=admin`（符合契约"超管一律 403 admin 引导"优先于 404 的口径，两种行为均已实测）。

---

## 4. 零后端与依赖边界证明（可复现）

```bash
cd <repo>
git status --porcelain
#  M client/src/main.js
#  M client/src/router/index.js
# ?? client/src/mobile/            （新增）
# ?? docs/mobile-app/10-v1-implementation-contract.md 等（文档）
# （无 server/**、prisma/**、迁移）

git diff --name-only HEAD          # 仅上面 2 个共享入口文件
git diff HEAD -- client/package.json client/package-lock.json   # 空
```

- **共享入口改动仅 2 处**：`router/index.js` 新增 `import { mobileRoutes… }` + `...mobileRoutes`（位于桌面 catch-all 之前）+ `/m` 独立守卫函数；`main.js` 仅 401 目标按当前路径区分 `/m/login`。桌面路由定义/views/components/styles 未改（`static-check B2`）。
- **无新依赖**：`package.json` / lockfile 无 diff；mobile 外部 import 仅 `vue`、`vue-router`、`dompurify`（既有依赖）。
- **无新 axios 实例**：mobile 源码无 `axios` import / `axios.create`，请求统一 `client/src/api/request.js`。
- **无延期接口**：静态扫描（去注释）与运行时 34 次请求双查均为 0；契约白名单外 0 次。
- **chunk 隔离证据**：构建后入口 CSS 不含 `m-screen`；移动样式独立 `assets/MobileLayout-*.css`（48,039 B）；移动页面各自独立 chunk；入口 JS 仅含路由表字符串（懒加载 map，符合设计）。

---

## 5. 完整性：31 路由 / 34 实体屏 / 守卫矩阵

### 5.1 路由 → 页面映射（全部实测可挂载）

| 组 | 路由（实测） | 实体屏 | 结果 |
|---|---|---|---|
| 公共 | `/m`·`/m/login`·`/m/doc`·`/m/404`·`/m/403`·`/m/500` | 6 | ✅ 全部挂载、h1=1、无报错 |
| 平台 | `/m/platform/install`·`/m/platform/splash`·`/m/platform/states` | 3 | ✅ |
| 学生 | `/m/student/home`·`assignments`·`assignments/:id`·`assignments/:id/answer`·`assignments/:id/done`·`scores`·`scores/:assignmentId`·`profile` | 8 路由 / **11 实体屏** | ✅ 8/8 路由通过；答题卡/交卷确认 = Answer 页内 Sheet（实测可打开/关闭） |
| 教师 | `/m/teacher/home`·`assignments`·`assignments/:id`·`review`·`review/:submissionId`·`review/:submissionId/code`·`review/:submissionId/diff`·`batch`·`batch/confirm`·`assign/new`·`questions`·`classes/:classId`·`profile`·`code/unsupported` | 14 | ✅ 14/14 路由通过 |
| 兜底 | `/m/:pathMatch(.*)*` → Error404 | — | ✅ 且位于最后注册，未知 /m 路径公开 404 |
| 管理端 | `/m/admin/**` **未注册** | 0（延期 D12） | ✅ 未登录→移动 404；超管→`/m/403?reason=admin` |

合计 **31 路由 + 1 兜底 = 32 条**；实体屏 **6+3+11+14 = 34**。`routes.json`（`artifacts/routes.json`）为机器可读清单。

### 5.2 守卫矩阵（全部通过）

| 场景 | 实测结果 |
|---|---|
| 未登录访问 `/m/student/home` / `/m/teacher/home` | `/m/login?redirect=/m/student/home` / `…teacher/home` ✅ |
| 学生访问教师页、教师访问学生页 | `/m/403` ✅（保留登录态） |
| 超管访问任意 `/m/*`（含 /m/admin） | `/m/403?reason=admin`，文案「移动端暂不提供管理端…请使用电脑端」✅ |
| `/m/admin`、`/m/admin/monitor`（未登录） | 移动 404，不跳桌面登录 ✅ |
| 未知 `/m/unknown-page`（未登录） | 移动 404（公开）✅ |
| 受保护页 API 返回 401 | `/m/login?expired=1&redirect=…` ✅（桌面仍 `/login?expired=1`，main.js 按路径分流） |
| 桌面 `/`、`/login` | 正常渲染、无 `.m-screen`、0 报错 ✅ |

---

## 6. 问题清单（P0/P1/P2）

### P0（阻断交付）— 0 条

### P1（重要，建议集成前修）— 3 条

#### P1-1 学生「我的」缺字号偏好（v1 范围项与教师端不一致）
- **现象**：教师 `/m/teacher/profile` 提供「字号大小」标准/大/特大并持久化；学生 `/m/student/profile` 无该设置（DOM 未见「字号」，源码仅教师 Profile 实现）。
- **证据**：`client/src/mobile/views/teacher/Profile.vue:55-91,164,195`（`applyFont` + `localStorage m-font-size` + Sheet）；`client/src/mobile/views/student/Profile.vue` 无字号实现（grep 0 命中）；运行时 `smoke.json → components.font.studentHasFontSetting=false`；09-v1 §4「教师/学生『我的』：主题/字号/文档/退出」。
- **影响**：v1 范围项缺失、两端设置不一致；学生用户无法调大字号。
- **建议**：把教师页的 `applyFont` 抽到 `MobileLayout` 或 `composables/useFontScale.js`（共享能力，教师页注释已自曝该缺口），学生 Profile 复用。工作量 S。

#### P1-2 既有全仓门禁 `verify-frontend` 因 mobile 代码 3 项 FAIL（桌面零回归 CI 红）
- **现象**：`cd client && node scripts/verify-frontend.mjs --no-build` → `SUMMARY checks=71 failed=3`，全部由新增 `client/src/mobile/**` 触发：
  - **⑨e** UI 出口出现原始错误 `.message`：`views/public/Login.vue:155`（`errorMsg.value = (err && err.message) || …`）、`views/teacher/AssignWizard.vue:310`（`submitError.value = (err && err.message) || …`）。虽然 `ApiError.message` 已是可上屏规范化文案，但门禁要求走 `errorCopyOf`。
  - **⑬c** `v-html/innerHTML` 白名单：`views/student/Answer.vue:104-105,667,672`（`materialHtml/contentHtml`）。代码已用 `DOMPurify.sanitize`（:17,137），安全但未登记到门禁白名单。
  - **⑮b** 裸 `request` 调用（无就地 catch/safeLoad）：`Answer.vue:239`、`Profile.vue:78-80`、`Scores.vue:72-73`、`StudentHome.vue:155-157`；实际均包在 `Promise.allSettled`（不会冒泡白屏），属门禁正则未识别写法。
- **证据**：`/tmp/verify-frontend.log`（本次运行输出；也可在本地复跑上方命令）；失败行号如上。
- **影响**：仓库既有质量门禁从绿变红，Lead 若按门禁合入会被阻断；⑨e 若未来 ApiError 外错误进入该分支也可能上屏非友好文案。
- **建议**：由对应页面 Agent（T1/T3）改：登录/建作业错误走 `errorCopyOf`；Answer 的 v-html 登记白名单或改用已白名单化的 `safeMaterial/safeSqContent`（若存在）；裸 request 改 `safeLoad/safeSubmit` 或在门禁登记 `Promise.allSettled` 豁免（需 Lead 决策，不允许 QA 改）。工作量 S–M。

#### P1-3 批量审核未过滤实训题，走通用 review 存在接口/语义风险
- **现象**：`BatchSelect` 直接使用 `GET /teacher/submissions` 列表（无题型过滤），`BatchConfirm` 对每个选中 id 调 `PUT /teacher/submissions/:id/review`（通用题接口）。契约 §6 将实训题审核单列为 `PUT /teacher/submissions/:id/project/review`，§7.4 要求批量「逐条 review + publish」但未处理实训题分支。
- **证据**：`client/src/mobile/views/teacher/BatchSelect.vue:101-113`（仅 classId/assignmentId 参数，无 type 过滤）；`BatchConfirm.vue:142`（通用 review）、`:159`（publish ids）；契约 §6/§7.4。
- **影响**：若 `/teacher/submissions` 返回实训题（project）提交，批量将通过错误接口审核（可能 4xx 或评分语义不符），表现为"部分失败"而非静默错误。
- **建议**：前端在批量列表/确认处按题型过滤或分支（实训题走 project/review 或排除并提示"实训题请逐份审核"）；需 Lead/后端确认 `/teacher/submissions` 是否含实训题。工作量 S。

### P2（可后续）— 5 条

| # | 现象 | 证据 | 建议 |
|---|---|---|---|
| P2-1 | `mobileFeatures` 13 个开关未被任何页面/布局消费（仅定义文件自身注释），v1 的"开关关闭"实际靠"功能未实现"达成 | `grep -rn "from .*mobileFeatures" client/src/mobile` 0 命中；`features/mobileFeatures.js` | 契约 §7.10 要求延期项统一由开关控制；建议后续恢复延期能力时先接入开关（或文档明确 v1 用「不实现」代替开关）。S |
| P2-2 | 使用文档页仍列「作业布置…催交说明」（D6 催交为延期能力） | 运行 `/m/doc` innerText（`smoke.json` findings 原始命中）；页面为静态文档内容 | 更新文档文案为「暂未开放/电脑端」，避免暗示 v1 已有催交。S |
| P2-3 | 字号偏好实现为教师 Profile 页内局部注入 `<style id="m-font-size-style">`，未收敛共享；教师页注释已自曝"已作为共享能力缺口报给 Lead" | `teacher/Profile.vue:59-80` | 与 P1-1 合并处理，收敛到共享 composable/Layout。S |
| P2-4 | `Answer.vue` scoped 样式存在颜色字面量 `#fff`（徽标/选中题号） | `views/student/Answer.vue:841,885,888`；`static-check C2-obs` | 令牌规范要求走 `--text-on-brand/--brand-*`；低风险，后续替换。S |
| P2-5 | 契约文档 §3 教师路由计数笔误：「13 路由覆盖 14 实体屏」，实际列出 14 条且实现为 14 条（总数 31 正确） | `docs/mobile-app/10-v1-implementation-contract.md:38` | 修正为「14 路由 / 14 实体屏」。S |

---

## 7. 共享组件与已知问题复核

| 项 | 结论 | 证据 |
|---|---|---|
| MSheet 关闭按钮命中区 | ✅ 已修复为 **44×44**（设计评审 P1 关闭） | `styles/mobile.css:542`；运行时 `smoke.json components.sheet.closeW/closeH=44` |
| MSheet Esc / 遮罩关闭 / 语义 | ✅ 通过；`role=dialog`、`aria-modal=true`；关闭后焦点归还由组件 watch 实现 | `components/MSheet.vue:42-88,95-104`；`components.sheet.escClosed=true, maskClosed=true` |
| MSheet 是否被 teleport 出 `.m-screen` | ✅ 未 teleport，实测 `inScreen=true`（令牌/主题生效） | `MSheet.vue:93`；smoke |
| MobileLayout `role` 才出 TabBar | ✅ public 0 项、student/teacher 各 4 项；`bottom` 缺省按 role 推断 | `layout/MobileLayout.vue:39-53`；smoke components.tabbar |
| 字号偏好 | ⚠️ 教师可用并持久化（standard/large/xlarge）；**学生缺失 = P1-1** | `teacher/Profile.vue`；smoke components.font |
| 批量实训题走通用 review | ⚠️ 风险成立 = P1-3 | 见 P1-3 |
| 主题切换（上轮设计评审 P1） | ✅ 学生/教师 Profile 均使用 `useTheme` 与 `html[data-theme]`（代码注释与实现），未再出现设计稿的静态开关 | `views/student/Profile.vue:9,53-60`；`views/teacher/Profile.vue` |
| 页面错误不白屏 | ✅ 失败/空态均有可读反馈（6/6 三态通过）；`safeLoad/safeSubmit` 约定在页面层普遍使用 | `/tmp/smoke.log` states[] |
| 通用题不请求 project 接口 | ✅ 审核详情/代码页仅在实训题分支请求 `/submissions/:id/project`；本次 mock 通用提交未产生 project 请求 | `ReviewDetail.vue:160`；`smoke.json apiAudit.sample` |

---

## 8. 已知限制与待确认

**本次验收边界（不视为实现缺陷）**
1. **API 全部 mock**：字段形状由页面消费逻辑推导（对齐 `buildUnits`/`payload()` 等），未与真实后端响应逐字段核对；"有数据渲染"只验证挂载/标题/无报错/无溢出，不验证业务数值正确性。
2. **未真机**：未跑 Android WebView / 微信 / iOS Safari / Capacitor 壳；PWA/SW/manifest 不在 v1（07 M4+）。
3. **登录成功链路未 e2e**：仅验证守卫/401；`POST /auth/login` 成功后的角色跳转、D14 多学校 1002 UI 未端到端（代码存在：`Login.vue:139-147,341`）。
4. **桌面零回归**：仅冒烟 `/`、`/login`；全仓门禁 3 红见 P1-2，其余 68 项 PASS。
5. **写操作未验证**：批量 review/publish、改分、交卷、布置作业等 POST/PUT 仅 mock 200 路径，未做失败/并发/重试端到端。
6. **响应式**：v1 只验 390/360；≥768 桌面表格回退属 07/04 后续阶段。
7. **视觉/像素级**未复评（设计稿阶段已有独立设计评审报告）。

**待产品/后端确认（沿用 09 文档，不新增需求）**
- `/teacher/submissions` 是否包含实训题（决定 P1-3 修复方案）；`/teacher/submissions/:id/review` 对实训题的行为。
- D1–D13 延期项维持「延期（未取消）」；本实现未调用、未伪造对应数据（已审计）。
- `mobileFeatures` 与「不实现」的替代关系（P2-1）需 Lead/产品确认口径。

---

## 9. 复现命令与产物

```bash
# 0) 环境（仓库根）
cd client && npm run dev -- --port 5174 --host 127.0.0.1   # 验收后停掉
# 1) 静态边界（16 项）
node tests/mobile-v1/static-check.mjs
# 2) 路由清单（31 + 兜底 → artifacts/routes.json）
node tests/mobile-v1/route-inventory.mjs
# 3) 路由/页面/守卫/三态/API/组件冒烟（Playwright + mock API）
node tests/mobile-v1/smoke.mjs
# 4) 禁用文案 DOM 双查（18 页）
node tests/mobile-v1/dom-text-audit.mjs
# 5) 构建与 lint（只跑一次，避免并发构建）
cd client && npm run build && npx eslint src/mobile
# 6) 既有全仓门禁（桌面零回归）
node client/scripts/verify-frontend.mjs --no-build
```

**产物清单（tests/mobile-v1/）**
- `static-check.mjs` / `route-inventory.mjs` / `smoke.mjs` / `dom-text-audit.mjs`
- `artifacts/static-check.json`（16 PASS / 0 FAIL / 3 观察项）
- `artifacts/routes.json`（31+1 路由与组件映射）
- `artifacts/smoke.json`（33 页、13 守卫、6 三态、34 API 请求、共享组件结论）
- `artifacts/dom-text-audit.json`（18 页 DOM 双查，0 命中）
- 截图：`student-home.png`、`student-scores.png`、`teacher-review.png`、`teacher-review-detail.png`、`answer-sheet.png`（Sheet 打开态）、`admin-403.png`、`_m_student_home-360.png`、`_m_student_assignments-360.png`


**提交提示**：`tests/` 被 `.gitignore` 忽略（见 P1-4），提交前需 `git add -f tests/mobile-v1` 或由 Lead 加 `!tests/mobile-v1/` 例外。

**本次验收命令结果速查**
- `npm run build`：exit 0（50.44s；仅既有 >500KB chunk 告警）
- `npx eslint src/mobile`：exit 0
- `verify-frontend --no-build`：71 checks / **3 failed**（见 P1-2）
- `smoke.mjs`：0 console errors / 0 guard failures / 0 state failures / 0 overflow / 0 h1 异常
- `dom-text-audit.mjs`：18 页 visibleHits=0、hiddenHits=0

---

*本报告仅写入 tests/mobile-v1/**；未修改 client/src/mobile/**、共享文件、server/prisma；未执行 git commit/push。验收完成后已停止本地 dev server。*


---

## 10. Lead 修复回执与最终复验（2026-10-17）

> 页面 Agent 按本报告 P1/P2 修复后，Lead 重新走构建、门禁、lint、静态边界与 QA smoke；以下为最终状态。

### 10.1 P1 修复

| 项 | 修复 | 证据 |
|---|---|---|
| P1-1 学生字号偏好 | student/Profile.vue 增加标准/大/特大三档，localStorage m-font-size + 仅 .m-screen 变量注入，和教师端同口径 | 学生字号专项 Playwright 16/16；Profile 页面可见「字号大小」 |
| P1-2 verify-frontend 3 红 | ① Login.vue / AssignWizard.vue 改走 errorCopyOf；② Answer.vue v-html 表达式改 safeMaterialHtml/safeContentHtml；③ Answer/Profile/Scores/StudentHome 裸 request 改页面级 safeGet/safePut | node client/scripts/verify-frontend.mjs --no-build → 71 checks / 0 failed |
| P1-3 批量实训题风险 | BatchSelect/BatchConfirm 在 assignmentId 下先查 GET /teacher/assignments/:id；含 project 即禁用并提示「请逐份审核」；直达 URL 同样 fail-closed，不发 review/publish | 教师端 18/18 断言；正常纯 code 作业流程不变 |
| P1-4 T4 产物入库 | QA 已用 git add -f 将 tests/mobile-v1/** 纳入版本控制；Lead 最终 commit 保留 | git status 中非忽略；报告/脚本/artifacts 可提交 |

### 10.2 P2 处理

- 已处理：/m/doc 删除「催交说明」并明确「暂未开放」；
- 已处理：契约 §3 教师路由笔误 13→14；§7.10 说明 v1 用「不实现」代替开关消费；
- 已处理：Answer.vue scoped #fff 改 --text-on-brand；
- 后续优化：字号偏好仍为页面内实现（学生/教师各自），未收敛 MobileLayout；mobileFeatures 仍为未来开关位——均已在 09/10 记录，不影响 v1。

### 10.3 最终复验（Lead）

| 检查 | 结果 |
|---|---|
| cd client && npm run build | 通过（exit 0） |
| node client/scripts/verify-frontend.mjs --no-build | 71 checks / 0 failed |
| npx eslint src/mobile | 0 error / 0 warning |
| node tests/mobile-v1/static-check.mjs | 17 PASS / 0 FAIL（2 条观察项均属合法文案） |
| node tests/mobile-v1/smoke.mjs（dev server + mock） | 33 页面 / 0 console error / 0 P0/P1/P2 findings |
| 零后端边界 | server/**、prisma/**、迁移 0 diff；package.json/lockfile 无 diff；无新依赖/axios 实例 |
| 路由/页面 | 31 条契约路由 + /m 兜底；34 实体页；/m/admin 未注册；桌面 /、/login 无 .m-screen |
| 拦截结论 | 通过（P1 已闭环）；可合入 feat/mobile-app |

> 说明：QA smoke 脚本按文件头要求使用 dev server（5174）；用 vite preview 时 mock 的 /api 前缀与构建环境不同会误报 Answer 空数据，这不是产品回归，正式验收以 dev server 结果为准。


### 10.4 v1.1 交互调整（2026-10-17 晚）
- /m 欢迎页与 /m/doc 教师使用手册改为直接复用桌面端 client/src/views/Landing.vue / Doc.vue（桌面页本身响应式）；旧移动自定义页保留但不再挂路由，仅作参考。
- /m/login 按桌面登录同构简化：logo 改回 学习中.svg（与根目录同一文件），保留账号/密码/显示密码/记住账号/登录，去掉品牌 D、页脚、提示块、使用文档等冗余元素；多学校 1002 选择与首登改密提示仍保留。
- 桌面 Landing/Doc 在 /m 上下文把登录/文档/返回登录链接改走移动端（桌面行为不变）。
- QA 脚本已同步：/m、/m/doc 不要求 .m-screen，桌面手册正文不参与移动端延期文案扫描；smoke 结论更新为 33 页/0 console/0 P0/P1/P2。
- 复验：build exit 0；verify-frontend 71/0；eslint 0；static-check 17/0；smoke 33/0/0/0。

### 10.5 v1.2 顶部标题精简（2026-10-17 深夜）
- 教师端四个主 Tab 页去掉顶部重复标题：工作台、作业、评分审核（审核）、我的；保留各页右上角操作（通知/头像、布置作业、批量审核），详情页标题保留。
- 「我的」页删除右上角「使用文档」书签按钮，保留页内「关于与帮助」入口。
- 四个主 Tab 页补 sr-only h1，视觉不显示但保留无障碍页面标题；QA smoke 33 页 / 0 console / 0 P0/P1/P2，build / lint / verify-frontend / static-check 均通过。

### 10.6 v1.3 审核代码页文件树（2026-10-18）
- 教师端「代码只读」页的实训题文件选择从平铺 chips 改为可展开/收起的文件树；数据直接使用既有 GET /teacher/submissions/:id/project 返回的 studentFiles.tree / standardFiles.tree（缺失时按 contents 路径兜底），无后端改动。
- 默认展开当前文件所在目录链；文件夹可点按展开/收起；切换「学生提交/标准答案」会重建树并保持当前文件。
- 真机浏览器实测：提交 10471（20 个文件）树正常渲染、选中文件与代码同步、无控制台错误；QA smoke/static/build 均通过。