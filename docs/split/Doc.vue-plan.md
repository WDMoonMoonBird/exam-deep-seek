> ⚠️ **本方案已作废（2026-10-11 用户裁定剔除 Doc.vue），内容仅作存档参考。**
>
> **作废理由**：`Doc.vue` 是**纯静态的教师使用手册、不连任何后端**（Captain 独立实测：API 调用匹配数 = 0），其体量在**内容**而非**逻辑**
> （本方案的实测也印证了这点：script 350 行里**纯内容字符串 ≈298 行**、**行为只有 ≈52 行**；模板 208 行里 136 行是 5 个静态章节的手写 HTML 正文）。
> 拆它要动模板（B 档）⇒ 成本与收益不成比例。
>
> **本文件中仍然有效的两条产出**（供将来参考，勿丢）：
> ① **真实块清单**（compiler-sfc parse 实测）：template 1–208 / scriptSetup 210–559 / **style 有两个块**（scoped 561–810 + 非 scoped 811–1106）；
>    这是本专项**第四次**纠正 Captain 的块边界盘点（前三次 40/194、48/312、47/236），根因同为「用 grep 首个 `</template>` / 漏数 style 块」。
> ② **像素区域设计 + 对已有 `--with-doc-regions` 的 3 处缺陷判定（D1/D2/D3）** —— 见 §6.3.1 附近。将来做「更新手册截图」时可直接复用。
>    其中 **D1 是最严重的一条**：整页区域（`main.doc-main`）实测页面高度 >10000px（24 张 doc-img），全页截图会撞 Chromium 上限 → exit 2 或被截断成只比首屏 = **最坏形态的假绿**。
# Doc.vue 拆分方案（接缝与护航分析）—— GodFile 专项 step 8

- **step**: 8 ｜ **agent**: A（接缝与护航分析，只读）｜ **日期**: 2026-10-11
- **目标文件**: `client/src/views/Doc.vue`（**1106 行** / 50264 B）
- **DoD 档位**: `docs/plan/2026-10-11-godfile-split-plan.md` §5 —— ★**B 档**（触及模板块）。判定与理由见 §2；**这是本专项的第一个 B 档**。
- **立场**: **纯只读**。本文件是 Agent A 的**唯一产物**；本轮未修改/新建/删除仓库内任何其它文件，**未触碰任何 .vue**，未跑 jest / build / 未起服务 / 未占用 :5173/:3000 / 未联网 / 未执行任何 git 写操作。所有分析脚本均落在仓库外 /tmp/*.cjs。
- **依据**: docs/split/ReviewDetail.vue-plan.md（step 7 范本：L0/L1/④/⑤ 配方与两处判据装置缺陷）、docs/split/QuestionEdit.vue-plan.md、**docs/split/pixel-gate-report.md**（★B 档必读：能力与局限、--regions 协议、exit 2 语义）、docs/pipeline/project-constraints.md（**18 条**）。

## 版本锚点（本方案全部实测数据的取值时刻）

| 项 | 实测值 | 复算命令 |
|---|---|---|
| 仓库 | `/Users/you/My Projects/My Vue/Exam-DeepSeek`（**主 worktree**） | `pwd` |
| HEAD | `b97e6334e96ec7c9ec740395d861b66c6aa9240c`（branch `master`，step 7 已落地） | `git rev-parse HEAD` |
| 目标文件（改前 = 工作树 = HEAD） | **1106 行** / 50264 B / `d29075d4c537238907e53785da74f30bf31c06076fe3ef20954b0f5c95001128` | `shasum -a 256 client/src/views/Doc.vue`；`git show HEAD:client/src/views/Doc.vue \| shasum -a 256`（**两者逐字节相同**，本轮实测） |
| 第二个 worktree | `…/Exam-DeepSeek-ui`（`feat/ui-redesign`）：其 client/src/views/Doc.vue = **1097 行 / md5 5a38b2b7c3220b56a7fe6a742abb011e**，**与本仓不同** ⇒ ★G-A 仍然存在（tests/ui-redesign-verify/rig.sh:9 的 CLIENT_DIR **默认指向它**） | 两处各跑 `wc -l` / `md5` |
| 编译器 / 驱动 | vue/compiler-sfc **3.5.34**（★**位于 client/node_modules**，仓库根**没有**，实测 MODULE_NOT_FOUND）、@babel/parser、@vue/compiler-dom；Playwright 由门禁自带加载器解析 | 本轮实测 |
| 门禁现状 | scripts/gates/pixel-diff.mjs **工作树已被 Captain 扩展**（+70 行：新增 `--with-doc-regions`，追加 **4 区域 × 2 主题 = 8 个** Doc 区域；`--regions` 语义不变）。★该文件是本轮唯一的非 A 产物，**A 只读不改** | `git status --short -- scripts/` |
| 面积基线（只读实测） | arch-metrics.mjs:31 `BASELINE = { layerViolations: 0, unmigrated: 44, godfileOver800: 3, over500: 14 }`；`wc -l` 实测 **>800 恰好 3 个**：teacherController.js 1338 / **Doc.vue 1106** / reviewController.js 965 ⇒ **本步是当前最大的未拆文件** | `wc -l`（不跑门禁，纯只读） |

⚠ **锚点纪律**：step 5/6/7 报告中的锚点（e37d27c / b94407f / aa29505）**均已过期**；B/C 执行前必须重新 `git rev-parse HEAD`。本方案所有行号/计数都是**上表锚点下的本轮实测值**（constraints §3-10）。

---

## 0 约束遵守声明

1. 本文件是**唯一写入**；未修改任何 .vue/.js/tests//client/dist/scripts/gates/*；未执行任何 git 写操作；未跑 jest、未跑 build、未起任何服务；未联网；**未在仓库内落任何脚本**（分析脚本全部写 /tmp/an*.cjs）。
2. 所有行号/计数**本轮实测**：@vue/compiler-sfc 的 parse() / compileScript() / compileTemplate() + @vue/compiler-dom 模板 AST + @babel/parser 脚本 AST + grep 交叉验证。**未采信方案 §2 的盘点表**，并纠正了其中的**三处**错误（§1.0）。
3. ★**块边界一律用编译器实测**（descriptor.template.loc / scriptSetup.loc / **styles[]**），**未使用** `grep -n '</template>'` 首条命中 —— 该法在本文件**必然出错**：首个 `</template>` 在 **:192**（`<a-float-button>` 的 `#icon` 插槽），真实模板块闭合在 **:208**。**这正是 Captain 连错三次的同一条根因**（step5 194→40、step6 312→48、step7 236→47）：本文件若沿用同法会得到 **192**，与真值 208 差 **16 行** —— 恰好是「内层插槽起点 190 → 真闭合 208」的跨度。
4. 本方案的判据配方**经本轮实测/推演**，含 **6 处对范本与 DoD 的必要纠正或补强**（§6.2 L0 的**适用范围改判**、§6.1 的 **_ctx 基线 = 0**、§6.4-(4) 的④两条新盲区、§6.3 的**像素门禁 3 处缺陷 + 7 区域替代表**、§6.4-(6) 的 **DOM 节点级 + 内容级等价**判据、§7.2 的**结构天花板结论**）。

---

## 1 段落接缝图谱（逐段实测）

### 1.0 ★真实块清单 与 1106 行的构成（**纠正方案 §2 的三处错误**）

| 块 | 起止行（**编译器实测**） | 行数 | 字节 | sha256（首 16） |
|---|---|---|---|---|
| `<template>` … `</template>` | **1–208** | **208** | 16316 | `e69892a674831716` |
| `<script setup>` … `</script>` | **210–559** | **350** | 22724 | `0413aa5a0f73459a` |
| `<style scoped>` … `</style>` | **561–810** | **250** | 4934 | `abde63d6e479ca91` |
| ★**`<style>`（第二个、非 scoped）** … `</style>` | **811–1106** | **296** | 6284 | `6584d90bc555d5b9` |
| 分隔空行 | 209 / 560 | 2 | — | — |
| **合计** | **1–1106** | **1106** | 50264 | `d29075d4c5372389` |

**逐块求和核对**：208 + 350 + 250 + 296 + 2 = **1106** ✔（与 `wc -l` 实测一致）。
块外**无**任何其它内容：全文 HTML 注释 **13 行**、空行 **145 行**、**无许可证头**（均已含在各自块内）。

#### ★方案 §2 盘点的三处错误（不纠正则后续所有收益核算全错）

| 项 | 方案 §2 写的 | **实测真值** | 偏差 | 根因 |
|---|---|---|---|---|
| template | 192 | **208** | −16 | `grep -n '</template>'` 首条命中 = :192（`<template #icon>` 插槽的闭合标签） |
| style | 250 | **546**（**两个块：250 + 296**） | **−296** | **只数了第一个 `<style scoped>`，整个漏掉第二个无 scoped 的 `<style>`（:811–1106，296 行）** |
| 行数 | 1107 | **1106** | −1 | 口径差（按"标签行"多算 1 行） |
| 合计 | 192+350+250 = **792** | 208+350+546+2 = **1106** | **314 行"去向不明"** | **= 漏掉的 296 行第二个 style 块 + 2 分隔行 − 模板少算的 16 行**（296+2−16 = 282…见下） |

> **314 的去向已完全解释**：方案把 template 少算 16、把 style 少算 296、又多算 1 行。
> 真实的 1106 = 1104 行块内（208+350+250+296）+ 2 行分隔空行。
> ⇒ **"去向不明"的 296 行就在同一个文件里**，是一个**独立的、无 scoped 的第二个 `<style>` 块**。
> ★**这不是"大段注释/许可证头"** —— 实测全文 HTML 注释仅 13 行、空行 145 行，两者都已计入各自块内。

#### ★两个 style 块必须分开对待（本文件与 step 5/6/7 的结构性差异）

| 块 | scoped | 编译实测 | 覆盖对象（实测） | 能否搬走 |
|---|---|---|---|---|
| style[0] :561–810（250 行） | **是** | styles[0].scoped === true | .doc-layout/.doc-header/.doc-body/.doc-sidebar/.doc-main/.doc-section/.section-title/.section-body + **7 条 .section-body :deep(...)** + .flow-*/.img-placeholder + :target + @media(max-width:992px) | ❌ 不能（`data-v-` 归属由**本 SFC** 决定） |
| style[1] :811–1106（**296 行**） | **否** | styles[1].scoped === false | .doc-table / .a-alert(.a-alert-info) / .doc-tag-{blue,green,red,orange,purple,default} / .doc-spinner + @keyframes doc-spin / .doc-step* / .steps-content / .steps-action / **.doc-img** / **.lightbox-* + Transition 类** / @media(max-width:768px) | ⚠️ 理论可搬（全局 CSS 无 data-v 依赖），但**属风格层且同样是 0 行收益的搬运** ⇒ **本步不动**（§7.1-R10） |

> **为什么 style[1] 必须无 scoped（实测证据，非推测）**：它的**主要消费方是 v-html 注入的字符串内容**（sections2to7 / sections9to10 里的 `<table class="doc-table">`、`<div class="a-alert a-alert-info">`、`<span class="doc-tag doc-tag-purple">`）。
> v-html 的内容**在运行期才产生，拿不到本 SFC 的 data-v 属性** ⇒ 这些规则若写在 scoped 块里会**全部失效**。
> **另一子集必须全局**：.lightbox-* 作用于 `<Teleport to="body">` 的内容（:200–207），**teleport 出去的元素不在 .doc-layout 子树内**。
> ⇒ **两道硬禁令**：**不得给 style[1] 加 scoped**、**不得把 style[1] 的内容并进 style[0]**。

