# pixel-gate-report —— client 侧像素门禁（Phase 1 / P1-1）落地报告

> 产物：`scripts/gates/pixel-diff.mjs`（新建）
> 报告：`docs/split/pixel-gate-report.md`（本文件）
> 立场：护栏构建者（纯只读借用既有装置；**零 git 写操作**；未碰任何 .vue）
> 自测锚点：`c7dbd75`（HEAD，三组自测执行时）｜收尾复核时 HEAD 已前移到 `06cb6dc`，两者 **client/ 零差异**（见 §4），故结论直接沿用

---

## 0 一句话结论

门禁已落地并**通过三组自测**：正向 exit 0、负向 exit 1（精确命中被改区域）、边界 exit 0；
另加两组**抗假绿自测**（装置异常时拒绝判 PASS）。三组之外的额外收获是排掉了实现期
真实踩到的 5 个缺陷（§6），其中 2 个若不复测就会产出**假 INCONCLUSIVE / 假 FAIL**。

---

## 1 装置说明

### 1.1 流程

```
node scripts/gates/pixel-diff.mjs --before <commit> --after <commit|worktree|dir> [--json]
```

| 步 | 做法 | 约束依据 |
|---|---|---|
| ① 冻结改前 | `git archive <commit> | tar -x -C /tmp/pixel-gate/tree-before`；**绝不读活树当基线** | constraints §3.7 先冻结再测 |
| ② 两棵树各自构建 | `node <repo>/client/node_modules/vite/bin/vite.js build --outDir /tmp/... --emptyOutDir`，env `VITE_API_BASE_URL=/api` | constraints §1 严禁重建 `client/dist` |
| ③ 起两个静态服务 | 各自 bind `127.0.0.1:31xx`，**起服务前逐端口 bind 探测占用**，显式跳过 3000/5173 | constraints §14 非特权端口 |
| ④ 浏览器自动化截图 | Playwright（**复用仓内 client/node_modules，不联网不装包**），同视口 1440×900、同夹具数据 | — |
| ⑤ 逐区域比像素 sha1 | 全等 → exit 0；任一不等 → exit 1 并列出差异区域 | 计划书 §5 DoD 5 |

**两棵树的 `node_modules` 用软链指向本仓 `client/node_modules`**（不复制 456MB），
所以仓库外目录里的 client/ 无需 `npm install`。

### 1.2 为什么没有后端

原设想沿用 round 2 的 rig（真后端 :3100 + 真实登录）。实测**本机 MySQL 未监听 3306**，
后端起不来（且 constraints §1 禁止写生产库、§14 要求 PORT=0）。
故本门禁改为 **/api 由静态服务内建的夹具表应答**：

- 两侧拿到**逐字节相同的 JSON** → 数据差异被彻底排除，观测到的像素差异只可能来自源码；
- 无 DB、无后端端口、无鉴权链路 → 装置更稳、更快（整跑约 100 s）。

代价（真实数据形态不覆盖）写进 §5「已知局限」。

### 1.3 区域划分（默认 2 主题 × 3 区域 = 6 个）

| 区域 id | 主题 | 选择器 | 路由 | 打开方式 |
|---|---|---|---|---|
| `light.sider` / `dark.sider` | light/dark | `.ant-layout-sider` | `/exam/teacher/classes` | — |
| `light.content` / `dark.content` | light/dark | `#main-content` | `/exam/teacher/classes` | — |
| `light.modal` / `dark.modal` | light/dark | `.ant-modal-content:visible` | `/exam/teacher/classes` | 点「新增班级」 |

主题经 `localStorage['ui-theme']` → `useTheme` 写到 `<html data-theme>`；
上下文同时设 `colorScheme` 与 `reducedMotion:'reduce'`，截图用 `animations:'disabled'`。

> **对计划书「4 组」的澄清（沿用 round 2 §7.4）**：字面形态「亮/暗 × 舒适/紧凑 4 组」在本仓
> **不可执行** —— `data-density` 是各 Layout 硬编码（teacher=compact / student=comfortable /
> admin=compact），**无全局密度开关**，同一路由无法在两种密度下渲染。
> 故采用可执行形态：**每个主题各自做「改前 vs 改后」全等**，共 6 个区域。

