# G1 · 平台检查器【生成侧】根因分析与改造方案

> 角色：Agent G1（只读分析 + 方案设计）。本轮 = **设计**，实施由 B 承担。
> 输入：`docs/pipeline/P5-平台复算.md`（319 行，检出率 42.62%/20.00%、致命 26.53%）、本仓生成侧与执行器源码、`实验/注入测试集`（62 份 + `错误清单.json` 18 类错误 ground truth）。
> 约束遵守：只读代码、只读 DB（含测试库，全部 SELECT）、未跑 generator、未写任何库、未 npm install、未构建、未执行学生代码、临时脚本全部在 `/tmp/g1` 并已清理、未联网、未打印任何 key。

---

## 0. 一句话结论与实测投影

**为什么只生成 `contains_text`（根因一句话）**：给模型的规则类型白名单是 `parsers.js:7-16` 里**另立的一份 8 类旧清单**（不含 `ast_pattern/count_imports/normalized_text`），而模型若真写出这三类，`parsers.js:147` 会**静默丢弃**并把分转嫁给别的项——**提示词在 `prompts.js:129` 让模型"语义级规则优先"，却在 `prompts.js:128` 的白名单里把这三类删掉了，生成侧自己把表达力锁死在文本存在性**；同时就绪判定只看"标准包不失分"（`generator.js:309`）+ 自证式负例验证（`ruleMutator.js:202-218`），从不惩罚漏检。

| 指标 | P5 既有链路实测 | 本方案投影（原型实测，见 §5） | 依据 |
|---|---|---|---|
| 实例级检出（122 项） | 52/122 = **42.62%** | **112/122 = 91.80%**（观测内 112/118 = 94.92%） | §5 探针表逐项实测 |
| 样本级（50 份全中） | 10/50 = **20.00%** | **40/50 = 80.00%** | 同上 |
| 致命级 | 13/49 = **26.53%** | **47/49 = 95.92%** | 同上 |
| 误扣率（12 份应满分） | 0/12 | **0/12**（新规则全过标准包 + 全过 6 份无害变体） | §5.3 假阳性复核 |
| 余漏 10 项 | — | F1×7（规范层，建议转主观）+ 3 项清单伪影 | §5.4 |

---

## 1. 根因分析（含代码证据）

### 1.1 ★主根因：白名单双份定义 + 解析器静默丢弃（生成侧自己锁死表达力）

| 证据 | 位置 | 事实 |
|---|---|---|
| ① 两份白名单 | `server/src/domain/services/checker/parsers.js:7-16` vs `server/src/domain/services/rule/constants.js:10-23` | 前者 8 类、后者 11 类；**前者缺 `ast_pattern / count_imports / normalized_text`** |
| ② 白名单来源 | `prompts.js:6` `import { RULE_TYPES } from '../../../domain/services/checker/parsers.js'` → `prompts.js:128` 注入模型 | **模型看到的合法类型只有 8 类**，执行器支持的 3 类语义规则从未出现在提示词白名单里 |
| ③ 提示词自相矛盾 | `prompts.js:128`（白名单 8 类）与 `prompts.js:129`（"P0-2 语义级规则优先……ast_pattern{path,pattern}……count_imports{path,module,min}……normalized_text{path,text}"） | 同一段提示词里，**鼓励使用的类型不在上一条"只能使用白名单"的清单中**——遵循铁律的模型必然只输出旧 8 类 |
| ④ 静默丢弃 | `parsers.js:147` `if (!RULE_TYPES.includes(it.rule_type)) continue;` | 即使模型违反白名单写出语义规则，也会被**当垃圾项丢掉**，其分值由 `parsers.js:186-222` 的"总和归一化"转嫁给别的项 |

**④ 可复现实测（本机只读执行，5 项输入 → 2 项输出）**：

```js
// 在 server/ 下：node --input-type=module -e '...'（import parseCheckerRules）
// 输入 5 项各 2 分：ast_pattern / count_imports / normalized_text / contains_text / syntax_check
checker RULE_TYPES: file_exists,dir_contains_file,contains_text,count_regex,contains_regex,file_count_in_dir,syntax_check,fact
executor RULE_TYPES: file_exists,...,fact,ast_pattern,count_imports,normalized_text
解析后 objective 项数: 2
a4:contains_text=2 | a5:syntax_check=8      ← 3 条语义规则消失，6 分被加到无关的 syntax_check 上
```

> **这条比"提示词没写"更严重**：写不写是概率问题，**丢不丢是确定性问题**。即使把提示词改好，只要 `parsers.js:7-16` 不同步，语义规则仍然 100% 进不了 `checker_script`。

### 1.2 次根因：few-shot 与格式锚点单一（偏向 `contains_text`/`file_exists`）

| 证据 | 位置 | 事实 |
|---|---|---|
| 格式锚点 | `prompts.js:9-19` `RULES_FORMAT` | 模板里唯一出现的 `rule_type` 是 **`file_exists`** |
| few-shot | `prompts.js:85-93` `RULES_EXAMPLE` | 唯一示例也是 **`file_exists`**；没有一条正则/结构/fact 示例 |
| fact 只有字段没有例子 | `prompts.js:123` + `35-72` | 只给出 `{fact, op, value}` 与字段名清单，**没有一条可照抄的 fact 规则**；模型无法推断 `op` 与字段类型的组合 |
| 无配额约束 | `prompts.js:124-135` | 只要求"覆盖所有可确定性检查的评分点"，**没有"不得只用 contains_text""至少 N 条结构规则"的约束** |

### 1.3 校准反馈回路只反馈"失分项"，从不反馈"漏项"

- `generator.js:344-356`：未达标时 `lastFeedback = attachNegativeFeedback({ result, defectItems, deductions }, neg.weakRules)`——`deductions` 只包含**标准包上失分的规则**（`generator.js:350-355` 过滤 `it.score < it.max_score`）。
- `prompts.js:167-189`：校准提示词只渲染【扣分项】【标准包缺陷候选】【弱规则】三段，**结构里没有任何"某个缺陷类型没有任何规则覆盖"的输入通道**。
- `prompts.js:158-159` `PATH_RULES`：**明确把模型推向 `contains_text`**——"正则匹配不到时，先依据文件片段调整正则或**改用其他检查方式（如 contains_text 关键字）**"。这是循环里唯一给出的"改法建议"，方向恰好是表达力更低的一侧。
- 结果：`generator.js:275-288` 的 `negDetail` 日志显示"负例验证：覆盖 75，跳过 0，weak 0"，**全绿但漏 70/122**——绿灯只证明"规则接线了"，不证明"抓得到缺陷"。

### 1.4 就绪判定：目标函数错位（"标准包不失分"≠"抓得到缺陷"）

```js
// server/src/infrastructure/ai/checker/generator.js:305-325
const subSumCheck = (rules.subjective_items || []).reduce((s, x) => s + (Number(x.max_score) || 0), 0);
const threshold = meta.threshold || DEFAULT_THRESHOLD;          // meta.js:7 → 90
if (calibScore >= rules.max_score - subSumCheck && realDeductionSum === 0) {
  ... appendVersion(meta, rulesText, 'active', '校准满分就绪（校准得分 ' + calibScore + '/' + rules.max_score + ' 分）');
  ... checkerStatus: 'ready'
}
```

- 判定只依赖**标准包正向执行**（`generator.js:200 runRules(rules, rootDir)`）与 `realDeductionSum === 0`（`generator.js:250-252`）。
- 同样条件在 `generator.js:327`（review 分支）与 `generator.js:360`（多轮兜底 review）复现 3 次——**三处都必须接入门禁，否则门禁可被绕过**。
- `neg.weakRules` **不参与判定**（`generator.js:253-256` 注释明确"weak 规则不阻塞达标判定"）。

### 1.5 自证式负例验证（`ruleMutator.js`）：对 `contains_text` 恒真

```js
// server/src/services/ruleMutator.js:202-218
function mutateContainsText(params, root) {
  ...
  const mutated = r.content.split(text).join(MUTATION_PLACEHOLDER);  // 把该 token 全部替换掉
  ...
}
// :554  if (target.score === 0) return { kind: 'covered', id: task.id };
```

