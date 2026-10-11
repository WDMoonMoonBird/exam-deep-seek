> ## ⚠️ Captain 注记：本次扩展**未发布为活代码**（2026-10-11 13:25）
>
> **现状**：`scripts/gates/pixel-diff.mjs` 已**还原到扩展前**的版本；本次扩展以补丁形式存档于
> [`pixel-gate-doc-regions.patch`](pixel-gate-doc-regions.patch)（154 行），本报告保留全部设计与自证证据。
>
> **不发布的两条理由**：
>
> 1. **目的已取消** —— 用户已裁定**剔除 `Doc.vue`**（纯静态教师手册、不连后端、体量在内容而非逻辑），
>    该扩展是为「`Doc.vue` 的 B 档拆分」准备的，而那个拆分不做了。
> 2. ★**它有一个会「静默出错」的失效模式，且未被证明不存在**：`docbody` 区域用的是整页容器
>    `main.doc-main`，实测截图尺寸 **912×21629**（21629 像素高）。**装置里没有任何「断言截图未被截断」的逻辑**
>    （已 grep 确认：无 `truncat` / `截断` / 图高断言）。若在某个环境下截图被截断（尺寸上限、内存、页面继续变长），
>    比对就只会比已截到的那部分 —— **下方内容的变化会被漏掉，而门禁报 exit 0**。这正是最危险的**假绿**形态。
>    本次自证的正控只改动了 `.doc-header`（**页面顶部**），**因此只证明了「顶部被比对」，没有证明「底部也被比对」**。
>
> **将来重建时必须补上的性质**（做完这些才可发布）：
> - **截断断言**：截图后校验「图像高度 ≈ 目标的 `scrollHeight`/`boundingBox` 高度」（或在同一区域内选一个位于**页面底部**的
>   见证元素，断言它出现在截图内）；不满足即 **exit 2（无法判定）**，**不得当作 PASS**；
> - **底部正控**：正控改成「只改页面**底部**的内容」，必须仍能报出差异（补上本次缺失的那一半证明）；
> - 重新评估 **A 提出的 D2/D3**：`ready` 选择器不得依赖异步测量（如 `a-anchor` 渲染完成）；见证阈值不要恰等于真值（留余量）。
>
> **保留价值**：本报告的 8 个区域设计、选择器口径、显式开关（不并入默认以保默认行为逐字节不变）、
> 以及「零夹具（该页零 API）」的结论都是正确的，重建时可直接复用；`pixel-gate-doc-regions.patch` 是可直接 apply 的起点。
# pixel-gate-extension —— 像素门禁扩展到 Doc.vue（/exam/doc）落地报告

> 产物：`scripts/gates/pixel-diff.mjs`（**只增不改既有语义**，+70 / −8 行）
> 报告：`docs/split/pixel-gate-extension.md`（本文件）
> 立场：护栏扩展者（**只改门禁脚本与本报告**；零产品代码改动、零 git 写操作、零联网、零新依赖）
> 锚点：P0–P4 执行时 HEAD = `b97e6334`；G1/G2 执行时 HEAD 已由 Captain 前移到 `1b713b83`。
> **两次 HEAD 的 `client/` 指纹完全相同（`9e6ed2b42e59`）** → client 侧零变化，全部结论跨该次前移直接成立
> （前移只动 `server/`、`docs/`、`scripts/`）。活树 `client/` 与 HEAD 亦逐字节相同。

---

## 0 一句话结论

Doc.vue 所在路由 `/exam/doc`（**公共路由，无需登录、无角色校验、无参数**）现已可被门禁覆盖：
新增 **8 个区域**（2 主题 × 顶栏/正文侧栏/内容区/首章节），用 `--with-doc-regions` 显式开启；
**既有 6 区域、CLI 默认行为、退出码、端口策略一律不变**（扩展前后 6 区域 sha1 逐字节相同）。
该页**不需要任何 `/api` 夹具**（全页零网络请求，已实测「夹具漏网 API = 无」），故夹具表未动。
既有三组自测复跑**全部保持通过**；新区域**正控报得出差异**（改 1 处模板即 8/8 命中）、
**干净对照 0 误报**；抗假绿（区域截不到图）仍是 **exit 2**。

---

## 1 任务 1｜Doc.vue 的路由与进入条件

| 项 | 值 | 依据 |
|---|---|---|
| 路由定义 | `{ path: '/doc', component: () => import('../views/Doc.vue') }` | `client/src/router/index.js:57` |
| **完整路径（含 base）** | **`/exam/doc`** | router 用 `createWebHistory('/exam/')`（`router/index.js:62`）+ vite `base: '/exam/'`（`client/vite.config.js:137`） |
| 路由 name | **无**（该条记录未声明 `name`） | 同上 |
| 路由参数 | **无**（`/doc` 是静态路径，无 `:param`；也无 `props`） | 同上 |
| 是否需要登录 | **不需要**（**唯一**被全局守卫显式放行的业务路由） | `router/index.js:81-83`：`if (to.path === '/doc') return true;` —— 该分支在 `if (!token \|\| !user) return '/login'` **之前** |
| 是否需要角色 | **不需要**（无 `meta.role`；对比 `/teacher`/`/student`/`/admin` 都有 `meta.role`） | `router/index.js:57` 无 meta |
| 布局归属 | **独立页**：不经 `views/teacher/Layout.vue` 等任何 Layout | 路由是顶层记录，非 children |
| 页面骨架 | `div.doc-layout` → `header.doc-header` + `div.doc-body`（`aside.doc-sidebar` + `main.doc-main`，内含 `section.doc-section` × N）+ 移动端浮动目录（`a-float-button`/`a-drawer`）+ 图片灯箱（`Teleport to="#body"`） | `client/src/views/Doc.vue:2-207` |