### 1.4 判据口径（写死，防假阳性）

- **禁用 asset 文件名 / 字节哈希判等**。Vite 的 content hash 让产物名随源码一字节变化而变
  （实证：`index-B7EtbyWX.css` ↔ `index-BH2_SreE.css`）→ 只能证明「源码变了」，
  不能证明「渲染变了」，**必然假阳性**。门禁只比渲染像素。
- `diff -rq` **只用于「同一棵树两次构建是否 byte-identical」的装置自检**，不参与改前/改后判据。
- **构建不确定 → 不判 PASS**：同一棵树两次独立构建若非 byte-identical，即使像素全等也退化为
  exit 2「无法判定」。

### 1.5 退出码

| 码 | 含义 |
|---|---|
| 0 | 全部区域像素 sha1 相等（PASS） |
| 1 | **已实测到**存在不等区域（FAIL，逐区域列出） |
| 2 | 无法判定 / 执行错误：区域截不到图、夹具漏网、构建不确定、`client/dist` 被触碰 |

**设计意图：「无法判定」绝不能退化成 0。** 任何装置异常都必须显式失败，否则门禁会变成永远绿灯。

---

## 2 三组自测（必做）—— 原始输出

### 2.1 正向：同一棵树构建两次 → 全区域 sha1 相等，exit 0 ✅

命令：`node scripts/gates/pixel-diff.mjs --before HEAD --after worktree --keep`

```
像素门禁（client 视觉零回归）
  改前 before = c7dbd754  HEAD   fp=02a459dfc07c
  改后 after  = worktree（活树）   fp=02a459dfc07c
  构建 before = 21.8s / 392 文件  → /tmp/pixel-gate/dist-before
  构建 after  = 21.7s / 394 文件  → /tmp/pixel-gate/dist-after
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
```

`POSITIVE_EXIT=0`。

**收尾复核（用最终版脚本、在 HEAD 已前移到的 `06cb6dc` 上重跑）**：
`node scripts/gates/pixel-diff.mjs --before HEAD --after worktree` → **exit 0**，6/6 区域全等，
`fp=02a459dfc07c`（与 `c7dbd75` 时逐字节相同 → 再次印证 client 侧零变化），端口收尾干净。

改前树另建一次（`builds.beforeSecond`）作为确定性对照，
两次构建 `diff -rq` **0 行** → 像素判等可信。

> 注：`dist-after` 比 `dist-before` 多 2 个文件（394 vs 392），差的是
> `public/.DS_Store` 与 `public/doc-img/.DS_Store` —— 活树独有的 macOS 垃圾文件被 vite 拷进产物，
> 与渲染无关（像素仍全等）。这正是 §6 缺陷 1 的现场。

### 2.2 负向：故意改一处样式 → 门禁报差异并 exit 1 ✅

**改动**（在 /tmp 临时副本里，仓库与活树均未动）：
`client/src/styles/tokens.css` 浅色块把页面底色降**一个色阶**：

```diff
--- a/client/src/styles/tokens.css
+++ b/client/src/styles/tokens.css
@@ -178,7 +178,7 @@
 :root {
   /* 背景 */
-  --bg-canvas: var(--gray-50);        /* 页面底色 */
+  --bg-canvas: var(--gray-100);        /* 页面底色 */
```

（`--gray-50 #f6f7f9` → `--gray-100 #eef0f4`；`diff -rq` 证实**只此一个文件、一行**不同。）

命令：`node scripts/gates/pixel-diff.mjs --before HEAD --after /tmp/pg-neg/tree --keep`

```
像素门禁（client 视觉零回归）
  改前 before = c7dbd754  HEAD   fp=02a459dfc07c
  改后 after  = /tmp/pg-neg/tree   fp=70ee9807618b
  构建 before = 22.8s / 392 文件  → /tmp/pixel-gate/dist-before
  构建 after  = 21.8s / 392 文件  → /tmp/pixel-gate/dist-after
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
```

`NEGATIVE_EXIT=1`。