对 `contains_text` 的"缺陷变体"= **把该规则自己查的那个字符串删掉** ⇒ 规则必然 0 分 ⇒ 必然"覆盖"。这是**接线测试（circuit test）**，不是缺陷测试（fault test）。
**反证**：本题 `负例验证：覆盖 75，跳过 0，weak 0`（`checker_meta` 校准日志），而真实缺陷检出 42.62%。

### 1.6 子串无边界 + 规则被"另一行"满足（本题最典型）

```json
// /tmp/p5/checker_script.json（353 的既有 75 条规则，实测导出）
{"id":"a19","group":"路由与页面跳转","item":"Login.vue 中包含登录成功后跳转到 /user 的逻辑","rule_type":"contains_text","params":{"path":"src/views/Login.vue","text":"/user"},"max_score":1}
{"id":"a28","group":"登录功能","item":"Login.vue 中包含登录成功后跳转 /user 的代码","rule_type":"contains_text","params":{"path":"src/views/Login.vue","text":"/user"},"max_score":1}
```

标准包 `src/views/Login.vue` 的真实实现是 `router.push({ name: 'User' })`（**不含 `/user` 字面量**），文件里唯一命中 `/user` 的地方是 `L44: import { useUserStore } from '@/stores/user';`。
⇒ **a19/a28 从来没在检查"登录成功跳转"，它们检查的是 import 行**。L3 注入把 `router.push({ name: 'User' })` 整行删掉后，规则依旧满分 → 7/7 全漏。

**同类"被 import 行满足"的规则实测（对标准包逐条扫描，命中行含 `^import`）**：

| 规则 | token | 命中行 | 其中 import 行 |
|---|---|---|---|
| a8 | `ant-design-vue` | 2 | L2, L8 |
| a9 | `pinia` | 1 | L4 |
| a19 / a28 | `/user` | 1 | L44 |
| a29 / a33 / a48 / a51 | `notification` | 3 | L42 |
| a53 | `defineStore` | 1 | L2 |

**9 条规则（7 个 token）的"通过"可由 import 行独立满足** —— 这正是 S7/S8/S9/L3/L5/L4 五类漏检的共同机制。

---

## 2. 执行器能力盘点（11 类：参数 schema / 判定语义 / 可表达性）

### 2.1 逐类清单（`executor.js:23-49` 分派，实现见 `executors.js` / `syntax.js` / `evaluators.js`）

| # | rule_type | 参数 schema | 判定语义 | 校验位置 | 备注/坑 |
|---|---|---|---|---|---|
| 1 | `file_exists` | `{path}` | 文件存在且是文件 → 满分 | executors.js:18-31 | — |
| 2 | `dir_contains_file` | `{dir, pattern(glob)}` | dir 递归下存在匹配文件 | :40-59 | `pattern` 含 `/` 时按相对路径匹配（`evaluators.js:25-29`） |
| 3 | `contains_text` | `{path, text}` | `content.includes(text)`（**裸子串，无边界**） | :68-79 | ★1.6 的病灶 |
| 4 | `count_regex` | `{path, regex, min, partial?}` | 匹配次数 ≥ min；`partial:true` 按比例给分 | :89-108 | `min` 缺省 0 ⇒ **恒通过**，生成侧必须强制 min |
| 5 | `contains_regex` | `{path, regex}` | `new RegExp(regex).test(content)` | :117-133 | ★**无 `m` 标志**：`^` 只匹配文件开头，多行锚定必须写 `(^|\n)` |
| 6 | `file_count_in_dir` | `{dir, pattern, min, partial?}` | 匹配文件数 ≥ min | :142-163 | — |
| 7 | `syntax_check` | `{dir, pattern}` | tree-sitter 解析，任一 ERROR/缺失节点 → 0 分 | syntax.js:121-146 | 可检查 ext：js/mjs/cjs/ts/jsx/tsx/vue（`constants.js:35`） |
| 8 | `fact` | `{fact, op, value}`，op∈`constants.js:38` | 与 `extractFacts` 的工程事实比较 | evaluators.js:109-153 | **字段清单见 `constants.js:41-87`**；每次 runRules 只提取一次（executor.js:87-99） |
| 9 | `ast_pattern` | `{path, pattern}` | `>` 分隔的**节点类型链**祖先→后代匹配 ≥1 → 满分 | syntax.js:210-234 + 179-202 | ★**只有节点类型，没有文本/标识符谓词**：无法区分 `app.use(router)` 与 `app.use(Antd)` |
| 10 | `count_imports` | `{path, module, min, partial?}` | 逐行扫描 `^(import|require|from|include)` 且行内含 module → 计数 ≥ min | executors.js:170-198 | 引号风格无关；**同一行的 module 出现即算**（含子串） |
| 11 | `normalized_text` | `{path, text}` | 双侧去全部空白后 `includes` | executors.js:200-215 | **只去空白，不去注释** ⇒ `// app.use(router)` 仍然命中 |

### 2.2 关键判据：五类致命漏检"能表达 / 不能表达"

| P5 漏检类 | 注入实际形态（本轮实测，见附录 B） | 现有 11 类能否表达 | 结论 |
|---|---|---|---|
| **S7** 未挂载 Pinia（6） | `app.use(createPinia())` → `// app.use(createPinia())` | ✅ `contains_regex` `(^|\n)\s*[A-Za-z_$][\w$]*\.use\(\s*createPinia\(\)\s*\)` | **改提示词就能做到** |
| **S8** 未挂载 router（9） | `app.use(router)` → `// app.use(router)` | ✅ 同上（`router`） | **改提示词就能做到** |
| **S9** 未注册 Antd（7） | `app.use(Antd)` → `// app.use(Antd)` | ✅ 同上（`Antd`） | **改提示词就能做到** |
| **L3** 登录成功不跳转（7） | `router.push({ name: 'User' })` → `// push removed` | ✅ `contains_regex` `(^|\n)\s*[A-Za-z_$][\w$]*\.push\(` | **改提示词就能做到** |
| **L4** 不写 store（2） | `userStore.$patch(...)` → `// patch removed` | ✅ `(^|\n)\s*[A-Za-z_$][\w$]*\.\$patch\(` | **改提示词就能做到** |
| **H2** dataIndex 拼错（4） | `dataIndex: 'email'` → `'emial'`（`key: 'email'` 保留） | ✅ `contains_regex` `dataIndex\s*:\s*['"]email['"]` | **改提示词就能做到** |
| **S5** 路由 import 指向不存在文件（7） | `'@/views/Login.vue'` → `'@/views/LoginPage.vue'` | ❌ 无任何类型会"解析 import 目标并查文件是否存在" | **必须扩执行器**（新类型或新 fact） |
| **S6** store import 路径写错（5） | `'@/stores/user'` → `'@/stores/users'` | ❌ 同上 | **必须扩执行器** |
| **L1/L5** 首句 `return;` 短路（9+7） | 函数体**首句插入 `return;`**（onSubmit / `catch(error => {...})`），其余代码原文保留 | ❌ 文本/AST 存在性规则全部照旧命中；AST 也不含"可达性"信息 | **必须扩执行器**（不可达代码检测） |
| F1 store 注释全删（7） | 删 3 条注释（标准 14 处 `//` → 变体 11 处） | ⚠️ 只能靠 `count_regex {regex:"//", min:N}` 硬编码标准包计数 | 建议**转主观**（rubric 属"九、规范健壮"） |

> **注意 S7/S8/S9 的"改提示词就能做到"有前提**：规则必须写成 `[A-Za-z_$][\w$]*\.use\(`（不写死 `app`）——否则无害变体 N1（`app`→`myApp`，main.js 内自洽）会被误扣。本轮已用 62 份实测：写死 `app` 会误伤 N1；写成标识符通配 + 行首锚定则 **22/22 全中且 0 误扣**（§5.3）。

### 2.3 附带缺口（供 B 一并考虑，非阻塞）

1. `package-inspect.js:30-38 PATH_PARAM_BY_TYPE` **只登记 8 类**，`ast_pattern/count_imports/normalized_text` 的 `params.path` **不做白名单校验**：模型幻觉一个不存在的路径不会被判为"标准包缺陷候选"，只会在标准包上失分 → 白耗一轮校准。
2. `enrichDeductionSnippets`（:92-108）同样只覆盖 8 类 ⇒ 语义规则的失分**没有文件片段**进入校准反馈，模型拿不到修正依据。
3. `contains_regex`/`count_regex` **无 flags**：`m`/`i`/`s` 都不可用，规则作者必须手写 `(^|\n)` 与 `[A-Za-z_$]`；提示词必须把这条"正则写法约定"显式教给模型（`prompts.js` 目前一字未提）。
4. `ast_pattern` 无文本谓词 ⇒ 挂载点检查**不要**依赖它（模型很可能写出"能匹配但不判别"的链，例如 `expression_statement > call_expression > arguments > identifier` 会被 `app.use(Antd)` 满足）。