---

## 2 ★A 档 还是 B 档？—— 判定 **B 档**，且本文件存在**结构性天花板**

### 2.1 这 1106 行到底是什么（逐块说明）

| 块 | 行数 | 内容性质（**实测**） |
|---|---|---|
| **template** | **208** | **页壳 72 行 + 正文内容 136 行**。页壳 = 顶栏(:4–13) · .doc-body 容器(:15/:186) · 左侧 a-anchor 目录(:17–19) · main 与事件绑定(:22) · 移动端浮动按钮 + a-drawer(:188–196) · 图片灯箱 Teleport(:198–206)。**正文内容 136 行 = 5 个"静态章节"**（#intro 18 · #questions 41 · #project 43 · #aiflow 21 · #performance 13），全部是**手写 HTML 文档正文**，**不含任何构造性响应式绑定**（只有 3 组 a-steps + v-if 按钮 + 插值）。另有 12 行是 3 个 v-for + v-html 的短驱动块（:44–47 / :137–140 / :181–184） |
| **script setup** | **350** | **33 条顶层语句**（9 import + 24 声明；实测 **0 死代码**）。其中**纯文档内容字符串 ≈ 298 行**（sections2to7 160 行 + sections9to10 73 行 + 3 组步骤条 24 行 + allSections 10 行 + anchors 8 行…），**真正的行为逻辑只有 ≈ 52 行**（1 个 watch + 5 个函数 + 2 个 computed + 2 个生命周期钩子 + 3 个 UI ref） |
| **style[0] scoped** | 250 | 页壳布局 + 章节版式 + **7 条 .section-body :deep(...)**（为**静态章节的裸 h3/p/ul/ol/li/b** 提供版式）+ .flow-*/.img-placeholder（**0 模板引用**）+ :target + 992px 断点 |
| **style[1] 全局** | **296** | **文档正文的视觉层**：表格 / 提示条 / 6 种标签 / 加载点圈 / 步骤条(.doc-step*) / 截图 .doc-img / **灯箱** / 768px 断点 |

**一句话结论**：**Doc.vue 不是"逻辑 GodFile"，是"内容 GodFile"** —— 1106 行里 **≈ 434 行（模板 136 + 脚本 298）就是文档正文本身**，**行为只有 52 行**，**版式 546 行**。这与 step 2/5/6/7 的「script 占 80%、模板零改动」形态**根本不同**，因此**不能套用 A 档配方**。

### 2.2 能否只抽 script 就达成目标？—— **不能，且有算术证明**

**A 档能搬走的全部**（逐项实测行数）：

| 可搬单元 | 行数 |
|---|---|
| sections2to7 :306–465 + sections9to10 :467–539（纯内容字符串） | 233 |
| introSteps/flowSteps/qSteps + 3 个 *Items :262–294 | 33 |
| 灯箱族 :218–258（3 ref + 1 let + 4 函数 + 1 watch） | 41 |
| allSections + anchors :541–558 | 18 |
| sections2to5/sections7 :296–298 + checkMobile/2 hooks :300–304 | 9 |
| 移动端目录 2 ref :215–216 | 2 |
| import 行（9 → 收成 2–4 行） | ≈ 6 |
| **合计可搬** | **≈ 342** |

**A 档后的算术上界**（模板与样式**逐字节不动**）：

```
1106 − 342（script 全部可搬） = 764           ← 全搬空的极限，实际还要留接线代码
接线根必须保留：<script setup> 标签 2 行
                + const { … } = useXxx() 解构 ≈ 20 行（step 7 实测基准 21 行）
                + 2 个 onMounted/onUnmounted 委托 ≈ 3 行
⇒ Doc.vue ≈ 789 行（最好情况）
```

> ★★**结构天花板（本方案最重要的一条结论）**：
> ```
> 不可触碰基线 = template 208（A 档不动） + style 546 = 754 行
> 目标 = ≤ 800 ⇒ A 档能留给 script 的预算只有 46 行（含 <script setup> 标签与全部接线）
> ```
> **754 行的不动基线 + ≥ 21 行的接线根 ≈ 775–789 行**，**贴线**：任何注释、换行、解构行数波动都会翻红。
> ⇒ **A 档在本文件「理论上勉强够、工程上不可接受」**：它把 1106 压到 ~790，却让 .vue 长期停在「离红线 10 行」的位置，**且换不来任何结构改善**（内容仍全压在模板里）。
> 这正是 DoD 判据 1（arch-metrics godfileOver800 ≤ 3）的**临界陷阱** —— 只降行数不换结构的做法会让下一步无路可走。

### 2.3 必须动模板：三种改法的 DOM / 像素影响预测（按改动面从小到大）

| # | 改法 | 模板行数变化 | **DOM 树变化** | **像素影响预测** | 需先调区域表？ | 收益 | 结论 |
|---|---|---|---|---|---|---|---|
| **(a)** | 把 5 个静态章节的"内容"抽成数据，模板改为 **v-html 驱动** | 136 → 12（−124） | **0**（.section-body 仍在原处，内容由 innerHTML 注入） | **预测全等**：style[0] 的 7 条 :deep(h3/p/ul/li/b) 作用于**裸元素**，改成 v-html 后**照样命中**（:deep 不要求元素带 data-v）✔；style[1] 的表格/标签类**本就为 v-html 而写**，命中不变 ✔ | 否 | −124 | ⚠️ **可行但降级**：把编译期模板降级为运行期字符串（与仓库既有 v-html 风格一致，但**牺牲 IDE/编译期检查**）。**仅作为 (b) 失败时的退路** |
| **(b)** | ★**把 5 个静态章节抽成 1 个子组件 DocSection.vue**（子组件内**不含** .section-body 包裹层 —— 见 §2.5 硬约束） | 136 → **5**（−131） | **0 元素增减**（Vue fragment 根不产生包裹节点；h3/p/ul/table/img 逐节点同序同级） | **预测全等**（子组件自己的 scoped 样式**不写任何规则** ⇒ 版式仍全部来自父组件的 data-v） | **否**（#intro/#questions/… 选择器**全部仍在**） | **−131** | ✅ **推荐** |
| **(c)** | 把 5 个静态章节**各自**抽成 5 个子组件 | 136 → 5 | 同 (b) | 同 (b) | 否 | −131（同 (b)） | ❌ 不必要：**同样收益下多 4 个文件 + 4 倍维护面** |

> ★**改法 (d)（A 之外的第四种）已排除**：把内容字符串搬进 `client/public/` 或 `.html` 再 fetch/import 进来 —— **会新增运行期 HTTP 请求**（门禁的 unmockedApi 会点名、且属行为变更），**且 fetch 是异步的 ⇒ 首帧必然变化 ⇒ 像素必红**。

**改法 (b) + 全部脚本搬运 的合并账**：

```
1106 − 342（script 全部可搬） − 131（模板 5 个静态章节抽出） = 633
+ 接线根真实开销（★实测基准：step 7 的接线根 = 620 − (236+359+2+2) = 21 行）
⇒ Doc.vue ≈ 616 ± 10 行（降 44%）
```

### 2.4 ★判定：**B 档**（触及模板块），理由三条

1. **A 档无法达成目标**（§2.2 已给算术证明）：只抽 script 最好 ≈ 789 行，**贴线且工程上不可接受**；必须动模板才能拿到 **−131** 的确定性收益。
2. **DoD §5 的字面口径已触发**：本步必然修改模板块 ⇒ 落在 **B 档**定义内（「触及模板块或样式块的步」⇒ **必须过像素门禁，且区域表须先覆盖该文件所在路由**）。
3. **B 档的唯一新增成本（区域表）已经付清**：/exam/doc 是**公共路由**（router/index.js:57，beforeEach :81–83 显式放行）、**零 API 调用**（§6.3 夹具清单实测为**空**）、Captain 已把 **8 个 Doc 区域**加进 pixel-diff.mjs。

> ★**但 B 档在本文件不是"全文放开"**：模板**只有 136 行内容区可动**，页壳 72 行与两个 style 块（546 行）**逐字节不动**（见 §2.5 白名单）。

### 2.5 ★改动面白名单（B 档的边界，B 逐字遵守）

| 区域 | 行号 | 本步许可 |
|---|---|---|
| 模板块 **页壳**（顶栏 / .doc-body 容器 / aside / main 开合标签 / 浮动按钮 / a-drawer / Teleport 灯箱） | :1–24, :186–208 | ❌ **逐字节不动** |
| 模板块 **正文内容**（5 个静态章节） | **:25–42, :51–91, :93–135, :144–164, :167–179** | ✅ **允许搬进 DocSection.vue**（★"内容" = 保留每章的 `<section id class="doc-section">` 与 `<div class="section-body">` **两层包裹在 Doc.vue**，只搬包裹层**内部**） |
| 模板块 3 个 v-for 驱动块 | :44–47, :137–140, :181–184 | ❌ 不动（已是最小形态） |
| scripts setup 全部 | :210–559 | ✅ 允许整体重组（§4 目标划分） |
| style[0] scoped | :561–810 | ❌ **逐字节不动** |
| style[1] 全局 | :811–1106 | ❌ **逐字节不动** |

---

## 3 段落图谱（含页壳外段落）

### 3.1 脚本段（**10 段，实测**；script 内 **0 条 `// =====` 横幅**，段界由 AST 语句边界 + 注释实测确定）