**装置侧的含义**：既有做法（`addInitScript` 种 `token`/`user`）对该路由**非必需**但**无害**（守卫直接放行）；
本扩展**不改** captureRegion 的种入逻辑（那是既有语义），已验证该页在种入会话下同样渲染正常。

---

## 2 任务 2｜新增区域（8 个 = 2 主题 × 4 结构区块）

沿用既有 6 区域的**同一口径**（选择器 + 视口 1440×900 + 主题 `light`/`dark` 经
`localStorage['ui-theme']` → `useTheme` 写 `<html data-theme>`），亮色与暗色**各自都有**：

| 区域 id（× 2 主题） | 结构含义 | 选择器 | 视口 | 就绪标记 `ready` | 见证断言 | 实测 box |
|---|---|---|---|---|---|---|
| `light\|dark.docheader` | 顶栏（品牌 + 文档标题 h1 + 前往登录） | `header.doc-header` | 1440×900 | `.doc-section` | `header.doc-header h1.doc-title` ≥ 1 | 1440×56 |
| `light\|dark.docnav` | 正文侧栏（页内目录锚点导航） | `aside.doc-sidebar` | 1440×900 | `.doc-section` | `aside.doc-sidebar .ant-anchor-link` ≥ 5 | 200×425 |
| `light\|dark.docbody` | **页面主体**（整页正文容器） | `main.doc-main` | 1440×900 | `.doc-section` | `main.doc-main .doc-section` ≥ 8 | 912×21629 |
| `light\|dark.docintro` | 章节容器（第 1 章 `#intro`：正文 + 步骤条） | `main.doc-main .doc-section#intro` | 1440×900 | `.doc-section` | `#intro .section-body .ant-steps-item` ≥ 6 | 912×457 |

**选择器为什么这样写（稳健性口径）**

1. **语义标签 + 本页自有类名**（`header.aside/main` + `.doc-*`），不用 `.ant-*` 这类 antd 实现细节；
   Doc.vue 无 antd 布局件（无 `.ant-layout-sider`、无 `#main-content`），故不能沿用默认三区域的选择器。
2. **不绑 `.ant-anchor-*`**：侧栏区域把锚点导航整体当黑盒截，内部结构（antd `a-anchor` 的 DOM）就算
   被拆分改动也不影响门禁判等；见证断言里用 `.ant-anchor-link` 只作**数量见证**（≥5），不作判据主键。
3. **`#intro` 用 id 不用类名**：该 id 是**页内锚点契约**（侧栏目录 `href="#intro"`），
   比 `.doc-section` 这种纯样式类更不易在拆分中被重命名。
4. **不截 `.doc-layout` 整页**：整页高 >21000px，全页截图既慢又易触 PNG 尺寸上限；
   改截「首章节」即可覆盖标题/正文/步骤条/图片的典型排版，`docbody` 负责整页容器级别的一致性。
5. `ready` 一律用 `.doc-section`（页面已就绪的标记）——**不用区域自身的选择器**，避免重演
   `pixel-gate-report.md` §6 缺陷 4（弹窗区域 `ready` 指向自身 → 循环等待超时）。

### 2.1 为什么是「显式追加」而不是「并入默认集合」

指令允许二选一，本装置选 **`--with-doc-regions` 显式追加**（默认仍 6 区域，语义与逐字节输出不变）：

- **默认行为零变化的硬要求**：并入默认会让每一次既有跑法的区域数与输出都变（哪怕 6 个旧区域仍全等），
  违背「原有 6 个区域的默认行为一律不变」。显式开关下，**不传参 = 与扩展前逐字节一致的 6 区域**（已实测，见 §4.1）。
- **失败归因更干净**：门禁的 `--json` 报告里 `args.withDocRegions` 与 `regionSet` 记录了本次到底测了什么，
  避免「本次 HEAD 对 HEAD 的 6 区域全等」被误读成「Doc.vue 也没回归」——那正是 `pixel-gate-report.md` §5 局限 1 的老问题。
- **仍是「可显式指定」**：`--regions <file>` 的既有语义（完全接管）**未改**，两者同用时以 `--regions` 为准。

---

## 3 任务 3｜夹具：**不需要新增任何 `/api` 夹具**（并说明为什么）

**结论：Doc.vue 渲染不依赖任何后端接口，`FIXTURES` 保持原样（仍是 3 条，全部服务于默认路由）。**

依据（三条独立证据）：

1. **源码级**：`grep -nE "api|axios|fetch\(|request|socket" client/src/views/Doc.vue` → **0 命中**。
   该页的 `<script setup>` 只 import `vue` / `@ant-design/icons-vue` / `ant-design-vue`，
   数据全部来自组件内常量（`introSteps`/`flowSteps`/`qSteps`/`sections2to7`）。
2. **全局级**：`/doc` 不套 Layout（`views/*/Layout.vue` 才是打 `/api/teacher/pending-summary` 的地方），
   `App.vue` 只做主题/语言/aria 同步，不打接口；该页也没有 pinia store 的取数动作。