---

## 3. 改造方案

### a) 提示词 / 策略改造（含 diff 草案与 few-shot）

#### a-1 ★白名单单一真源（必修）

```diff
--- a/server/src/domain/services/checker/parsers.js
+++ b/server/src/domain/services/checker/parsers.js
@@ -4,14 +4,9 @@
-/** 规则类型白名单（与 ruleExecutor.RULE_TYPES 一致，prompt 注入用） */
-const RULE_TYPES = [
-  'file_exists',
-  'dir_contains_file',
-  'contains_text',
-  'count_regex',
-  'contains_regex',
-  'file_count_in_dir',
-  'syntax_check',
-  'fact',
-];
+// 单一真源：直接复用执行器白名单（domain 层内相对路径，不违反 check-layers）。
+// 历史上本文件另立过一份 8 类旧清单，导致 ast_pattern/count_imports/normalized_text
+// 被 parseCheckerRules 静默丢弃（见 docs/pipeline/G1-generator改造.md §1.1）。
+import { RULE_TYPES } from '../../rule/constants.js';
```

> 分层校验：`domain/services/checker/parsers.js` → `../../rule/constants.js` = `domain/services/rule/constants.js`，同层，`server/scripts/check-layers.mjs:63-65` 允许（domain 内相对路径）。

#### a-2 `prompts.js:128-129` 改为"类型选择阶梯 + 硬配额"（核心）

```diff
@@ buildGenerateUserPrompt（prompts.js:124-135 的"要求"段）
-- rule_type 只能使用白名单类型：' + RULE_TYPES.join(' / ')
-- P0-2 语义级规则优先（抗格式差异）：ast_pattern{path, pattern} ... 仅当语义级规则无法表达时才用 contains_text/contains_regex/count_regex 文本级规则
++ rule_type 只能使用白名单类型：' + RULE_TYPES.join(' / ')
++ 【类型选择阶梯（必须自上而下选，能上不下）】
++  L0 挂载/装配点：必须用 contains_regex 且**行首锚定 + 标识符通配**（严禁写死变量名 app）；
++      例：{"path":"src/main.js","regex":"(^|\\n)\\s*[A-Za-z_$][\\w$]*\\.use\\(\\s*router\\s*\\)"}  ← 注释掉该行即失分，重命名 app→myApp 不失分
++  L1 文件/目录存在性：file_exists / dir_contains_file / file_count_in_dir
++  L2 语法可运行性：syntax_check{dir,pattern}（每个源码目录至少 1 条）
++  L3 结构存在性（抗格式差异）：count_imports{path,module,min} / ast_pattern{path,pattern} / normalized_text{path,text}
++  L4 内容存在性：contains_regex（**必须绑定上下文**）> contains_text（**仅当 token 为该功能独有且不会出现在 import/其它功能行**）
++  L5 工程级事实：fact{fact,op,value}（字段清单见下）
++ 【硬配额（违反将被生成侧 lint 打回）】
++  1) objective_items 中 contains_text 占比 ≤ 40%；
++  2) 至少 1 条 L2、至少 1 条 L3、至少 1 条 L0（若评分标准涉及依赖/插件/路由挂载）；
++  3) 任何 contains_text 的 text 若在标准包中出现于 import 行或另一功能的行内，必须改写为 contains_regex 绑定上下文（例：'email' → dataIndex\\s*:\\s*['"]email['"]）。
++ 【正则写法约定（JS RegExp 无 flags）】
++  - 不支持 m/i/s 标志：多行锚定写 (^|\\n)，忽略大小写用字符类，跨行用 [\\s\\S]；
++  - 允许等价写法：如跳转可接受 { name: 'User' } 或 '/user'，必须用 | 并列，不要只认一种写法。
```

#### a-3 `RULES_EXAMPLE`（`prompts.js:85-93`）改成多类型 few-shot（给模型可照抄的"骨架"）

```diff
 const RULES_EXAMPLE = [
   '{',
   '  "max_score": 100,',
   '  "objective_items": [',
-  '    { "id": "a1", "group": "项目初始化与运行", "item": "存在 pom.xml", "rule_type": "file_exists", "params": { "path": "pom.xml" }, "max_score": 10 }',
+  '    { "id": "a1", "group": "项目初始化与运行", "item": "存在 package.json", "rule_type": "file_exists", "params": { "path": "package.json" }, "max_score": 6 }',
+  '    { "id": "a2", "group": "项目初始化与运行", "item": "src 下源码语法可解析（无语法错误）", "rule_type": "syntax_check", "params": { "dir": "src", "pattern": "*.js" }, "max_score": 4 }',
+  '    { "id": "a3", "group": "二、路由与跳转", "item": "已挂载 vue-router（未被注释）", "rule_type": "contains_regex", "params": { "path": "src/main.js", "regex": "(^|\\n)\\s*[A-Za-z_$][\\w$]*\\.use\\(\\s*router\\s*\\)" }, "max_score": 5 }',
+  '    { "id": "a4", "group": "二、路由与跳转", "item": "登录成功后执行跳转（接受 name 或 path 写法）", "rule_type": "contains_regex", "params": { "path": "src/views/Login.vue", "regex": "(^|\\n)\\s*[A-Za-z_$][\\w$]*\\.push\\(\\s*(?:\\{\\s*name\\s*:\\s*[\'\"]User[\'\"]|[\'\"]\\/?user[\'\"])" }, "max_score": 5 }',
+  '    { "id": "a5", "group": "五、Pinia", "item": "引入了 pinia 依赖", "rule_type": "count_imports", "params": { "path": "src/main.js", "module": "pinia", "min": 1 }, "max_score": 3 }',
+  '    { "id": "a6", "group": "五、Pinia", "item": "工程使用 Pinia（依赖+使用）", "rule_type": "fact", "params": { "fact": "hasPinia", "op": "==", "value": true }, "max_score": 3 }',
   '  ],',
   '  "subjective_items": []',
   '}',
 ].join('\n');
```

> 说明：示例只放"格式骨架"，`group` 名用占位式写法（真实 group 必须来自【固定分项】）。**不要**在示例里放本题（用户管理系统）的具体 token，否则模型会照抄示例 token。

#### a-4 `PATH_RULES`（`prompts.js:158-159`）把"兜底方向"从 contains_text 改成锚定正则

```diff
-const PATH_RULES = '铁律：params.path/params.dir 必须来自【标准工程包文件树】中真实存在的文件/目录，绝对禁止编造文件路径；'
-  + '正则匹配不到时，先依据文件片段调整正则或改用其他检查方式（如 contains_text 关键字），不要重复同一写法。';
+const PATH_RULES = '铁律：params.path/params.dir 必须来自【标准工程包文件树】中真实存在的文件/目录，绝对禁止编造文件路径；'
+  + '正则匹配不到时，先依据文件片段调整正则（行首锚定 (^|\\n)、标识符通配 [A-Za-z_$][\\w$]*、等价写法 | 并列），'
+  + '仍不行再用 normalized_text/count_imports/ast_pattern；**不要退回 contains_text 裸子串**——那会让"某 token 还在"通过而"该功能已失效"漏检。';
```

#### a-5 生成侧确定性 lint（提示词之外的硬保证）

在 `generator.js` 的 `evaluateRound`（:169-203）里，`parseCheckerRules` 之后增加 `lintGeneratedRules(rules, projectRoot)`（纯函数，放 `domain/services/checker/ruleLint.js`）：

