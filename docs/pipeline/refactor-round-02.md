# refactor-round-02 —— 定点修复报告（流水线第 2 轮）

> 轮次：**02（定点修复）** ｜ 日期：2026-10-11（凌晨）｜ 基线 commit：`8fb2c1d4ad775a02a4ec3b3f9e8a89772efd46aa`（round 1 已提交，与 `pipeline-status.md` 的 `anchor_commit: 8fb2c1d` 一致）
> Agent B 技能：`tech-code-refactoring` ｜ 上游输入：`docs/pipeline/audit-round-02.md`（§5 逐项评估 + §6 执行集 + §6.6 硬边界）、`docs/pipeline/project-constraints.md`、`pipeline-status.md`、`docs/pipeline/refactor-round-01.md`
> 执行集：**恰好 6 个文件 / 预算 8，余 2** —— 全部照 A §6.5 清单执行，**未新增文件、未改任何 `.md`**
> 方法：**冻结副本测基线**（`git archive 8fb2c1d` → `/tmp/b2-before`，1010 文件）→ 定点改 → **活树复算全部硬指标** + **改前/改后同源夹具行为对拍**；临时脚本全部落 `/tmp`，未入仓

---

## 0 约束遵守声明

| 约束（constraints §1/§2 + A §6.6） | 执行情况 |
|---|---|
| 只改 A §6.5 的 6 个文件 | ✅ `git status --porcelain -uno` 仅这 6 个（+ Captain 的 `pipeline-status.md`，见 §5.3） |
| **不新增任何文件**（`unmigrated 47` 是硬上限） | ✅ `find server/src client/src -type f` = **146 → 146**（改前/改后同值） |
| 不改任何 `.md`（尤其 `docs/ui-redesign/03-components.md`） | ✅ 全轮唯一写入的 `.md` 是**本报告**（新建，非修改） |
| 禁止 `git clean`/`stash`/`checkout -- .`/`reset --hard`/`restore .`；零 git 写操作 | ✅ 只读 `rev-parse`/`status`/`diff`/`show`/`archive` |
| 不碰 `:5173`/`:3000`、`client/dist`、`tests/` | ✅ 未启动/重启/kill 任何进程；未读写 `client/dist`；`tests/` 零读写 |
| 不跑 jest / 不跑 build / 不启动服务 | ✅ 未执行任何 jest、vite、服务命令（仅 `node --check` 与门禁脚本） |
| 不改字号/hex/`!important`/令牌顺序；不引入新令牌 | ✅ 恢复项是**回填原值** `var(--bg-surface)`；hex 有减无增（`hard-metrics` 仍 0） |
| 不得用 `aria-label` 修 `a-select` | ✅ `grep -c aria-label CheckerWizard.vue` = **0** |
| F-1「逐字搬移」，禁止顺手优化 | ✅ 归一化等价断言 + 19 夹具对拍全等（§3） |
| 唯一写者 | ✅ 本轮仅写 6 个执行目标 + 本报告 |

---

## 1 改动文件清单（6 个）

### 1.1 `client/src/views/teacher/Layout.vue` —— 执行项 1（M-1a），**+1 行**

**改了什么**：`MENU_TITLES` 字典**新增 1 项** `'/teacher/rule-quality': '规则质量',`（新第 **162** 行，插在 161 与 163 `};` 之间）。文件 490 → **491** 行。

```diff
@@ -160,4 +160,5 @@ const MENU_TITLES = {
   '/teacher/assignments': '作业管理', '/teacher/review': '评分审核', '/teacher/questions': '题库管理',
   '/teacher/classes': '班级管理', '/teacher/students': '学生管理', '/teacher/teams': '教学团队',
+  '/teacher/rule-quality': '规则质量',
 };
```

**为什么**：该路由无映射 → `syncPageTitle()`（`:164-175`）取不到页内标题、退化到字典也取不到 → `pageTitle = ''` → `:87` 的 `<h1 v-if="pageTitle" class="visually-hidden">` **根本不渲染** → axe `page-has-heading-one` 命中（A §5.2 / §6.1）。

**逐字一致性核对**：取值 `规则质量` 与 `:30`（`<a-menu-item key="/teacher/rule-quality">` … `<span>规则质量</span>`）的侧栏菜单名**逐字一致** ✅（`grep` 实测两侧同为 4 字，无空格/标点差异）。

**零视觉变化（由构造可证）**：该 h1 带 `class="visually-hidden"`，`client/src/style.css:211-221` 定义为 `position:absolute; width:1px; height:1px; margin:-1px; clip:rect(0 0 0 0); overflow:hidden` → **脱离文档流、不参与布局、不可见**；同一构造已在 `student/Layout.vue:45`、`admin/Layout.vue:53` 生产运行。**未改模板结构、未改 CSS、未改其它 6 个键。**

---

### 1.2 `client/src/components/checker/CheckerWizard.vue` —— 执行项 2（M-2），**+2 行**