3. **装置级（实测）**：5 次带 Doc 区域的整跑，门禁自检的 **`夹具漏网 API = 无`**（`unmockedApi: []`）。
   该自检的口径是「任何未命中夹具的 `/api/**` 一律 500 并记录，出现一条即 exit 2」——
   也就是说**一旦 Doc.vue（或它未来的子组件）开始打接口，本次门禁会立刻退化为 exit 2 并点名路径**，
   不会假绿。这正是「B 档拆分后若新增取数需要补夹具」的自动提示器。

图片资源（`/exam/doc-img/*.png`）走的不是 `/api`，由静态服务按 vite `base=/exam/` 前缀直接提供；
两棵树的 `public/doc-img/` 内容相同，实测 12 个区域截图的两侧 sha1 全等（含图片区），说明图片确已加载
（若图片 404 会渲染成破图/空框，两侧仍可能相等——故额外用**见证断言**兜底：`docintro` 要求步骤条节点 ≥6，
`docbody` 要求章节 ≥8）。

---

## 4 第五步自证（全部原始输出）

### 4.0 复现命令与耗时总览（P0–P4 时 HEAD = `b97e6334`；G1/G2/F1/F2 时 HEAD = `1b713b83`，client 指纹同一）

| 编号 | 场景 | 命令 | 退出码 | 实测耗时 |
|---|---|---|---|---|
| P0 | 既有三组之「边界」同 commit | `--before HEAD --after HEAD` | **0** | **64 s** |
| P1 | 既有三组之「正向」同树构建两次 | `--before HEAD --after worktree` | **0** | **88 s** |
| P2 | 既有三组之「负向」改一个色阶 | `--before HEAD --after /tmp/pg-ext/neg-base` | **1** | **109 s** |
| P3 | 新区域**干净对照** | `--before HEAD --after /tmp/pg-ext/clean --with-doc-regions` | **0** | **134 s** |
| P4 | 新区域**正控** | `--before HEAD --after /tmp/pg-ext/pos-doc --with-doc-regions` | **1** | **122 s** |
| G1 | 抗假绿：新区域截不到图 | `--before HEAD --after HEAD --regions /tmp/pg-ext/regions-ghost.json` | **2** | **171 s** |
| G2 | 抗假绿：夹具漏网 | `--before HEAD --after HEAD --regions /tmp/pg-ext/regions-unmocked.json` | **2** | **51 s** |
| F1 | **交付版脚本**默认集合复跑 | `--before HEAD --after HEAD`（当前 HEAD = `1b713b83`） | **0** | **60 s** |
| F2 | **交付版脚本** Doc 区域干净复跑 | `--before HEAD --after /tmp/pg-ext/clean --with-doc-regions` | **0** | **111 s** |

**整跑耗时口径**：默认 6 区域 **60–109 s**（同树 60–64 s / 异树 88 s / 负向含改后构建 109 s）；
加 `--with-doc-regions` 后 **111–134 s**（+50 s 左右，代价来自 `docbody` 的 912×21629 长图）。
与扩展前报告的「单次约 100 s」同量级，无退化。

**F1/F2 是「交付版脚本」的收口复核**（写入报告前最后一次改动之后执行）：
F1 默认集合 **exit 0** 且输出与 §4.1 **逐字节一致**（连「区域（6 个 = 2 主题 × 侧栏/内容区/弹窗）」这行文案都相同）；
F2 带 Doc 区域 **exit 0**、14/14 全等、`夹具漏网 API = 无`、端口收尾干净、`client/dist` mtime 未变。

### 4.1 P0｜既有三组之「边界」（`--before HEAD --after HEAD`）→ exit 0 ✅

```
像素门禁（client 视觉零回归）
  改前 before = b97e6334  HEAD   fp=9e6ed2b42e59
  改后 after  = b97e6334  HEAD   fp=9e6ed2b42e59
  构建 before = 25.6s / 392 文件  → /tmp/pixel-gate-p0/dist-before
  构建 after  = 24.3s / 392 文件  → /tmp/pixel-gate-p0/dist-after
  确定性      = ✓ 同源两次构建 byte-identical（diff -rq 0 行）
  服务端口    = before :3110  after :3111（绑 127.0.0.1；/api 由内建夹具应答）
  区域（6 个 = 2 主题 × 侧栏/内容区/弹窗）：
    ✓ light.sider   1460123e7607 == 1460123e7607   box=232x900
    ✓ light.content ce1768d6734a == ce1768d6734a   box=1208x900
    ✓ light.modal   831efb22eb64 == 831efb22eb64   box=640x216
    ✓ dark.sider    936a2608a2ab == 936a2608a2ab   box=232x900
    ✓ dark.content  1d19afb28940 == 1d19afb28940   box=1208x900
    ✓ dark.modal    a4f1cb802699 == a4f1cb802699   box=640x216
  夹具漏网 API    = 无
  亮/暗互异自检   = ✓ 亮暗像素确实不同（主题真的生效）
  client/dist     = ✓ 未被触碰（mtime 指纹未变）
  端口收尾        = :3110 已释放  :3111 已释放
结论：PASS
EXIT_CODE[P0_默认_HEAD_vs_HEAD]=0  WALL_SECONDS[P0_默认_HEAD_vs_HEAD]=64
```

**与扩展前逐字节同结论**：6 个区域的 sha1 **与 `pixel-gate-report.md` §2 记录的 6 个值完全相同**
（`1460123e7607 / ce1768d6734a / 831efb22eb64 / 936a2608a2ab / 1d19afb28940 / a4f1cb802699`）
→ 证明本次扩展**没有触碰默认区域表、像素判据、退出码与输出格式**。