| 检查 | 判定 | 处理 |
|---|---|---|
| L-A 类型配额 | `contains_text` 占比 > 40%，或缺 L2/L3 规则（当评分标准涉及依赖/挂载） | 抛错 → 走既有"本轮失败→校准反馈"通道（`generator.js:226-241`），错误文案给出具体缺什么 |
| L-B 裸子串串扰 | 对每条 `contains_text`：token 在标准包**同一文件**中命中 ≥2 行，或任一行匹配 `/^\s*import\b/` | 同上；文案附命中的行号与行内容片段（复用 `enrichDeductionSnippets` 的片段逻辑） |
| L-C 死 token / 恒真 | `count_regex`/`count_imports`/`file_count_in_dir` 未给 `min` 或 `min<=0`（`executors.js:100-107/155-162/190-193` 缺省 0 = 恒通过） | 同上 |
| L-D 路径白名单覆盖 | `PATH_PARAM_BY_TYPE` 扩到 11 类（含 `ast_pattern/count_imports/normalized_text`） | 让语义规则的幻觉路径进入"标准包缺陷候选"通道（`generator.js:197-198/246-248`） |
| L-E 重复规则 | 组内/跨组 (rule_type, params) 完全相同的项 | 见 §3-e 去重 |

> 注意：lint **抛错**比"提示词里写要求"强得多——它走的是既有的"本轮失败→下一轮校准"闭环（`generator.js:235-242`），模型必须改，否则 `evaluateRound` 一直失败（最多 3 轮，最终 failed 而不是悄悄放过）。

### b) 规则表达力下限（覆盖 P5 五类致命漏检）

**分界线（B 施工时必须按此分工）：**

| 能力 | 覆盖缺陷 | 落点 | 工作量 |
|---|---|---|---|
| **只改提示词/白名单**（不改执行器） | S7(6) S8(9) S9(7) L3(7) L4(2) H2(4) = **35 项** | a-1 + a-2 + a-3 + a-4 + a-5(L-A/L-B) | 提示词 ~40 行、lint ~120 行 |
| **必须扩执行器**：import 目标存在性 | S5(7) S6(5) = **12 项** | 新类型 `import_resolves`（或新 fact `brokenImports`） | 新执行器 ~90 行 + fact 提取 ~60 行 + 白名单/标签 4 处 |
| **必须扩执行器**：不可达代码/首句 return | L1(9) L5(7) = **16 项** | 新类型 `no_unreachable_code` | 新执行器 ~70 行（复用 `syntax.js:parserForFile`） |
| **建议转主观**（可选扩） | F1(7) | rubric 属"九、规范健壮"；若硬做需 `count_regex{regex:"//",min:标准包计数−2}`（本题标准 14 → min 12） | 0（转主观）/ ~30 行 |

**新类型规格草案（可直接进 B 的施工单）**

```js
// 12) import_resolves：{path, alias?: {"@": "src"}, exts?: ['.js','.vue','.ts','.json']}
//   —— 读取 path 中所有 import/require/from 说明符：相对路径（./ ../）与 alias 前缀（默认 {'@':'src'}，
//      可由 params.alias 覆盖；alias 表建议生成时从 vite.config.js/jsconfig.json 解析并写进规则参数）；
//   尝试 <spec>、<spec>.js/.vue/.ts/.json、<spec>/index.js|vue；任一候选存在即视为已解析。
//   只要存在 1 个无法解析的说明符 → 0 分，evidence 列出 "文件:说明符"（最多 5 条）。
//   满分条件：所有说明符均可解析（或文件本身无 import）。
// 13) no_unreachable_code：{path}
//   —— 解析文件（vue 走 <script> 抽取，与 syntax.js:153-169 parserForFile 一致），
//      对每个 statement_block：若【首条非注释语句】为 return_statement 且其后仍有 ≥1 条语句 → 命中。
//      命中数 ≥1 → 0 分，evidence 给 "第 N 行：return 之后仍有 M 条语句不可达"。
//   —— 标准包预检（必须通过）：UserManagement/src 全量扫描命中 0 处（本轮实测：12 份应满分样本零误报，见 §5.3）。
```

**为什么 `no_unreachable_code` 必须是"首句 return + 其后仍有语句"，而不是"函数体首句 return"**：
- 标准包 `src/views/Login.vue` 的 `sleep()` 就是 `return new Promise(...)` —— 合法早返回；
- 若写成"任何函数体首句即 return 就失分"，标准包自己就失分 → 该规则永远无法通过校准（会被判为标准包缺陷候选，白耗轮次）。
- 实测该精确形态在标准包上命中 0、在 6 份无害变体 + 6 份对照上命中 0、在 L1/L5 变体上命中 13/13（观测内全中）。

### c) 子串命中问题（`contains_text` 加 token 边界）

**三层处理（建议全做，成本递增）**

1. **生成侧禁止（最有效，0 运行时风险）**：a-5 lint L-B —— `contains_text` 的 token 若命中 import 行或同文件多行 → 打回重生成。本题 9 条命中 import 行的规则（a8/a9/a19/a28/a29/a33/a48/a51/a53）全部会被这条 lint 拦下。
2. **参数级边界（可选，~25 行）**：给 `execContainsText` 增加可选 `params.boundary`（`true` = 词/路径边界匹配），实现：
```js
function escapeRe(s) { return String(s).replace(/[.*+?^$&(){}|[\]\\]/g, '\\$&'); }
const re = params.boundary === true
  ? new RegExp('(?<![\\w$@/.-])' + escapeRe(text) + '(?![\\w$-])')
  : null;
const hit = re ? re.test(r.content) : r.content.includes(text);
```
   ⚠️ **对本题的 a19/a28 无效**：`'@/stores/user'` 里的 `/user` 前面是 `s`（词字符），边界版确实能不命中——但**真正的问题不是边界，而是"这条规则根本不是在做它声称的检查"**（用户跳转用 `{name:'User'}`，与 `/user` 无关）。**边界只能减少串扰，不能把错规则变对**。因此 C-1（生成侧禁止）优先级高于 C-2。
3. **提示词层绑定上下文（a-2 L4 + a-4）**：要求 `contains_regex` 绑定属性名（`dataIndex\s*:\s*['"]email['"]`）、要求写"等价写法并列"。

### d) ★回归门禁（P5 建议 1，优先级最高）：把注入测试集接进 ready 判定

#### d-1 目标与定义

```
基线 base = runRules(rules, standardProjectRoot)
对每条注入变换 T（附录 B）：构造变体 variant(T) → runRules(rules, variant(T)) → deducted(T)
T 被"语义检出" ⟺ ∃ 失分项 it：rules[it.id].params.path ∈ T.targetFiles
指标：fatalRecall / instanceRecall / sampleRecall / falsePositives(12 份应满分样本)
```
> "语义检出"口径与 P5 §2.1(B) 一致（避免"扣在别处也算抓到"）。

#### d-2 接入点（三处，缺一即被绕过）

| 位置 | 现状 | 改为 |
|---|---|---|
| `generator.js:309` | `if (calibScore >= ... && realDeductionSum === 0)` → **ready** | `&& gate.ok`；否则把 `gate.misses` 塞进 `lastFeedback`，进入下一轮校准 |
| `generator.js:327` | 同条件 → **review**（阈值 90） | `&& gate.ok`；否则同样进校准反馈（review 分支不能被门禁绕过） |
| `generator.js:360` | 多轮最优 → **review** | 保留 `review`，但 `appendVersion` 的 reason 必须写入 gate 指标，且 `meta.report` 增加 gate 段落 |
| `generator.js:384` | failed 文案只提分数 | 增补"注入回归未达标：致命检出 x/y" |

#### d-3 门禁分级（避免 LLM 随机性导致永久 failed/死锁）

| 档 | 判据 | 后果 |
|---|---|---|
| **硬门禁（必须满足才 ready）** | `falsePositives === 0`（12 份应满分样本零扣分）**且** `fatalRecall ≥ 0.70`**且** 适用变换数 ≥ 8 | 不满足 → 不许 `ready`，进校准反馈 |
| **软门禁（达标线）** | `instanceRecall ≥ 0.80` 且 `sampleRecall ≥ 0.60` | 不满足 → 落 `review`（**不是 failed**），报告里明确列出缺口类型（如"L1 首句 return 无任何规则覆盖"），交教师决定"确认/重新生成" |
| **豁免** | 该题标准包上可适用的变换 < 8（Java/Python 题、题库未覆盖题型） | 记 `meta.gate = {skipped:true, reason}` 并打 warn 日志；**不阻塞**（fail-open + 可见），避免误伤新题型 |