**改了什么**：`:82` 前插 1 行隐藏 `<label for>`；`:83` 的 `<a-select>` 加**稳定 `id`**。文件 512 → **514** 行。

```diff
         <div class="cw-version-row">
+          <label for="cw-rollback-version" class="visually-hidden">历史版本</label>
           <span class="cw-vlabel">历史版本：</span>
-          <a-select v-model:value="rollbackTarget" style="width: 420px" size="small" placeholder="选择要回滚的版本">
+          <a-select id="cw-rollback-version" v-model:value="rollbackTarget" style="width: 420px" size="small" placeholder="选择要回滚的版本">
```

**为什么**：`:82` 的 `<span class="cw-vlabel">` 只是**视觉**标签，与 `:83` 的 `a-select` 无程序化关联 → axe `label`/`select-name` **critical** 命中（A §5.2 / §6.2）。

**⚠️ 按 A §6.6-4 明令，未使用 `aria-label`**（`client/src/style.css:209-210` 有实测反例：antd 会把它渲染到外层 `.ant-select` div，落不到 `role=combobox` 的 input）。本改动是**本仓已出货的定型做法**，同形构造实测 ≥10 处（`Login.vue:19/45/58`、`Students.vue:29/30`、`Assignments.vue:56/66`、`Review.vue:24`、`Classes.vue:73/74`、`TeamEdit.vue:12` 等均为 `<label for=… class="visually-hidden">` + `<a-select id=…>` 配对）。

**零视觉变化**：`.visually-hidden` 为 `position:absolute` + 1×1 + clip → 脱流不可见；`.cw-version-row`（`CheckerWizard.vue:497`）虽是 `display:flex`，但**绝对定位子元素不参与 flex 布局** → 几何不变。
**id 唯一性**：`grep -rn 'cw-rollback-version' client/src` = 2 处（`for` 与 `id`），**无重复 id** ✅。未动 `:89` 的 `a-popconfirm :disabled="!rollbackTarget"` 与 `:90` 的回滚按钮 → 回滚门控行为不变。

---

### 1.3 `client/src/styles/tokens.css` —— 执行项 3，**−4 声明 +1 行**

**改了什么**（严格**按令牌名**定位；三个删除点均为**同行多声明**，只删目标声明）：

| 原行号（8fb2c1d） | 动作 | 删除的令牌 | **保留的同行者** | 新行号 |
|---|---|---|---|---|
| **61** | 改行 | `--green-500` | `--green-600` | 61 |
| **66** | 改行 | `--amber-500` | **`--amber-400`**、`--amber-600` | 66 |
| **75** | 改行 | `--violet-500` | `--violet-50`、`--violet-100` | 75 |
| **217** | 删整行 | `--border-inverse`（亮 `rgba(255,255,255,.10)`） | — | — |
| **264** | 删整行 | `--border-inverse`（暗 `rgba(0,0,0,.12)`） | — | — |
| 295/296 之间 | **插入 1 行** | **恢复** `--btn-default-bg` | — | **294** |

文件 431 → **430** 行（−2 删行 +1 插行）。

```diff
@@ -60,3 +60,3 @@
-  --green-500: #12b76a;  --green-600: #039855;
+  --green-600: #039855;
@@ -65,3 +65,3 @@
-  --amber-400: #fdb022;  --amber-500: #f79009;  --amber-600: #dc6803;
+  --amber-400: #fdb022;  --amber-600: #dc6803;
@@ -74,3 +74,3 @@
-  --violet-50: #f4f3ff;  --violet-100: #ebe9fe; --violet-500: #7a5af8;
+  --violet-50: #f4f3ff;  --violet-100: #ebe9fe;
@@ -216,3 +216,2 @@    -  --border-inverse: rgba(255, 255, 255, 0.10);
@@ -263,3 +262,2 @@    -  --border-inverse: rgba(0, 0, 0, 0.12);
@@ -295,2 +293,3 @@
   --btn-primary-fg: var(--text-on-brand);
+  --btn-default-bg: var(--bg-surface);
   --btn-default-bg-hover: var(--gray-50);
```

**为什么删 4 个**：A §2.3 裁定——4 个令牌在**核心规范 `.md` 0 命中**（唯一出现处 `preview/index.html` 只链设计侧镜像 `02-design-tokens.css` 且自称「不属于设计系统」）→ 无契约；且产品侧零消费 → 删除零影响面。
**为什么恢复 1 个**：A §3 裁定——`03-components.md:110` 的 `--btn-default-bg/-bd`（斜杠展开）构成有效契约，round 1 的扫描器引号正则在 `X/-suf` 形态上失配导致**误删**。

**逐字回填核对**（强证据）：
```bash
$ [ "$(git show ac60831:client/src/styles/tokens.css | sed -n '304p')" = "$(sed -n '294p' client/src/styles/tokens.css)" ] && echo YES
YES        # 与 ac60831（round 1 删除前）第 304 行逐字节相同：'  --btn-default-bg: var(--bg-surface);'
```