| # | 段落名 | 起止行（实测） | 行数 | 段内顶层声明（名@行） | 响应式/生命周期实测 | 模板引用 |
|---|---|---|---|---|---|---|
| **S0** | import 面 | 211–213 | 3 | ref computed h watch nextTick onMounted onUnmounted @211 · BarsOutlined @212 · Tag @213 | — | **BarsOutlined @192**（#icon 插槽内，方括号式引用） |
| **S1** | 移动端浮动目录开关 | 215–216 | 2 | showMobileToc @215 · mobileTocOpen @216 | 2 ref | **是（2/2）**：:189 v-if · :194 v-model:open · :195 @click |
| **S2** | ★图片灯箱（a11y：Esc / 焦点入箱 / 焦点回位 / Tab 不逃出） | 218–258 | **41** | lightboxOpen @219 · lightboxSrc @220 · lightboxCloseRef @221 · **lightboxTrigger @222（let，非响应式）** · openLightbox @224 · closeLightbox @229 · onMainClick @232 · onMainKeydown @237 · onLightboxKeydown @244 · **watch(lightboxOpen,…) @249–258** | 3 ref + 1 **setup-let** + **1 个顶层 watch** | **部分（5/10）**：lightboxOpen :202 · lightboxSrc :204 · closeLightbox :202/:203 · onMainClick :22 · onMainKeydown :22；**lightboxCloseRef 走 string ref :203**；lightboxTrigger/openLightbox/onLightboxKeydown **不进模板** |
| **S3** | 系统简介步骤条数据 | 260–270 | 11 | introStep @261 · introSteps @262 · introStepItems @270 | 1 ref + 1 map | **是（3/3）**：:28 :items · :30 插值 · :32/:33/:35 v-if |
| **S4** | AI 评分流程步骤条数据 | 272–282 | 11 | flowStep @273 · flowSteps @274 · flowStepItems @282 | 1 ref + 1 map | **是（3/3）**：:148/:150/:152–155 |
| **S5** | 新建题目步骤条数据 | 284–294 | 11 | qStep @285 · qSteps @286 · qStepItems @294 | 1 ref + 1 map | **是（3/3）**：:59/:61/:63–66 |
| **S6** | 章节切片 + 移动端 + **生命周期** | 296–304 | **9** | sections2to5 @297（computed）· sections7 @298（computed）· checkMobile @300 · **onMounted @303 · onUnmounted @304** | 2 computed + **2 个生命周期钩子（全在此段）** | **部分（2/3）**：sections2to5 :44 · sections7 :137；**checkMobile 不进模板** |
| **S7** | ★章节内容数据（2~8 章） | 306–465 | **160** | sections2to7 @306（6 个对象，6 条 HTML 模板字符串） | 无 | 经 sections2to5/sections7 间接进模板 |
| **S8** | ★章节内容数据（11~13 章） | 467–539 | **73** | sections9to10 @467（3 个对象，3 条 HTML 模板字符串） | 无 | 经 sections9to10 直接进模板 :181 |
| **S9** | 目录（anchors） | 541–558 | **18** | allSections @541（12 项）· anchors @551（h() 渲染函数，**Tag 组件 + .tag-warning 全局语义类** :556） | 无响应式 | **是**：anchors :19（桌面）· :196（a-drawer 内） |

**闭合核对**：段内行数 = 3+2+41+11+11+11+9+160+73+18 = **339**；块内 349 行 − 339 = **10 行分隔**。
**AST 实测**：顶层语句 **33 条**（3 import + 20 VariableDeclaration + 4 FunctionDeclaration + 3 ExpressionStatement（1 watch + 2 hook）+ …按 AST 精确计数 = 33）；**0 嵌套函数**；**0 死代码**（compileTemplate 可见名 ∪ 脚本内引用 = 全部 24 个声明）。

### 3.2 ★五处「物理位置 ≠ 逻辑归属」的暗礁（实测）

1. **watch(lightboxOpen, …) :249–258 物理在 S2、但它是 setup 期的顶层副作用** —— 内含 `await nextTick()`（微任务）与 lightboxTrigger 的读-清-写。⇒ **必须与 lightboxTrigger 同在一个 composable 内**，且**注册必须在 setup 同步阶段**（若被包进 onMounted 会改变首次触发时机与 watcher scope）。
2. ★**onMounted/onUnmounted :303/:304 是"一个语句同时挂两个监听器"** —— resize → checkMobile、keydown → onLightboxKeydown，**两者分属两个不同 composable**（S1 与 S2）。⇒ **这是本文件唯一的"跨 composable 生命周期"接缝**：注册顺序必须仍为 **resize 在前、keydown 在后**，清理顺序同理（见 §5-U4）。
3. ★**sections2to5/sections7 :297/:298 依赖 :306 的 sections2to7（声明在前、依赖在后）** —— 能工作**只因为它们是 computed（惰性求值）**。⇒ **不得改成普通 const 数组切片**（那会在 setup 期抛 ReferenceError: Cannot access before initialization）。这是本文件最容易被"顺手优化"改坏的接缝。
4. **sections2to7[4]（id:questions，"6. 题库管理"）模板不可达** —— sections2to5 = slice(0,4)（索引 0–3）、sections7 = [sections2to7[5]]（只取索引 5）⇒ **索引 4 永不渲染**（占 21 行，是"数据里的死项"）。**本步不得删**，登记为 **K3**。
5. ★**anchors :551 用 h(Tag, …) 渲染 BETA 标签**（:556）—— 它把 **antd 的 Tag 组件**混进了一个"纯数据数组"。⇒ anchors **不能"纯数据化"**（那会丢组件渲染），必须整体留在 .js 模块里并保留 `import { Tag } from 'ant-design-vue'` 与 h 的 vue import。这是判据④必须覆盖、也是**唯一能在 DOM 上验证**（.tag-warning 的 BETA）的点。

### 3.3 模板可见面实测（**拆分的硬边界**，B/C 按此对拍）

| 类别 | 数量 | 明细（compileTemplate 产物实测） |
|---|---|---|
| **点式 `$setup.名字`** | **20** | anchors closeLightbox flowStep flowStepItems flowSteps introStep introStepItems introSteps lightboxOpen lightboxSrc mobileTocOpen onMainClick onMainKeydown qStep qStepItems qSteps sections2to5 sections7 sections9to10 showMobileToc |
| ★**方括号式 `$setup["名字"]`** | **1** | **BarsOutlined**（:192，#icon 插槽内的组件）—— **点式扫描会整批漏掉**（step 7 已登记同类） |
| **静态 string ref** | **1** | lightboxCloseRef :203（ref="lightboxCloseRef"） |
| **模板可见名合计** | **22** | = 21 个 setup 名（20 点式 + 1 方括号）+ 1 个 string ref；其中 **20 个是顶层声明**，1 个是组件 import |
| ★**编译产物 `_ctx.` 引用** | **0** | **实测 0 命中** ⇒ **`_ctx` 的正确基线是 0，不是 1**（step 7 的基线是 1，因其模板里有 $router；本文件模板**无任何 $* 全局属性**） |
| `unref(` 调用 | 0 | — |
| 模板内联赋值目标 | **7 处（4 个名字）** | `@change="introStep = $event"` :29 · `@click="introStep = 0"` :36 · `@change="qStep = $event"` :60 · `@click="qStep = 0"` :66 · `@change="flowStep = $event"` :149 · `@click="flowStep = 0"` :156 · `@click="mobileTocOpen = true"` :189 —— 全部编译为 `$setup.X = …` 的**赋值**（★不是 `.value =`，故这些名字必须留在 setup 作用域，且搬进 composable 后必须由接线根**解构回同名 const**） |
| v-model 目标 | **1 处** | mobileTocOpen :194（v-model:open） |
| resolveComponent（全局组件） | 6 | a-button a-anchor a-steps a-tag a-float-button a-drawer；另 Teleport/Transition 为内建 |
| 模板元素总数 | **178** | 最大深度 **7**（div.doc-layout > div.doc-body > main > section > div.section-body > ul > li > b）—— ★**§6.4-(6) DOM 节点级判据的基数** |
| .doc-img 总数 | **18** | **6 张写在模板**（:56/:70/:76/:100/:110/:122）+ **12 张在内容字符串里**（v-html） |

### 3.4 ★执行路径（多形态）实测：**本文件只有一条路由、零 props、零 API、零路由参数**

| 轴 | 驱动源 | 取值 | 可达性实测 |
|---|---|---|---|
| **轴 1 路由** | router/index.js:57 `{ path: '/doc', component: … }` | **仅 /exam/doc 一条** | ★**公共路由**：beforeEach :81–83 `if (to.path === '/doc') return true` ⇒ **不需要 token / 不校验角色**。**无路由参数、无 props、无 defineProps**（实测 0 命中） |
| **轴 2 视口** | checkMobile() :301 `window.innerWidth < 992` + 2 条媒体查询（style[0] 992px / style[1] 768px） | showMobileToc true/false · 侧栏显示/隐藏 · 步骤条横排/纵排 | 真浏览器可达；页面总高 **>10000px**（24 张截图：18 张 1440×900 + 6 张 3420×1794 ⇒ 主栏 976px 宽下每图 ≈ 610px） |
| **轴 3 步骤条状态** | introStep/flowStep/qStep（3 个 ref，**各 6 项**） | 6×6×6 = 216 组合，但**三组彼此独立**（互不引用） | 由用户点击驱动；**初始态一律 = 0**（:261/:273/:285）⇒ 门禁只需覆盖 3 组「上一步/下一步/重新浏览」的 v-if 三点 |
| **轴 4 灯箱** | .doc-img 点击 / Enter / Space（:232/:237） | 开/关 · 触发元素是否聚焦 · Esc · Tab | ★**点击委托绑在 main 上（:22）**，因此 6 张模板内 + 12 张 v-html 内的图**都能触发**（这是必须保留的结构） |
| **轴 5 主题** | localStorage[ui-theme] → useTheme → html[data-theme] | light / dark | ★实测：两个 style 块大量走 CSS 变量（--bg-canvas/--bg-surface/--text-primary/--brand-600/--status-*），tokens.css 的 light(:182/:200/:215) 与 dark(:241/:252/:261) **取值不同** ⇒ **亮/暗像素必然互异**（满足门禁的 themeActuallyDiffers 自检） |
| **轴 6 步骤条内容插值** | `{{ introSteps[introStep].content }}`（:30/:61/:150） | 6 段文案随步骤切换 | ★**这三处插值必须在接线根作用域内可解析**（A2/A1 断言） |

**★三条形态一致性断言（B/C 必须守住）**：

- **A1（步骤条真值源唯一）**：introStepItems/flowStepItems/qStepItems = `*.map(s => ({ title: s.title }))`（:270/:282/:294）—— **必须保持"从同一数组派生"**，不得在子组件里再 map 一遍（会引入第二真值源）。
- **A2（内容与驱动的绑定方向不变）**：sections2to5 / sections7 / sections9to10 三个名字**必须继续留在 setup 作用域**（模板 :44/:137/:181 直接引用）⇒ 若搬进 composable，**必须由接线根解构回来**，不得只在子组件里以 props 传递后删掉本文件的名字。
- **A3（.doc-img 的类名与 tabindex="0" 逐字不动）**：灯箱靠 `e.target.closest('.doc-img')`（:233）与 `el.closest('.doc-img')`（:240）识别目标。⇒ 搬进子组件时 **class / tabindex / :src / alt 必须逐字节保留**。

---

## 4 目标文件划分

### 4.1 五条不可协商的形式前提