> 阈值依据：本轮投影显示"照 §3-a/b 生成"的规则集可稳定做到 致命 95.9% / 实例 91.8% / 样本 80%（§5）。硬线 0.70 / 软线 0.80 留出 LLM 方差余量；若首轮实测普遍低于软线，应调的是提示词，不是把线降下来。

#### d-4 替换自证式负例验证（P5 建议 1 的后半句）

- `validateNegativeTests`（`ruleMutator.js:583-641`）**保留其"接线检查"价值**，但：
  1. 结果只作为**诊断信息**写入 `checkerMeta.negativeTests`，**不得**再出现在"就绪理由"里（当前 `generator.js:275-288` 会把"覆盖 75，跳过 0"写进 `meta.log`，是虚假信心的主要来源）；
  2. `weakRules` 反馈段（`prompts.js:180-183`）改为注入门禁的缺口段（见 d-5）；
  3. 对 `contains_text` 的变异策略（`ruleMutator.js:202-218`）标注"仅接线测试"或直接对 `contains_text` 跳过（**它恒 covered，提供的信号为零**）。

#### d-5 门禁缺口必须回流到校准提示词（闭环）

`prompts.js` 的 `buildCalibrateUserPrompt` 增加一段（新 `feedback.gateMisses` 通道，`meta.js:attachNegativeFeedback` 同步扩展）：

```text
【注入回归缺口（必须在本轮修复）】当前规则在确定性缺陷注入上的检出率：
- 致命 x/y（需 ≥0.70）、实例 a/b（需 ≥0.80）、样本 c/d（需 ≥0.60）
以下是**完全没有被任何规则抓到**的缺陷类型（每条都已用真实注入复现，请补齐能区分它们的规则，不要删除既有评分项）：
- L1 登录提交首句 return（致命，文件 src/views/Login.vue，注入形态：函数体首行插入 return;）
- S8 未挂载 router（致命，文件 src/main.js，注入形态：// app.use(router)）
- S5 路由 import 指向不存在文件（致命，文件 src/router/index.js，注入形态：'@/views/Login.vue' → 不存在的路径）
若某类缺陷现有 rule_type 无法表达，请在输出中**照常生成最接近的规则**，并在该规则 item 描述末尾标注「（表达力不足：需 <类型名>）」——教师将据此决定转主观。
注意：新增规则不得导致【标准包】失分（注入回归的前提是标准包满分），也不得让 12 份语义等价样本失分。
```

> 这一段是**把"漏项"接进反馈回路**的关键——P5 根因 §5-3 的核心是"校准只优化不失分、不优化抓缺陷"，本段直接改变目标函数。

#### d-6 注入器（确定性，零 LLM）

新增 `server/src/services/checkerFaultInjector.js`，实现附录 B 的 18 类变换（`{id, sev, layer, applicable(projectRoot), targets, mutate(dest)}`），**逐条单点注入**（复制标准包 → 应用 1 个变换 → 返回 variantDir），与 `ruleMutator.mutateVariant`（:417-481）同一复制/清理约定。
判定纯函数抽到 `domain/services/checker/injectionGate.js`（无 fs、无 npm，便于单测）：

```js
export function evaluateInjectionGate(baseResult, variantResults, transforms, thresholds) // → {
//   ok, fatalRecall, instanceRecall, sampleRecall, falsePositives, misses: [{id, sev, reason}], applied, skipped
// }
```

### e) 分值映射（对齐 rubricItems 九项 + 去白送分 + 110/100 正面处理）

**现状实测（/tmp/p5/checker_script.json + rubric_items.json）**

| 项 | rubricItems（确定性 7 项，合计 77） | checker 客观 group 合计 | 漂移 |
|---|---|---|---|
| 项目初始化 | 9 | 9 | 0 |
| 路由与页面跳转 | 9 | **10** | **+1** |
| 登录功能 | 18 | **14** | **−4** |
| 注册功能 | 18 | 18 | 0 |
| Pinia状态管理 | 9 | 9 | 0 |
| 个人信息展示 | 5 | 5 | 0 |
| 管理员用户列表 | 9 | **12** | **+3** |
| （主观）主页布局权限 / 规范健壮 | 14 / 9 | subjective s1/s2 = 14/9 | ✅ 一致 |

- **1 分/条**：75 项里 **74 项 max_score = 1**（唯一例外 a75=3）⇒ 致命缺陷（如 H1 缺邮箱列）只值 1 分，严重度与分值完全脱钩。
- **7 组重复 token（9 条冗余项）**：

  | 重复组 | 组归属 | token |
  |---|---|---|
  | a18 / a47 | 路由与页面跳转 / 注册功能 | `Register.vue: /login` |
  | a19 / a28 | 路由与页面跳转 / 登录功能 | `Login.vue: /user` |
  | a22 / a24 | 登录功能 | `Login.vue: required` |
  | a29 / a33 | 登录功能 | `Login.vue: notification` |
  | a35 / a41 | 注册功能 | `Register.vue: email` |
  | **a38 / a40 / a42 / a44** | 注册功能 | `Register.vue: required`（4×） |
  | a48 / a51 | 注册功能 | `Register.vue: notification` |

  ⇒ 同一 token 被计 2~4 次分；**a18/a47、a19/a28 还跨组重复**（一个 token 在两项评分标准里各拿 1 分）。

**改造方案（`parseCheckerRules` 内确定性后处理，新增 `normalizeRuleScores(rules, rubricItems, maxScore)`）**

1. **组名归一**：沿用 `RUBRIC_NAME_SEPARATORS`（`parsers.js:228`）与 `findMisplacedSubjective`（:240-256）的匹配口径，把 `objective_items[].group` 映射到 `rubricItems[].item`；映射不到的 group → 抛错（走校准反馈："group 必须来自【固定分项】"）。
2. **去重**：同一 `group` 内 (rule_type, params) 完全相同的项，**保留首项并将其 max_score 置为组内该键的合计分**（保留严重度），其余删除。跨组重复**不去重**（a18/a47 属两个评分项，各自保留 1 分）——但要求两组的 token 必须各自绑定上下文（a-5 L-B 会强制改写）。
3. **组内配平**：对每个确定性 rubric 分项 `it`，令组内 `Σmax_score = it.maxScore`：不足 → 按**严重度权重**补齐（优先级：L0 挂载点/import 解析 > 结构存在性 > 语法 > 内容存在性）；超出 → 复用 `parsers.js:196-221` 已有的**最大余数法**（抽成 `scaleToTarget(items, target)` 纯函数复用，避免重复实现）。
4. **严重度映射（可选但建议）**：规则项允许 `sev: 'fatal'|'major'|'minor'`，段位权重 fatal 3 / major 2 / minor 1，配平后按权重取整、余数归 fatal 项。这直接回应 P5"致命缺陷只扣 1 分"的批评。**默认关闭**（不改变现有分制），由 `checkerMeta.severityWeighting = true` 开启，先在 353 上试。
5. **110 vs 100 正面处理**：
   - `summarizeRubricItems`（`rubric-items.js:60-73`）的提示词已写"各项之和必须恰好等于 maxScore"（教师九项实为 10+10+20+20+10+15+5+10+10 = 110，被静默折算成 100）；
   - 改为：解析后若模型返回的**原始合计 ≠ maxScore**，在 `rubricItems` 上附 `rawMaxScore`（如 110）与 `scale = maxScore/rawMaxScore`（0.909）并把两者写入 `checkerMeta.rubricNormalization`；
   - 教师端（`review.js` 返回体 + 前端）展示一行：「教师原始分项合计 110 分 → 已按 100/110 等比折算（登录 20→18、主页布局 15→14…）」，并在 `review.js:23` 的 review 载荷里带出——**把"悄悄归一化"变成"显式告知 + 可复核"**；
   - 若教师希望保留 110，应把 `question.maxScore` 改为 110（平台侧不改分数语义，只做一致性校验）。

---

## 4. 可复算性与快速迭代回路

### 4.1 事实基础（实测确认）