**未顺手误删的核对**：`--amber-400` 仍声明（`03-components.md:317` 有契约 ✅）、`--green-600`/`--amber-600`/`--violet-50`/`--violet-100` 全部保留 ✅；60 个「应保留」令牌**逐个仍在** ✅（§2.3 集合代数第 6 条）。
`--border-inverse` 亮/暗**两处同删**，明暗对称性保持 ✅（`grep -c` 残留 = 0）。

---

### 1.4~1.6 F-1 循环依赖拆解 —— 执行项 4（**3 个文件原子完成**）

**目标**：消除 `factExtractor.js:30 → ruleExecutor.js` 与 `ruleExecutor.js:21 → factExtractor.js` 构成的**全仓唯一 SCC**。

#### 1.4 `server/src/services/factExtractors/common.js`（**+100 行**，263 → 363；未改既有任何符号）

追加内容（`:265-362`）：

| 追加符号 | 来源 | 处理 |
|---|---|---|
| **`ROOT_PROBE_EXTS`**（`:277-284`，**37 项**） | `ruleExecutor.js:55-62` 的 `SOURCE_EXTS` | **逐字复刻**，仅**换名**（避免与 `common.js:32` 已有的 9 项 `SOURCE_EXTS` 冲突） |
| **`collectAllFiles(dir)`**（`:291-313`） | `ruleExecutor.js:171-198`（JSDoc+函数） | **逐字复刻**，仅函数名 `collectFiles` → `collectAllFiles` |
| **`resolveProjectRoot(rootDir)`**（`:315-362`） | `ruleExecutor.js:938-986`（JSDoc+函数） | **逐字复刻**，仅两处替换：`SOURCE_EXTS` → `ROOT_PROBE_EXTS`、`collectFiles(` → `collectAllFiles(`（**含注释内那一处**，避免悬空引用） |
| 溯源注释块（`:265-276`） | 新增 | 说明搬移原因与两处重命名的**理由**（防后人误合并） |

**未改既有符号**：`SKIP_DIRS`（`:21`，与 `ruleExecutor.js:65-67` **逐字相同**，直接复用）、`EXT_LANGUAGE`/`SOURCE_EXTS`(9 项)/`MANIFEST_LANGUAGE`/`extOf`/`collectSourceFiles`/`countSyntaxErrors`/… 一字未动 ✅。

#### 1.5 `server/src/services/ruleExecutor.js`（**−50 行 / +5 行**，1068 → 1023）

```diff
 import { extractFacts } from './factExtractor.js';
+import { resolveProjectRoot } from './factExtractors/common.js';
 import { getJavaParser } from './factExtractors/java.js';
 ...
 import logger from '../utils/logger.js';
 
+// F-1 循环依赖拆解（round 2）：resolveProjectRoot 的实现已下沉到 factExtractors/common.js，
+// 此处再导出以保持既有对外导出面逐字不变（checkerService.js / ruleMutator.js 从此处 import）。
+export { resolveProjectRoot };
+
@@ -935,56 +940,6 @@   （删除原 937 空行 + 938-986：JSDoc + 函数体，共 50 行）
```

- 删除区间取 **937（前置空行）～986**，使 `validateRules` 的 `}` 与 `runRules` 的 JSDoc 之间**恰好保留 1 个空行**（结构无变化，仅位置改变）。
- **未动** `SOURCE_EXTS`（`:55-62`，对外导出但全仓无 importer，按 A §5.1 最小 diff 原则保留）、`collectFiles`（`:176-198`，另有 4 处调用）、`SKIP_DIRS`、`extOf`（6 处调用）—— 它们仍在本文件，供本文件的 `extOf`/路径解析使用。
- 本文件内部原 `:983` 的调用点（现 `:970` `runRules` 内 `const projectRoot = resolveProjectRoot(rootDir)`）**逐字不变**，只是改由 import 提供。

#### 1.6 `server/src/services/factExtractor.js`（**−2 行 / +1 行**，166 → 165）

```diff
-import { resolveProjectRoot } from './ruleExecutor.js';          ← 环边在此消失
 import {
-  collectSourceFiles, detectLanguage, emptyFacts, extractManifestDeps, extOf,
+  collectSourceFiles, detectLanguage, emptyFacts, extractManifestDeps, extOf, resolveProjectRoot,
 } from './factExtractors/common.js';
```

**第 39 行 `export { resolveProjectRoot };` 及其上方注释逐字未动**（`test/unit/infrastructure/fact-extractor.test.js:10` 直接依赖该再导出面，删它 = 17 例在 import 阶段整体炸掉）。`git diff` 证明该行**不在 diff 中** ✅。

---

## 2 自证证据（命令 + 原始输出）

### 2.1 硬指标 —— 四项门禁**全部 PASS**

**改动前**（`/tmp/b2-before` = `git archive 8fb2c1d`，1010 文件，冻结副本）：