1. **新增文件一律放 client/src/composables/doc/ 与 client/src/components/**（与既有的 composables/{submit,question,review,project}/ 同级惯例一致）。
2. **纯数据文件用 .js 放 client/src/composables/doc/docContent.js**（**不新增 client/src/data/ 顶层目录** —— 那会偏离既有目录惯例）。
3. ★**Doc.vue 保留的模板必须与改前"节点级等价"**：`<section id class="doc-section">` 与 `<div class="section-body">` **两层包裹留在 Doc.vue**，只搬包裹层**内部**（理由见 §2.3-(b)）。
4. **两个 style 块逐字节不动**，新组件**不写 style 块**。
5. **不得新增依赖**、不得改路由、不得改对外契约（本文件本就零路由参数、零 API）。

### 4.2 文件 → 单元对照表（**完整覆盖 33 条顶层语句**）

| 目标文件 | 职责 | 搬走的声明（名@行） | 搬走行数 | 预估产出行数 |
|---|---|---|---|---|
| **client/src/composables/doc/docContent.js** | **纯内容数据（0 逻辑、0 vue import）** | sections2to7 @306–465 · sections9to10 @467–539 | **233** | ≈ 240 |
| **client/src/composables/doc/useDocSections.js** | 章节切片 | sections2to5 @297 · sections7 @298 | 2 | ≈ 12 |
| **client/src/composables/doc/useDocAnchors.js** | 目录（含 h() + Tag） | allSections @541 · anchors @551 · import { h } · import { Tag } | 18 | ≈ 30 |
| **client/src/composables/doc/useDocSteps.js** | 3 组步骤条 | introStep @261 · introSteps @262 · introStepItems @270 · flowStep @273 · flowSteps @274 · flowStepItems @282 · qStep @285 · qSteps @286 · qStepItems @294 | 33 | ≈ 45 |
| **client/src/composables/doc/useDocLightbox.js** | 灯箱 + a11y | lightboxOpen @219 · lightboxSrc @220 · lightboxCloseRef @221 · lightboxTrigger @222 · openLightbox @224 · closeLightbox @229 · onMainClick @232 · onMainKeydown @237 · onLightboxKeydown @244 · watch @249–258 · **onUnmounted @304 的 keydown 一半** | **41** | ≈ 55 |
| **client/src/composables/doc/useDocMobileToc.js** | 移动端目录开关 + resize | showMobileToc @215 · mobileTocOpen @216 · checkMobile @300 · **onMounted/onUnmounted @303/:304 的 resize 一半** | 5 | ≈ 20 |
| **client/src/components/DocSection.vue** | ★5 个静态章节的**内容**（**无 script、无 style**） | 模板块 :25–42 / :51–91 / :93–135 / :144–164 / :167–179 的**内部**（共 **131 行**） | — | ≈ 140 |
| **client/src/views/Doc.vue（保留）** | 接线根 + 页壳 + 2 个 style 块 | 全部 import 收窄 + 6 组解构 | — | **≈ 616**（推算，见 §2.3） |

**单元数：8 个目标文件**（7 新 + 1 保留）= 5 个 composable + 1 个数据模块 + 1 个内容子组件 + Doc.vue 本身。与 step 5/6/7 的 9/12/7 同量级。

### 4.3 ★接线根（Doc.vue）的精确形态（B 照抄；★两处顺序陷阱已标出）

```js
import { BarsOutlined } from '@ant-design/icons-vue';
import DocSection from '../components/DocSection.vue';
import { useDocMobileToc } from '../composables/doc/useDocMobileToc';
import { useDocLightbox } from '../composables/doc/useDocLightbox';
import { useDocSteps } from '../composables/doc/useDocSteps';
import { useDocSections } from '../composables/doc/useDocSections';
import { useDocAnchors } from '../composables/doc/useDocAnchors';

// ★★调用顺序 = 改前 setup 的字面顺序（不得交换）：
//   :215-216 移动端 → :218-258 灯箱(watch) → :260-294 步骤条 → :296-298 切片 → :300-304 目录
//   关键：resize 的 onMounted 必须早于 keydown 的 onMounted（§5-U4）
const { showMobileToc, mobileTocOpen } = useDocMobileToc();
const { lightboxOpen, lightboxSrc, lightboxCloseRef, openLightbox, closeLightbox, onMainClick, onMainKeydown, onLightboxKeydown } = useDocLightbox();
const { introStep, introSteps, introStepItems, flowStep, flowSteps, flowStepItems, qStep, qSteps, qStepItems } = useDocSteps();
const { sections2to5, sections7, sections9to10 } = useDocSections();
const { anchors } = useDocAnchors();
```

> ★★**顺序陷阱（本步最容易犯的错）**：改前只有**一个** onMounted，体内**先 resize 后 keydown**（:303）；清理同理（:304）。拆开后两个监听器**分属两个 composable** ⇒ **注册顺序由"两个 composable 的调用顺序"决定**。
> ⇒ **必须 useDocMobileToc() 在前、useDocLightbox() 在后**。
> ⇒ **不得**在接线根留两个空的 onMounted/onUnmounted（死代码，且掩盖真实顺序来源）。
> ⚠️ 若两个 composable 各自调用 onMounted/onUnmounted（推荐），接线根**不再需要** `import { onMounted, onUnmounted }` ⇒ **必须删掉**（否则触发 no-unused-vars）。
> ⚠️ **接线根也不再需要** `import { Tag } from 'ant-design-vue'` 与 `import { h } from 'vue'`（两者只被 anchors 用，已随 useDocAnchors 迁走）—— **必须删干净**，否则 lint (a) 与 lint (b) 都会红。

### 4.4 本仓既有先例（**均有事实依据**）

| 先例 | 事实 |
|---|---|
| client/src/composables/ 已有 4 个子目录 | project/ question/ review/ submit/（ls 实测）⇒ 新增 doc/ **符合既有惯例** |
| 既有 composable 全部是 .js 且导出 useXxx() | useTheme.js useConfirm.js useDraftAutosave.js useMonacoKeyboardA11y.js useMonacoTheme.js useProjectUpload.js useSelectAriaSync.js（ls 实测） |
| client/src/components/ 已有扁平子组件 | ListPage.vue / RichEditor.vue / checker/CheckerWizard.vue（t16/scan-f4.mjs:11 明确列出 client/src/components/RichEditor.vue）⇒ DocSection.vue 放 components/ 根**符合惯例** |
| ★**:deep() + 子组件** 的既有组合 | 全仓 **70 处 :deep(**（实测）：Layout.vue 族用 .layout :deep(.ant-layout) **跨子组件（antd Layout）**；ReviewDetail.vue:452 .sq-editor-wrap :deep(.monaco-editor) 跨 Monaco 组件 |
| /exam/doc 已有独立验收装置 | tests/ui-redesign-verify/artifacts/T5-a11y.mjs:127（{ id: 'doc', url: APP + '/doc', auth: null }）· t16/probe-app.mjs:41（{ id: 'doc', url: '/exam/doc', auth: null }）⇒ C 可只读借用做 a11y 对照（★不得改 tests/） |

---

## 5 ★响应式与生命周期六条判定（本步核心）

| # | 判定项 | 结论 | 实测依据与约束 |
|---|---|---|---|
| **1** | **ref 所有权** | **等价** | 4 个响应式 ref（showMobileToc / mobileTocOpen / lightboxOpen / lightboxSrc）+ 1 个 string-ref（lightboxCloseRef）+ 3 个步骤条 ref。**全部是"单写者"**：showMobileToc 仅 checkMobile 写；mobileTocOpen 仅模板写；lightbox* 仅灯箱族写；*Step 仅模板写 ⇒ **每个 ref 归一个 composable，无双写者冲突**。★**lightboxTrigger 是 let（非响应式）**，被 openLightbox（写）与 watch（读-清）触碰 ⇒ **必须与 watch 同模块** |
| **2** | **watch 顺序** | **等价（需特殊处理）** | 全文件**仅 1 个 watch**（:249，lightboxOpen）。**无 immediate、无 flush 选项**（默认 pre）⇒ 注册位置不影响语义，**但注册时机必须在 setup 同步阶段**。★这里 watch 在 onMounted 之前注册（:249 < :303） |
| **3** | **钩子注册（顺序/位置）** | ★**需特殊处理** | 只有 **1 个 onMounted + 1 个 onUnmounted**（:303/:304），**各自在一个箭头函数体里挂两个监听器**：resize → checkMobile、keydown → onLightboxKeydown。⇒ **跨两个 composable**。Vue 钩子按注册顺序执行 ⇒ **改后顺序必须仍为 resize 注册 → keydown 注册**；清理必须仍为 removeEventListener(resize) → removeEventListener(keydown)。★**判据⑤必须对拍 addEventListener/removeEventListener 序列**（静态判等全盲） |
| **4** | **清理顺序** | **需特殊处理** | 同上。★另一条：watcher 的停止依赖组件作用域（setup 顶层创建的 watcher 随组件卸载自动停止）⇒ 搬进 composable 后**仍必须在 setup() 同步阶段调用 useDocLightbox()**（若包进 onMounted 或条件分支，watcher scope 错误 ⇒ **静默泄漏 + 卸载后仍响应**，L0/L1/build 全盲） |
| **5** | **路由/store/请求注入时机** | **等价（比 step 7 更简单）** | ①**无 useRoute/useRouter**（实测 0 命中；模板也无 $route/$router ⇒ **_ctx 基线 = 0**）。②**无 pinia/store**（0 命中）。③**无 defineProps/defineEmits/defineExpose/withDefaults/provide/inject**（0 命中）。④**零 API 调用**：全文无 axios/request/fetch 命中（实测），App.vue 也不发请求 ⇒ **本文件是纯静态页**（与 ReviewDetail/Submit 的根本差异）。⑤唯一"外部注入"是 window 的两个监听器与 document.activeElement（灯箱） |
| **6** | **动态加载** | **等价（需特殊处理）** | ①**无 defineAsyncComponent、无动态 import()**（实测）。②模板里有 6 个全局 antd 组件 + Teleport/Transition + 1 个 import 组件 BarsOutlined。★**新增的 DocSection.vue 是静态 import** ⇒ 会被打进同一 chunk 或被 Rollup 拆成独立 chunk。**两种都允许**（门禁禁用 asset 文件名/哈希判等），但 **ready 选择器不得假设"子组件已渲染"**（见 §6.3 的 ready/witness 拆分） |

### 5.1 ★「不确定需实测」清单（交给 C，**共 10 条**）

| U# | 项 | 为什么静态判等看不见 | 实测方法与**期望值** |
|---|---|---|---|
| **U1** | ★**父组件 scoped 的 :deep() 能否命中子组件内容** | :deep(h3) 编译为 .section-body[data-v-p] h3；子组件的 h3 **不带** data-v-p。**理论命中**（data-v-p 只约束 .section-body），但这是本步**唯一的理论推断支点** | 真 Chromium：取 #questions .section-body h3 的 fontSize/marginTop **改前 = 改后**；再取 #intro h3 / #aiflow h3 各一次；**正控**：临时给一个 h3 加内联 font-size 应能改变读数。★**U1 不成立 ⇒ 改法 (b) 降级为 (a)** |
| **U2** | ★**子组件 fragment 根是否产生包裹节点** | 若误把 .section-body 也搬进子组件，会多一个包裹层 ⇒ **DOM 深度 +1、.doc-section > .section-body 失配** | main .doc-section = **8**、.section-body = **8**、main .doc-section > .section-body = **8**、模板元素总数 **178**、最大深度 **7**。**任一不等 = 阻断** |
| **U3** | **mobileTocOpen 的 v-model:open 双向写是否仍生效** | v-model 编译为 `$setup.mobileTocOpen = $event`（**赋值**），依赖该名字留在 setup 作用域 | 真运行时：a-drawer 打开后触发 @click（:195）应把 mobileTocOpen 置回 false；对拍改前/改后的代理写次数（1 vs 1） |
| **U4** | ★**两个监听器的注册顺序与清理顺序** | 静态判等对 addEventListener 的**跨模块顺序**全盲；step 2 已实证"build 绿 ≠ 能跑" | 替身 window.addEventListener 记录 (type, order)：**改前 = [resize, keydown]，改后必须逐项相同**；removeEventListener 同理。**变异反证**：对调两个 composable 调用顺序 ⇒ 该断言必须**转红** |
| **U5** | ★**watch(lightboxOpen) 是否仍在 setup 同步阶段注册且首次触发等价** | 若包进 onMounted 或条件里，watcher scope 错误 | 替身 watch 计数 + nextTick 后的焦点调用序：**开 → lightboxCloseRef.focus() 1 次**；**关（有 trigger）→ trigger.focus() 1 次 且 lightboxTrigger 置 null**；**关（无 trigger）→ 0 次** |
| **U6** | ★**sections2to5/sections7 的 computed 惰性是否仍成立**（声明顺序陷阱） | 若在模块顶层做 .slice()，会抛 TDZ ReferenceError | 真 import 一次（constraints §3-12：node --check **不算证据**）+ 断言 sections2to5.value.length === 4、sections7.value.length === 1、sections7.value[0].id === 'assignments'`。★**变异反证**：把 computed 改普通数组，必须观察到 ReferenceError |
| **U7** | **anchors 里的 h(Tag, …) vnode 是否仍能被 a-anchor 渲染** | anchors 从"本文件常量"变成"跨模块返回值"，Tag 的 import 随之迁移 | 真运行时：aside.doc-sidebar 的锚点项数 = **12**；其中 project 项渲染出 **.tag-warning 的 "BETA"**（必须是 span.ant-tag.tag-warning，不是纯文本）—— 唯一能在 DOM 上验证 h()+Tag 的观测点 |
| **U8** | **.doc-img 的点击委托与键盘路径** | v-html 产生的 12 张图**不在模板 AST 里** | 点击 #quickstart .doc-img（v-html 内）→ lightboxOpen === true；document.activeElement 聚焦 .lightbox-close；Esc → 关闭且焦点回到该图。**模板内 + v-html 内各测 1 张** |
| **U9** | ★**提取的 136 行内容是否逐字节不变** | 拆分最容易在"搬移时顺手改一个空格/全角"处出错 | 改前/改后各取 5 个章节的 **innerHTML**，逐章 sha256 相等 —— 见 §6.4-(6) |
| **U10** | **DocSection.vue 的 chunk 归属及其对 ready 的影响** | 若被拆成独立 chunk，首帧会晚于 main.doc-main 出现 | page.on(request) 抓 /exam/doc 的全部 JS 请求：**不设"必须同一个 chunk"的断言**，但**必须断言 §6.3 的 ready 选择器任何情况下都能等到** |

---

## 6 ★判据落地方案（**B 档**：A 档 5 条**全做** + 像素门禁 + 两道 lint）

> DoD §5 字面要求：**B 档「必须」过像素门禁，且区域表须先覆盖该文件所在路由**。
> ★但本步的模板改动是**"内容整体搬家"**（DOM 节点级不变）而非"结构改造"，所以 **A 档 5 条判据一条都不能省** —— 它们比像素门禁**更锋利**（能定位到"哪个名字掉了"）；像素门禁则兜住**所有静态判据都看不见的渲染层**（CSS 归属、chunk 时序、字体、图片解码、scroll 位置）。

### 6.1 事实核查（本轮实测，**不采信历史报告**）

| 事实 | 实测值 | 对判据的影响 |
|---|---|---|
| 两个 style 块 | styles.length === 2（250 + 296） | **L0 必须切 2 段 style 块**（不是 step 6/7 的 1 段） |
| _ctx 基线 | **0** | L1 的断言是 _ctx 引用 === 0（**不是 step 7 的 1**） |
| 方括号名 | **1 个**：BarsOutlined | L1 必须同时扫 $setup["…"] |
| 模板元素总数 / 最大深度 | **178 / 7** | DOM 节点级等价判据的基数 |
| .doc-img 总数 | **18**（6 模板 + 12 v-html） | 像素与交互判据都要覆盖两类 |
| **/exam/doc 的 API 调用数** | **0**（Doc.vue + App.vue 均无请求） | 像素门禁的**夹具清单为空**（见 §6.3） |
| doc-img 图片齐全性 | 20 个引用 / 20 个文件（**0 缺失**，comm 实测） | 图片不会 404（否则两侧**同样**是破图 → 掩盖差异） |
| .doc-logo 的 src="../assets/logo.svg" | 文件存在（1972 B） | 静态 import 资产，随 chunk 打包 |
| client/dist mtime | 门禁自带 distStamp() 断言 | 沿用 |