| 事实 | 证据 |
|---|---|
| `runRules` 纯函数、零 DB/零网络；62 份秒级 | `executor.js:72-132`；P5 §2.2 实测 |
| `generator.js` 有 ≥4 处写库 | :101（置 generating）、:119（inputsSnapshot）、:300（checkerScript+meta）、:303（calibrating）、:316（ready）、:334（review）、:372、:382 |
| 主库 = `exam_system`；测试库 = `exam_system_test` **已存在**（22 表，10 题） | `server/.env` DATABASE_URL（仅解析库名，未打印凭据）；information_schema SELECT |
| **测试库里没有 353** | `SELECT COUNT(*) FROM exam_system_test.questions WHERE id=353` → 0；现有题 id = 902/903/1280-1283/6364-6366/14468 |
| 测试库有 `questions_teacher_id_fkey → users.id`，而 teacher 1063 **不在测试库** | KEY_COLUMN_USAGE 查询 + `COUNT(*) … WHERE id=1063` → 0 |
| 测试库 `system_configs` 无 deepseek_api_key 行 ⇒ `getApiKey()` 回退环境变量 | `config.js:44`；测试库该键行数 0（主库 1，值未读取） |
| 标准包在磁盘上、与库无关 | `server/uploads/project-questions/353/standard/UserManagement`（`projectPaths.js:36-38`） |
| 测试库写库白名单已存在 | `server/test/setup.js:35` `TEST_DB_NAMES = ['exam_system_test']` |

### 4.2 在测试库复现 353 + 跑 generator + 复算（完整步骤，B 执行）

```bash
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek"

# ⓪ 备份测试库（建议）
#    mysqldump exam_system_test > /tmp/g1/exam_system_test.bak.sql     # 需凭据，勿回显

# ① 测试库 seed：把 353 从主库复制过来（★唯一允许写库的一步，只写 exam_system_test）
#    teacher_id 外键在测试库不存在（teacher 1063 不在），两种做法任选：
#    (a) 一并复制教师行（推荐，语义完整）
#        INSERT INTO exam_system_test.users SELECT * FROM exam_system.users WHERE id=1063;
#    (b) 关闭外键检查（最小侵入）
#        SET FOREIGN_KEY_CHECKS=0; INSERT INTO exam_system_test.questions SELECT * FROM exam_system.questions WHERE id=353; SET FOREIGN_KEY_CHECKS=1;
#    校验（只读）：均应为 1
#        SELECT COUNT(*) FROM exam_system_test.questions WHERE id=353;
#        SELECT checker_status, CHAR_LENGTH(checker_script) FROM exam_system_test.questions WHERE id=353;
#    ★注意：353 的 checker_status 是 ready（不是 generating/calibrating），generator 不会幂等短路（generator.js:85-92）

# ② 跑 generator（★必须把 DATABASE_URL 指向测试库；key 从 server/.env 经 dotenv 读入，禁止打印）
cd server
DATABASE_URL="mysql://<user>:<pass>@localhost:3306/exam_system_test" \
LOG_LEVEL=info \
node --input-type=module -e '
  import "dotenv/config";
  const { generateChecker } = await import("./src/infrastructure/ai/checker/generator.js");
  const r = await generateChecker(353);
  console.log(JSON.stringify(r));            // 只打印状态/轮次/分数，绝不打印 key
'
# 预期：{status:"ready"|"review"|"failed", rounds, totalScore}；日志含每轮 totalScore / 负例验证 / gate 指标
cd ..

# ③ 导出新生成的规则（只读）
node docs/pipeline/scripts/p5-db-query.mjs "SELECT checker_script FROM exam_system_test.questions WHERE id=353;" > /tmp/g1/new-rules.json
node -e 'const fs=require("fs");const rows=JSON.parse(fs.readFileSync("/tmp/g1/new-rules.json","utf8"));
  fs.writeFileSync("/tmp/g1/checker_script.json",rows[0].checker_script);
  const R=JSON.parse(rows[0].checker_script);const c={};
  for(const i of R.objective_items)c[i.rule_type]=(c[i.rule_type]||0)+1;
  console.log("类型分布",JSON.stringify(c));'

# ④ 复算 62 份（纯函数、零 DB；脚本就地解压到 /tmp/p5/subs）
cp /tmp/g1/checker_script.json /tmp/p5/checker_script.json
node docs/pipeline/scripts/p5-recompute.mjs /tmp/p5
node docs/pipeline/scripts/p5-final.mjs /tmp/p5          # 语义口径头条数字（与 §3.1 同口径）

# ⑤ 门禁口径（与本方案 d-1 一致；建议由 B 固化为 server/scripts/checker-bench.mjs）
#    node server/scripts/checker-bench.mjs eval --rules /tmp/g1/checker_script.json
```

### 4.3 快速迭代回路（改提示词 → 重新生成 → 复算）

```
┌─ ① 改 prompts.js / ruleLint ─┐
│                              ▼
│  ② node server/scripts/checker-bench.mjs generate 353    # LLM 1~3 轮，1~5 分钟
│  ③ node server/scripts/checker-bench.mjs eval --rules /tmp/g1/checker_script.json   # 秒级
│  ④ 看指标表：类型分布 / 致命检出 / 实例检出 / 样本级 / 假阳性 / 缺口类型
└── 未达标 → 回到 ①（提示词或 lint 规则）
```

**关键**：③ 是**纯函数**（只依赖 `runRules` + 注入器 + 62 份 zip），**不写库、不联网、零 LLM**，可以无限次重跑；只有 ② 消耗 LLM 额度。
建议 B 把 `server/scripts/checker-bench.mjs` 做成三个子命令：

| 子命令 | 作用 | 是否写库 | 是否调 LLM |
|---|---|---|---|
| `seed [qid]` | 打印/执行测试库 seed SQL（默认 dry-run 只打印，`--commit` 才执行） | 是（仅测试库） | 否 |
| `generate <qid>` | `import 'dotenv/config'` + `generateChecker(qid)`，落 `/tmp/g1/checker_script.json` | 是（仅测试库） | 是 |
| `eval --rules <f>` | 注入门禁 + 62 份复算，打印指标表 | **否** | 否 |

### 4.4 迭代回路的硬约束（B 必须遵守）

1. **只写 `exam_system_test`**：跑 generator 前必须用 `DATABASE_URL` 覆盖到测试库；脚本里加与 `server/test/setup.js:52-70` 同款的库名白名单断言（fail-closed）。
2. **key 不落日志**：只 `import 'dotenv/config'`，禁止打印 `process.env.DEEPSEEK_API_KEY` / `getApiKey()` 的返回值；日志里只打 `promptChars`（`llm.js:73` 已如此）。
3. **353 在测试库的先行状态**：若为 `generating/calibrating` 且 `checkerMeta.startedAt` 在 15 分钟内，`generator.js:85-92` 会幂等短路；先把 `checker_status` 置回 `failed`（测试库）再跑。
4. 复算脚本用的是 `/tmp/p5` 目录约定（`p5-recompute.mjs:13`），B 直接复用即可（或让 bench 自建 `/tmp/g1`）。

---

## 5. 预期效果（本轮原型实测投影）

### 5.1 方法

用 62 份注入集逐份实测 9 个候选探针（脚本在 `/tmp/g1`，已清理），与 P5 §2.1(B) **同一语义口径**（`final-metrics.json` 的 `detected` 为基线；探针命中且承载文件存在 = 新增检出）：

| 探针 | 归属 | 正则/逻辑（JS RegExp，无 flags） |
|---|---|---|
| P1 S8 | main.js | `(^|\n)\s*[A-Za-z_$][\w$]*\.use\(\s*router\s*\)` |
| P2 S7 | main.js | `(^|\n)\s*[A-Za-z_$][\w$]*\.use\(\s*createPinia\(\)\s*\)` |
| P3 S9 | main.js | `(^|\n)\s*[A-Za-z_$][\w$]*\.use\(\s*Antd\s*\)` |
| P4 L3 | Login.vue | `(^|\n)\s*[A-Za-z_$][\w$]*\.push\(` |
| P5 L4 | Login.vue | `(^|\n)\s*[A-Za-z_$][\w$]*\.\$patch\(` |
| P6 H2 | UserList.vue | `dataIndex\s*:\s*['"]email['"]` |
| P7 L1/L5 | Login.vue `<script>` | tree-sitter：statement_block 首条非注释语句为 `return_statement` 且其后 ≥1 条语句 |
| P8 S5 | 全 src | import 说明符（`@/`→`src`、相对路径）解析目标文件存在性 |
| P9 S6 | 全 src | 同 P8（`@/stores/users`） |

### 5.2 结果（逐类型，n / 基线已检出 / 本次新增）