```
循环依赖门禁 · 根目录 server/src
  扫描 71 文件 / 163 条相对导入边
  强连通分量（|SCC|>1）: 1（基线 1）
  ↻ server/src/services/factExtractor.js  ↔  server/src/services/ruleExecutor.js
      server/src/services/factExtractor.js:30 → server/src/services/ruleExecutor.js
      server/src/services/ruleExecutor.js:21 → server/src/services/factExtractor.js
  自环（文件 import 自身）: 0        结论：PASS

文件 71 个，违规 0 条（0 类规则），未分层待迁移 47 个
  ✓ layerViolations 基线=0 实测=0   ✓ unmigrated 基线=47 实测=47
  ✓ godfileOver800  基线=10 实测=10 · >500 行（观察带）基线=19 实测=19     结论：PASS
硬指标门禁（去注释口径） ✓ hex6=0 ✓ important=0 ✓ modalConfirm=0        结论：PASS
```

**改动后**（活工作树）：

```bash
$ node scripts/gates/cycle-check.mjs
循环依赖门禁 · 根目录 server/src
  扫描 71 文件 / 163 条相对导入边
  强连通分量（|SCC|>1）: 0（基线 1）          ← ★ 1 → 0：全仓最后一个 SCC 消失
  自环（文件 import 自身）: 0
结论：PASS                                    # exit=0

$ node server/scripts/check-layers.mjs
文件 71 个，违规 0 条（0 类规则），未分层待迁移 47 个      # exit=0  ← 三个数字与基线完全一致

$ node scripts/gates/arch-metrics.mjs
架构门禁
  ✓ layerViolations    基线=0  实测=0
  ✓ unmigrated         基线=47  实测=47
  ✓ godfileOver800     基线=10  实测=10
  · >500 行（观察带，不计判据） 基线=19 实测=19
  GodFile >800 行：… server/src/services/ruleExecutor.js (1023) …   ← 1068 → 1023，仍 >800，计数 10 不变
结论：PASS                                    # exit=0

$ node scripts/gates/hard-metrics.mjs
  ✓ hex6          基线=0  实测=0
  ✓ important     基线=0  实测=0
  ✓ modalConfirm  基线=0  实测=0
结论：PASS                                    # exit=0
```

| 判据 | 基线（8fb2c1d） | round 2 后 | 达标 |
|---|---|---|---|
| cycle-check：文件 / 边 / **SCC** | 71 / 163 / **1** | 71 / 163 / **0** ✅ | ✔ 边数净变化 **0**（−1 环边 +1 新边），与 A §6.4 预测一致 |
| check-layers：文件 / 违规 / 未分层 | 71 / 0 / 47 | 71 / 0 / **47** | ✔ 未分层**不增**（零新文件） |
| arch-metrics | 0 / 47 / 10（+19 观察带） | 0 / 47 / 10（+19） | ✔ |
| hard-metrics | 0 / 0 / 0 | 0 / 0 / 0 | ✔ |

### 2.2 零引用令牌：**64 → 61**（自研独立扫描器，`/tmp/b2-final.mjs`）

**扫描器口径**（**未复用** `/tmp/a1*`、`/tmp/a2*`、`/tmp/b1*`，为独立实现）：
- **声明侧**：`tokens.css` 中「`--name` + 可选空格 + `:`」形态的声明键（**支持同一行多条**，手工扫描不依赖行锚定）；
- **引用侧**：产品语料 = `client/src` + `server/src` + `trustjudge-server`（**排除** `docs/`、`tests/`、`node_modules`、`dist`）；词边界判定 `[^\w$-]`（防 `--space-1` 误配 `--space-10`）；在 `tokens.css` 内部**先屏蔽声明键**，故值里的 `var(--x)` 仍计为真实引用；
- **双口径**：A = 含注释；B = **去注释**（= A §2.1 口径）。

```
改动前（/tmp/b2-before）
corpus files scanned = 148
tokens.css decl sites = 335 | distinct declared = 252        ← 与 A §2.1 的 335/252 精确一致
caliber A (with comments)     ZERO-REF = 62
caliber B (comment-stripped)  ZERO-REF = 64                  ← ★ 与 A §2.1/§3.4 的 64 精确一致

改动后（活树）
corpus files scanned = 148                                   ← 语料不变（无新文件）
tokens.css decl sites = 331 | distinct declared = 249        ← −4 声明点 / −3 去重令牌
caliber A (with comments)     ZERO-REF = 59
caliber B (comment-stripped)  ZERO-REF = 61                  ← ★ 64 → 61
```

**集合代数（比计数更强的证据，`/tmp/b2-setcheck.mjs`）**：