### 6.2 L0 · **2 段**切片字节判等（成本 ≈ 10 分钟，零依赖）

★**本步的 L0 适用范围与 step 6/7 不同 —— 必须改判**：

| | step 6/7 的做法 | **本步必须的做法** | 为什么 |
|---|---|---|---|
| 段数 | template + style（2 段） | ★**只有 style 两个块（2 段）：:561–810 / :811–1106** | 本文件有**两个** style 块；只切 1 段会**漏掉 296 行**（正是方案 §2 漏掉的那 296 行！） |
| template | 逐字节相等 | ★**本步不能要求 template 逐字节相等** | **B 档就是"要动模板"** —— 把 template 也写进 L0 就是**把判据写成必然假通过** |
| 取切片 | 有的步用固定行号 | **两侧都从 descriptor 取**（styles[0].loc / styles[1].loc） | DoD 明写「不得沿用写死的固定行号」：step 7 的 A 实测到**改后切片取到空区间 → 比对恒等通过 = 假通过** |
| 自证 | 无 | ★**必须打印"切片非空 + 行数等于 250 / 296"** | 防假通过：空切片 cmp 恒等 |

```bash
# 改前（HEAD）—— 两段各自从 descriptor 取 loc，不写死行号
git show HEAD:client/src/views/Doc.vue > /tmp/l0-before.vue
node -e "<取 styles[0].loc / styles[1].loc，切 2 段并 shasum -a 256，打印 段名:行区间:字节:sha256>"
# 改后（活树）—— 同一段脚本，指向 client/src/views/Doc.vue
node -e "<同脚本>"
# ★自证（必须打印）：style[0] == 250 行 且 style[1] == 296 行 且两段非空，否则判据装置不合格
```

> ★**template 的等价性由 §6.4-(6) 的 DOM 节点级 + 内容级判据 + §6.3 的像素门禁共同承担**（比"逐字节相等"弱一档，但**这三条合起来比它更全面**：字节相等只证明"文本没变"，DOM 节点级 + 像素证明"渲染没变"）。

### 6.3 ★像素门禁（B 档的**新增强制项**）—— 路由 + 区域表 + 夹具 + exit 2 预案

**路由实测**：**/exam/doc**（client/src/router/index.js:57；**公共路由**，beforeEach :81–83 放行 ⇒ **无需 token/角色**；**无路由参数、无 props**）。

**夹具清单（★实测为空，但必须显式声明）**：