### 4.2 P1｜既有三组之「正向」（同树构建两次 → 全等）→ exit 0 ✅

```
  改前 before = b97e6334  HEAD   fp=9e6ed2b42e59
  改后 after  = worktree（活树）   fp=9e6ed2b42e59
  构建 before = 25.6s / 392 文件  → /tmp/pixel-gate-p1/dist-before
  构建 after  = 24.0s / 394 文件  → /tmp/pixel-gate-p1/dist-after
  确定性      = ✓ 同源两次构建 byte-identical（diff -rq 0 行）
  服务端口    = before :3110  after :3111（绑 127.0.0.1；/api 由内建夹具应答）
  区域（6 个 = 2 主题 × 侧栏/内容区/弹窗）：
    ✓ light.sider   1460123e7607 == 1460123e7607   box=232x900
    ✓ light.content ce1768d6734a == ce1768d6734a   box=1208x900
    ✓ light.modal   831efb22eb64 == 831efb22eb64   box=640x216
    ✓ dark.sider    936a2608a2ab == 936a2608a2ab   box=232x900
    ✓ dark.content  1d19afb28940 == 1d19afb28940   box=1208x900
    ✓ dark.modal    a4f1cb802699 == a4f1cb802699   box=640x216
  夹具漏网 API    = 无
  亮/暗互异自检   = ✓ 亮暗像素确实不同（主题真的生效）
  client/dist     = ✓ 未被触碰（mtime 指纹未变）
  端口收尾        = :3110 已释放  :3111 已释放
结论：PASS
EXIT_CODE[P1_正向_HEAD_vs_worktree]=0  WALL_SECONDS[P1_正向_HEAD_vs_worktree]=88
```

> 注：`dist-after` 比 `dist-before` 多 2 个文件（394 vs 392），差的仍是活树独有的
> `public/.DS_Store` 与 `public/doc-img/.DS_Store`（`pixel-gate-report.md` §6 缺陷 1 的同一现场），与渲染无关。
> 活树 `client/` 与 HEAD 指纹相同（`fp=9e6ed2b42e59`）—— 本轮**未改任何产品代码**。

### 4.3 P2｜既有三组之「负向」（/tmp 副本改 1 个色阶）→ exit 1，精确命中 ✅

改动（仓库外副本，`diff -rq` 证实只有这 1 个文件 1 行不同）：

```diff
--- a/client/src/styles/tokens.css
+++ b/client/src/styles/tokens.css
@@
-    --bg-canvas: var(--gray-50);        /* 页面底色 */
+    --bg-canvas: var(--gray-100);       /* 页面底色 */
```

```
  改前 before = b97e6334  HEAD   fp=9e6ed2b42e59
  改后 after  = /tmp/pg-ext/neg-base   fp=967885f353ed
  构建 before = 24.3s / 392 文件  → /tmp/pixel-gate-p2/dist-before
  构建 after  = 25.5s / 392 文件  → /tmp/pixel-gate-p2/dist-after
  确定性      = ✓ 同源两次构建 byte-identical（diff -rq 0 行）
  服务端口    = before :3110  after :3111（绑 127.0.0.1；/api 由内建夹具应答）
  区域（6 个 = 2 主题 × 侧栏/内容区/弹窗）：
    ✓ light.sider   1460123e7607 == 1460123e7607   box=232x900
    ✗ light.content ce1768d6734a != c40eb40e5916   box=1208x900
    ✗ light.modal   831efb22eb64 != 958e107932d4   box=640x216
    ✓ dark.sider    936a2608a2ab == 936a2608a2ab   box=232x900
    ✓ dark.content  1d19afb28940 == 1d19afb28940   box=1208x900
    ✓ dark.modal    a4f1cb802699 == a4f1cb802699   box=640x216
  夹具漏网 API    = 无
  亮/暗互异自检   = ✓ 亮暗像素确实不同（主题真的生效）
  client/dist     = ✓ 未被触碰（mtime 指纹未变）
  端口收尾        = :3110 已释放  :3111 已释放
结论：FAIL（不等区域：light.content, light.modal）
EXIT_CODE[P2_负向_HEAD_vs_neg-base]=1  WALL_SECONDS[P2_负向_HEAD_vs_neg-base]=109
```

**灵敏度与分辨力与扩展前完全一致**：只降一个色阶即被抓到；只改浅色块 → 全部 dark 区域
与 `light.sider` 保持全等。**既有负向自测未因本次扩展而失效或变钝。**

### 4.4 P3｜新区域**干净对照**（不改任何东西）→ exit 0、**0 误报** ✅

条件：`/tmp/pg-ext/clean` = `git archive HEAD` 的**未改动**副本（与 HEAD 同指纹 `9e6ed2b42e59`）。