```
1) the 4 deleted tokens were in BEFORE : true
2) the 4 deleted tokens are gone AFTER : true
3) --btn-default-bg NOT in BEFORE      : true
4) --btn-default-bg IS in AFTER        : true
5) AFTER == (BEFORE minus 4) plus 1    : true          ← 集合级恒等，非仅计数相等
6) all other 60 tokens still present   : true          ← 60 个「应保留」令牌逐个仍在
7) no unexpected newcomer in AFTER     : --btn-default-bg（唯一新增，符合预期）
decl sites  335 -> 331  (delta -4, expect -4)
distinct    252 -> 249  (delta -3, expect -3)
corpus      148 -> 148  (must be equal)
```

**★ 62/64 口径差已定位并复现**（A §2.1 未展开，本轮补齐）：差额恰为 **2 个只在 CSS 注释里被提及**的令牌 —— `--input-h`（`tokens.css:172` 注释）与 `--table-row-h`（`tokens.css:320` 注释）。A 的扫描器剥离注释故计为 64；含注释口径则为 62。**两种口径下「64→61」与「62→59」的增量恒为 −3**，结论不受影响。后续轮次用哪一套都行，但**必须固定一套并声明**。

### 2.3 文件数不变 + 配置未动

```bash
$ find server/src client/src -type f | wc -l
146                     # 改动前 146，改动后 146 —— 零新增文件（unmigrated 47 的硬前提）
$ node -e "JSON.parse(require('fs').readFileSync('server/package.json','utf8'))"
package.json JSON OK    # 本轮未动 server/package.json（round 1 的 4 段式 test 脚本原样）
$ node --check server/src/services/ruleExecutor.js      # OK（server/package.json 为 "type":"module"）
$ node --check server/src/services/factExtractor.js     # OK
$ node --check server/src/services/factExtractors/common.js  # OK
```

### 2.4 改动面：恰好 6 个文件

```bash
$ git status --porcelain --untracked-files=no
 M client/src/components/checker/CheckerWizard.vue
 M client/src/styles/tokens.css
 M client/src/views/teacher/Layout.vue
 M pipeline-status.md                    ← 见 §5.3：会话开始前即为 M（Captain 的状态文件），B 未触碰
 M server/src/services/factExtractor.js
 M server/src/services/factExtractors/common.js
 M server/src/services/ruleExecutor.js

$ git diff --numstat -- client/src server/src
2       1       client/src/components/checker/CheckerWizard.vue
4       5       client/src/styles/tokens.css
1       0       client/src/views/teacher/Layout.vue
1       2       server/src/services/factExtractor.js
100     0       server/src/services/factExtractors/common.js
5       50      server/src/services/ruleExecutor.js
        → 6 files changed, 113 insertions(+), 58 deletions(-)
```

**无任何 `.md` 被修改**（`git status -uno | grep '\.md'` 仅 `pipeline-status.md`，且非本轮所改）。

---

## 3 「逐字搬移」等价性说明

### 3.1 搬了哪些行、怎么保证逐字

搬移**不是手工重打**，而是由脚本 `/tmp/b2-move.mjs` 从 `ruleExecutor.js` **按行切片**后拼接（3 段）：

| 段 | 源区间（1-based） | 行数 | 目标位置 | 变换 |
|---|---|---|---|---|
| 扩展名白名单内层 | `ruleExecutor.js:56-61` | 6 | `common.js:278-283` | **零变换**（含 `// 前端`/`// 后端`/`// 脚本/数据/配置` 三行注释） |
| `collectFiles`（JSDoc+函数） | `ruleExecutor.js:171-198` | 28 | `common.js:286-313` | 仅签名行 `function collectFiles(dir) {` → `export function collectAllFiles(dir) {` |
| `resolveProjectRoot`（JSDoc+函数） | `ruleExecutor.js:938-986` | 49 | `common.js:315-362` | 仅 2 处标识符替换：`SOURCE_EXTS`→`ROOT_PROBE_EXTS`（含 JSDoc 内 1 处）、`collectFiles(`→`collectAllFiles(` |

**脚本内建断言**（任一不成立即 `exit 1`、不写任何文件）：行内容锚定（`:55`/`:62`/`:176`/`:198`/`:948`/`:986`/`:21`/`:24` 逐字比对）、扩展名条目引号数 = 74（37 项）、重命名命中数、`SOURCE_EXTS` 零残留、以及**归一化等价断言**：

```
equivalence: resolve block normalized-equal modulo renames = true
MOVE OK  ruleExecutor lines 1069 -> 1024
```

### 3.2 两个再导出面**逐字保留**（运行时可证）

```bash
$ node /tmp/b2-equiv.mjs "<repo>"     # 同时 import 冻结前(8fb2c1d)与改后
export-surface identity:
  factExtractor.resolveProjectRoot === common.resolveProjectRoot : true    ← fact-extractor.test.js:10 依赖面完好
  ruleExecutor.resolveProjectRoot  === common.resolveProjectRoot : true    ← checkerService.js:35 / ruleMutator.js:39 依赖面完好
  typeof before=function after=function
  ruleExecutor.SOURCE_EXTS still exported: true size=37 (unchanged)        ← 未顺手删
  common.ROOT_PROBE_EXTS size=37
  probe sets equal (37-item rule preserved): true                          ← 宽探测白名单未被 9 项版取代
  common.SOURCE_EXTS (9-item) untouched: size=9
  common.collectSourceFiles untouched (relative, source-only): true
  common.collectAllFiles new (absolute, all files): true
```