| 项 | 实测 | 说明 |
|---|---|---|
| Doc.vue 的 API 调用 | **0**（无 axios/request/fetch 命中） | ⇒ **不需要新增 /api 夹具** |
| App.vue（根）的 API 调用 | **0**（只有 useTheme + useSelectAriaSync，后者只挂 MutationObserver） | ⇒ 全链路**零请求** |
| ⇒ 门禁的 unmockedApi 自检 | **必然为「无」** | ★**这是本路由相对 /exam/teacher/* 的正面差异**：不存在"夹具漏网 → exit 2"的风险面 |
| 主题注入 | localStorage[ui-theme] → useTheme → html[data-theme]（门禁已 addInitScript 种下） | 实测两个 style 块大量走 CSS 变量，light/dark 取值不同 ⇒ themeActuallyDiffers 自检**可通过** |
| token/user 注入 | 门禁一律种（FIXTURE_USER = teacher） | 该页不读它们，**留作无害冗余** |

**★对 Captain 已落地 --with-doc-regions（4 区域 × 2 主题）的逐项核对**：

| 区域 id | 选择器 | 静态命中 | 见证断言 | **A 的核对结论** |
|---|---|---|---|---|
| *.docheader | header.doc-header | **1**（:5） | header.doc-header h1.doc-title ≥ 1 | ✅ 命中 1；该元素 `position: sticky` **但不随页面滚走**（在页面顶部）⇒ 截取安全 |
| *.docnav | aside.doc-sidebar | **1**（:18） | aside.doc-sidebar .ant-anchor-link ≥ 5 | ✅ 命中 1；★实测 allSections = **12 项** ⇒ 锚点 12 ≥ 5，**有 2.4× 余量**；元素高约 440px，可完整截取 |
| *.docbody | main.doc-main | **1**（:23） | main.doc-main .doc-section ≥ 8 | ⚠️ ★★**A 实测到缺陷 D1（必须补强）** |
| *.docintro | main.doc-main .doc-section#intro | **1**（:25） | #intro .section-body .ant-steps-item ≥ 6 | ✅ 命中 1；introSteps = **6 项**；⚠️ 见 D3（零余量） |

#### ★★A 对区域表的 3 处缺陷判定（**必须在 B 开工前处理**）

| # | 缺陷 | 实测依据 | 后果 | 修法 |
|---|---|---|---|---|
| **D1** | **main.doc-main 太高，基线必然测不全** | 24 张 doc-img 实测尺寸：18 张 1440×900 + 6 张 3420×1794（13-review.png / 13-review-detail-1/2.png / 09-parse-modal.png）⇒ 主栏 976px 宽下每图 ≈ 610px；**18 张图 ≈ 11000px + 版式 ≈ 14800px** | 若 locator.screenshot() 按元素全高截取 ⇒ **PNG 超 Chromium 上限报错 → exit 2**；若被截断 ⇒ **只比首屏、下方全盲**（最坏的**假绿**形态） | ★把 docbody 从"整页"改为**按章节切片**（见 §6.3.1 的 5 个内容区域：每章独立、高度可控、有强见证） |
| **D2** | **ready: '.doc-section' 可能早于 a-anchor 完成异步测量** | a-anchor 的 .ant-anchor-link 是 antd 挂载后**异步测量**才渲染的 | docnav 的 witness 断言会**间歇性超时** ⇒ **间歇 exit 2**（不稳定门禁 = 最坏形态：随机红绿） | ★把 docnav 的 ready 从 .doc-section 改为 **aside.doc-sidebar .ant-anchor-link**（就绪即见证，二者同源） |
| **D3** | docintro 的 witness ≥ 6 **恰好等于真值**，零余量 | introSteps 长度 = **6**（:262–269 实测） | ant-steps 若渲染 5 个 ⇒ **立即 exit 2**（方向安全，不假绿） | 保留 ≥ 6（见证就该卡真值），但**必须同时把内容级见证补上**：见 §6.3.1 的 5 区域 |

#### 6.3.1 ★A 推荐的**完整区域表**（含 Captain 的 docheader/docnav，替换 docbody/docintro 为一个内容区族）

```json
[
  { "id": "light.docheader", "theme": "light", "area": "docheader", "url": "/exam/doc",
    "ready": ".doc-section", "selector": "header.doc-header",
    "witness": { "selector": "header.doc-header h1.doc-title", "min": 1, "label": "顶栏文档标题 h1" } },
  { "id": "light.docnav", "theme": "light", "area": "docnav", "url": "/exam/doc",
    "ready": "aside.doc-sidebar .ant-anchor-link", "selector": "aside.doc-sidebar",
    "witness": { "selector": "aside.doc-sidebar .ant-anchor-link", "min": 12, "label": "页内目录锚点项（真值 12）" } },
  { "id": "light.docintro", "theme": "light", "area": "docintro", "url": "/exam/doc",
    "ready": "#intro .ant-steps-item", "selector": "main.doc-main .doc-section#intro",
    "witness": { "selector": "#intro .section-body .ant-steps-item", "min": 6, "label": "简介步骤条节点（真值 6）" } },
  { "id": "light.docquestions", "theme": "light", "area": "docquestions", "url": "/exam/doc",
    "ready": "#questions .doc-img", "selector": "main.doc-main .doc-section#questions",
    "witness": { "selector": "#questions .doc-img", "min": 3, "label": "题库章截图（真值 3）" } },
  { "id": "light.docproject", "theme": "light", "area": "docproject", "url": "/exam/doc",
    "ready": "#project .doc-img", "selector": "main.doc-main .doc-section#project",
    "witness": { "selector": "#project .doc-img", "min": 4, "label": "实训题章截图（真值 4）" } },
  { "id": "light.docaiflow", "theme": "light", "area": "docaiflow", "url": "/exam/doc",
    "ready": "#aiflow .ant-steps-item", "selector": "main.doc-main .doc-section#aiflow",
    "witness": { "selector": "#aiflow .ant-steps-item", "min": 6, "label": "评分流程步骤条节点（真值 6）" } },
  { "id": "light.docperformance", "theme": "light", "area": "docperformance", "url": "/exam/doc",
    "ready": "#performance .a-alert", "selector": "main.doc-main .doc-section#performance",
    "witness": { "selector": "#performance .a-alert", "min": 1, "label": "性能章提示条（真值 1）" } }
  // ★dark.* 为上述 7 条的完整镜像（theme 改 "dark"），合计 14 个区域
]
```

> **为什么这 7 个区域正好覆盖 B 的改动面**：#intro / #questions / #project / #aiflow / #performance **就是被搬进 DocSection.vue 的那 5 章**（§2.5 白名单的 136 行）。每章有独立且**强于临界值**的见证（截图数 / 步骤条数 / 提示条数全部来自**实测真值**）⇒ 任何"内容漏搬/多搬/顺序错/CSS 失配"都会同时被**像素 sha1** 与**见证计数**抓住。
> **高度核算（安全）**：单章最高 #questions ≈ 3 图 × 610 + 版式 ≈ 2400px；#project 内 3420×1794 的图按主栏 976px 缩到 ≈ 512px 高 ⇒ **全部单章 < 3000px**，无纹理上限风险，且**不含 position: sticky 的跨滚动元素**（顶栏已单独成区）。
> ★**图片解码时机**：模板未设 `loading="lazy"`（实测无该属性）⇒ 图片立即开始加载；但 `ready` 只保证元素在、不保证已解码 ⇒ 门禁已在截图前 await document.fonts.ready + waitForTimeout(600)。**建议 B/C 实测确认 600ms 对含 3420×1794 大图的章节足够**；若不稳，用 `page.waitForLoadState("networkidle")` 兜底（★改门禁属 Captain 权限，A 只建议）。
> ⚠️ **注意与 Captain 现版的差异**：Captain 现版是 **4 区域 × 2 = 8 个**；本建议是 **7 区域 × 2 = 14 个**，**多出的 5 个正是"被搬迁的内容章"**。若 Captain 认为 14 个区域耗时太长（每区域两侧各截一次），**最低限度必须加上 #questions / #project（含 3+4 张截图的章节）**，否则"内容搬家"没有任何像素级见证。

#### 6.3.2 ★「区域选择器消失 → exit 2」的应对预案（DoD §5 明写的硬失败）

| 触发条件 | 门禁行为 | **A 的应对预案（按顺序执行）** |
|---|---|---|
| 某区域在改后树**选择器消失**（如 #intro 被误删） | **exit 2**（unrunnable，**不是** exit 1） | ① **先不要改区域表** —— 先查 git diff：选择器消失**本身就是最严重的回归证据**（B 把 .doc-section 或 id 搬走了）。**回流 B**。② 只有当"选择器消失"是**本步有意为之**（本方案**不是**这种情况：§2.5 白名单要求 <section id> 留在 Doc.vue）时，才允许先调区域表再比 —— 且**必须登记为偏离 D 项** |
| 某区域**截不到图**（超时 / 纹理上限） | exit 2 | 按 §6.3.1 换成**单章区域**（不要用 main.doc-main 整页） |
| **夹具漏网**（unmockedApi 非空） | exit 2（**即使像素全等**） | 本路由实测 **0 请求** ⇒ 若真出现，说明**有代码新增了请求**（= 行为变更）⇒ **回流 B** |
| 构建**不确定**（同源两次构建非 byte-identical） | exit 2 | 检查是否有并发写者（constraints §1「写者唯一」）；重跑 |
| **亮/暗像素相同**（themeActuallyDiffers 失败） | exit 2 | 区域选在了不随主题变化的地方；按 §6.3.1 扩到带底色/文字的元素 |
| **门禁脚本本身被改**（本轮 pixel-diff.mjs 已有未提交改动 +70 行） | — | ★constraints §13：**门禁自身也必须先冻结再测** ⇒ B/C 必须记录 pixel-diff.mjs 的 sha256 与"是否已提交"，并把区域表来源（--with-doc-regions / --regions file）与区域数写进验证报告。**禁止在跑门禁的同时改门禁** |

**执行命令（B/C 照抄）**：

```bash
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek"
# 未提交时：改前 = HEAD，改后 = 活树
node scripts/gates/pixel-diff.mjs --before HEAD --after worktree --with-doc-regions --keep
# 已提交时：--before <prev-commit> --after <step-commit>
# ★必须留痕：被测树 = 主仓库 client（不是 Exam-DeepSeek-ui/client）
```

### 6.4 A 档 5 条判据（**B 档下一条都不能省**）

| # | 判据 | 本步的落地形态（**含对范本的纠正**） | 成本 |
|---|---|---|---|
| (1) | **L0 切片字节判等** | **2 段**：style[0]（250 行）+ style[1]（296 行）逐字节相等（**两侧都从 descriptor 取区间 + 非空/行数自证**）。**template 不在 L0 范围**（B 档动了它） | ≈ 10 min |
| (2) | **L1 编译级对拍（★冻结改前 bindingMetadata 口径）** | ① 冻结改前：parse()+compileScript() 得 bindings（**实测 36 项**）与 compileTemplate() 的 code；② 改后用**同一份改前 bindingMetadata** 编译改后 template，断言：$setup.* 集合 ⊇ 改前 20 名、$setup["BarsOutlined"] 仍在、**_ctx.* 仍为 0**（★本文件基线 = 0，**不是 step 7 的 1**）、resolveComponent 集合不变、模板内联赋值目标仍是那 **4 个名字 / 7 处**（introStep qStep flowStep mobileTocOpen）；③ ★**断言"新增名 = 0"必须带允许列表 {DocSection}** —— 新增子组件会以 $setup.DocSection 形式出现，**这是本步唯一预期的新增名**，不登记就会把正常新增误判为回归 | ≈ 30–50 min |
| (3) | **L2 交互验证** | 覆盖 §5.1 的**全部 10 条 U**（U4/U5/U7/U8 为必测） | ≈ 1–2 h |
| (4) | ★**自由标识符扫描**（**必做**，两遍或 scope.crawl()） | 扫 7 个新模块 + 改后 .vue：**自由标识符 = 0**。★**本步新增两条盲区**：① **docContent.js 里全是 HTML 字符串** ⇒ 扫描器看不见字符串内被误改的 class/属性（如 .doc-img 拼错）⇒ 由 §6.4-(6) 内容级对拍兜住；② **anchors 里的 h(Tag, …)**：h 与 Tag 都是已 import 的绑定，漏 import 能被抓到（好）；但若把 Tag 换成局部同名 const，扫描器**抓不到** ⇒ 由 **U7 的 DOM 观测**兜住 | ≈ 2 min/轮 |
| (5) | ★**真运行时对拍**（**必做**） | 在仓库外搭替身：真跑 5 个 composable 的接线根，对拍 **① window.addEventListener 序列（resize→keydown）② removeEventListener 序列 ③ watch 注册时机与 3 次 focus 调用序 ④ computed 惰性（U6）⑤ a-anchor 锚点数 12 + BETA vnode**。**必须带变异反证 ≥3 个**：对调两个 composable 调用顺序 / computed 改普通数组 / 删掉 Tag 的 import | 首次 ≈ 3–5 h，复跑 ≈ 30 min |
| (6) | ★★**本步新增：内容级 + DOM 节点级等价**（**B 档必需，DoD 里没有但本方案要求**） | ① **内容级**：改前/改后各 page.evaluate 取 5 个章节的 **innerHTML**，逐章 sha256 相等（U9）；② **节点级**：导出改前/改后**全量 DOM 快照**（tag + class + id + 文本 + 深度 + 文档序），断言 **元素总数 178、最大深度 7、序列逐项相同**（U2）；③ **反证**：在改后树里**故意给某个 .section-body 外包一层 div**，该判据必须**转红** | ≈ 40 min |

> ★**为什么 (6) 是本步的"必需品"而非"加分项"**：L0 **不再覆盖 template**（B 档动了它），若无 (6)，则"模板搬家"这件事**只有像素门禁一条证据**。而像素门禁**只证明"渲染像素相同"**，不证明"DOM 结构相同" —— 而本步的正确性恰恰是**结构等价**（fragment 根、两层包裹保留、18 张图顺序）。⇒ **(6) 补上"结构"这一维，(1)+(6)+§6.3 三者合起来才覆盖了"A 档 L0 原本一条就覆盖的东西"**。

### 6.5 两道 lint 判据（**client 步必做，二者互补**）

| 判据 | 命令 | 达标线 | 本步的特有风险 |
|---|---|---|---|
| **(a) ESLint** | npx eslint client/src server/src | **error = 0**；**warn ≤ 59**（基线，只降不升） | ★新增 7 个文件后 **no-unused-vars 是最可能被触发的规则**：docContent.js 若导出 5 个数组而只被消费 2 个 ⇒ 其余被判未使用（**必须逐个 import 到位，或只导出真正被消费的名字**）；★接线根删掉 Tag/h/onMounted 后的**残留 import 必须同步删除** |
| **(b) 离线门禁** | node scripts/gates/lint-check.mjs | **exit 0**（基线 **31 条**，只减不增；比对键 = file+rule+symbol，**行号漂移不算新违规**） | ★它是 client 侧 **no-unresolved-import 的唯一覆盖**（bind-check 只覆盖 server）；Doc.vue 里新增的 **7 条相对路径**（'../components/DocSection.vue' + 5 个 composable + 1 个 docContent）**任何一条打错都会被它抓住** —— 本步最便宜的护栏（0.55s）。★--update-baseline **不是消红按钮** |
| **(c) client 侧循环依赖** | node scripts/gates/cycle-check.mjs --root client/src | **SCC = 0** | 依赖方向必须严格为 **Doc.vue → composables/doc/* → docContent.js**（单向、无回边）。★**DocSection.vue 不得 import Doc.vue**；★**useDocSections 与 useDocAnchors 都从 docContent.js 取数据**（不得互相 import —— 那会引入环） |
| **(d) bind-check** | node scripts/gates/bind-check.mjs client/src | 0 处坏绑定 | ★constraints §3-12：**node --check 不算证据**，必须真 import 一次或走该门禁 |

### 6.6 门禁覆盖缺口（DoD §5 已修正项，本步必须照做）

| 缺口 | 本步的正确做法 |
|---|---|
| cycle-check 默认只扫 server/src | ★**显式传根**：`node scripts/gates/cycle-check.mjs --root client/src`（step 7 实测均绿） |
| bind-check 默认不含 client | ★**显式传根**：`node scripts/gates/bind-check.mjs client/src` |
| 像素门禁默认 6 区域只走 /exam/teacher/classes | ★**必须 --with-doc-regions**（或 --regions 传 §6.3.1 的表） |
| axe-core 全盘缺失 | 用 `page.accessibility.snapshot()` **逐节点对拍**（banner 的 a11y 树改前=改后）—— 比 axe 只查违规更严；**不得联网安装 axe** |

---

## 7 风险分级 + 分批建议

### 7.1 风险分级（每个搬移单元）

| 单元 | 风险 | 依据 | 缓解 |
|---|---|---|---|
| **R1 docContent.js（233 行纯数据）** | **低** | 0 逻辑、0 响应式、0 vue import；唯一要求是**逐字节搬移**（含全角标点、·、①、内容里的裸双引号 :533） | 内容级对拍（U9）+ L1 |
| **R2 useDocSteps.js（33 行）** | **低** | 3 组独立 ref + map；模板引用 9 名全为点式 | L1 + L2 |
| **R3 useDocSections.js（2 行）** | ★**中** | **依赖声明在后的 sections2to7**（§3.2-3）；改普通数组 → ReferenceError | U6 + 变异反证 |
| **R4 useDocAnchors.js（18 行）** | **中** | 含 h() + Tag 组件渲染（§3.2-5）；allSections 用了 sections2to5.value 的 .value | U7（DOM 观测 BETA）+ ④扫描 |
| **R5 useDocLightbox.js（41 行）** | ★**中高** | 全文件**唯一的 watch + 唯一的 let 非响应式变量 + 焦点管理 + 3 个键盘/点击入口**；onLightboxKeydown 还要跨模块挂到 window | U1/U4/U5/U8 + 判据⑤（替身对拍 focus 调用序） |
| **R6 useDocMobileToc.js（5 行）** | **中** | window.innerWidth + resize 监听的注册/清理顺序（与 R5 共用 :303/:304） | U4 |
| **R7 DocSection.vue（131 行内容 → 新组件）** | ★★**高** | **本步唯一动模板的单元**：① fragment 根不得引入包裹层（U2）② 父 :deep() 必须仍命中（U1）③ a-steps 的 3 组插值必须仍指向接线根的 ref（A1/A2）④ 18 张图里 6 张在此 | 像素门禁（§6.3.1 的 5 个内容区域）+ U1/U2/U9 + DOM 节点级对拍 |
| **R8 接线根解构（Doc.vue）** | **中** | 「被调方声明了形参、调用方没传」这类**跨文件接线错配**（判据④全盲，DoD 明写） | 判据⑤（真运行时对拍）+ lint-check 的 no-unresolved-import |
| **R9 over500 观察带** | **低（正收益）** | 1106 → ≈ 616 ⇒ godfileOver800 3 → **2**；但**仍在 >500 观察带内**（见 §7.2 的天花板结论） | arch-metrics（**只读复算**；DoD 判据 1 是"不增"，本步是**下降**） |
| **R10 两个 style 块** | **低（不动）** | 本步**逐字节不动**（L0 两段全等即证）。★**不要**顺手把 296 行全局块搬进独立 .css（那是"风格层搬运"，0 行收益 + 引入全局 CSS 加载顺序风险 —— main.js 的 import 顺序 :8→:10→:12 有注释保护） | L0（2 段） |
| **R11 死 CSS（≈90 行）** | **低（不改）** | 实测**模板与脚本 0 引用**：.flow-overview/.flow-step/.flow-num/.flow-arrow/.img-placeholder/.doc-steps/.doc-step/.doc-step-num/.doc-step-arrow/.doc-tag-default/.doc-tag-blue | 登记 K5；后续专项处理 |
| **R12 「不改清单」触碰** | ★**必须显式回答** | constraints §2 第 5 条：client/src/views 的**视觉·交互·动效**改动一律不动（无 ui-guard 常驻）。★**本步判定**：拆 composable + 抽内容子组件**不改变任何视觉/交互/动效**（DOM 节点级等价 + 像素全等 + 事件绑定逐字保留）⇒ **不构成"改动"**；**但没有像素门禁的红/绿背书就不能这么声称** —— 这正是 B 档必须过门禁的根本理由 | 像素门禁 + §6.4-(6) |
| **R13 既有 a11y 缺陷（B3-O2 引文 4.44、ant-tag-orange 3.34:1）** | **低（不改）** | constraints §2 第 1 条明确列为**改前=改后**的既有项；.ant-tag-orange 是 **antd 预设橙标签**（Doc.vue:93/:99 用了 class="tag-warning" 但渲染出 .ant-tag-orange，实测 T4 报告 §4.1 F2） | **不得顺手修**（K2） |

### 7.2 ★分批建议（**每批独立提交、各自过判据**）

> **分批原则**：先做**不动模板**的全部收益（B-1），把风险分层；再做**动模板**的那一步（B-2）。这样即使 B-2 回流，B-1 的收益已经落袋且**已被完整验证**。

| 批 | 内容 | 触及 | 预估 Doc.vue 行数 | 必须过的判据 | 回滚成本 |
|---|---|---|---|---|---|
| **B-1** | docContent.js + useDocSteps.js + useDocSections.js + useDocAnchors.js + useDocMobileToc.js + useDocLightbox.js；Doc.vue 变成接线根 | **只动 script setup**（★**模板与 2 个 style 块逐字节不动**） | **≈ 756**（1106 − 350 + ~2 接线） | **A 档 5 条**（★此处 L0 可**3 段全等**：template + 2 style —— 因为本批不动模板）+ lint (a)(b) + cycle + bind | 低（纯 JS 搬移） |
| **B-2** | 5 个静态章节内容 → components/DocSection.vue；模板这 5 处改为 DocSection 组件调用 | **动模板块的 136 行** | **≈ 616** | **A 档 5 条**（L0 **降为 2 段**：两个 style 块）+ ★**像素门禁（§6.3.1）** + §6.4-(6) 内容级/DOM 级对拍 + lint (a)(b) + cycle + bind | 中（模板 + 1 新组件） |
| **B-3（可选，不推荐）** | style[1]（296 行全局 CSS）→ src/styles/doc.css | 动 style 块 | ≈ 320 | 全部门禁 + **全局 CSS 加载顺序**验证 | 高（**0 行收益**） |

> **★精确核对（本方案必须诚实给出的结论）**：
> - **B-1 之后 ≈ 756 行** ⇒ **已经 ≤ 800** ⇒ **godfileOver800 3 → 2 在 B-1 就已达成**（不必等到 B-2）。
> - **但 756 仍 > 500 ⇒ 停在观察带内**；B-2 把它带到 **≈ 616（仍 > 500）**。
> - ★★**结构天花板（必须写进状态文件的诚实结论）**：本文件的**不动基线 = 模板 208 + 两个 style 块 546 = 754 行**；即使模板被搬空、脚本全部搬走，**.vue 也永远 ≥ 754 + 接线 ≈ 775 行 > 500** ⇒ **本步无法让 Doc.vue 脱离 >500 观察带**（除非允许动 style 块 = B-3，属另一档授权）。
> - ⇒ **不要承诺"over500 会降到 13"** —— step 7 已用同样的推理否掉过"over500 会降"，属同型错误。

---

## 8 给 Agent B 的逐条搬移指令

### 8.1 总则（不可协商）

1. **逐字搬移**，不重排、不改写、不"顺手优化"；搬移前后用 git diff 自查**只应有"删除块 + 新增块"的对应关系**。
2. **★模板白名单**（§2.5）：**只有** 5 个静态章节的**包裹层内部**（:25–42 / :51–91 / :93–135 / :144–164 / :167–179 的**内部**）可动；section.doc-section 与 div.section-body **两层包裹必须留在 Doc.vue**。
3. **★两个 style 块逐字节不动**（L0 逐字节比对，动一个空格即红）。
4. **不新增依赖**；**DocSection.vue 不写 style 块**（写了也不会被父 scoped 引用，且给判据添乱）。
5. **写者唯一**（constraints §1）：本步进行中不得有第二个 Agent 写 client/。
6. **★按 B-1 → B-2 两批提交**（§7.2），每批各自过判据；**不得合并成一个提交**。

### 8.2 ★「模板等价」的具体检查点（逐条可执行）

| # | 检查点 | 通过标准 |
|---|---|---|
| T1 | section.doc-section 与 div.section-body **仍在 Doc.vue** | grep -c 'class="doc-section"' Doc.vue = **8**；grep -c 'class="section-body"' Doc.vue = **8** |
| T2 | 子组件**根节点是 fragment**（无包裹 div） | 新组件 template 直接以 h2.section-title 或 template/v-if 之类开头；**禁止** div / section 作为唯一根 |
| T3 | 5 个章节的 **id 与 class 逐字不变** | intro / questions / project / aiflow / performance 五个 id 全部仍在 Doc.vue 的 section 上 |
| T4 | **3 组 a-steps 的插值仍指向接线根的 ref** | :current="introStep" / :items="introStepItems" / 插值 introSteps[introStep].content 等**逐字保留**（★不得改成 props 传入后改名） |
| T5 | **@click="onMainClick" / @keydown="onMainKeydown" / ref="mainRef" 逐字保留** | :22 一行不动（★mainRef 是**死 ref**，见 K1 —— **不得删**） |
| T6 | **18 张图的 class="doc-img" + tabindex="0" 逐字保留** | 6 张在模板（搬进子组件时同步搬）、12 张在 docContent.js 的字符串里（**一字不改**） |
| T7 | **DocSection.vue 的 props 形态** | 建议 defineProps({ sections: { type: Array, required: true } }) 或直接接收 5 个具名数组 —— 无论哪种，**都不得在子组件内新建/改写数组**（只读渲染） |
| T8 | **所有 .doc-img 的 src 保持运行期字面量** | 形如 src="/exam/doc-img/xxx.png" 与 :src 绑定字符串，都是**不经构建的运行时路径**（/exam/ 是部署前缀）⇒ **绝不得改成 import 资产或 new URL(…, import.meta.url)**（那会改加载路径与产物） |

### 8.3 ★「不许顺手修」清单（K 系列，**搬移中一律照旧**）

| K# | 项 | 实测事实 | 为什么不能改 |
|---|---|---|---|
| **K1** | ref="mainRef"（:22）—— **mainRef 在 script 里根本不存在** | 模板 :22 绑了 ref="mainRef"，但 script setup 里**没有 mainRef 声明**（实测：bindings 无此键、33 条顶层语句无此名）⇒ **Vue 对该 string ref 静默忽略**（无告警、无后果） | 删掉它 = **改模板字节**（白名单外）；属独立缺陷，须单独登记 |
| **K2** | a-tag class="tag-warning"（:94/:99）渲染为 **.ant-tag-orange** | .tag-warning 定义在 src/style.css（全局语义类）；实测 **3.34:1 对比度**（T4 报告 §4.1 F2，既有） | constraints §2 第 1 条 **B3-O2 明列"改前=改后"** |
| **K3** | sections2to7[4]（id:questions，21 行）**模板不可达**（死数据） | sections2to5=slice(0,4)（索引 0–3）· sections7=[sections2to7[5]]（只取索引 5）⇒ **索引 4 永不渲染** | 删 = 内容变更；**必须整段搬进 docContent.js 保留** |
| **K4** | sections2to7[5] 的 content 里写 **h3 编号 7.x**，而章节标题是 **8. 作业管理** | :445 id:assignments, title:8. 作业管理，内部 <h3>7.1 … | 编号不一致是**既有内容**，改了就是改文档 |
| **K5** | **死 CSS ≈ 90 行** | .flow-*/.img-placeholder/.doc-steps/.doc-step*/.doc-tag-default/.doc-tag-blue 在模板/脚本 **0 引用** | 删 CSS = 样式块变更（L0 会红） |
| **K6** | a-steps 的 3 处 style="margin:20px 0;" 内联样式 | :28/:59/:148 | 逐字保留 |
| **K7** | sections2to5 / sections7 是 **computed**（惰性） | §3.2-3 | **不得**改普通 const（TDZ） |
| **K8** | 注释块（:7–8 的 B3-1 说明、:218 的 R-22、:236/:243 的键盘注释、:296 的"从原 sections2to7 数组拆分"） | 实测 13 行 HTML 注释 + 若干 JS 注释 | **随代码一起搬**（不要"清理注释"） |

