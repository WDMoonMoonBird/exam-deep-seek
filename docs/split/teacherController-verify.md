> ## ⚠️ Captain 裁定（2026-10-11 15:20）：所报「越界」**不成立为 B 的越界**，实为规则措辞歧义
>
> C 指出 `67a0053` 改了 `scripts/gates/arch-metrics.mjs` 的基线（43→42 / 2→1 / 13→12）、未登记，且与 B 报告 §9 的「基线=43」不一致，
> 并据任务书里的「不得碰 `scripts/gates/*`」判为越界。**该观察本身是准确的**（确实有改动、确实与报告不一致），但归因需更正：
>
> 1. **改基线的是 Captain，不是 B** —— 见 `docs/plan/2026-10-11-godfile-split-plan.md` 的收尾流程：
>    「[判定] 通过 → 提交该步 + **刷新 arch 基线** + 进下一步」，以及 §5 判据表「每步后**刷新基线**（P1-4）」。
>    这是**既定流程**，且 `git log -- scripts/gates/arch-metrics.mjs` 显示**每一步**的拆分提交都伴随基线刷新（step3/4/5/6/7/8/9 无一例外）。
> 2. **「不得碰 gates」的适用对象是执行 Agent**（防止写者削弱自己的门禁），**Captain 收尾刷新不在其列**；
>    且二者方向相反：Agent 可能放松判据，Captain 是**收紧棘轮**（代码变好、基线随之变严）。
> 3. **因此不需要 B 补登记 D10** —— 让 B 登记一件不是它做的改动会造成**错误归因**；改由本注记 + 计划书的措辞澄清共同留痕。
>
> ★**C 的这条观察仍有价值**：它暴露了任务书措辞的歧义（验证者会把它读成越界），已修正为
> 「不得改 `scripts/gates/*`（**Captain 收尾刷新 arch 基线除外**）」。**这类「规则没写清适用对象」的缺陷，靠 C 的独立审视才被发现。**
# teacherController 拆分独立验证报告（GodFile 拆分专项 · step 9 · Agent C · 最终验证）

- **被验对象**：`67a0053`（step 9 产品提交：teacherController.js 1336 行 → 12 文件）＋ 基准 `2e63a56`（D2 补测）
- **验证者**：Agent C（独立验证 / 对抗性）｜ **立场**：不采信 Agent B 自测，全部判据**自建装置**复算；主动证伪
- **日期**：2026-10-11 ｜ **技能**：tech-test-automation
- **方案**：`docs/split/teacherController-plan.md` ｜ **B 的落地记录**：`docs/split/teacherController-refactor.md` ｜ **上轮**：`docs/split/teacherController-B0-B0b-verify.md`
- **装置**：全部落在 `/tmp/c9/`（`w3*.mjs` `w5.mjs` `w7.mjs` `w12b.mjs` `negctl.mjs` `covdiff.mjs` `mutate.mjs` `probe/run.mjs` `stub/prisma.js` `cruns.sh` …），**仓库内零新增脚本**；唯一写入 = 本报告 + `docs/split/test-round-23.log`
- **约束遵守**：纯只读（除本报告与回归日志）｜ **无任何 git 写操作**（无 clean/stash/checkout -- . /reset --hard/restore，无提交）｜ **未联网**、未装依赖 ｜ 未碰 :5173/:3000、`client/dist`、`tests/` ｜ 测试一律 `PORT=0` + `exam_system_test` ｜ **未刷新 lint 基线**

---

## V1 版本锚点（自证）

| # | 判据 | 期望 | **实测** | 结论 |
|---|---|---|---|---|
| 1 | `git rev-parse HEAD` | `67a0053` | `67a00532923c28feff711be8f2e97e31bf659188` | ✅ |
| 2 | `git status --porcelain -uno` | 空 | **空** | ✅ |
| 3 | 拆前基准 sha256 | `30793987…` | `307939875e16654f5c435eb923309292443737291131f682e984cc00c4b36823`（`git show 2e63a56:…`） | ✅ |
| 4 | 拆前基准行数 | 1336 | **1336** | ✅ |
| 5 | `2e63a56` 内容 | 仅 D2 补测 | `M server/test/integration/tc-b0-switch-class-school.test.js`（唯一 1 文件） | ✅ |
| 6 | 旧 `routes/teacher.js:4` | `import * as teacher from '../controllers/teacherController.js';` | 逐字相同 | ✅ |
| 7 | 源文件现状 | 已删 | `ls` = No such file | ✅ |
| 8 | 新树 12 文件总行数 | 1448 | **1448**（最大 399 ≪ 800） | ✅ |
| 9 | 本轮提交改动面（`git diff --name-status 2e63a56 67a0053`） | 12 新 + 3 改 + 1 删 + 报告 | 13 A（12 新 + 报告）/ 3 M（`routes/teacher.js`、`assignment-q9-branches.test.js`、**`scripts/gates/arch-metrics.mjs`**）/ 1 D | ⚠️ **见 D-C1** |

---

## V2 判据总表（判据 → 期望 → 实测 → 结论）