**证据强度（不只是「红了」）**：
- **灵敏度**：只降一个色阶（`#f6f7f9`→`#eef0f4`）即被抓到；
- **分辨力**：只改**浅色**块的 `--bg-canvas`，则 `light.sider`（走 `--sider-bg`）与
  **全部 dark 区域**（暗色块未动）保持全等 —— 说明门禁不是「哪里都报红」；
- **级联可见**：`light.modal` 也变了（弹窗底/表单读过该变量或经 antd 主题桥派生），
  说明**间接传播的视觉变化同样逃不掉**。

### 2.3 边界：--before 与 --after 指同一个 commit → 报相等，exit 0 ✅

命令：`node scripts/gates/pixel-diff.mjs --before HEAD --after HEAD`

```
  改前 before = c7dbd754  HEAD   fp=02a459dfc07c
  改后 after  = c7dbd754  HEAD   fp=02a459dfc07c
  确定性      = ✓ 同源两次构建 byte-identical（diff -rq 0 行）
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
结论：PASS
```

`BOUNDARY_EXIT=0`。**排除了「把版本簿记差异误判成像素差异」**：
两棵树是分别独立构建的两份产物（不是同一目录复用），仍 6/6 全等。

---

## 3 附加自测：抗假绿（门禁不能永远绿灯）

「没有负向自测的门禁等于永远绿灯」不止适用于样式改错，也适用于**装置本身失灵**。故补两组：

### 3.1 区域截不到图 → 必须 exit 2，且不得冒充「差异」

```
    ! light.ghost   未能截图（无法判定，不是差异）  before=locator.waitFor: Timeout 8000ms exceeded. …
    ! dark.ghost    未能截图（无法判定，不是差异）  …
结论：INCONCLUSIVE（未能截图、无法判定：light.ghost, dark.ghost）
```
`BLIND_EXIT=2`。

> 这里修掉了一个真实缺陷（§6 缺陷 5）：初版把「两侧都没截到图」算成 `pixelEqual=false` → 报 **FAIL(exit 1)**，
> 把「没测到」冒充成「测出来不一样」。现已区分：**未能截图 = 无法判定（exit 2），不是差异。**

### 3.2 夹具漏网（页面悄悄白屏）→ 必须 exit 2，即使像素全等

把区域指到 `/exam/teacher/assignments`（其 mount 会打 `/api/teacher/assignments`，夹具表里没有）：

```
  区域（2 个）：
    ✓ light.assign  511211bc571e == 511211bc571e   box=1208x900
    ✓ dark.assign   e15aa087552e == e15aa087552e   box=1208x900
  夹具漏网 API    = GET /api/teacher/assignments
  亮/暗互异自检   = ✓ 亮暗像素确实不同（主题真的生效）
结论：INCONCLUSIVE
```

`BLIND3_EXIT=2`。**这是最关键的一条**：像素 100% 全等，门禁仍拒绝说 PASS，
并点名漏网的 API 路径 —— 因为「两侧同样烂」不构成「零回归」的证据。

另有**亮/暗互异自检**：若同一侧 light 与 dark 像素相同，说明 `data-theme` 没生效，
该区域等于只测了一半 → 直接判「无法判定」。

---

## 4 约束遵守核对（硬约束逐条）

| 约束 | 实测 | 证据 |
|---|---|---|
| 严禁重建 `client/dist`；构建一律 --outDir 到仓库外 | ✅ | `client/dist` 与 `dist/index.html` mtime **仍为 2026-10-10 21:55:33**；产物全部落 `/tmp/pixel-gate/`；门禁每次运行还自断言该 mtime 未变 |
| 严禁占用 :5173 / :3000；临时服务显式绑 31xx 且用后关闭 | ✅ | 全程只用 **:3110 / :3111**（bind 127.0.0.1）。收尾 `lsof -iTCP -sTCP:LISTEN`：**31xx 段、:3000、:5173 全部空**；无残留 vite/node/chrome 进程 |
| 不修改 `tests/` 下任何文件（只读借用 rig） | ✅ | `tests/` mtime **仍为 2026-10-10 20:13:40**，`tests/ui-redesign-verify` **仍为 2026-10-10 20:26:07**。本轮**未启动也未复用 rig**（后端不可用，见 §1.2），只读了其 rig.sh / playwright 配置作为装置参考 |
| 禁止 git clean / stash / checkout -- . / reset --hard / restore .；**零 git 写操作** | ✅ | 只用 `rev-parse`/`archive`/`ls-files`/`diff`/`log`/`status`。`git reflog` 显示 `c7dbd75`、`06cb6dc` 两个提交**均为 Captain 所做**，非本会话 |
| 禁止联网、不得 npm install | ✅ | 零安装。Playwright 复用 `client/node_modules/playwright@1.60.0`（经 `createRequire` 解析），浏览器复用 `~/Library/Caches/ms-playwright/chromium-1223` |
| 不碰任何 .vue 源码 | ✅ | `git status --short -- client/` **为空**；本轮只新建 `scripts/gates/pixel-diff.mjs` 与本文档 |
| 只读借用既有 rig | ✅ | 未执行 `rig.sh` 任何子命令（含 start/stop），未写 tests/ |