### 8.4 禁令（违反即回流）

❌ 不得改任何 .doc-img 的 src 写法、class、tabindex、alt。
❌ 不得把 .section-body 或 .doc-section 搬进子组件。
❌ 不得给 DocSection.vue 加 style 块（尤其不得加 scoped 规则）。
❌ 不得给 style[1] 加 scoped，也不得把它的规则并入 style[0]。
❌ 不得把 sections2to5/sections7 改成普通数组；不得把它们的声明位置挪到 sections2to7 之后（那会改 L1 的 binding 面）。
❌ 不得删 mainRef（K1）、不得删死 CSS（K5）、不得删 sections2to7[4]（K3）。
❌ 不得为"补齐"而新增 useRoute()/useRouter()/defineProps（本文件**没有**它们，新增 = 无谓偏离 + L1 会多出名字）。
❌ 不得在同一提交里既搬移又修缺陷（DoD §6「不在同一提交里既拆文件又改行为」）。
❌ 不得改 pixel-diff.mjs / arch-metrics.mjs / lint-check.mjs 等门禁（那是 Captain 的护栏，且 constraints §13 要求门禁先冻结再测）。

---

## 9 给 Agent C 的验证清单

**前置（必须打印并留痕）**：被测树 = **主仓库** …/Exam-DeepSeek/client（★**不是** …/Exam-DeepSeek-ui/client —— 后者 Doc.vue = **1097 行**，本轮已实测与本仓不同）· HEAD（git rev-parse HEAD）· 改前 Doc.vue 的 sha256（d29075d4c537238907e53785da74f30bf31c06076fe3ef20954b0f5c95001128，且与 git show HEAD:… 逐字节相同）· 改后各文件的 git hash-object · **pixel-diff.mjs 的 sha256 与是否已提交** · 区域表来源（--with-doc-regions 或 --regions 文件）与**实际区域数**。