| # | 判据 | 期望 | **实测** | 结论 |
|---|---|---|---|---|
| W3 | 43 块逐块判等 | 41 全等 + 2 块各 1 行 | **41 全等 + 2 块各仅 1 行**（唯一差异 = 函数体内动态 import 规格符）；OTHER = **0** | ✅ |
| W4 | 反向校验：未匹配非空白字节 | 0 | **12/12 文件 = 0**；行号守恒 **1313 + 12 + 11 = 1336**（无重叠、11 行全空白） | ✅ |
| W5 | 导出面 30 名逐字等价 | 30 == T8∪T12 | 旧 **30** == 并集 **30**（名字逐字相等）；**T8=26 / T12=4 / ∩=∅ / spread=30=并集** | ✅ |
| W5b | `gradeProject` 不在导出面 | 不在 | 旧树、T8、T12、合并对象**四处皆 false** | ✅ |
| W5c | I1 的 29 个 `teacher.X` 全为 function | 29/29 | **29/29 全 `typeof === 'function'`**；合并键数 30；唯一未被路由使用 = `getMyClasses`（既有孤儿） | ✅ |
| W8 | 路由体 29 行逐字相同 | 逐字节 | `diff` **空**；整文件唯一差异 = 第 4 行 → 3 行 | ✅ |
| W7 | interface → infrastructure（spec 级） | 0 | **0**（AST 口径，14 个 interface .js 全部 import/re-export/动态 import 规格符解析） | ✅ |
| **W2** | **D2 闭环：放宽变异必红且红面唯一** | 1 failed（仅 T-A8） | 对照 **8/8 绿**；变异 **1 failed / 7 passed**，唯一红例 = **T-A8**，文案 `无权操作`→`你不属于目标学校` | ✅ |
| W9 | I2 真跑 | 0 failed | **9 passed / 0 failed**（实测 **9** 例，plan 写 13 → 确认 B 的 D4） | ✅ |
| W11 | lint 迁移三元组 | gradeProject 迁移、31→29、未刷新 | `--json` 迁移条目逐字命中；**31 → 29**、resolved 4、fresh/blocking **0**、exit 0；基线 sha `678d3d51…` / mtime `Oct 11 13:22:03` **未变** | ✅ |
| W12 | 路径探针 | 3 根同绝对路径、深度无关、无漂移目录 | 3 根 EQUAL；5 站点表达式与值**逐字相同**；镜像树副作用落位正确；漂移目录 **0**；**负控有牙** | ✅ |
| **W13** | **四维对拍** | 0 差异 | **101 例 / 4 维 / 0 差异**；装置自检 0 差异；fetch 9 次全回环、真实外呼 **0** | ✅ |
| W13b | 变异反证 ≥3 处 | 必报差异 | **5/5 全部报差异**（M1–M5）；惰性对照 **0 差异** | ✅ |
| W13c | 刻意存活探针 | 如实登记 | **存活**（0 差异）⇒ 覆盖盲区 1 处，已登记 | ⚠️ 见 §V7 |
| W15 | 门禁七项 | 见下 | 7/7 达标 | ✅ |
| W15b | 全量回归 | 4 段摘要 + failed=0 | 第 1 次 1 failed（环境性偶发，已隔离定性）→ 第 2 次 **4 段摘要 + failed=0 + 1121 例** | ✅ |
| W16 | 越界自查 | 仅计划内文件 | 计划内 16 项 **+ 1 项未登记越界**（`scripts/gates/arch-metrics.mjs`） | ⚠️ **D-C1** |

---

## V3 W3 / W4 逐块判等（自建装置，未复用 B 的脚本）

**装置**：acorn 取改前树 43 个顶层声明（9 `function` + 30 `export const` + `gradeProject` + `uploadDir`/`storage`/`upload`），在 12 个新文件中**按名字**定位同名声明，比对**声明字节**（`node.start..node.end`，排除前导注释，避免把新 banner 误算进块）。

### 3.1 结果：**41 全等 + 2 块各仅 1 行不同 + 0 其他**

| 块 | 源行 | 新位置 | 差异行 | 旧 → 新 |
|---|---|---|---|---|
| `getProjectFiles` | `:137` | `questions.js:69`（块内第 14 行） | **1 行** | `await import('../utils/fileTree.js')` → `await import('../../../../utils/fileTree.js')` |
| `gradeProject` | `:204` | `grade.js:59`（块内第 46 行） | **1 行** | `await import('../infrastructure/ai/deepseek/index.js')` → `await import('../ai/deepseek/index.js')` |

其余 **41 块逐字节相同**（含 `code:1007`、`:201` 的 ES6 简写 `{ code: 1001, message, data: null }`、`gradeProject` 全 60 行、`switchClassSchool` 全 56 行）。

### 3.2 ★独立判定：「这 2 处只能搬移时改」——**成立**

**（a）解析必然性（我在两棵树上逐条求值，含反事实）**

| 站点 | 旧宿主 `src/controllers/` + 旧规格符 | 新宿主 + 新规格符 | 反事实①：新宿主保留旧规格符 | 反事实②：旧宿主换成新规格符 |
|---|---|---|---|---|
| `:137` fileTree | `../utils/fileTree.js` → `src/utils/fileTree.js` **EXISTS** | `../../../../utils/fileTree.js` → `src/utils/fileTree.js` **EXISTS** | → `src/interface/http/controllers/utils/fileTree.js` **MISSING** | → `<repo>/utils/fileTree.js` **MISSING** |
| `:204` deepseek | `../infrastructure/ai/deepseek/index.js` → `src/infrastructure/ai/deepseek/index.js` **EXISTS** | `../ai/deepseek/index.js` → `src/infrastructure/ai/deepseek/index.js` **EXISTS** | → `src/infrastructure/infrastructure/ai/deepseek/index.js` **MISSING** | → `src/ai/deepseek/index.js` **MISSING** |

⇒ **换宿主必须换规格符，且换规格符后解析回同一绝对路径（模块身份不变）**；两条反事实都指向不存在的文件。**B0b 阶段（源文件仍在 `controllers/`）若改成新深度，源文件自身立刻 ERR_MODULE_NOT_FOUND** —— 所以这两行**只能与搬移同时发生**。B 对 Captain 任务书「本轮无例外」的更正**成立**，A 的方案（plan §6.4 / §10-B2/B7 明文要求改写）本来就是对的。

**（b）它们属「import 行」而非「函数体改写」**：`check-layers.mjs` 的 `IMPORT_RE` 第三分支即 `import\s*\(`，两条动态 import 与静态 import 同桶；plan §7.7 的豁免表 X1/X2 也把这两行列入。

### 3.3 反向校验（我自建的三重独立口径）

| 口径 | 方法 | 实测 |
|---|---|---|
| **① 未匹配非空白字节** | 逐文件把「命中块 + import 声明/动态 import + 全部注释 + `export {}` 块」标为可归因，其余非空白字节计数 | **12/12 文件 = 0**（含两个 barrel）；唯一曾报 70 字节的是 `uploads.js:15` 的顶层 `if (!fs.existsSync(uploadDir)) fs.mkdirSync(...)`——它**不是 43 块之一**，我另行断言它与源 `:1292` **逐字相同** |
| **② 双向行多重集** | 源「非空白且非 import」行（**1190**）与目标「非空白且非 banner/import/export 块」行（**1190**）做多重集比对；先把 2 行动态 import 归一化回旧文本 | **source-only = 0，target-only = 0** ⇒ 无增行、无丢行、无重复行 |
| **③ 行号守恒** | 用 plan §6.2 的 13 个源区间求并集 | 搬移 **1313** + import **12** + 未搬移 **11** = **1336**；未覆盖行恰为 `12,68,82,371,423,810,829,1002,1286,1287,1321`（**11 行全为空白**）、无重叠 |
| **④ 注释溯源** | 每个新文件的注释：非 banner 者必须逐字存在于源文件 | **外来注释 = 0**；源注释 120 条**全部**在新树逐字出现；目标非 banner 注释 = 120 = 源 120 ⇒ 新增注释**只有 12 条文件 banner** |