**锚点说明**：三组自测执行于 `c7dbd75`；收尾时 HEAD 已由 Captain 前移到 `06cb6dc`（step-1 拆 ruleExecutor）。
`git diff --stat c7dbd75 06cb6dc -- client/` **输出为空** → client 侧零变化，**三组自测结论直接沿用到当前 HEAD**。
（该提交只动 `server/`、`docs/`、`scripts/gates/`。）

---

## 5 已知局限（这个门禁抓不到什么）—— 必须读

1. **默认区域不覆盖被拆分的具体文件**。默认 6 个区域只走 `/exam/teacher/classes` 一条路由，
   覆盖的是**布局骨架 + PageShell/ListPage + antd 弹窗**。对 Phase 3 要拆的
   `Submit.vue` / `ProjectQuestionEdit.vue` / `QuestionEdit.vue` / `ReviewDetail.vue` / `Doc.vue`
   **近乎盲区**。→ **拆哪个 .vue，就必须用 `--regions` 把该文件所在路由补进来**（见 §7），
   否则「6 区域全等」不能作为该文件的零回归证据。
2. **夹具数据 ≠ 真实数据**。不覆盖长文本换行、空态、异常态、分页、真实排序。
   夹具是固定的 2 行班级数据。
3. **纯静态像素**：抓不到交互时序、键盘可达性 / 焦点顺序、ARIA 语义、请求行为、控制台报错、
   性能。**像素全等 ≠ 功能无回归** —— a11y 仍需 axe，行为仍需对拍。
4. **只截「静止」态**：动画 / 过渡 / 轮询刷新中的中间帧不覆盖（靠 `reducedMotion` +
   `animations:'disabled'` 压掉了，属有意为之）。
5. **不覆盖登录/鉴权链路**：token 与 user 由 `addInitScript` 直接种进 localStorage（无真后端）。
   若拆分改到鉴权或路由守卫，本门禁看不见 —— 需行为对拍补位。
6. **构建确定性只能证伪不能证实**：本仓实测同源两次构建 byte-identical，
   但**换机器 / 换 Node 版本后必须重跑一次自检**（门禁已内置该检查，不必手动）。
7. **区域缺失是硬失败，不是跳过**：若某区域在改后树里选择器消失（例如元素被删），
   门禁会给 exit 2 而不是「静默跳过」——这是有意的，但也意味着**真实的重构性 DOM 变更**
   （如 C5 Doc.vue 拆子组件）需要先调整区域表，不能直接拿默认表判红。

---

## 6 实现期踩到并修掉的 5 个缺陷（复现价值高）