### 3.3 两个陷阱的**行为级**反证（19 夹具对拍，改前 8fb2c1d vs 改后）

在 `/tmp` 造 15 组真实目录夹具（含空目录、多子目录、隐藏目录、`node_modules`、清单在根/清单在内层、非目录路径、不存在路径、`null`/`42`/`''` 非法入参），并直接 `import` 冻结前的 `ruleExecutor.js` 与改后的 `ruleExecutor.js` **对拍返回值**：

```
ok  <FIX>/go-only/outer       -> <FIX>/go-only/outer/inner      ← ★ 陷阱 1：只含 main.go 仍下钻（9 项版会失败）
ok  <FIX>/html-only/outer     -> <FIX>/html-only/outer/inner     ← ★ 陷阱 1：只含 index.html 仍下钻
ok  <FIX>/sql-only/outer      -> <FIX>/sql-only/outer/inner      ← ★ 陷阱 1：只含 .sql 仍下钻
ok  <FIX>/css-only/outer      -> <FIX>/css-only/outer/inner      ← ★ 陷阱 1：只含 .css 仍下钻
ok  <FIX>/vue-only/outer      -> <FIX>/vue-only/outer/inner
ok  <FIX>/js-only/outer       -> <FIX>/js-only/outer/inner
ok  <FIX>/txt-only/outer      -> <FIX>/txt-only/outer            ← 无源码 → 不下钻
ok  <FIX>/manifest-root/outer -> <FIX>/manifest-root/outer       ← ★ 陷阱 2：根含 package.json → 不下钻（清单信号保留）
ok  <FIX>/deep-manifest/outer -> <FIX>/deep-manifest/outer/inner ← ★ 陷阱 2：内层 package.json 被 collectAllFiles 命中
ok  <FIX>/two-subdirs/outer   -> <FIX>/two-subdirs/outer
ok  <FIX>/hidden-sub/outer    -> <FIX>/hidden-sub/outer/src
ok  <FIX>/skip-sub/outer      -> <FIX>/skip-sub/outer/src        ← node_modules 被跳过
ok  <FIX>/nested1/outer       -> <FIX>/nested1/outer/mid         ← 只下钻一层（既有语义，未变）
ok  <FIX>/not-a-dir.txt       -> <FIX>/not-a-dir.txt
ok  <FIX>/empty               -> <FIX>/empty
ok  <FIX>/does-not-exist      -> <FIX>/does-not-exist
ok  (null) -> null   ok  (42) -> 42   ok  ('') -> ''
cases=19 pass=19 fail=0
```

> 这是**行为等价**证据（而非仅静态比对）：陷阱 1（.go/.html/.sql/.css 下钻）与陷阱 2（`package.json` 清单信号）在改前后**同值**。

### 3.4 ★ 与 A 报告的一处数字出入（**须写进后续上下文**）

A §5.1/§6.6 反复称 `ruleExecutor.js:55-62` 的 `SOURCE_EXTS` 有 **43 项**。**实测为 37 项**：

```bash
$ node -e "…ruleExecutor.js:55-62 内引号项计数…"
COUNT= 37 ["js","mjs","cjs","jsx","ts","tsx","vue","svelte","html","css","scss","sass","less",
           "java","py","go","c","cpp","h","hpp","cc","cxx","cs","rb","php","rs","kt","swift",
           "sh","bash","sql","json","yml","yaml","xml","toml","ini"]
```

**对本轮结论无影响**（本轮以「**逐字复刻**」为准，不是按计数复制），但 **C 若照 A 文案断言「43 项」会误判**。请以 **37 项** 为准。另：A 记 `collectFiles` 为 `176-197`，实测函数体为 **171-198**（含 JSDoc），本轮按实测区间搬移。

---

## 4 未做项与原因