```
  改前 before = b97e6334  HEAD   fp=9e6ed2b42e59
  改后 after  = /tmp/pg-ext/clean   fp=9e6ed2b42e59
  构建 before = 34.7s / 392 文件  → /tmp/pixel-gate-p3/dist-before
  构建 after  = 37.6s / 392 文件  → /tmp/pixel-gate-p3/dist-after
  确定性      = ✓ 同源两次构建 byte-identical（diff -rq 0 行）
  服务端口    = before :3110  after :3111（绑 127.0.0.1；/api 由内建夹具应答）
  区域（14 个 = 默认 6 + Doc 8（Doc 侧 = 2 主题 × 顶栏/正文侧栏/内容区/首章节））：
    ✓ light.sider   1460123e7607 == 1460123e7607   box=232x900
    ✓ light.content ce1768d6734a == ce1768d6734a   box=1208x900
    ✓ light.modal   831efb22eb64 == 831efb22eb64   box=640x216
    ✓ dark.sider    936a2608a2ab == 936a2608a2ab   box=232x900
    ✓ dark.content  1d19afb28940 == 1d19afb28940   box=1208x900
    ✓ dark.modal    a4f1cb802699 == a4f1cb802699   box=640x216
    ✓ light.docheaderfdef8a21a3ed == fdef8a21a3ed   box=1440x56
    ✓ light.docnav  09e25b59e2d3 == 09e25b59e2d3   box=200x425
    ✓ light.docbody cf3749b3a180 == cf3749b3a180   box=912x21627
    ✓ light.docintro66094e3fc2a6 == 66094e3fc2a6   box=912x457
    ✓ dark.docheader55871176695e == 55871176695e   box=1440x56
    ✓ dark.docnav   973434ca38ab == 973434ca38ab   box=200x425
    ✓ dark.docbody  2d8e8f37608b == 2d8e8f37608b   box=912x21627
    ✓ dark.docintro b524a0ef787b == b524a0ef787b   box=912x457
  夹具漏网 API    = 无
  亮/暗互异自检   = ✓ 亮暗像素确实不同（主题真的生效）
  client/dist     = ✓ 未被触碰（mtime 指纹未变）
  端口收尾        = :3110 已释放  :3111 已释放
结论：PASS
EXIT_CODE[P3_新区域干净_HEAD_vs_clean]=0  WALL_SECONDS[P3_新区域干净_HEAD_vs_clean]=134
```

**关键读数**：8 个新区域**全部有真实像素**（box 非空、体积非零，见 §4.8），
且**亮/暗互异**（`fdef8a21a3ed ≠ 55871176695e`、`09e25b59e2d3 ≠ 973434ca38ab`、
`cf3749b3a180 ≠ 2d8e8f37608b`、`66094e3fc2a6 ≠ b524a0ef787b`）
→ 证明暗色主题在该页**确实生效**，不是「light 的副本」。**0 误报。**

### 4.5 P4｜新区域**正控**（只改 Doc.vue 模板 1 处）→ exit 1，**8/8 命中** ✅

改动（仓库外副本，`diff -rq` 证实**只有 Doc.vue 一个文件**不同）：
把 `Doc.vue` 的 `<style scoped>` 里 `.doc-header` 高度由 `56px` 改为 `96px`
——**模板结构性区块的 1 处改动**，正是 B 档拆分最可能触发的那类变化。

```
  改前 before = b97e6334  HEAD   fp=9e6ed2b42e59
  改后 after  = /tmp/pg-ext/pos-doc   fp=4d7f4746319d
  构建 before = 25.4s / 392 文件  → /tmp/pixel-gate-p4/dist-before
  构建 after  = 34.1s / 392 文件  → /tmp/pixel-gate-p4/dist-after
  确定性      = ✓ 同源两次构建 byte-identical（diff -rq 0 行）
  服务端口    = before :3110  after :3111（绑 127.0.0.1；/api 由内建夹具应答）
  区域（14 个 = 默认 6 + Doc 8（Doc 侧 = 2 主题 × 顶栏/正文侧栏/内容区/首章节））：
    ✓ light.sider   1460123e7607 == 1460123e7607   box=232x900
    ✓ light.content ce1768d6734a == ce1768d6734a   box=1208x900
    ✓ light.modal   831efb22eb64 == 831efb22eb64   box=640x216
    ✓ dark.sider    936a2608a2ab == 936a2608a2ab   box=232x900
    ✓ dark.content  1d19afb28940 == 1d19afb28940   box=1208x900
    ✓ dark.modal    a4f1cb802699 == a4f1cb802699   box=640x216
    ✗ light.docheaderfdef8a21a3ed != 1ec109ffd17e   box=1440x56  ⚠几何不等
    ✗ light.docnav  09e25b59e2d3 != 453c8b12ca01   box=200x425  ⚠几何不等
    ✗ light.docbody cf3749b3a180 != b2740344b940   box=912x21627
    ✗ light.docintro66094e3fc2a6 != b15bacb04187   box=912x457  ⚠几何不等
    ✗ dark.docheader55871176695e != e0302a595c38   box=1440x56  ⚠几何不等
    ✗ dark.docnav   973434ca38ab != 45d537f15dff   box=200x425  ⚠几何不等
    ✗ dark.docbody  2d8e8f37608b != 7be47e090ae8   box=912x21627
    ✗ dark.docintro b524a0ef787b != 80f7a86449d9   box=912x457  ⚠几何不等
  夹具漏网 API    = 无
  亮/暗互异自检   = ✓ 亮暗像素确实不同（主题真的生效）
  client/dist     = ✓ 未被触碰（mtime 指纹未变）
  端口收尾        = :3110 已释放  :3111 已释放
结论：FAIL（不等区域：light.docheader, light.docnav, light.docbody, light.docintro,
             dark.docheader, dark.docnav, dark.docbody, dark.docintro）
EXIT_CODE[P4_新区域正控_HEAD_vs_pos-doc]=1  WALL_SECONDS[P4_新区域正控_HEAD_vs_pos-doc]=122
```