⇒ **「除 12 行 banner + 1 处 export{} 块外，新树不含任何非搬移字节」成立**。

---

## V4 W5 / W8 导出面与路由契约（真 import）

**装置**：`/tmp/c9/T-before` = `git archive 2e63a56 server`（控制器 sha 前置断言 `30793987…`✅），与工作树**同进程对拍**（这是唯一能同时 import 旧新的时刻；源文件已删 ⇒ 用冻结副本重建）。

```
W5 OLD(teacherController) count = 30
W5 T8 count = 26   T12 count = 4
W5 T8∩T12 = [] (size 0)
W5 union size = 30   merged(spread) size = 30
W5 spread == union : true
W5 OLD == union (逐字名比较): true
W5 OLD-names-not-in-new: []     new-names-not-in-OLD: []
W5 gradeProject in OLD? false | in T8? false | in T12? false | in merged? false
W5 非 function 的合并值: []   （30/30 全为 function）
I1 teacher.X distinct names = 29   I1 missing-or-not-function = []
I1 merged key count = 30          I1 exported-but-unused-by-routes = ["getMyClasses"]
```

- **无静默遮蔽**：`T8∩T12 = ∅` 且 `{...T8,...T12}` 的 30 个键 == 并集 == 旧 30 名（**逐字**），⇒ `{...}` 合并没有覆盖任何同名导出；I1 使用的 29 个名字**全部**在合并对象上 `typeof === 'function'`（缺失 0）。
- **路由契约**：`diff <(旧 teacher. 行) <(新 teacher. 行)` = **空**（29 行逐字节）；整个 `routes/teacher.js` 的**唯一差异**是第 4 行 → 3 行；`router.use(auth, requireRole('teacher'))` 与挂载前缀未动。
- **barrel 纪律（人读 + AST）**：interface barrel 6 行 `export … from './xxx.js'`（全部同层）、infra barrel 3 行；两 barrel **均无 `import`、无逻辑**；全 12 文件 `export *` = **0**、`export default` = **0**、`export function` = **0**、`export const` = **30**；`export {}` 块**仅** `guards.js`（6 个守卫名）；`./guards.js` 被 **4** 个同层文件导入。

---

## V5 W7 interface 红线（★方法：AST，不用裸 grep）

**方法**：acorn 解析 `server/src/interface/**` 全部 **14** 个 `.js`，收集 ① `ImportDeclaration.source` ② `ExportNamedDeclaration/ExportAllDeclaration.source` ③ **全 AST 遍历** `ImportExpression`/`import()` 的**字面量**参数；对每条规格符用**文件所在目录**做 `path.resolve`，判断落点是否在 `server/src/infrastructure` 下。

- **interface → infrastructure 命中 = 0**（14 文件全绿）。
- 8 个 teacher/interface 文件的实际 import（逐条人读）：`../../../../utils/{prisma,logger,scoring,projectPaths,fileTree}.js`、`../../../../domain/errors.js`、`../../../../controllers/teamController.js`、`fs`/`path`/`bcryptjs`（黑名单/内置）、同层 `./guards.js` —— **无一条指向 infrastructure**。
- **文本口径对照（提醒勿用裸 grep）**：`interface/**` 里 `infrastructure` 字样共 **2** 处（两个 barrel 的 banner 纪律提示语）。另外 `grep -rn 'teacherController\.js' server/src server/test` = **14** 命中 = **12 条新文件 banner + 2 条既有测试注释**（`question.test.js:154`、`e2e/global.setup.js:60`，均为历史行号注释，非规格符）；**规格符口径 = 0**。（B 记「12 = 12 条 banner」，少算了测试注释那 2 条 → 低级别文档口径差，见 D-C2。）

---

## V6 ★W2 D2 闭环复核（我上一轮挖出的缺口的最终验收）

**装置**：`/tmp/c9/pristine`（工作树副本，未变异）与 `/tmp/c9/mut`（同副本 + 变异），**变异前断言锚点出现次数恰为 1**，变异只写 `/tmp`。

```
锚点（classes.js:145）: const tc = await prisma.teacherClass.findFirst({ where: { teacherId: req.user.id, classId } });
变异后            : … findFirst({ where: { teacherId: req.user.id } });     ← {teacherId,classId} 放宽为 {teacherId}
mutated sha256    : 040461bfdc64fe7b…
```

| 树 | 结果 | 红面 |
|---|---|---|
| **对照（正确代码）** | `Test Suites: 1 passed` / `Tests: 8 passed, 8 total` | — |
| **变异（放宽守卫）** | `Test Suites: 1 failed` / `Tests: **1 failed, 7 passed**, 8 total` | **恰为 T-A8**（`✕ T-A8 ★classId 作用域…`），其余 7 例全绿 |

失败明细与我上一轮预测**逐字一致**：
```
- Expected  - 1     "message": "无权操作"
+ Received  + 1     "message": "你不属于目标学校"
  178 |     expect(res.body).toEqual({ code: 1003, message: '无权操作', data: null });
```

⇒ **D2 闭环成立**：靶点已从旧树 `:963` 迁到新树 `classes.js:145`，**放宽变异在新树上依然必红，且红面唯一**。B 在 `2e63a56` 的补测是**真封堵**，不是「跑绿即过」。

---

## V7 W9 / W11 / W12 三处装置复核

### 7.1 W9 · I2 真跑（bind-check 的盲区补位）

`server/test/unit/assignment-q9-branches.test.js:41` 是**全仓唯一动态 import 控制器路径**的调用方：
```
const { createAssignment } = await import('../../src/interface/http/controllers/teacher/assignments.js');
```
真跑：`Test Suites: 1 passed` / `Tests: **9 passed**, 9 total`（`grep -c '  it('` = 9）。⇒ **实测 9 例**，**不是 plan 的 13**（B 的 D4 属实）。该套件对 bind-check 只是 `unresolved（仅登记）`，**拦不住漏改** ⇒ 本项是承重判据，已真跑。

### 7.2 W11 · lint 迁移三元组（人工核对「搬运而非修一处加一处」）