| # | 项 | 目标文件 | 为何不做 |
|---|---|---|---|
| 1 | **M-1b** `.ant-statistic-title` 对比度 | `RuleQuality.vue` | 改**渲染颜色 = 视觉变更**，不在 constraints §2 的 a11y 豁免枚举（aria/label/heading）内；本项目无 ui-guard。且属**既有、超出 QA 12 页基线**的违规，不阻断 §5 判据（A §5.2 裁定） |
| 2 | **N-1** `--duration-page` 契约悬空 | `tokens.css` / `04-interaction-a11y.md` | 补声明 = 新增**零消费**令牌，与 round 1 清理方向相反；正解属**设计决策**（A §2.4） |
| 3 | **N-2** 12 个 `--tag-*-{fg,bg}` | `docs/ui-redesign/03-components.md:276,279` | 契约**已被同文档 §⑥/§⑦ 取代**（实现走 `--status-*` 且与文档一致）→ 正解是**改文档**，而设计文档不在本流水线授权范围（A §2.5） |
| 4 | 空 `catch {}` 7 处（5 文件） | — | 吃掉 5/8 预算；`Submit.vue:705` 属**有意降级**（改它=改语义）；不影响任何门禁（A §5.3） |
| 5 | `console.log` 19 处（3 文件） | — | server 12 处是**生产排障线索**，正解是 pino 分级（**行为变更**）；client 7 处收益极小（A §5.3） |
| 6 | GodFile 拆分（10 个） | 10 文件 | server 侧撞 `unmigrated ≤ 47` 门禁；client 侧撞 constraints §2 视觉铁律。**预算不是瓶颈**（A §5.4） |
| 7 | 未把临时扫描器晋升为门禁脚本（G-4） | — | 本轮脚本仅用于自证；A §8-10 要求先加固自测 |
| 8 | 未跑 jest / axe / 像素 sha1 / build / 服务 | — | 明令属 C 职责；本轮「零视觉变化」是**基于 CSS 自定义属性语义与 `visually-hidden` 定义的静态推断 + 构造证明**，不是像素证据 |

---

## 5 遗留风险

| # | 风险 | 等级 | 处置建议 |
|---|---|---|---|
| **R1** | **本轮 3 个前端改动全部产生「新渲染的 DOM 节点」**（1 个 `<h1>` + 1 个 `<label>`），虽均为 `.visually-hidden` 脱流元素，但**像素 sha1 是唯一主判据**（constraints §3-4）——静态推断不能替代 | 中 | **C 必须跑 4 组像素 sha1**（亮/暗 × 舒适/紧凑）；`/teacher/rule-quality` 路由需在页集内 |
| **R2** | `a-select` 的 `id` 落点**未经浏览器验证**：A 断言 antd 会把 `aria-label` 渲染到外层 `.ant-select` div；`id` 是否落到 `role=combobox` 的 `input` 上，须由 C 用 CDP 断言（本仓同类做法 ≥10 处已出货，风险低但**未在本组件验证过**） | 中 | C 在自动评分器向导第 4 步断言 `label[for]` 解析到 combobox 的 `input`（**不是**外层 div），并确认 `label`/`select-name` 归零 |
| **R3** | **评分热路径行为变更**：`checkerService → ruleExecutor → factExtractor` 是评分主链路；本轮 99 例（fact-extractor 17 / rule-executor 61 / rule-mutator 21）覆盖它，但**未跑** | 中 | C 按 §6 四段式跑全量；`fact-extractor` 必须能 import 到 `resolveProjectRoot`（`:444` 的 describe 需真的在跑） |
| **R4** | `defectPrecheck.js` 有**第三份独立** `resolveProjectRoot`（`:100/134` 调用、自带实现并导出） | 低 | 本轮**未动**（不在 6 文件执行集内）。登记为 round 3+ 候选：若将来统一，须同样做行为对拍——三份实现的清单/宽探测语义可能已漂移 |
| **R5** | A 报告 `SOURCE_EXTS` = **43 项** 为误计，实测 **37 项**（§3.4） | 低 | 后续轮次以 37 为准；本轮已按逐字复刻，行为已对拍证明不变 |
| **R6** | 4 个被删令牌仍存在于**设计侧镜像** `docs/ui-redesign/02-design-tokens.css` 与 `preview/index.html` | 低 | **按设计不动**（A §2.3：镜像与实现非 1:1，round 1 已删的 44 个同样仍在镜像里且 C 判 PASS）。若将来 preview 需与实现对齐，属**设计侧**动作 |
| **R7** | `common.js` 现为 363 行（`ROOT_PROBE_EXTS` + 两个函数 + 溯源注释），较 A 预估的 ≈344 多 19 行 | 低 | 仍 **<500**，GodFile 观察带 19 **不变**（`arch-metrics` 实测）。多出的是**溯源注释块**，属刻意留痕 |
| **R8** | `--input-h` / `--table-row-h` 的「零引用」判定**依赖是否剥离注释**（§2.2），口径漂移会造成 ±2 的假结论 | 低 | 后续轮次固定一套口径并在报告显式声明；两者均有核心规范契约，**不属可删集合** |

---

## 6 给 Agent C 的验证指引

### 6.1 后端全量回归（本轮**主判据**）

```bash
bash docs/pipeline/scripts/unblock-g2.sh      # 或：cd server && DATABASE_URL="…exam_system_test" npm test
```

| 项 | 期望 | 说明 |
|---|---|---|
| 日志中 `Test Suites:` 摘要出现次数 | **4 处** | 少于 4 处 = 仍有短路 |
| 段 1 / 段 2 / 段 3 / 段 4 | 912 / **17** / **61** / **21** | 段 2/3/4 = 本轮改动链路 |
| 合计 | **1011 passed / 0 failed** | failed > 0 即回流 B |
| 定向反证 | `fact-extractor` 17 例中 **`:444` 的 `describe('resolveProjectRoot — 与 ruleExecutor 同语义')` 必须在跑** | 若 17 例在 **import 阶段**整体报 `SyntaxError`/`does not provide an export named` → 再导出面被破坏，立即回流 B |