**新区域不是空跑（这是本扩展最关键的一条）**：8 个新区域**全部报出差异**，
而 6 个既有区域**全部保持全等**（该改动只影响 `/exam/doc`，不影响 `/exam/teacher/classes`）
—— 说明新区域既不空跑、也不越界误伤。

**为什么先动 header 高度会连带 docnav/docintro 变**：`.doc-header` 是 `position: sticky` 且高度参与文档流，
增高 40px 会把 `.doc-body` 整体下移 → 侧栏（`sticky top:88px`）与首章节的**截图取景位置**同步改变
（`.docintro` 的 box 仍是 912×457，但内容错位 → `几何不等` 标记也亮了，正是该行提示的用途）。
这同时证明了门禁**抓得到「间接/级联传播」的视觉变化**，不只是改哪个块就报哪个块。

> 另外，`.docbody` 这一行**没有** `⚠几何不等`：因为它截的是 `main.doc-main` 整块，
> 块本身尺寸恰好未变（内容整体等高下移），**只有像素不同** —— 这正是「几何相等 ≠ 像素相等」
> 的现场，两条判据（`pixelEqual` 与 `geometryEqual`）各司其职。

### 4.6 新增区域的「非空」证据（像素与体积）

| 区域 | PNG 尺寸 | before 体积 | 说明 |
|---|---|---|---|
| `light.docheader` | 1440×56 | 9,049 B | 顶栏条带（含 logo/标题/按钮） |
| `light.docnav` | 200×425 | 22,285 B | 侧栏卡片（目录锚点） |
| `light.docbody` | 912×21629 | 2,524,684 B | 整页正文容器（长图） |
| `dark.docbody` | 912×21629 | 2,597,826 B | 同上（暗色；亮/暗体积不同 → 主题确实生效） |
| `light.docintro` | 912×457 | 64,359 B | 第 1 章（标题 + 正文 + 步骤条） |
| `dark.docintro` | 912×457 | 65,486 B | 同上（暗色，体积不同 → 主题确实生效） |

（尺寸/体积从 `/tmp/pixel-gate-p3/logs/*.png` 直接量取；若区域选择器落空，这里会是 0 或根本没有文件，
门禁也会以「未能截图」直接 exit 2。）

> 口径说明：门禁在报告里打印的 `box` 取自 Playwright `boundingBox()`（可能是小数，例如 `docbody` 的高度
> 实测 `21627.03`，而 `locator.screenshot()` 出来的 PNG 高 21629 —— 两者在亚像素上取整方式不同，
> 差 2px 属正常）。这不影响判据：`geometryEqual` 是**两侧同法取值后互比**，取整方式一致；
> 真要精确尺寸请用 `--json` 看 `regions[].before.box`。

---

### 4.7 G1｜抗假绿：**新区域截不到图 → 仍是 exit 2（无法判定），不冒充 PASS 也不冒充 FAIL** ✅

做法：用 `--regions` 把区域指向一个**不存在于 Doc.vue 的选择器**（`main.doc-header-nonexistent`），
验证「没测到」绝不会被算成「测出来不一样」，也不会被算成 PASS：

```
  改前 before = 1b713b83  HEAD   fp=9e6ed2b42e59
  改后 after  = 1b713b83  HEAD   fp=9e6ed2b42e59
  构建 before = 22.3s / 392 文件  → /tmp/pixel-gate-g1/dist-before
  构建 after  = 23.1s / 392 文件  → /tmp/pixel-gate-g1/dist-after
  确定性      = ✓ 同源两次构建 byte-identical（diff -rq 0 行）
  服务端口    = before :3110  after :3111（绑 127.0.0.1；/api 由内建夹具应答）
  区域（2 个 = 自定义区域表：/tmp/pg-ext/regions-ghost.json）：
    ! light.ghost   未能截图（无法判定，不是差异）  before=locator.waitFor: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('main.doc-header-nonexistent').first() to be visible
 after=locator.waitFor: Timeout 30000ms exceeded. …
    ! dark.ghost    未能截图（无法判定，不是差异）  before=locator.waitFor: Timeout 30000ms exceeded. …
  夹具漏网 API    = 无
  亮/暗互异自检   = ✓ 亮暗像素确实不同（主题真的生效）
  client/dist     = ✓ 未被触碰（mtime 指纹未变）
  端口收尾        = :3110 已释放  :3111 已释放
结论：INCONCLUSIVE（未能截图、无法判定：light.ghost, dark.ghost）
EXIT_CODE[G1_新区域抗假绿_ghost]=2  WALL_SECONDS[G1_新区域抗假绿_ghost]=171
```

**含义**：新增区域若因为拆错/选择器失效而截不到图，门禁会**点名该区域并 exit 2**，
绝不会安静地跳过、更不会因为「两侧都没截到」而算成全等。
（耗时 171 s 偏高：两个区域各自在两侧各等 30 s 超时，属失败路径的正常代价。）

### 4.8 G2｜抗假绿：**夹具漏网 → 仍是 exit 2，即使像素 100% 全等** ✅

做法：用 `--regions` 指向 `/exam/teacher/assignments`（其 mount 打 `/api/teacher/assignments`，夹具表里没有）：

```
  区域（2 个 = 自定义区域表：/tmp/pg-ext/regions-unmocked.json）：
    ✓ light.assign  511211bc571e == 511211bc571e   box=1208x900
    ✓ dark.assign   e15aa087552e == e15aa087552e   box=1208x900
  夹具漏网 API    = GET /api/teacher/assignments
  亮/暗互异自检   = ✓ 亮暗像素确实不同（主题真的生效）
结论：INCONCLUSIVE
EXIT_CODE[G2_抗假绿_夹具漏网]=2  WALL_SECONDS[G2_抗假绿_夹具漏网]=51
```