`node scripts/gates/lint-check.mjs --json` 的 `migrations` 数组中，本轮条目**逐字**为：
```json
{ "rule": "no-unused-vars", "symbol": "gradeProject",
  "text": "const gradeProject = async (req, res) => {", "count": 1,
  "from": [{ "file": "server/src/controllers/teacherController.js", "line": 159 }],
  "to":   [{ "file": "server/src/infrastructure/teacher/grade.js",        "line": 14  }] }
```

| 项 | 旧树（2e63a56） | 新树 | 判定 |
|---|---|---|---|
| `gradeProject` 出现位置 | `:159`（声明）+ `:204`（**属性名**） | `grade.js:14`（声明）+ `:59`（**属性名**） | **一一对应，无新增** |
| 声明行**文本 sha256** | `5aca4ce426bbe2e47152f6710d96778c292e587c6fb2a6c0558a47ebfe0598b1` | **同一 sha**（`grade.js:14`） | ✅ 逐字搬运 |
| 导出面 | — | `grade.js` 的 `Object.keys()` **不含** `gradeProject` | ✅ 未加 export |
| eslint | 本模块 3 条 warn | 216 文件 **0 error / 57 warn**，本模块仅 `grade.js:14 no-unused-vars` | ✅ 同一缺陷换宿主 |

**计数三元组**：基线 **31 → 当前 29**；`resolved` 4 条（本轮 `gradeProject` + step8 `count` + 两个死绑定）；**fresh / blocking = 0**；`verdict = PASS`、exit 0；**基线文件 sha `678d3d51af0f446b4e2c7e2c2226c2c3f9915b1572393651efff93812f81804c`、mtime `Oct 11 13:22:03 2026` 均未变** ⇒ **未执行 `--update-baseline`**。

### 7.3 W12 · 路径探针（B0b 的延续，含负控）

| 判据 | 实测 |
|---|---|
| **3 个根（真 import `utils/projectPaths.js`）** | `<repo>/server/uploads` / `…/uploads/projects` / `…/uploads/project-questions` ⇒ **与期望逐字相同** |
| **5 个路径站点** | 表达式与求值结果在 2e63a56 与工作树之间 **5/5 逐字相同**（`getProjectFiles.dir` / `gradeProject.standardDir` / `createQuestion.projectsRoot` / `createQuestion.destDir` / `uploadDir`） |
| **独立回溯到 pre-B0b（c3b9e3f）的 `__dirname` 语义** | 用旧表达式 `path.join(__dirname,'../../uploads',…)` + `__dirname=<repo>/server/src/controllers` 求值，与现状**5/5 EQUAL** ⇒ 常量化前后**值不变** |
| **宿主深度依赖** | 10 个内容文件中 `__dirname`/`fileURLToPath`/`process.cwd` = **0/0/0** |
| **★副作用实测（不是表达式求值）** | 镜像树 `/tmp/c9/depth/proj`：**先删掉 `server/uploads`**，再 import `infrastructure/teacher/index.js` ⇒ `server/uploads/materials` **被 `mkdirSync` 重建**，且落在 **projectPaths 推定的根**（而非任何错误深度） |
| **漂移目录** | `<repo>/server/src/**/uploads` = **0**；镜像树同项 = **0** |
| **★负控（装置有牙）** | 第三个镜像把 `uploads.js` **退回 `__dirname` 形态**（`path.join(__dirname,'../../uploads/materials')`，新宿主深度）⇒ **正确目录不存在**（false）、**漂移目录 `server/src/uploads` 出现**（1 个）⇒ 探针有分辨力，且反证「常量化是承重的」 |

---

## V8 ★W13 行为对拍（本轮最核心的行为证据）

**装置**（自建，未复用 B 的任何脚本）：`/tmp/c9/probe/run.mjs` + `/tmp/c9/stub/prisma.js`（同一份字节注入两棵树）。
- **S-A 网络桩（承重）**：探针**首行**即 `globalThis.fetch = …`（早于任何树内模块 import），记录 `{url, body}`；叠加 `DEEPSEEK_BASE_URL=http://127.0.0.1:9`；桩支持**流式**（`body.getReader()` 分 3 片 SSE + `[DONE]`）与**失败态**（503）。
- **S-B DB 桩**：内存替身覆盖 `server/src/utils/prisma.js`（两树同字节），实现 15 个 model × 11 种操作（`findMany/findFirst/findUnique/create/update/upsert/delete/deleteMany/createMany/count/groupBy` + `$transaction`）、`where` 比较子（`in/not/lt/lte/gt/gte/contains/AND/OR`）、**关系过滤**（`some/none/every` + to-one 嵌套）、`select/include/_count/_max/orderBy/skip/take/复合唯一键`；`user.username` 有唯一约束（抛 `code:'P2002'`）。
- **S-C 时钟桩**：`Date` 冻结在 `2026-01-15T00:00:00Z`（构造器无参 + `Date.now`）；**另冻结 `Math.random`**（否则上传文件名的随机后缀使对拍不确定）；**再补一处 B 未提到的必需桩：`bcryptjs` 的随机盐** —— 用**树内锚点模块** `export { default } from 'bcryptjs'` 拿到与控制器**同一个模块实例**并替换 `hashSync/hash/compareSync/compare`（直接 patch `node_modules` 会写进仓库，已避开；`require.resolve` 拿到的是 `umd/index.js`，与 ESM `import` 条件解析的 `index.js` **不是同一个对象** —— 这是我第一版装置 12 例假差异的根因）。
- **两独立进程**：BEFORE = `git archive 2e63a56 server` 重建 `/tmp/c9/T-before`（控制器 sha 前置断言 `30793987…`✅）→ `import …/controllers/teacherController.js`；AFTER = `/tmp/c9/T-after`（工作树副本）→ 两个 barrel 用 `{...http, ...io}` 合并。

### 8.1 判据结果

| 判据 | 期望 | **实测** |
|---|---|---|
| 用例数 / 覆盖 handler | ≥15 条路由 | **101 例 / 30 个 handler**（29 条路由 **全覆盖** + 无路由孤儿 `getMyClasses`） |
| **装置自检（before 连跑 2 次）** | 必须相等 | **0 例差异**（101/101 全等）⇒ 装置确定 |
| **before vs after（四维）** | 0 差异 | **0 例差异**（逐例比 `status/body/headers/rawText/jsonCalls/ended/writes/db/log/fetch/ucLog/files/fileHashes/dirs/error`） |
| 有序调用日志 | 逐条相等 | **233 条 prisma 操作**两侧逐字相等（含 `$transaction` 内外顺序、`getAssignments` 的 4 组聚合顺序） |
| fetch 请求体 | 逐字节 + 硬禁网 | **9 次 fetch**，`body` 长度 `[2480, 2480, 82479, 2490, 2505, 471]` 两侧相等；**URL 全部 = `http://127.0.0.1:9/v1/chat/completions`**、**真实外呼 `realFetchCalls = 0`** |
| 状态码分布 | — | `{200:52, 400:18, 403:17, 404:11, 500:3}`；body code `{0:45, 1001:17, 1003:16, 1004:11, 1007:1, 2001:6}` |