⚠️ 未指向 `exam_system_test` 时 `test/setup.js:35,52` 护栏会**立即 exit 1 且不打印任何 jest 摘要** —— 那不是崩溃。

### 6.2 静态门禁（可立即复跑，本轮已自证）

```bash
node scripts/gates/cycle-check.mjs        # 71 / 163 / SCC 0   ← 三个数字都要对上
node server/scripts/check-layers.mjs      # 71 / 违规 0 / 未分层 47（不得变）
node scripts/gates/arch-metrics.mjs       # 0 / 47 / 10（+19 观察带）PASS
node scripts/gates/hard-metrics.mjs       # 0 / 0 / 0 PASS
node /tmp/b2-final.mjs "<repo>"           # caliber B: ZERO-REF 61（caliber A: 59）
node /tmp/b2-setcheck.mjs                 # 需先有 /tmp/b2-zero-{b2-before,after}.json；7 条断言全 true
find server/src client/src -type f | wc -l   # 146（不得变）
```

**反证清单（改了就该变 / 不该变的就别变）**：

```bash
grep -c -- '--green-500:\|--amber-500:\|--violet-500:\|--border-inverse' client/src/styles/tokens.css   # → 0
grep -c -- '--amber-400' client/src/styles/tokens.css                                                     # → 1（有契约，保留）
grep -c -- '--btn-default-bg:' client/src/styles/tokens.css                                               # → 1（已恢复）
grep -c 'aria-label' client/src/components/checker/CheckerWizard.vue                                      # → 0（明令禁止）
grep -n 'cw-rollback-version' client/src/components/checker/CheckerWizard.vue                             # → 恰好 2 处（for + id）
grep -n "MENU_TITLES" -A4 client/src/views/teacher/Layout.vue                                             # → 7 个键，含 rule-quality
```

### 6.3 无障碍（axe，亮/暗各一遍）

| 页面 / 组件 | 断言 |
|---|---|
| `/teacher/rule-quality` | `page-has-heading-one` **归零**；`h1` 文本 = `规则质量`；元素带 `visually-hidden` |
| 自动评分器向导第 4 步 | `label`/`select-name` **归零**；`label[for=cw-rollback-version]` 解析到 **`role=combobox` 的 `input`**（不是外层 `.ant-select` div） |
| 回归（不得变化） | 其余 6 个 `MENU_TITLES` 路由的 h1 文本**逐键不变**；`a-popconfirm`/`a-button` 的 `:disabled="!rollbackTarget"` 行为不变 |

### 6.4 像素回归（**零视觉变化**主判据）

4 组（**亮/暗 × 舒适/紧凑**）**像素 sha1 全部相等**。**不要**用 asset 文件名哈希或 CSS 字节数（A §4.1：源码一字节变化 → `index-*.css` 必换名 = 100% 假阳性）；**不得**重建 `client/dist`，用 rig 私有 dist 副本（`:3100`，非 5173/3000）。

### 6.5 不得触碰（复述 A §4.3）

禁止重建/覆盖 `client/dist`；禁止重跑 `ledger-check.mjs --out=raw/ledger.json`；禁止回写引用 `index-CHwIlsxa` 的运行时快照（`tests/ui-redesign-verify/**`）。

---

## 7 唯一写入声明

本轮 Agent B 在仓库内**只写 7 个路径**：6 个执行目标（`Layout.vue` / `CheckerWizard.vue` / `tokens.css` / `factExtractors/common.js` / `ruleExecutor.js` / `factExtractor.js`）+ 本报告 `docs/pipeline/refactor-round-02.md`（新建）。

临时脚本与数据全部落 `/tmp`，**未入仓**：`/tmp/b2-scan.mjs`、`/tmp/b2-variant.mjs`、`/tmp/b2-weak.mjs`、`/tmp/b2-final.mjs`（双口径零引用扫描器）、`/tmp/b2-move.mjs`（逐字搬移器，内建断言）、`/tmp/b2-equiv.mjs`（行为对拍）、`/tmp/b2-setcheck.mjs`（集合代数）；数据 `/tmp/b2-zero-b2-before.json`、`/tmp/b2-zero-after.json`；冻结副本 `/tmp/b2-before`（+ 两个指向仓库 `node_modules` 的**只读符号链接**，仅为让冻结副本可 `import`，未写仓库）。

**未执行任何 git 写操作**（无 add/commit/checkout/restore/stash/clean）；未跑 jest；未构建；未启动任何服务；未触碰 `:5173`/`:3000`、`client/dist`、`tests/`。

---

*本报告由 Agent B（`tech-code-refactoring`）于 round 2 产出。*