| # | 检查 | 期望 | 反证（不给反证不算通过） |
|---|---|---|---|
| V1 | **L0 两段逐字节** | style[0] 250 行、style[1] 296 行，sha256 与改前**逐项相等**；**两段均非空**（打印行数自证） | 故意改 style[1] 里一个字节 ⇒ 必须红 |
| V2 | **L1 编译级** | 改后 template 用**改前 bindingMetadata** 编译：$setup.* ⊇ 改前 20 名；$setup["BarsOutlined"] 在；**_ctx.* = 0**；**新增名仅 DocSection**（允许列表） | 删掉接线根一处解构 ⇒ 该名字应掉出 / _ctx 应多 1 ⇒ 必须红 |
| V3 | **④ 自由标识符** | 7 个新模块 + 改后 .vue = **0 命中**（两遍或 scope.crawl()；对象方法简写形参须正确处理） | 注入一个未声明名字 ⇒ 必须命中 |
| V4 | **⑤ 真运行时对拍** | U4（监听器序列 [resize, keydown]，清理同序）· U5（watch 注册时机 + 3 次 focus 调用序）· U6（computed 惰性 + ReferenceError 反证）· U7（锚点 12 + BETA vnode）· U8（模板内 1 张 + v-html 内 1 张的点击/Esc） | 对调两个 composable 调用顺序 / computed→数组 / 删 Tag import ⇒ 各自必须红 |
| V5 | **内容级对拍（U9）** | 5 个章节 innerHTML 的 sha256 **逐章相等** | 在内容字符串里改一个全角空格 ⇒ 必须红 |
| V6 | **DOM 节点级对拍（U2）** | 元素总数 **178**、最大深度 **7**、main .doc-section = **8**、.section-body = **8**、main .doc-section > .section-body = **8**；字段序列逐项相同 | 给某 .section-body 外包一层 ⇒ 必须红 |
| V7 | **U1（:deep() 跨组件）** | #questions .section-body h3 / #intro h3 / #aiflow h3 的 fontSize + marginTop 计算值改前=改后；**正控**：内联改字号应能改变读数 | 临时把 :deep(h3) 从 CSS 删掉 ⇒ 必须红（证明读数真来自该规则） |
| V8 | ★**像素门禁（B 档强制）** | node scripts/gates/pixel-diff.mjs --before HEAD --after worktree --with-doc-regions ⇒ **exit 0**；全部区域 pixelEqual && geometryEqual；unmockedApi = 无；themeActuallyDiffers = ✓；client/dist mtime 未变；端口收尾干净 | ★**负向自测必做**：造一棵"只改 .doc-title 字号"的 /tmp 副本，跑同一区域表 ⇒ **必须 exit 1 且点名 *.docheader**（证明区域表**真的在看这个文件**，而不是"选了个不随改动变化的容器"）。**没有这一步的 exit 0 不算证据** |
| V9 | **lint (a)** | npx eslint client/src server/src ⇒ **error 0 / warn ≤ 59** | 新增一个未使用 import ⇒ warn 应 +1 |
| V10 | **lint (b)** | node scripts/gates/lint-check.mjs ⇒ **exit 0**（31 条基线只减不增） | 把某条 import 路径打错 ⇒ no-unresolved-import 必须命中 |
| V11 | **cycle / bind** | cycle-check --root client/src ⇒ SCC = 0；bind-check client/src ⇒ 0 坏绑定 | — |
| V12 | **arch-metrics（只读复算）** | godfileOver800 **3 → 2**（Doc.vue 离开 >800）；over500 **14 → 14（不变，见 §7.2 天花板）**；layerViolations 仍 0；unmigrated 不增 | — |
| V13 | **a11y 对照（可选，只读借用）** | 复用 tests/ui-redesign-verify/artifacts/T5-a11y.mjs:127 的 doc 页配置（auth: null），对拍改前/改后的 a11y 快照**逐节点相同**（★**不得修改 tests/**）；axe 在本仓全盘缺失，故用 page.accessibility.snapshot() 逐节点对拍 | — |

**C 的验证边界（必须写进 Doc.vue-verify.md）**：

1. **像素全等 ≠ 功能无回归**（pixel-gate-report §5 局限 3）：像素门禁**抓不到**交互时序、焦点顺序、ARIA 语义、请求行为、控制台报错 ⇒ **V4 的运行时对拍不可省**。
2. **只截"静止"态**：动画/过渡/轮询的中间帧不覆盖（prefers-reduced-motion: reduce + animations: disabled 压掉，属有意为之）。
3. **不覆盖真实数据形态**：本页无数据依赖 ⇒ 该局限**在本步不适用**（这是本文件相对 /teacher/* 路由的正面差异）。
4. **构建确定性只证伪不证实**：换机器/换 Node 版本必须重跑门禁内置自检。
5. **_ctx 基线 = 0**：不要照抄 step 7 的 === 1。
6. **不许用 node --check 当证据**（constraints §3-12：无 type:module 的目录下它对语法坏文件也返回 0）。
7. **不许改测试迁就实现**（constraints §3-16）：断言必须**比改前更强或等强**。
8. ★**L0 在本步只有 2 段（两个 style 块）**：**不得**把 template 的字节相等写成判据（B 档必然不等 ⇒ 那会把判据写成恒假，或者反过来被"取空区间"骗成恒真）。

---

## 10 局限声明

1. **本方案的全部结论基于静态分析 + 编译器实测**，未运行应用、未跑测试、未执行门禁（纯只读立场）。§5.1 的 U1–U10 是**必须由 C 实测**的项，其中 **U1（:deep() 跨子组件命中）与 U2（fragment 根不产生包裹层）是本步的两个"理论推断支点"** —— 二者任一不成立，则 §2.3 的改法 (b) **必须降级为改法 (a)**（内容转 v-html 字符串，收益 −124 而非 −131，且不再新增子组件）。
2. **行数预估（≈ 616 / ≈ 756）是"按已实测行数推算"的估算**，不是实测值；B 落地后**必须以 wc -l 实测**并更新 §7.2 的账。
3. **本方案对 Captain 已落地的 --with-doc-regions（+70 行，未提交）做了逐项核对，并给出 3 处缺陷（D1/D2/D3）与 7 区域替代表**。★**A 未修改该脚本**（只读）；是否采纳、以及"整页 main.doc-main 是否会因高度触发 exit 2"，**必须由 Captain/B 在真跑一次门禁后裁决**（A 无法在不跑门禁的前提下断言 Playwright 的截图高度上限行为）。
4. **未验证"第二 worktree 的差异是否会影响本步"**：Exam-DeepSeek-ui 的 Doc.vue（1097 行）与本仓不同；本方案所有行号只对**主仓库 HEAD b97e633** 有效。任何验证若误用该 worktree（rig.sh:9 的默认值），**结论全部无效**。
5. **死 CSS（≈90 行）、死数据 sections2to7[4]、死 ref mainRef** 是**本轮实测发现但本步不处理**的既有缺陷（已登记 K1/K3/K5）。本方案**不主张**在本步修复它们（改 CSS/模板 = 扩大改动面）。
6. **本文件所在路由无任何自动化测试覆盖**（实测：tests/ 下无针对 Doc.vue 的断言，只有 a11y 快照对 /exam/doc 的采样）⇒ **本步的回归防护完全依赖 §6 的判据组合**，不存在"既有测试兜底"。
7. **未实测的第三方行为**：a-anchor 的 .ant-anchor-link 异步测量时机、a-float-button/a-drawer 的渲染时机、Playwright locator.screenshot() 对超高元素的处理 —— 这三者都只做了**源码级推断**，属 D1/D2 的处置范围。

---

**（本方案结束。下一步：Captain 裁决 §6.3 的区域表（Captain 现版 8 区域 vs A 建议 14 区域）→ Agent B 按 §8 执行 B-1 → C 按 §9 验证 → B-2 → C 复验。）**