### 8.2 任务书点名的四类必测（全部命中）

| 必测项 | 实测 |
|---|---|
| **403 / `code:1003`（16 处）** | **17 个 403 响应**，文案 `无权操作`×15 + `无权操作当前学校`×1 + `你不属于目标学校`×1；**差分覆盖率口径下 16/16 个 `res.status(403)` 站点全部真执行**（逐站点 delta 已打印） |
| **`code:1007`（Q9 软确认）** | `createAssignment:1007` → 400 + `code:1007` + `data:{requiresConfirmation:true, warnings:[…]}`（长文案逐字、`title` 与 `questionId` 正确）；`confirmWithoutStandardPackage:true` → 200 正常创建 |
| **`uploadMaterial` 磁盘副作用** | 三态：无文件 → 400 `未选择文件`；`.txt` → 400 `仅支持 zip 文件`（fileFilter）；`.zip` → 200 `上传成功` + `data.url`，**磁盘真的出现文件**（名称 `1768435200000_4fzzzxjylrx.zip`、大小 11、sha 前 16 `bf623c88aeeeff29`，两侧逐字相同） |
| **`parseExamStream` SSE 四态** | ① 空内容 → 400（无 header、无 write）；② 正常 → 200 + **4 个 header 逐字**（`Content-Type: text/event-stream`/`Cache-Control: no-cache`/`Connection: keep-alive`/`X-Accel-Buffering: no`）+ **8 次 write**，phase 有序 `start → connecting → streaming → token×3 → parsing → done` + `end()`；③ 桩抛错 → **`phase:'error'`** + `end()`（`start → connecting → error`）；④ `data: ` 前缀 + 双换行格式由 `rawText` 逐字节比对 |

另外 `getProjectFiles:realdir` 用**真实目录 + 真实文件**打通（`attachmentUrl = project-questions/500/standard`，含子目录 `sub/b.py`），⇒ **函数体内那条动态 import（fileTree.js）被真实执行**（不是静态判等能覆盖的）。

### 8.3 变异反证（我自建 5 处，与 B 的设计不同）

| # | 变异 | 预期 | **实测** | 结论 |
|---|---|---|---|---|
| **M1** | `guards.js:24` `visibleIds.includes(+classId)` → `true`（classId 作用域失效） | 403 家族变红 | **29 例差异**，维度 `{status:4, body:4, db:29, log:4}` | ✅ |
| **M2** | `assignments.js:343` `!== true` → `=== true`（Q9 取反） | `1007` 与 confirm 变红 | **2 例**（`createAssignment:1007`、`:confirm`），`{status:2, body:2, db:1, log:2}` | ✅ |
| **M3** | `exam-parse.js:44` `'X-Accel-Buffering': 'no'` → `'yes'` | 仅 header 维度 | **2 例**，维度**仅 `headers`** | ✅ 维度分辨力精确 |
| **M4** | `uploads.js:31` `'.zip'` → `'.rar'` | 上传正例变红 + 无落盘 | **1 例**（`uploadMaterial:ok`），`{status, body, files, fileHashes}` | ✅ |
| **M5** | `classes.js:153/154` 两条**全仓唯一文案互换** | 文案维度 | **2 例**（`403oldschool`/`403newschool`），**仅 `body`** | ✅ 文案级敏感 |
| **P0** | **惰性对照**：副本**零变异** | 0 差异 | **0 例差异** | ✅ 无假阳性 |

### 8.4 ★刻意存活探针（如实登记覆盖盲区）

**探针 X1**：`assignments.js:84` `acc.reviewPending += row.mode === 'practice' ? 0 : r.reviewPending;` → `acc.reviewPending += r.reviewPending;`（即**抹掉「practice 行待审核恒 0」的语义**）。

**结果：0 例差异 ⇒ 探针存活（未 RED）。** 根因：我的夹具里 `getPendingSummary` 的 `reviewPending` **在任何路径下都是 0**（无 `status='ai_graded'`、也无「已提交未审」的历史行能把它抬到非 0），因此「practice 归零」与「不归零」**在本装置里不可分辨**。这正是 plan §7.5 反证①（`:494`）指的同一处语义 —— **B 的 F14/F18 夹具若含非 0 pendingReview 则能钉住它**；我的装置在这一条上是**盲的**，如实计入残留风险（§V11-R3）。

### 8.5 两张清单（★差分覆盖率口径，非「外层 range」口径）

**方法**：同一 AFTER 树跑两次 —— 带 101 例矩阵 vs `COV_EMPTY=1`（0 例基线），用 `NODE_V8_COVERAGE` 采两遍，**逐行相减**；某行 delta>0 才算「被矩阵执行」。这消除了「模块顶层 range 覆盖全文件」的假绿（我第一版用「最内层 range」直接判定时，**死代码 `gradeProject` 也被报成已执行** —— 与上轮同一陷阱）。

| 分类 | 数量 | 明细 |
|---|---|---|
| **被执行的顶层具名单元** | **40 / 43** | 6 个守卫 + `switchSchool` + 6 个题库 + 8 个作业 + `getAllTeachers` + 6 个班级 + 7 个学生 + `parseExam`/`parseExamStream` + `generateReference` + `storage`/`upload`/`uploadMaterial`（每条的 `deltaLines`/`maxDelta` 已打印，如 `switchClassSchool` lines=56 delta=56 max=19、`parseExamStream` delta=28 max=14） |
| **未被矩阵执行的** | **3** | ① `rollupRow`（`assignments.js:24-36`，delta=0 —— 我的提交记录没触发到逐行 rollup）；② `gradeProject`（`grade.js:14-73`，delta=0 —— **死代码**，无路由无消费者，plan §1.5-1 已登记）；③ `uploadDir`（`uploads.js:14`，delta=0 —— **模块加载期**执行，两次运行都有 ⇒ 差分恒 0；其正确性由 **W12 副作用探针**独立证明：删掉 `uploads` 后 import 会重建 `…/uploads/materials`，且 `uploadMaterial` 真的把文件写进该目录） |
| **`res.status(403)` 站点** | **16 / 16** | 逐站点 delta：`assignments.js:318=5, :387=10`；`classes.js:59=5, :62=5, :87=4, :92=3, :113=3, :146=15, :153=13, :154=10`；`students.js:74=8, :80=5, :128=3, :150=5, :181=5, :214=4` |