```
F1   n= 7 base= 0 new= 0     （规范层，未做探针）
F2   n= 8 base= 8 new= 0
H1   n= 5 base= 5 new= 0
H2   n= 4 base= 0 new= 4 ✅
L1   n= 9 base= 0 new= 7 ✅（2 项不可观测：Login.vue 被同批删除型错误删掉）
L2   n= 3 base= 3 new= 0
L3   n= 7 base= 0 new= 7 ✅
L4   n= 2 base= 0 new= 2 ✅
L5   n= 7 base= 0 new= 6 ✅（1 项不可观测）
S1..S4  base=36 new= 0
S5   n= 7 base= 0 new= 7 ✅
S6   n= 5 base= 0 new= 5 ✅
S7   n= 6 base= 0 new= 6 ✅
S8   n= 9 base= 0 new= 9 ✅
S9   n= 7 base= 0 new= 7 ✅

实例级（不可观测计分母）: 112/122 = 91.80%     （基线 52/122 = 42.62%）
实例级（剔除 4 项不可观测）: 112/118 = 94.92%   （基线 52/118 = 44.07%）
样本级: 40/50 = 80.00%                          （基线 10/50 = 20.00%）
致命: 47/49 = 95.92%   重要: 48/49   次要: 17/24  （基线 致命 13/49 = 26.53%）
层次: 静态 70/70 · 半静态 9/9 · 语义 25/28 · 规范 8/15
```

### 5.3 假阳性复核（必须为 0）

- **标准包基线自检**：6 条正则探针 + 不可达代码探针 + import 解析探针**全部通过**（`{router:true,pinia:true,antd:true,push:true,patch:true,dataIndexEmail:true}`）。
- **12 份应满分样本（6 对照 + 6 无害）**：**12/12 全部通过，假阳性 0**。其中 N1（`app`→`myApp`）是写死变量名规则的经典误扣陷阱，本轮探针用标识符通配 `[A-Za-z_$][\w$]*` 规避 ⇒ **验证了"改提示词能做到"这一档不会引入误扣**。

### 5.4 剩余未检出（10 项，全部可解释）

| 项 | 数量 | 说明 |
|---|---|---|
| F1 store 注释全删 | 7（6 可观测 + 1 伪影） | 规范层；rubric 映射到主观 s2。硬做需 `count_regex{regex:"//",min:12}`（标准包 14 处），属过拟合，**建议转主观** |
| 周磊08/L5、蔡娜43/L1、魏丽46/L1 | 3 | P5 已定义的"清单伪影"：承载文件被同批删除型错误删除，该错误在提交中客观不存在 |

### 5.5 预计可达区间（给决策用）

| 档位 | 实例级 | 样本级 | 致命 | 前提 |
|---|---|---|---|---|
| **下限（只做 §3-a 提示词 + lint + §3-d 门禁，不扩执行器）** | 79~85% | 60~70% | 75~85% | S7/S8/S9/L3/L4/H2（35 项）走提示词；S5/S6/L1/L5（28 项）仍漏 |
| **目标（§3-b 扩 2 个执行器类型）** | **89~95%** | **78~88%** | **93~97%** | 本轮原型实测 91.8%/80.0%/95.9% 为其中位 |
| 上限（再处理 F1 注释项） | 96~97% | 90~92% | 95.9% | 需接受"注释计数"这类硬编码，不建议 |

> **结论口径**：本轮投影是"**规则集理想时执行器能给到的上限**"；能不能达到取决于 **generator 是否真的生成这些规则**，而这一点**只有门禁（§3-d）能保证**——这正是"门禁优先于提示词"的原因。**没有门禁，改提示词只是提高概率，不是保证。**

---

## 6. 给 B 的施工单

### 6.1 改动清单（按依赖顺序）

| # | 文件 | 动作 | 行数估计 | 依赖 | 验收判据 |
|---|---|---|---|---|---|
| B1 | `server/src/domain/services/checker/parsers.js:7-16` | 删除本地 `RULE_TYPES`，改为 `import { RULE_TYPES } from '../../rule/constants.js'`（并继续 `export { RULE_TYPES }` 保持既有引用） | −10 / +4 | — | `parseCheckerRules` 对 11 类输入 5 项全部保留（§1.1 复现脚本：输出 5 项而非 2 项）；`node server/scripts/check-layers.mjs` 违规数不增加 |
| B2 | `server/src/infrastructure/ai/checker/prompts.js` | a-2 类型阶梯+硬配额+正则约定；a-3 多类型 few-shot；a-4 `PATH_RULES` 改向；d-5 `【注入回归缺口】` 段 | ~45 | — | 断言：`RULES_EXAMPLE` 含 syntax_check/contains_regex/count_imports/fact 四类；白名单字符串 = 11 类 |
| B3 | `server/src/domain/services/checker/ruleLint.js`（新） | L-A 配额 / L-B 裸子串串扰（import 行与多行命中）/ L-C 恒真参数 / L-E 重复 | ~130 | B1 | 单测：353 既有 75 条规则 → 至少报出 9 条 L-B（a8/a9/a19/a28/a29/a33/a48/a51/a53）、7 组 L-E；纯函数（domain 层，禁 fs） |
| B4 | `server/src/infrastructure/ai/checker/generator.js:169-203` | `evaluateRound` 内插入 lint 调用，失败抛错走既有校准通道 | ~10 | B3 | 构造违规规则 → 抛错 → `meta.log` 出现本轮失败记录 |
| B5 | `server/src/infrastructure/rule/import-resolve.js`（新）+ `domain/services/rule/constants.js` + `executor.js` | 新增 `import_resolves`：11→12 类 | ~110 | — | 单测：标准包 `src/router/index.js` → 满分；把 `'@/views/Login.vue'` 改成 `'@/views/LoginPage.vue'` → 0 分且 evidence 含"文件:说明符" |
| B6 | `server/src/infrastructure/rule/syntax.js` | 新增 `no_unreachable_code`：12→13 类 | ~70 | — | 单测：标准包 `src/views/Login.vue` 满分（`sleep()` 的 `return new Promise(...)` 不得误报）；在 `onSubmit` 首行插 `return;` → 0 分且 evidence 含行号 |
| B7 | `server/src/services/ruleMutator.js:443-479` | 为新 2 类补变异策略（删 import 目标文件 / 首个 statement_block 插 `return;`） | ~35 | B5,B6 | 负例验证对新类型不出现"不支持的规则类型" |
| B8 | `server/src/services/checkerFaultInjector.js`（新） | 附录 B 的 18 类确定性注入变换 | ~280 | — | 对标准包逐条注入：每条至少 1 条规则失分（接线自检）；`applicable()` 对 Java/Python 包返回少 ⇒ gate skipped |
| B9 | `server/src/domain/services/checker/injectionGate.js`（新） | `evaluateInjectionGate`（阈值/召回/假阳性/缺口，纯函数） | ~90 | — | 单测：给定伪造的 base/variant 结果，各种召回组合返回期望的 `ok/misses` |
| B10 | `server/src/infrastructure/ai/checker/generator.js:305-385` | 三处接入点（:309/:327/:360）`&& gate.ok`；`lastFeedback.gateMisses`；`meta.gate`；failed 文案 | ~35 | B8,B9 | 日志验证：gate 不达标时 3 个分支都不写 `ready` |
| B11 | `server/src/domain/services/checker/meta.js:16-22` | `attachNegativeFeedback` 透传 `gateMisses`；`buildReport` 增 gate 段；`appendVersion` reason 含 gate 指标 | ~20 | B10 | `checkerMeta.report` 含 `gate:{fatalRecall,instanceRecall,sampleRecall,falsePositives,misses}` |
| B12 | `generator.js:275-288` + `ruleMutator.js` | 负例验证降级为诊断（不再进"就绪理由"）；`contains_text` 变异标注"仅接线" | ~10 | — | 就绪 reason 不再出现"负例验证：覆盖 N" |
| B13 | `server/src/domain/services/checker/parsers.js:186-222` | 抽出 `scaleToTarget(items,target)` 并在 `normalizeRuleScores` 复用；组名归一 + 去重 + 组内配平（§3-e 1~3） | ~90 | B1 | 353 规则重跑后：各组合计 == rubricItems 对应分项（9/9/18/18/9/5/9），7 组重复各只留 1 条且分值合并 |
| B14 | `server/src/infrastructure/ai/deepseek/rubric-items.js:60-73` | 110/100 显式化：记 `rawMaxScore`/`scale` 到 `checkerMeta.rubricNormalization` | ~25 | — | 353 复跑后 `rubricNormalization = {rawMaxScore:110, scale:0.909}`；review 载荷带出 |
| B15 | `server/scripts/checker-bench.mjs`（新）+ `server/scripts/seed-test-question.mjs`（新） | §4.3 三子命令；seed 带库名白名单 fail-closed + `--commit` 开关 | ~180 | 全部 | `eval --rules` 秒级输出指标表；`generate 353` 仅写测试库 |
| B16 | `server/src/infrastructure/ai/checker/package-inspect.js:30-38` | `PATH_PARAM_BY_TYPE` 补 `ast_pattern/count_imports/normalized_text` | +3 | B1 | §2.3-1 的漏洞修复（幻觉路径进缺陷候选通道） |