**含义**：像素全等也不算 PASS —— 因为「两侧同样烂」不构成「零回归」的证据。
**对下一个拆分步的直接价值**：Doc.vue 拆出的子组件若开始打接口而夹具没补，
门禁会立刻 exit 2 并点名路径（而不是给出一个漂亮的假绿）。

---

## 5 本装置仍查不到什么（本次扩展**没有**解决的盲区）

| # | 盲区 | 具体边界 |
|---|---|---|
| 1 | **整页只截「内容/结构」，不截交互态** | 图片灯箱（`.lightbox-mask`，需点击/Enter 打开）、移动端浮动目录与抽屉（`showMobileToc` 只在宽度 <992px 出现，装置固定 1440×900）、锚点点击后的滚动定位——都不在本次 8 个区域内。若 B 档拆分动到这些逻辑，本门禁**看不见**，仍需行为对拍/axe 补位。 |
| 2 | **只覆盖 `/exam/doc` 一条路由** | Doc.vue 若被拆出**被其它页面复用的子组件**，那些页面的渲染不在本装置覆盖内（默认 6 区域只走 `/exam/teacher/classes`）。 |
| 3 | **仍是夹具/无后端** | 该页零接口，所以这一条对它暂时无影响；但一旦拆分引入取数，夹具数据 ≠ 真实数据（长文本、空态、异常态、分页、真实排序）仍不覆盖。 |
| 4 | **纯静态像素** | 抓不到交互时序、键盘可达性/焦点顺序、ARIA 语义、请求行为、控制台报错、性能。**像素全等 ≠ 功能无回归**（这条来自原报告，未变）。 |
| 5 | **不覆盖登录/鉴权链路** | `/doc` 本就是公共路由，故本页无关；但若拆分改动全局守卫，本门禁看不见。 |
| 6 | **图片内容不等于图片资源** | 区域截图只能证明「图片按当前布局渲染了」，`.doc-img` 指向的 PNG 本身换了内容（同名替换）不会被判为差异——资源内容的回归需要用资源哈希另设门禁。 |
| 7 | **构建确定性只能证伪不能证实** | 换机器 / 换 Node 版本后必须重跑一次自检（门禁已内置该检查，无需手动）。 |
| 8 | **区域缺失是硬失败，不是跳过** | 若 `header.doc-header` / `aside.doc-sidebar` / `main.doc-main` / `#intro` 里的某一个在改后树消失（例如被拆成子组件时改了外层标签或 id），门禁给 exit 2 并点名——这是**有意**的，但意味着真实的**结构性 DOM 变更**需要先同步调整区域表，不能直接拿本表判红。 |
| 9 | **不覆盖客户端路由跳转** | 只验证「直接打开 `/exam/doc` 的渲染」，不验证从其它页跳转过来（含过渡动画 `page-fade`）后的最终形态。 |

---

## 6 硬约束遵守核对

| 约束 | 实测 | 证据 |
|---|---|---|
| **不改任何产品代码**（`client/src/**` 只读） | ✅ | `git status --short -- client/ ` → **0 行**；活树 client 指纹 `9e6ed2b42e59` 与 HEAD 相同（P1 实测） |
| 只改 `scripts/gates/pixel-diff.mjs` 与本报告 | ✅ | `git status --short -- client/ scripts/ docs/split/` → 仅 ` M scripts/gates/pixel-diff.mjs` 与 `?? docs/split/pixel-gate-extension.md`（`docs/split/reviewController-plan.md` 非本会话产物） |
| **不重建 `client/dist`**；一律 `--outDir` 到仓库外 | ✅ | `client/dist` 与 `client/dist/index.html` mtime **仍为 2026-10-10 21:55:33**；所有产物在 `/tmp/pixel-gate-p*/dist-*`；门禁每次运行自断言该 mtime 未变（13 次跑全部 `✓ 未被触碰`） |
| 不碰 :5173/:3000；装置只用 31xx，逐端口探测 | ✅ | 13 次跑全部只 bind `127.0.0.1:3110/3111`；收尾 `lsof` 复核 **31xx/3000/5173 全空**；无残留 `pixel-diff.mjs` 进程 |
| 不写 `tests/` | ✅ | `find tests -newermt '-40 minutes' -type f` → **空**（本轮未启动、未复用任何 rig） |
| 零 git 写操作 / 禁 clean·stash·checkout·reset·restore | ✅ | 只用 `rev-parse`/`archive`/`ls-files`/`status`/`diff`/`numstat`；无任何写命令 |
| 禁止联网、不得安装新依赖 | ✅ | 零安装；Playwright 仍经 `createRequire` 复用 `client/node_modules/playwright` 与既有 chromium |
| **只增不改既有语义** | ✅ | `git diff --numstat` = **+70 / −8**；8 行删除全部是**被替换的注释/文案/一行三元式**，判据、退出码、端口、夹具、默认区域表**均未改动**（§7） |

### 6.1 变更行清单（+70 / −8）