---

## V9 ★观察项调查（B 的 §12-D5 瞬时失败）——**未能复现**，但**在另一个套件复现了同类抖动**

### 9.1 我做了什么（次数与方式全部列出）

| 方式 | 次数 | 结果 |
|---|---|---|
| **当前新树** `question.test.js` 单跑 | **6** | 6/6 `Tests: 13 passed, 13 total` |
| **冻结 before 树**（`git archive 2e63a56 server`，控制器 sha `30793987…`）单跑 | **2** | 2/2 `13 passed` |
| **序列复现**（`ownership-guards`(62 例) → `question`） | **1** | `13 passed` |
| 长序列复现（7 套件 → `question`）× 2 轮 | **2** | `question` 2/2 `13 passed` |
| 长序列复现（8 套件 → `question`）× 2 轮（§9.3-B） | **2** | 2/2 `13 passed` |
| 追加单跑（§9.3-C） | **5** | 5/5 `13 passed` |
| **合计** | **18 次** | `question.test.js` **0 次失败** |

⇒ **对 B 报的 `question.test.js` 1 failed / 12 passed：我在新树 + 冻结前树共 18 次尝试中一次也没复现**（无断言明细可给，因为没有失败可抓）。**不使用「应该没问题」代替结论**：结论就是**未能复现**，方法/次数如上。

### 9.2 ★但我在长序列里抓到了**同类抖动**（B 未看到的一手证据）

第 2 轮长序列中：`tc-b0-project-files -> Tests: 1 failed, 3 passed, 4 total`（同轮其它 6 套件全绿，`question` 13/13 绿）。同一长序列的第 1 轮该套件 4/4 绿。

- **意义**：抖动**不是 `question.test.js` 专属**，而是**环境级**的、可落在其它套件上 —— 这与 B 的「环境抖动、非拆分回归」结论**同向**，并且**修正了归因**（不应该把观察项绑在某一个套件上）。
- **它同样不是拆分回归**（证据边界写明）：该失败发生在**新树**的长序列第 2 轮，**同轮其它 6 个套件全绿、第 1 轮该套件 4/4 绿**；**我未在冻结 before 树上单跑该套件**，因此这条的「跨树」证据不成立，能成立的是**「同树、同命令、跨轮次不稳定」**。
- **后续复跑**（见 §9.3）：`tc-b0-project-files` 连跑 10 次 + 长序列 2 轮（含捕获完整输出）—— **一次都没再现**。

### 9.3 定向复跑（捕获完整输出）：`tc-b0-project-files` × 10 + 长序列 × 2 —— **全部绿，抖动不可复现**

| 方式 | 次数 | 结果 |
|---|---|---|
| `tc-b0-project-files` 单跑（每次完整输出 + 失败即落盘） | **10** | **10/10 `4 passed, 4 total`**（T-C1/C2/C3/C4 逐例绿）；**未捕获到任何失败**（`flake-*.log` 一个都没生成） |
| 长序列（7 套件 → `question`）× 2 轮 | **2** | 两轮 8 个套件**全绿**：8 / 3 / 4 / 4 / 3 / 2 / 62 / 13 例 |
| `question.test.js` 追加 | **5** | 5/5 `13 passed` |

⇒ **观测到的那 1 次 `tc-b0-project-files` 失败，在 12 次后续尝试中一次都没再现** ⇒ 与 B 的 `question.test.js` 同判：**环境级瞬时失败**。

### 9.4 ★全量回归里抓到的**第三次**同类抖动（最强的一条一手证据）

第一次全量回归（`ROUND=23`）段 1 报 `1 failed / 1021 passed / 1022 total`，唯一红例是 **`rc-project-review-contract.test.js`** 的
`T-B2: 分值钳制`：`expect(hi.status).toBe(200)` 收到 **401**（`Received: 401`）。

**根因定位（不是拆分回归）**：
1. **请求根本没到控制器**：该端点 `PUT /api/teacher/submissions/:id/project/review` 在 `routes/teacher.js:73` 绑的是 `review.reviewProjectSubmission` —— **step 8 的 review 模块**，与 teacher 模块无关（teacher 只贡献 `teacher.*` 的 29 条，此路由不在其中）。
2. **401 来自 `src/middleware/auth.js`**：`jwt.verify(...)` 与 `prisma.user.findFirst({id, deletedAt:null})` 被**同一个 try/catch 包住**，**任何瞬时 DB 异常都会静默变成 401**「未登录或 Token 过期」—— 这正是「环境抖动」的典型签名（业务逻辑不可能产生 401）。
3. **隔离复跑全绿**：新树 **3/3** `12 passed`；**冻结 before 树（2e63a56）2/2** `12 passed`；第二次全量回归（`ROUND=24`）该套件**绿**。按项目约束包**第 15 条**（偶发失败必须隔离复跑，仍失败才算回归）⇒ **判为环境性偶发，不是回归**。

**⇒ 三次抖动的统一结论**：瞬时失败**跨三个互不相干的套件**出现过（`question.test.js`（B）、`tc-b0-project-files`（我）、`rc-project-review-contract.test.js`（我）），**每一次都在隔离复跑中消失**（含冻结 before 树的对照）⇒ **环境级、套件无关、与 step 9 拆分无关**。B 的「环境抖动」判断**正确**，但它把观察项绑在 `question.test.js` 上是**过度归因**（见 D-C3）。

---

## V10 W15 门禁与全量回归

### 10.1 门禁七项（原始读数）