**总计约 1200 行**（新增 ~1000、改动 ~200），其中 B1/B2/B3/B5/B6/B13 是可独立验证的最小闭环。

### 6.2 验收判据（B 交付时必须给出的证据）

1. **§1.1 复现脚本反转**：同一段 `parseCheckerRules(5 项)` → 输出 5 项（含 ast_pattern/count_imports/normalized_text），分值合计不变。
2. **353 重新生成一次**（测试库）→ 导出 `checker_script` 后跑 §4.2 ④ → 给出指标表，**必须包含**：
   - 类型分布（期望 ≥1 条 syntax_check、≥1 条 count_imports/fact、`contains_text` 占比 ≤40%）；
   - 致命/实例/样本检出、假阳性（必须 0/12）；
   - 与 P5 基线（52/122、10/50、13/49）的对比。
3. **门禁不可绕过**：构造一份"标准包满分但注入检出 0"的规则（例如只保留 file_exists 类），确认 generator 走不到 `ready`（三处接入点各测一次）。
4. **无回归**：`cd server && npm test`（jest 只跑测试库，`test/setup.js:35` 生效）；`node server/scripts/check-layers.mjs` 违规数不增加。
5. **零误扣**：12 份应满分样本在新规则下仍 77/77（确定性层）。

### 6.3 风险与对策

| 风险 | 对策 |
|---|---|
| 提示词变长 → 输出被截断（`llm.js:10` max_tokens 16000） | 阶梯/示例保持骨架化；B 实测 `finish_reason`，必要时把"类型阶梯"做成短表 |
| LLM 不照做 → 3 轮耗尽落 failed | 硬门禁只卡"假阳性=0 + 致命≥0.70"，其余落 review 并展示缺口（d-3）；宁可 review 不可 failed |
| 新规则在其它题（Java/Python）不可用 | 注入器按语言 `applicable()` 判定；适用变换 <8 时 gate skipped 且可见（fail-open） |
| 组内配平改变分值 → 学生分数漂移 | 只在 `maxScore` 总量不变的前提下重排；先在 353 测试库验证，灰度前对比旧新两版分数分布 |
| 门禁让生成耗时上升 | 变换在**标准包副本**上做（1 份 + 18 变体），与 62 份注入集无关；`runRules` 单份毫秒级 ⇒ 开销可忽略 |

---

## 7. 边界声明（本轮"没做"的部分）

1. **只读**：除本文件外未写/改任何仓库文件；未写任何数据库（含测试库，全部 SELECT）；**未运行 generator**（§4.2 是给 B 的步骤，不是本轮执行记录）。
2. **未调 LLM**：本轮全部结论来自源码阅读 + 确定性原型（`/tmp/g1`，已清理），未使用 `DEEPSEEK_API_KEY`（仅解析 `server/.env` 的库名与键名，未打印任何值）。
3. **投影口径**：§5 的 91.80%/80.00%/95.92% 是**探针级投影**（探针即"理想规则"），代表执行器与规则集的**能力上限**；实际生成结果取决于 LLM 与门禁，见 §5.5 区间。
4. **P5 的一处描述修正**：P5 §4 把 **L5** 记为"`notification.error` 整块删除"；本轮对 7 份 L5 样本逐份 diff 的实测是 **`return;` 插入 `catch(error => {...})` 首行**（与 L1 同机制）。这提高了 L1+L5 的价值：**一条 `no_unreachable_code` 覆盖 16 个实例**。
5. **未触碰**：`compile-executor.js`、`legacy-script.js`、`client/**`、`tests/**` 未做任何修改；无 git 写操作。

---

## 附录 A：原型探针实测汇总（可复算）

- 数据源：`实验/注入测试集/*.zip`（62 份）+ `错误清单.json`（18 类错误 ground truth）+ `/tmp/p5/final-metrics.json`（P5 基线逐实例 `detected`）。
- 判定：探针命中 **且** 承载文件存在 ⇒ 计入检出；承载文件被同批删除型错误删除 ⇒ 记为不可观测（与 P5 一致，共 4 项）。
- 标准包基线自检：`{router:true, pinia:true, antd:true, push:true, patch:true, dataIndexEmail:true}` ⇒ 新规则**不会**让标准包失分（不会破坏校准）。
- 假阳性：12 份应满分样本 **12/12 通过**，`falsePositives = 0`。

## 附录 B：注入变换表（`checkerFaultInjector.js` 的 18 类，本轮逐份 diff 实测形态）

| ID | 层 | 严重度 | 变换（标准包 → 变体） | 承载文件 | 目标规则应指向 | 实例数 |
|---|---|---|---|---|---|---|
| S1 | 静态 | 致命 | 删除 `src/views/Login.vue` | — | `src/views/Login.vue` | 7 |
| S2 | 静态 | 致命 | 删除 `src/stores/user.js` | — | `src/stores/user.js` | 6 |
| S3 | 静态 | 重要 | 删除 `src/components/UserList.vue` | — | 该文件 | 9 |
| S4 | 静态 | 重要 | 删除 `src/views/User.vue` | — | 该文件 | 14 |
| S5 | 静态 | 致命 | `import Login from '@/views/Login.vue'` → `'@/views/LoginPage.vue'` | src/router/index.js | 该文件 | 7 |
| S6 | 静态 | 致命 | `from '@/stores/user'` → `'@/stores/users'` | src/views/Login.vue | 该文件 | 5 |
| S7 | 静态 | 致命 | `app.use(createPinia())` → `// app.use(createPinia())` | src/main.js | 该文件 | 6 |
| S8 | 静态 | 致命 | `app.use(router)` → `// app.use(router)` | src/main.js | 该文件 | 9 |
| S9 | 静态 | 重要 | `app.use(Antd)` → `// app.use(Antd)` | src/main.js | 该文件 | 7 |
| L1 | 语义 | 致命 | `onSubmit` 函数体首行插入 `return;` | src/views/Login.vue | 该文件 | 9 |
| L3 | 语义 | 重要 | `router.push({ name: 'User' })` → `// push removed` | src/views/Login.vue | 该文件 | 7 |
| L4 | 语义 | 重要 | `userStore.$patch(responseUser.value)` → `// patch removed` | src/views/Login.vue | 该文件 | 2 |
| L5 | 语义 | 重要 | `catch(error => {...})` 函数体首行插入 `return;` | src/views/Login.vue | 该文件 | 7 |
| L2 | 语义 | 重要 | 密码 `pattern` 由 `/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,20}$/` 改为 `/.*/` | src/views/Login.vue | 该文件 | 3 |
| H1 | 半静态 | 次要 | `UserList.vue` 表格列整行删除（含 `email`） | src/components/UserList.vue | 该文件 | 5 |
| H2 | 半静态 | 次要 | `dataIndex: 'email'` → `'emial'`（`key:'email'` 保留） | src/components/UserList.vue | 该文件 | 4 |
| F1 | 规范 | 次要 | 删除 `stores/user.js` 的 3 条注释（14 → 11 处 `//`） | src/stores/user.js | 该文件（建议转主观） | 7 |
| F2 | 规范 | 次要 | `userStore` → `x`（含引用同步改名） | src/views/Login.vue | 该文件 | 8 |

> 生成器侧的 `applicable(projectRoot)` 判据：目标文件/行存在且形态匹配（例如 `src/main.js` 中存在 `<ident>.use(...)`），否则 skipped 并从门禁分母中剔除——**绝不允许"因为注入不了所以算通过"**。