| 位置 | 类型 | 内容 |
|---|---|---|
| 文件头注释 | 增 | `--with-doc-regions` 用法说明、Doc 追加区域表（4 区域 × 2 主题）、局限更新 |
| `parseArgs` | 增/改 | 新增 `withDocRegions: false` 默认值与 `--with-doc-regions` 分支（既有参数分支未动） |
| `HELP` | 改 | 用法行补 `[--with-doc-regions]` |
| `DOC_REGION_AREAS` / `DOC_REGIONS` | 增 | 4 个区域定义 + 亮暗展开（约 35 行） |
| `main()` 区域选择 | 改 | 一行三元式 → 三态选择（`--regions` > `--with-doc-regions` > 默认）+ `report.regionSet` 记录 |
| `main()` report.args | 改 | 多记一个 `withDocRegions` 字段（原两字段未动） |
| `printHuman` 区域标题 | 改 | 硬编码文案 → 按 `regionSet` 查表；`default(6)` 文案与扩展前**逐字节相同** |

**未改动（逐行确认）**：`FIXTURES`、`FIXTURE_USER`、`DEFAULT_REGION_AREAS`、`EXIT`、`FORBIDDEN_PORTS`、`VIEWPORT`、`pickPort/portBusy/isPortFree`、`materialize/fingerprintClient/listSourceFiles`、`buildTree/diffDirs`、`startStaticServer`（含夹具漏网 500 记录）、`captureRegion`、判定分支（`measuredDiffs/unrunnable/themeCollisions/guardFail/verdict/exitCode`）。

---

## 7 复现本次自测的最短路径

```bash
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek"

# 既有三组（应分别 0 / 0 / 1）
node scripts/gates/pixel-diff.mjs --before HEAD --after HEAD        # 边界 → exit 0
node scripts/gates/pixel-diff.mjs --before HEAD --after worktree    # 正向 → exit 0
rm -rf /tmp/pg-neg && mkdir -p /tmp/pg-neg/tree && git archive HEAD | tar -x -C /tmp/pg-neg/tree
ln -sfn "$PWD/client/node_modules" /tmp/pg-neg/tree/client/node_modules
node -e "const fs=require('fs');const f='/tmp/pg-neg/tree/client/src/styles/tokens.css';let s=fs.readFileSync(f,'utf8');const a='--bg-canvas: var(--gray-50);',b='--bg-canvas: var(--gray-100);';if(s.split(a).length-1!==1)throw new Error('锚点不唯一');fs.writeFileSync(f,s.replace(a,b));"
node scripts/gates/pixel-diff.mjs --before HEAD --after /tmp/pg-neg/tree   # 负向 → exit 1

# 新区域（干净 → exit 0；正控 → exit 1）
rm -rf /tmp/pg-clean && mkdir -p /tmp/pg-clean && git archive HEAD | tar -x -C /tmp/pg-clean
ln -sfn "$PWD/client/node_modules" /tmp/pg-clean/client/node_modules
node scripts/gates/pixel-diff.mjs --before HEAD --after /tmp/pg-clean --with-doc-regions
rm -rf /tmp/pg-pos && cp -R /tmp/pg-clean /tmp/pg-pos
node -e "const fs=require('fs');const f='/tmp/pg-pos/client/src/views/Doc.vue';let s=fs.readFileSync(f,'utf8');const a='    height: 56px;',b='    height: 96px;';if(s.split(a).length-1!==1)throw new Error('锚点不唯一');fs.writeFileSync(f,s.replace(a,b));"
node scripts/gates/pixel-diff.mjs --before HEAD --after /tmp/pg-pos --with-doc-regions   # → exit 1，8 个 Doc 区域全部命中
```

### 7.1 给下一个拆分步（B 档 Doc.vue）的执行建议

```bash
# 未提交时：改前 = HEAD，改后 = 活树；必须带 --with-doc-regions（否则 Doc.vue 仍是盲区）
node scripts/gates/pixel-diff.mjs --before <prev-commit> --after worktree --with-doc-regions --json
```

判读要点：

- **只看 `docheader/docnav/docbody/docintro` 这 8 行**的结论；6 个默认区域只能证明布局骨架没被牵连。
- 如果拆分为子组件导致 `header.doc-header` / `aside.doc-sidebar` / `main.doc-main` / `#intro` 之一消失或改名，
  **先同步区域表再判**（门禁会 exit 2 点名，不会静默跳过）。
- 出现 `夹具漏网 API` = 拆分引入了新的取数 → 补 `FIXTURES` 后重跑（否则 exit 2）。

---

## 8 结论

1. **任务 1**：Doc.vue = `/exam/doc`，**公共路由**（无需登录/角色/参数），独立页无 Layout。
2. **任务 2**：新增 **8 个区域**（2 主题 × 顶栏/正文侧栏/内容区/首章节），选择器统一走「语义标签 + 本页类名/id」，不绑 antd 内部结构。
3. **任务 3**：**不需补夹具**（该页零 `/api` 请求，三条独立证据 + 实测「夹具漏网 API = 无」）。
4. **任务 4**：既有 6 区域、CLI 默认、退出码、端口策略**全部不变**（默认跑法输出与 6 个 sha1 与扩展前逐字节相同）；新区域仅在显式 `--with-doc-regions` 时追加。
5. **自证**：既有三组自测复跑 **0 / 0 / 1 全部符合预期**；新区域正控 **8/8 命中且 6 个默认区域保持全等**；干净对照 **0 误报**；抗假绿 **两组均 exit 2**；整跑 **60–134 s**（默认 60–109 s，加 Doc 区域 +50 s 左右），交付版脚本收口复跑 F1/F2 均 exit 0。