```
===== [1] check-layers =====
文件 117 个，违规 0 条（0 类规则），未分层待迁移 42 个            exit=0
===== [2] arch-metrics =====
  ✓ layerViolations    基线=0   实测=0
  ✓ unmigrated         基线=42  实测=42
  ✓ godfileOver800     基线=1   实测=1
  · >500 行（观察带）   基线=12  实测=12
  GodFile >800 行：client/src/views/Doc.vue (1106)      ← 名单只剩用户有意保留的 Doc.vue
  结论：PASS                                            exit=0
===== [3a] cycle-check（server/src）=====
扫描 117 文件 / 263 条相对导入边 ｜ SCC(|S|>1): 0 ｜ 自环: 0 ｜ PASS   exit=0
===== [3b] cycle-check --root client/src =====
扫描 99 文件 / 244 条相对导入边 ｜ SCC(|S|>1): 0 ｜ 自环: 0 ｜ PASS    exit=0
===== [4] hard-metrics =====
  ✓ hex6 0/0  ✓ important 0/0  ✓ modalConfirm 0/0 ｜ PASS               exit=0
===== [5] bind-check =====
modules scanned 225 ｜ named import bindings 785 ｜ unresolved 4 ｜ external 1
BINDING VIOLATIONS: 0                                                  exit=0
===== [6] eslint =====
files=216  errors=0  warnings=57        （本模块仅 grade.js:14 no-unused-vars）  exit=0
===== [7] lint-check =====
基线 31 → 当前 29 ｜ 已迁移 2 ｜ 基线外新违规 0 ｜ 结论：PASS             exit=0
基线文件 sha 678d3d51… / mtime Oct 11 13:22:03 未变（未刷新）
```

**七项判据全部达标**：违规 **0** ｜ 未分层 **42** ｜ **GodFile 1（只剩 Doc.vue）** ｜ SCC **0**（server 263 边 / client 244 边）｜ hard **0/0/0** ｜ bind **0**（unresolved 4 / external 1 与基线一致）｜ eslint **0 error / 57 warn** ｜ lint-check **exit 0**。（与 B §9 的读数**逐项一致**，唯一差别是 arch 的 `基线=` 打印值 —— 见 **D-C1**。）

### 10.2 全量回归（`ROUND=23 LOG_DIR=docs/split bash docs/pipeline/scripts/unblock-g2.sh`）

- **先查空序号**：`docs/split/` 已有 `08–22`，取 **23**（归档不可覆盖）。
- 判据 = **4 处 `Test Suites:` 摘要 + failed = 0**；用例数应比 B0 轮 **+1**（新增 T-A8）。

**第 1 次（`ROUND=23`）**：段 1 `1 failed / 1021 passed / 1022 total` ⇒ **只有 1 处 `Test Suites:`**（四段用 `&&` 串联，段 2–4 被短路未跑）⇒ **该次不达标**。唯一红例 = `rc-project-review-contract.test.js › T-B2`（401），**已按约束包第 15 条隔离复跑并定性为环境性偶发**（§9.4）。

**第 2 次（`ROUND=24`，同一工作树、同一命令、同一基线）**：

| 段 | 套件摘要 | 用例 |
|---|---|---|
| 1（除 3 个 tree-sitter 套件外全部） | `75 passed, 75 total` | **1022 passed, 1022 total** |
| 2 `fact-extractor` | `1 passed, 1 total` | 17 passed |
| 3 `rule-executor` | `1 passed, 1 total` | 61 passed |
| 4 `rule-mutator` | `1 passed, 1 total` | 21 passed |

⇒ **4 处 `Test Suites:` 摘要齐备 + `failed = 0` + 合计 1121 例通过 + `EXIT=0`**，日志 `docs/split/test-round-24.log`。
**「用例数 +1」的落地位置**：`tc-b0-switch-class-school.test.js` 由 7 → **8** 例（新增 T-A8），我在隔离单跑中逐例确认（T-A1…T-A8 全绿，§V6）。
⇒ **W15 达标**（含一次已定性的环境性偶发，非回归；本轮**未触发**约束包第 18 条的 tree-sitter 假红）。

---

## V11 缺陷分级

| # | 级别 | 项 | 证据 | 影响 / 处置 |
|---|---|---|---|---|
| **D-C1** | **中 · 越界 + 未登记** | 提交 `67a0053` **修改了门禁脚本 `scripts/gates/arch-metrics.mjs`**（`BASELINE` 由 `{unmigrated:43, godfileOver800:2, over500:13}` 改为 `{42, 1, 12}`），**既不在声明改动面内、也未登记在 B 的 D1–D9**；且 B §9 贴的原始输出是「`基线=43 实测=42`」，与本轮**已提交脚本**（`基线=42`）**自相矛盾** | `git diff --name-status 2e63a56 67a0053` 含 `M scripts/gates/arch-metrics.mjs`；`git diff` 全文见报告；我实测 `基线=42`，B 报告 §9 写 `基线=43` | **不减判据有效性**：门禁比较式为 `actual > BASELINE ? FAIL : PASS` ⇒ 这是**棘轮收紧**（42≤43 本来就 PASS，改基线并非为了过关），且与同文件 step7/step8 的「每步刷新 + 日期注释」惯例一致；我独立复算的实测值（42/1/12）**与 check-layers 的 42 相互印证**。但 plan §10 总则#1 明文「**不得碰 `scripts/gates/*`**」⇒ **须 B 补登记（列为 D10）+ Captain 追认**；不下不为例 |
| **D-C2** | 低 · 文档口径 | 「旧路径 grep」的文本命中数：B 记 **12**，实测 **14**（12 条新文件 banner + `question.test.js:154`、`e2e/global.setup.js:60` 两条**既有**注释）；另 `interface/**` 的 `infrastructure` 字样实测 **2** 处（B 未给数） | `grep -rn 'teacherController\.js' server/src server/test` = 14 | 结论不变（**规格符口径 = 0**）；仅提示后续报告写清口径 |
| **D-C3** | 低 · 归因精化 | B 把瞬时失败绑在 `question.test.js` 上；我 **16 次尝试未复现该套件**，却另有两次同类抖动落在 `tc-b0-project-files`（长序列）与 `rc-project-review-contract`（全量回归，401）⇒ 抖动是**环境级、套件无关**（三次抖动全部在隔离复跑中消失） | §9.1–§9.4 | **不改变**「非拆分回归」的结论，反而加强；建议把观察项改写为「环境级瞬时失败（可落任意套件）」，并给 CI 加「失败即存全量 jest 输出」钩子 |
| **D-C4** | 低 · 装置提示（给后续 C） | 对拍装置若只桩 `Date` 而不桩 **`bcryptjs` 随机盐** 与 **`Math.random`**，会在 `addStudent/batchAddStudents/uploadMaterial` 上产生**假差异**（我第一版 12 例假差异即此因）；且 `require.resolve('bcryptjs')` 解析到 `umd/index.js`，与 ESM `import` 条件解析的 `index.js` **不是同一对象**，patch 无效 | 本报告 §V8 装置段落 | 供 step 10 的 C 直接复用，避免重踩 |
| — | — | 实现/契约缺陷 | — | **未发现**（W2/W3/W5/W7/W9/W11/W12/W13 全部达标） |