| # | 现象 | 根因 | 修法 |
|---|---|---|---|
| 1 | 正向自测报 **INCONCLUSIVE**（假警报）：`diff -rq` 恰差 2 行 `.DS_Store` | 用「源码指纹相同」判定同源，但指纹按 .gitignore 口径忽略 `.DS_Store`，而 vite 会把 `public/` 整目录拷进 dist → 活树产物多 2 个文件；却拿「HEAD 构建」与「活树构建」互当确定性对照 | 判定「同一棵树」只认**同 commit / 同目录 / 都是活树**；不同树时**另建一次改前树**作对照 |
| 2 | 活树与 `git archive` 树的指纹对不上（`sameSource=false`） | 活树有被 .gitignore 的 `dist-r2/ dist-t02check/ .qa-dist/`（数百个产物文件）被计入指纹 | 指纹改用 **git 清单**（`ls-files --cached --others --exclude-standard`）：忽略产物，**但保留新增未跟踪源文件**（拆分新 composable 必须计入） |
| 3 | 导出树比活树少一个文件（`.vscode/extensions.json`） | 遍历时笼统跳过「点目录」 | 与 `client/.gitignore` 对齐：只跳 `node_modules/dist-*/.qa-dist/.vite/.git/…`，**不笼统跳点目录** |
| 4 | 弹窗区域永远超时 | 弹窗区域的 `ready` 选择器写成了弹窗自身 —— 而它只在点击后才出现（循环等待） | `ready` 必须是**弹窗打开前**就存在的标记；弹窗就绪交给 `open.waitFor` |
| 5 | 截不到图被判成 **FAIL(exit 1)** | 两侧 sha1 均为 null → `pixelEqual=false` → 计成差异 | 区分：**未能截图 = 无法判定（exit 2）**；只有两侧都取到图且不等才算 FAIL |

另修：软链的 `node_modules` 目录在遍历时被当成文件计入指纹（改为按目录处理再判是否跳过）。

---

## 7 每个拆分步怎么用（含 `--regions` 扩展示例）

**默认用法（布局骨架零回归）**：

```bash
# 未提交时：改前 = HEAD，改后 = 活树
node scripts/gates/pixel-diff.mjs --before HEAD --after worktree

# 已提交时：改前 = 上一提交，改后 = 本步提交
node scripts/gates/pixel-diff.mjs --before <prev-commit> --after <step-commit> --json
```

**拆具体 .vue 时（必做）** —— 用 `--regions` 传入 JSON 数组，字段与
`DEFAULT_REGION_AREAS` 一致（`id/theme/area/url/ready/selector/open/witness`）。
以 C1 `Submit.vue`（学生答题页）为例：

```json
[
  { "id": "light.submit", "theme": "light", "area": "submit",
    "url": "/exam/student/assignments/1",
    "ready": ".ant-layout-sider", "selector": ".ant-layout-content",
    "witness": { "selector": ".ant-layout-sider .ant-menu-item", "min": 3, "label": "侧栏菜单项" } },
  { "id": "dark.submit", "theme": "dark", "area": "submit",
    "url": "/exam/student/assignments/1",
    "ready": ".ant-layout-sider", "selector": ".ant-layout-content",
    "witness": { "selector": ".ant-layout-sider .ant-menu-item", "min": 3, "label": "侧栏菜单项" } }
]
```

配套需要在 `FIXTURES` 里补该路由要打的接口（学生用户还需把 `FIXTURE_USER` 的 role 改 `student`
并补 `/api/student/**` 夹具）。**夹具没补全门禁会 exit 2 并点名漏网路径** —— 不会假绿。

---

## 8 复现本次自测的最短路径

```bash
cd "<repo>"

# 正向（应 exit 0）
node scripts/gates/pixel-diff.mjs --before HEAD --after worktree --keep

# 边界（应 exit 0）
node scripts/gates/pixel-diff.mjs --before HEAD --after HEAD

# 负向（应 exit 1）—— 造一棵改了一个色阶的副本
rm -rf /tmp/pg-neg && mkdir -p /tmp/pg-neg/tree
git archive HEAD | tar -x -C /tmp/pg-neg/tree
node -e "const fs=require('fs');const f='/tmp/pg-neg/tree/client/src/styles/tokens.css';
let s=fs.readFileSync(f,'utf8');const a='--bg-canvas: var(--gray-50);',b='--bg-canvas: var(--gray-100);';
if(s.split(a).length-1!==1) throw new Error('锚点不唯一');fs.writeFileSync(f,s.replace(a,b));"
node scripts/gates/pixel-diff.mjs --before HEAD --after /tmp/pg-neg/tree
```

单次整跑约 **100 s**（2-3 次 vite build 各约 22 s + 浏览器 6 区域）。