---

## V12 未做项与残留风险（诚实边界）

| # | 残留风险 | 说明 |
|---|---|---|
| R1 | **对拍走的是「直调 handler」，不是 HTTP 栈** | 101 例直接调用导出的 handler（`req/res` 探针），**中间件/auth/路由挂载不在本轮对拍范围**；补偿证据：29 行路由体**逐字节相同**（W8）+ 6 个 B0 契约套件走真实 supertest + 全量回归（§10.2） |
| R2 | **prisma 替身是近似** | 不建模 FK/级联/事务隔离/并发；唯一约束只实现了 `user.username`。影响面被「两侧同桩」抵消（差异仍可分辨，见 M1–M5），但**真库特有语义**（如 `P2002` 的真实触发面、`$transaction` 的部分回滚）未验 |
| R3 | **覆盖盲区（实测）** | ① `rollupRow` 未被任何用例执行；② `gradeProject` 死代码未执行（符合预期）；③ **存活探针证明**：「practice 行 reviewPending 恒 0」语义**未被钉住**；④ `resetStudentPassword` 的 `tmp_` 400 分支（`students.js:154` 之后的 `sid.startsWith('tmp_')`）因我的学生 23 无班级关系而**先被 403 拦下** |
| R4 | **AI 出网路径只验到桩边界** | 硬禁网下 `fetch` 全被桩接管（真实外呼 0），因此「与真实 DeepSeek 的协议兼容」**不在本步证据面内**（与 plan §7.3 的判据一致） |
| R5 | **Playwright e2e 未审计** | `server/test/e2e/*.spec.js` 不在 jest 口径（B 的 §15-10 同款局限）；`tests/ui-redesign-verify/rig-server/` 冻结副本含**另一份 `teacherController`**（未触碰，也不属本步范围） |
| R6 | **观察项未定位根因** | 环境级瞬时失败**未能复现**（`question.test.js` 18 次全绿、`tc-b0-project-files` 12 次全绿、`rc-project-review-contract` 隔离 5 次全绿），但**全量回归第 1 次确实红过 1 例**（401，已定位到 auth 中间件的兜底 catch）⇒ **能定位机理、不能定位触发源**（未捕获到 DB 层异常栈）。不粉饰：这是一条**已知未知**；建议 CI 侧加「失败即存全量 jest 输出 + 打印 401 前的 DB 异常」的钩子 |
| R7 | **未验证 `getMyClasses` 的线上可达性** | 承 plan §12-9：代码级无路由、前端 0 命中，但历史页面/脚本未查访问日志 ⇒ 保留不动（本轮未加路由、未删导出，与导出面判据一致） |

---

## V13 结论

**PASS —— 行为等价与契约判据全部达标；另有 1 项「中·越界未登记」（D-C1）须 B 补登记 + Captain 追认。**

- **W3**：43 块 **41 全等 + 2 块各仅 1 行**（都是函数体内动态 import 规格符）；**反向校验未匹配非空白字节 = 0**；双向行多重集 1190==1190、注释 120==120 且 0 条外来；行号守恒 **1313+12+11=1336** 独立复算成立。★**「这 2 处只能搬移时改」我独立判定为成立**（4 条反事实解析全部指向不存在文件；B0b 阶段改会打断源文件；plan §6.4/§10-B2/B7 本就要求）。
- **W5**：旧 30 == T8(26) ∪ T12(4)，∩=∅，spread==并集==30（逐字名比较），**无静默遮蔽**；`gradeProject` **四处都不在导出面**；I1 的 **29 个 `teacher.X` 全为 function**；路由体 29 行逐字节相同。
- **W7**：**AST 口径**（import/re-export/动态 import 规格符解析）扫描 14 个 interface 文件 ⇒ **interface → infrastructure = 0**；文本 2 处均为 banner 文案。
- **W2**：新树放宽变异 **1 failed / 7 passed，红面唯一 = T-A8**，文案差异与预测逐字一致 ⇒ **D2 真闭环**。
- **W9**：I2 真跑 **9/9 绿**（实测 9 例，非 13）。**W11**：迁移三元组逐字命中，31→29、fresh 0、基线未刷新；`gradeProject` 声明行 sha 两树相同 ⇒ **确为搬运**。**W12**：3 根同路径、5 站点值同、副作用落位正确、漂移目录 0，**负控有牙**。
- **W13**：**101 例 / 四维 / 0 差异**，装置自检 0 差异，fetch 9 次全回环（真实外呼 **0**）；**5/5 变异必报差异**、惰性对照 0；**刻意存活探针存活 1 处**（practice 行 `reviewPending` 恒 0 语义未被钉住，已登记为盲区）；**403 站点 16/16 真执行**；被执行函数 **40/43**，未执行 3 个（`rollupRow`/`gradeProject`/`uploadDir`）。
- **观察项**：`question.test.js` **18 次尝试未复现**（B 报的那 1 次抓不到）；但我在**长序列**与**全量回归**中另抓到两次同类抖动（`tc-b0-project-files`、`rc-project-review-contract` 的 401），**三次全部在隔离复跑中消失**（含冻结 before 树对照）⇒ 判「环境级、套件无关、非拆分回归」，归因较 B 更精确，且给出了 401 的机理定位（auth 中间件兜底 catch 吞掉瞬时 DB 异常）。
- **W15**：门禁七项全绿（GodFile **1**，名单只剩 `Doc.vue`）；全量回归**第 1 次 1 failed（环境性偶发，已隔离定性）→ 第 2 次 4 段摘要 + failed=0 + 1121 例 + EXIT=0**（§10.2）。

**给 Captain 的三条动作**：① 要求 B 把 `scripts/gates/arch-metrics.mjs` 的基线棘轮**补登记为 D10** 并说明授权来源（**不得**再出现未登记的门禁脚本改动）；② 把「环境级瞬时失败」的观察项从 `question.test.js` 改写为**套件无关**，并在下一轮给 jest 加「失败即存全量输出 + 打印 auth 前 DB 异常」的钩子；③ 归档口径采纳 **`ROUND=24`**（4 段摘要 + failed=0 + 1121 例），**`ROUND=23` 保留为环境性偶发的原始证据**（不得删改）。
