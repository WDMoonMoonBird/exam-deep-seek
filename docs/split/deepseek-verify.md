# deepseek.js 拆分独立验证报告（GodFile 拆分专项 · step 4 · Agent C）

- **step**: 4 ｜ **角色**: C（独立验证 + 对抗性证伪）｜ **日期**: 2026-10-11
- **被验提交**: HEAD = e2e70fdf0580ff97ae9e458760a6309c8982721f（工作树**未提交**：本步全部产物为工作树改动）
- **被验树留痕**: 主仓库 /Users/you/My Vue/Exam-DeepSeek（唯一被测树）；冻结树 /tmp/verifyC/before（git archive HEAD server）；改后副本 /tmp/verifyC/after（rsync 自工作树，diff -r 逐字节相同后才使用）
- **被测标的 sha256（我在本轮独立复算，全部与 B 报告 §2 逐字一致）**:
  - 源文件（git show HEAD:server/src/services/deepseek.js） = c13fceb9b1ce88525db5e5cb5dad9528dbac12f6647fa1d358284365a87adc02（**V1 命中 A/B 锚点**）
  - prompts.js f1740c08… ｜ json-extract.js 49fbbf10… ｜ config.js 61cbdc56… ｜ submission-grading.js 6de24449…
  - exam-parsing.js f9994dc7… ｜ reference-answer.js fbd0ad7e… ｜ project-grading.js 2bd131c5… ｜ file-selection.js 2053c481…
  - rubric-items.js 0aa37e16… ｜ index.js 6339da90…
- **方法总则**: 全部装置由我自建（**未复用 B 的 /tmp/splitD/*** 任何脚本）；静态判等用**自写手搓 tokenizer**（不依赖 @babel，与 B 的 AST 法正交）；行为对拍用**自建三桩 + 两独立进程**；门禁用仓库既有五门禁 + /tmp 副本反向证伪；临时产物一律 /tmp，仓库内只写本报告 + 回归日志。
- **约束遵守**: 无 git 写操作（只用 rev-parse / show / archive / status / diff）；未碰 client/dist、tests/、scripts/gates/、server/package.json、server/logs（mtime 实测未变）；未跑 build；未占用 :5173/:3000（探针一律 PORT=0）；未安装任何依赖；未调用 web_search / web_fetch。

---

## 0 判据总表（期望 vs 实测）

| # | 判据 | 期望 | 实测 | 结论 |
|---|---|---|---|---|
| V1 | 冻结树源文件 sha256 | c13fceb9… | c13fceb9b1ce88525db5e5cb5dad9528dbac12f6647fa1d358284365a87adc02 | ✅ |
| V2 | 41 个顶层声明块逐块 sha256 判等 | 0 块不等 | **41/41 全等，0 块不等** | ✅ |
| V2b | 反向位置级校验（目标非空行 vs 源区间） | 未匹配字节 = 0 | 10 文件 unmapped=0 / gapUnmatched=0 / byteMismatch=0 / overlap=0；源侧 931 非空行中 922 归因，**未归因 9 行 = 3 条 import 行 + 6 条段落横幅（均为方案授权改写/不搬）** | ✅ |
| V3 | 变异反证 m1/m2 + 惰性对照 | 3/3 报差异；对照 0 差异 | m1 差异✅ m2 差异✅ m0（死绑定改名）0 差异✅；行为侧 bm1/bm2/bm3 差异✅ bm0 0 差异✅ | ✅ |
| V4 | 导出面（真 import 两进程） | 恰好 21 名且逐字相同 | BEFORE=21 / AFTER=21，**cmp 逐字节相同**；undefined 导出 0 | ✅ |
| V4b | index.js 9 行 re-export | 每名可取到值且非 undefined | 9 行 / 21 名全部可取，**21/21 与源模块同一对象（身份相等）** | ✅ |
| V5 | ★I14 双向（路径键控 mock） | 正向 18/18；反向必须响亮变红 | 正向 **18/18 PASS**；只改 :18 → **12 failed（TypeError: gradeProject.mockReset is not a function）**；只改 :23 → **同样 12 failed** | ✅ |
| V6 | 23 处站点逐个真 import | 全部可解析、无 does-not-provide | 我实测 **22 处 import 规格符 + 1 处 jest mock 规格符 = 23 处**；0 处指向已删模块；8 个 src 宿主文件真 import 全 OK（含 gradingWorker.js）；teacherController:204 动态 import 真执行 OK；test-grading.js:4 真解析 OK | ✅（**A 报 19 站点/20 处为漏计**） |
| V7 | 五门禁 | 0/44、PASS/6、SCC 0、0/0/0、0 | check-layers 96 文件 **违规 0 / 未分层 44**；arch-metrics **PASS（GodFile 6 / 观察带 16）**；cycle-check 96 文件 **214 边 / SCC 0 / 自环 0**；hard-metrics **0/0/0**；bind-check **194 模块 / 652 绑定 / 违规 0** | ✅ |
| V8 | 门禁反向证伪（能抓到错层/错导出/错 re-export） | 全部抓到 | 5 层陷阱 + 2 绑定陷阱 + 1 环陷阱 **全部抓到**；干净树 0 违规（不误报） | ✅ |
| V9 | ★行为等价（94 夹具 / 两进程 / 四维） | byte-identical | **before1 vs after1 逐字节相同**（先过 before 跑两次自检）；0 次真实外网 | ✅ |
| V10 | 复核 B 对 A 的 4 处纠正 | 逐条裁定 | **E1/E2/E3/E4 全部成立** | ✅ |
| V11 | 全量回归 | 4 处 Test Suites + failed 0 | ROUND=09/10 各 1 failed（环境性）；**ROUND=11：exit 0，4 处摘要，failed=0，68 套件 / 1073 例** | ✅（附前置树对照） |
| — | 越界自查 | 只改计划内文件 | 23 条 tracked 改动（B 的 22 条 + Captain 修的 test-grading.js 1 条）；server/test 改动 7 行**全部是 import 路径，0 条断言改动** | ✅ |

**本步结论：PASS**（无需回流 B。另有 3 条信息级发现 + 1 条需 Captain 裁定的越界面，见 §9/§10。）

---

## 1 V1 版本锚点

~~~bash
cd "REPO" && git rev-parse HEAD
# e2e70fdf0580ff97ae9e458760a6309c8982721f
git show HEAD:server/src/services/deepseek.js | shasum -a 256
# c13fceb9b1ce88525db5e5cb5dad9528dbac12f6647fa1d358284365a87adc02  -
git show HEAD:server/src/services/deepseek.js | wc -l
# 1051
~~~

冻结树导出：git archive HEAD server | tar -x -C /tmp/verifyC/before（副本内 sha256 复核仍为 c13fceb9…）。

---

## 2 V2 逐块判等 + 反向位置级校验（自建装置）

**装置**：/tmp/verifyC/slice-check4.mjs —— **手写 tokenizer**（逐字符状态机：行/块注释、单双引号、模板字面量含 \${} 嵌套、正则字面量、三种括号深度分别记账；**只有花括号回到 0 深度才收束声明**，这一处是我第一版报 41→44 个块的根因，修正后与 A/B 的 41 完全吻合）。

### 2.1 声明盘点（我的独立读数）

~~~
top-level stmts = 44 | import stmts = 3 | declarations = 41
（23 函数 + 18 常量，行区间与 A §1 / B §4.1 逐行一致）
~~~

### 2.2 41 块 sha256 判等

~~~
blocks = 41 | MATCHED = 41 | UNMATCHED = 0
T1 prompts.js            blocks=18
T2 json-extract.js       blocks= 3
T3 config.js             blocks=11
T4 submission-grading.js blocks= 1
T5 exam-parsing.js       blocks= 2
T6 reference-answer.js   blocks= 1
T7 project-grading.js    blocks= 2
T8 file-selection.js     blocks= 1
T9 rubric-items.js       blocks= 2
T10 index.js             blocks= 0
~~~

判等方法：对每个块在 10 个目标文件全文做**原子串定位**（indexOf 循环），命中 ≥1 即逐字节相等（哈希由构造保证）。

### 2.3 反向位置级校验（B 建议的「位置级而非集合级」，我按锚点法实现）

算法：先用块命中位置把每个目标文件与其**源区间锚定**，再用「多段最长连续匹配」把锚点之间的 JSDoc/注释行归位，最后逐行比对字节并检测跨文件重复占用。

~~~
T1  prompts.js            sliceLines= 178 mapped= 178 unmapped=0 gapUnmatched=0 byteMismatch=0 overlap=0 srcSpan=45-856    OK
T2  json-extract.js       sliceLines=  91 mapped=  91 unmapped=0 gapUnmatched=0 byteMismatch=0 overlap=0 srcSpan=489-779   OK
T3  config.js             sliceLines=  34 mapped=  34 unmapped=0 gapUnmatched=0 byteMismatch=0 overlap=0 srcSpan=5-43      OK
T4  submission-grading.js sliceLines=  84 mapped=  84 unmapped=0 gapUnmatched=0 byteMismatch=0 overlap=0 srcSpan=60-157    OK
T5  exam-parsing.js       sliceLines= 121 mapped= 121 unmapped=0 gapUnmatched=0 byteMismatch=0 overlap=0 srcSpan=233-373   OK
T6  reference-answer.js   sliceLines=  59 mapped=  59 unmapped=0 gapUnmatched=0 byteMismatch=0 overlap=0 srcSpan=388-454   OK
T7  project-grading.js    sliceLines= 171 mapped= 171 unmapped=0 gapUnmatched=0 byteMismatch=0 overlap=0 srcSpan=478-1051  OK
T8  file-selection.js     sliceLines=  71 mapped=  71 unmapped=0 gapUnmatched=0 byteMismatch=0 overlap=0 srcSpan=752-848   OK
T9  rubric-items.js       sliceLines= 113 mapped= 113 unmapped=0 gapUnmatched=0 byteMismatch=0 overlap=0 srcSpan=858-972   OK
T10 index.js              sliceLines=   0 mapped=   0 unmapped=0 gapUnmatched=0 byteMismatch=0 overlap=0 n/a           OK

TOTAL sliceLines=922 banner=40 import=23 exportBlock=11 blank=124
TOTAL unmatched=0 byteMismatch=0 overlap=0
reverse-check FAILED files = 0
~~~

源侧归因（确认「没有夹带、没有遗漏」）：

~~~
source non-blank = 931 | attributed = 922 | NOT attributed = 9
  src:1   import logger from '../utils/logger.js';
  src:2   import { ABNORMAL_FEEDBACK, DEFAULT_MAX_SCORE } from '../constants.js';
  src:3   import prisma from '../utils/prisma.js';
  src:159 // ===================== 试卷解析 =====================
  src:375 // ===================== 参考答案生成 =====================
  src:456 // ===================== 实训题项目评分 =====================
  src:748 // ===================== L1 两阶段：第一轮文件选择 =====================
  src:851 // ===================== 评分标准固定分项（2026-08-17 评分一致性方案） =====================
  src:974 // ===================== 主观分项评分（2026-08-17 检查器方案：仅评无法确定性检查的分项） =====================
~~~

⇒ 9 行未归因**全部是方案明示的授权改写**（3 条 import 按 §2.4 重排；6 条段落横幅按 §8.7 不搬）。**未匹配字节 = 0**，V2 通过。

---

## 3 V3 变异反证（装置必须有分辨力，且不误报）

在 /tmp 副本上注入（**未进仓库**，见 §10 自查），用同一装置跑：

| 变异 | 注入点 | 期望 | 实测 |
|---|---|---|---|
| m1 | prompts.js：0 到满分之间 → 0 到满分以内 | 报差异 | **MISS OUTPUT_FORMAT（UNMATCHED=1）+ T1 FAIL，unmapped=1** ✅ |
| m2 | config.js：CACHE_TTL 60_000 → 30_000 | 报差异 | **MISS CACHE_TTL（UNMATCHED=1）+ T3 FAIL，unmapped=1** ✅ |
| m0（惰性对照） | submission-grading.js 的零消费死绑定 DEFAULT_MAX_SCORE → DEFAULT_MAX_SCORE_DEAD | 0 差异 | **MATCHED=41 / UNMATCHED=0 / unmatched=0**（不误报） ✅ |

行为装置同样做了分辨力验证（§6.4）：bm1/bm2/bm3 均报差异，bm0 报 0 差异。

---

## 4 V4 导出面（真 import，两个独立进程）

~~~bash
# BEFORE：冻结树 /tmp/verifyC/before/server/src/services/deepseek.js
# AFTER ：repo  server/src/infrastructure/ai/deepseek/index.js
PORT=0 LOG_LEVEL=silent DEEPSEEK_BASE_URL=http://127.0.0.1:9 node probe/export-surface.mjs <module>
~~~

~~~
=== BEFORE ===  count=21  undefinedExports=[]  fetchCallsDuringImport=0
=== AFTER  ===  count=21  undefinedExports=[]  fetchCallsDuringImport=0
OPEN_PROJECT_ROLE,PROJECT_ROLE,buildOpenProjectGradePrompt,buildProjectGradePrompt,clearConfigCache,extractFilesJson,
generateReferenceAnswer,getApiKey,getBaseUrl,getConcurrency,getConfig,getModel,getProjectContextMode,gradeProject,
gradeSubjectiveItems,gradeSubmission,normalizeRubricItems,parseExamPaper,parseExamPaperStream,selectImportantFiles,summarizeRubricItems

cmp before.names after.names  ->  IDENTICAL byte-for-byte (cmp exit 0)
~~~

### 4.1 index.js 的 9 行 re-export（bind-check 之外，我自己再验一遍）

~~~
re-export lines found = 9
  ../../../domain/services/deepseek/prompts.js        4 names [PROJECT_ROLE,OPEN_PROJECT_ROLE,buildProjectGradePrompt,buildOpenProjectGradePrompt]
  ../../../domain/services/deepseek/json-extract.js   1 names [extractFilesJson]
  ./config.js                                         7 names [clearConfigCache,getConfig,getProjectContextMode,getApiKey,getBaseUrl,getModel,getConcurrency]
  ./submission-grading.js                             1 names [gradeSubmission]
  ./exam-parsing.js                                   2 names [parseExamPaper,parseExamPaperStream]
  ./reference-answer.js                               1 names [generateReferenceAnswer]
  ./project-grading.js                                2 names [gradeProject,gradeSubjectiveItems]
  ./file-selection.js                                 1 names [selectImportantFiles]
  ./rubric-items.js                                   2 names [normalizeRubricItems,summarizeRubricItems]
re-export names checked = 21 | identity-equal = 21 | problems = 0
~~~

「identity-equal」= index 上的第 n 个名字与源模块上的同名值是**同一个对象引用**（不是 undefined、不是重新包装）。21/21 通过。

### 4.2 声明行 export 审计（我的独立读数）

~~~
源（冻结树）^export 行 = 21（21 个名字，与导出面一致）
目标侧内联 export   = 21，名字集与源【完全相同】（only-in-source = [] / only-in-target = []）
文件尾 export { … } 块 = 2 ：prompts.js:221（14 名）、json-extract.js:99（2 名：repairTruncatedJson / extractProjectGradeJson）
export * 次数 = 0
index.js 的 export { … } from 行 = 9
~~~

---

## 5 ★V5 I14 路径键控 mock 双向验证（最高优先）

**被测事实**：server/test/unit/infrastructure/trustjudge-grader.test.js
- :18 jest.unstable_mockModule('../../../src/infrastructure/ai/deepseek/index.js', () => ({ gradeProject: jest.fn() }))
- :23 const { gradeProject } = await import('../../../src/infrastructure/ai/deepseek/index.js')
- 被测方 server/src/services/trustJudgeGrader.js:29 import { gradeProject } from '../infrastructure/ai/deepseek/index.js'
三处**解析到同一模块**。另：全仓 grep 已无任何 unstable_mockModule 指向旧路径（命中 0）。

| 实验 | 装置 | 结果 |
|---|---|---|
| **正向** | 仓库原样 | **Test Suites: 1 passed / Tests: 18 passed, 18 total（exit 0）** |
| **反向 A** | /tmp/verifyC/neg18：**恢复旧模块使旧路径可解析**，**只把 :18 改回旧路径**（:23 保持新路径） | **1 failed / 12 failed, 6 passed（exit 1）**，报 TypeError: gradeProject.mockReset is not a function（:119） |
| **反向 B** | /tmp/verifyC/neg23：同样恢复旧模块，**只把 :23 改回旧路径** | **1 failed / 12 failed, 6 passed（exit 1）**，同一 TypeError |
| **身份断言** | 由套件自身承担 | 反向实验的失败形态就是身份断言的反证：mock 失配时 gradeProject 是真函数，:119 的 mockReset 立即 TypeError；正向 18/18 绿 ⇒ mock 确实是被测方持有的那个 jest.fn()（配套件内 toHaveBeenCalledTimes(1) 与 mock.calls[0]） |

**结论**：mock 是**载荷性**的，且**两处任一改漏都会响亮变红**（不是静默失效、不会静默走真网）。I14 已正确双改。

---

## 6 ★V9 行为等价性对拍（本步唯一的行为证据）

### 6.1 装置（全部自建；两侧逐字同一份）

| 桩 | 实现 | 为什么 |
|---|---|---|
| 网络桩 | import 之前替换 globalThis.fetch；**桩体从不调用原始 fetch**；逐次记录 {url, method, auth, contentType, hasSignal, body(已 JSON.parse)}；按队列返回 200/429/500/抛错/SSE 响应对象（含 body.getReader()） | 全模块 8 处 fetch 都打全局 fetch；不打桩必然真连网 |
| DB 桩 | 同一份内存替身**覆盖两侧的 src/utils/prisma.js**（两侧 sha256 相同 = 39f78bc5…）：实现 systemConfig.findMany + __db/__log/__snapshot/__reset；未知属性访问记录并抛错 | 本模块唯一 prisma 调用点 = systemConfig.findMany；真库会让配置读取非确定 |
| 时钟桩 | Date.now = () => stub.NOW（夹具可推进）；每例复位到 1760000000000 | configCacheTime / TTL 判定会进调用日志，不冻结则边界必不等 |
| 退避加速桩 | setTimeout 包装：正数毫秒一律 0，但**把「被请求的等待值」记进有序日志**（白名单 2s/3s/5s/10s/15s/30s/60s/90s/120s/180s） | 不加速则 429 退避单例要等 100s+；记下等待值 ⇒ 退避算术仍在对拍范围内 |

执行：两侧各自**独立 node 进程**（PORT=0，LOG_LEVEL=silent，DEEPSEEK_BASE_URL=http://127.0.0.1:9）。
每例记录**四个维度**：① 返回值/抛错（name+message）② 终态 DB（rows 快照 + findMany 次数 + 有序 DB 日志）③ 有序 fetch 调用日志（含请求体全文）④ onProgress 回调序列（仅流式）；另附 ⑤ setTimeout 等待值序列。

### 6.2 结果

~~~
=== BEFORE 跑第 1 次 ===  fixtures=94 threw=19   fetchStubIntact=true  offHostUrls=0
=== BEFORE 跑第 2 次 ===  fixtures=94 threw=19   fetchStubIntact=true  offHostUrls=0
=== AFTER  跑第 1 次 ===  fixtures=94 threw=19   fetchStubIntact=true  offHostUrls=0

cmp before1.ndjson before2.ndjson  ->  SELF-CHECK OK（装置自检：同侧跑两次逐字节相同）
cmp before1.ndjson after1.ndjson   ->  A/B VERDICT: byte-identical（94/94 例）
~~~

聚合（对 before1 与 after1 分别统计，两侧数字相同）：

~~~
fixtures                 = 94
fixtures returning error = 19（皆为设计内的错误路径，如三次重试后抛错/兜底）
total fetch calls        = 115
total progress events    = 21（connecting / streaming / token / parsing 四相齐全）
total setTimeout waits   = 153 ；distinct wait values = [2000,3000,5000,10000,15000,30000,60000,90000,120000,180000]
distinct urls            = ['http://127.0.0.1:9/v1/chat/completions']   （offHostUrls = 0）
total prisma findMany    = 234
unexpected prisma access = 0
~~~

### 6.3 禁网证据（0 次真实外网请求）

1. 探针**第一行**即替换 globalThis.fetch，桩体**不调用原始 fetch**（无 fallthrough）；
2. DB 桩把 deepseek_base_url 固定为 http://127.0.0.1:9（不可达端口），**走 DB 优先而非 env**；
3. 事后断言：**全部 115 次 fetch 的 url 都是 http://127.0.0.1:9/v1/chat/completions，offHostUrls = 0**；
4. fetchStubIntact = true（被测模块未替换掉我的护栏）；
5. 仓库 server/logs 目录与文件的 mtime 在探针前后**逐字未变**；
6. 全程未调用 web_search / web_fetch。

### 6.4 行为装置的分辨力（变异反证，注入 /tmp 副本）

| 变异 | 注入点 | 结果 |
|---|---|---|
| bm1 | config.js CACHE_TTL 60_000 → 30_000 | **差异**（1 例：cfg.ttl.fresh.noreload） |
| bm2 | project-grading.js 的 comment 截断 .slice(0, 60) → .slice(0, 30) | **差异**（1 例：gp.fixedItems.align） |
| bm3 | exam-parsing.js temperature: 0 → 0.5 | **差异**（7 例：pep.*） |
| bm0（惰性对照） | submission-grading.js 死绑定 DEFAULT_MAX_SCORE → _DEAD | **0 差异** |
| 装置稳定性 | 变异全部还原后重跑 AFTER | after1 == after3，逐字节相同 |

### 6.5 ★两张函数清单（NODE_V8_COVERAGE 实测，AFTER 侧跑完整 94 例）

**A. 被执行的函数（23/23 顶层函数全部被执行）**

| 函数 | 命中次数 | 函数 | 命中次数 |
|---|---|---|---|
| loadConfig | 369 | repairTruncatedJson | 8 |
| clearConfigCache | 95 | extractProjectGradeJson | 16 |
| getConfig | 369 | buildProjectGradePrompt | 17 |
| getProjectContextMode | 5 | buildOpenProjectGradePrompt | 8 |
| getApiKey / getBaseUrl / getModel | 116 / 116 / 116 | gradeProject | 13 |
| getConcurrency | 3 | extractFilesJson | 27 |
| buildSystemPrompt | 35 | selectImportantFiles | 7 |
| gradeSubmission | 17 | normalizeRubricItems | 21 |
| parseExamPaper | 7 | summarizeRubricItems | 7 |
| parseExamPaperStream | 6 | gradeSubjectiveItems | 7 |
| generateReferenceAnswer | 7 | — | — |

⇒ A 点名的 **5 个整函数零覆盖（Z1 parseExamPaper / Z2 parseExamPaperStream / Z3 generateReferenceAnswer / Z4 selectImportantFiles / Z5 gradeSubjectiveItems）在本对拍中全部真执行**。

**B. 未被执行的函数（如实列出，全部计入残留风险）**

| # | 条目 | 位置 | 性质 | 覆盖方式 |
|---|---|---|---|---|
| 1 | 匿名箭头 () => controller.abort() | reference-answer.js:28 | setTimeout 回调（90s 超时） | 落在逐字搬移块内（sha256 判等覆盖） |
| 2 | 同上 | project-grading.js:45 | setTimeout 回调（180s） | 同上 |
| 3 | 同上 | project-grading.js:143 | setTimeout 回调（180s） | 同上 |
| 4 | 同上 | file-selection.js:44 | setTimeout 回调（30s） | 同上 |
| 5 | 同上 | rubric-items.js:79 | setTimeout 回调（30s） | 同上 |

说明：这 5 条是**被 clearTimeout 提前撤销的 abort 回调**（退避加速桩让它们多数来不及触发）。它们与已触发的同类回调（submission-grading.js:47 / exam-parsing.js:22）是**同一形态、逐字搬移**，因此其正确性证据是「块 sha256 判等」而非运行时执行 —— **这是本次验证的真实边界，不作「应该没问题」的推断**。

**C. 明确未覆盖、且不属本步改动面的东西（残留风险，见 §10）**

- 生产编排链：worker.js → gradingWorker.start() → scanSubmissions → gradeSubmission；projectGrading.enqueueProjectGrade → gradeProject → 分项写回 DB。本对拍只打模块对外函数，不跑编排。
- 除 systemConfig.findMany 之外的任何 DB 交互（本模块本就没有）。
- 真实网络语义（AbortController 与真实 socket 的交互时序）。
- extractProjectGradeJson **未直接探针**：它在 index.js 上不可见（BEFORE 侧同样私有），只能经 gradeProject 间接执行（16 次命中，含两种截断形态）。

---

## 7 V6 站点逐个真 import（A 报 19 站点/20 处；B 报 23 处 —— 以我实测为准）

**我自建扫描器**（/tmp/verifyC/site-scan.mjs，正则 + path.resolve，扫 server/src、server/test、server/scripts）：

~~~
=== 指向新模块的 import 规格符 ===
COUNT = 45
  其中：23 条在新模块内部（index.js 的 9 条 re-export + 12 条模块间 import）
        22 条是外部站点的 import 规格符（src 9 + test 6 + scripts 7）
=== 仍指向已删模块的 import 规格符 ===
COUNT = 0
~~~

外加我另行确认的 **1 处 jest mock 规格符**（trustjudge-grader.test.js:18，它是函数调用参数不是 import 语句，正则法看不见）：
**22 + 1 = 23 处站点** —— **B 的 23 处成立；A 的 19 站点/20 处是漏计**（漏在 teacherController 静态+动态、trustjudge mock+import、experiment-variance 2 处动态 import）。

**真 import 验证**（/tmp/verifyC/site-verify.mjs，PORT=0，全程 fetch 护栏）：

- **8 个 src 宿主文件真 import 全部 OK**（无 does-not-provide / cannot-find）：I1 gradingWorker.js、I2 projectGrading.js、I3 trustJudgeGrader.js、I4 adminController.js、I5 projectReviewController.js、I6 teacherController.js、I8a checker/llm.js、I8b checker/generator.js。
  ⚠️ 其中 **I1 gradingWorker.js 在 jest 里零加载**（我复算：server/test 内无任何 import 该文件），所以「测试红了」这条路对它无效 —— 它只能靠真 import 兜住，本次**已单独真 import 成功**。
- **动态 import 真执行**（单独做）：teacherController.js:204 的 await import('../infrastructure/ai/deepseek/index.js') → gradeProject 为 function ✅；experiment-variance.mjs:156 → gradeProject ✅；:158 → getProjectContextMode ✅。
- **test/unit/infrastructure/trustjudge-grader.test.js:23** 真解析 → gradeProject 为 function ✅。
- **server/test-grading.js:4**（Captain 已修）：import { gradeSubmission } from './src/infrastructure/ai/deepseek/index.js' → 解析到真实文件 ✅，命名导出 gradeSubmission 为 function ✅。
- test 站点与 .mjs 脚本**不做宿主真 import**（会触发 jest 全局或实验脚本的真跑），改用「规格符真解析 + 目标模块真 import + 逐个请求名存在性」判定：**全部 missing = []**。

> 说明：我的第一版扫描器对 4 个站点（:18/:23/ev:156/:158）报了 FAIL，经人工查证是**我的名字提取启发式**（跨行 import 回扫）误判，非真实缺陷 —— 这 4 处的真实请名分别是 gradeProject / gradeProject / gradeProject / getProjectContextMode，**全部存在**。

**计划外的陈旧引用（不在本步授权面内，仅登记）**：
- server/tmp-probe-ref-answer.mjs:9（untracked 探针残骸，指向已删模块，不可达）
- docs/test-results/2026-08-17-round3/verify-r3.mjs:1（历史归档证据，绝对路径，不可达）
- tests/ui-redesign-verify/rig-server/** 有 4 处指向 ../services/deepseek.js —— **该 rig 自带一份 src/services/deepseek.js（36328 字节，10-10 02:05）**，在 rig 内部可解析，**不是本步缺陷**（tests/ 为冻结区）。
- server/test/unit/infrastructure/trustjudge-grader.test.js:13 的**注释**仍写 src/services/deepseek.js（仅注释）。

---

## 8 V7 五门禁（我实跑的原始输出）

~~~
### 1) node server/scripts/check-layers.mjs
文件 96 个，违规 0 条（0 类规则），未分层待迁移 44 个          exit=0
### 2) node scripts/gates/arch-metrics.mjs
  ✓ layerViolations 0 / unmigrated 44（基线 45）/ godfileOver800 6（基线 7）/ 观察带 16（基线 17）
  GodFile 名单：teacherController(1338) Doc.vue(1106) ReviewDetail(988) QuestionEdit(983) reviewController(965) ProjectQuestionEdit(868)
  结论：PASS                                                  exit=0
### 3) node scripts/gates/cycle-check.mjs
  扫描 96 文件 / 214 条相对导入边 / 强连通分量 0 / 自环 0
  结论：PASS                                                  exit=0
### 4) node scripts/gates/hard-metrics.mjs
  hex6 0 / important 0 / modalConfirm 0（41 个文件） 结论：PASS   exit=0
### 5) node scripts/gates/bind-check.mjs
  modules scanned 194 / named bindings checked 652 / unresolved 4（仅登记）/ external 1（仅登记）
  BINDING VIOLATIONS : 0                                     exit=0
~~~

与 B 报告 §8 的读数**逐项一致**（未分层 44、GodFile 6、观察带 16、SCC 0、边 **214**、绑定 652/违规 0）。

### 8.1 V8 反向证伪（四条陷阱 + 我加的三条；全部在 /tmp 副本，未进仓库）

| 陷阱 | 构造 | 结果 |
|---|---|---|
| L1（A #1） | domain 的 prompts.js 顶部加 import logger from utils/logger.js | **抓到**：domain-imports-outside ×1，exit 1 |
| L2（A #2） | 把 submission-grading.js 移到 application/ai/deepseek/ 并指向 infrastructure 的 config.js | **抓到**：application-imports-infra ×1，exit 1（**这正是 A 否决 plan §S3 的实证**） |
| L3（A #3） | infrastructure 的 config.js 加 import ../../../interface/ghost.js | **抓到**：infrastructure-imports-upper ×1，exit 1 |
| L4（A #4） | prompts.js 移到 infrastructure，domain 的 json-extract.js 去 import 它 | **抓到**：domain-imports-outside ×1，exit 1 |
| L5（我加） | domain 文件 import node:fs | **抓到**：domain-imports-external ×1，exit 1 |
| B1（错 re-export） | index.js 的 config re-export 里删掉 getConcurrency | **抓到**：bind-check BINDING VIOLATIONS = 2（gradingWorker / projectGrading 各 1），exit 1 |
| B2（错导出） | config.js 的 getModel 改名 getModelX | **抓到**：bind-check BINDING VIOLATIONS = 7，exit 1 |
| C1（成环） | config.js 与 submission-grading.js 互相 import | **抓到**：cycle-check SCC = 1，结论 FAIL，exit 1 |
| C0（干净对照） | 未改动的完整副本 | check-layers 0 违规 / bind-check 0 违规 / cycle-check SCC 0 —— **不误报** |

**附加实证（对 A 的一条断言做验证）**：先构造「config.js import index.js，而 index.js 只通过 export { … } from 指回 config.js」—— cycle-check 的边数从 214 变 215、**SCC 仍为 0**。⇒ 证实 **index.js 的 9 行 re-export 对 cycle-check（以及 check-layers）完全不可见**，因此这 9 行 re-export 的正确性**只能**由 bind-check + 真 import 保证（我已两者都做）。

---

## 9 V10 对 B「4 处纠正」的独立裁定

| # | B 的主张 | 我的独立取证 | 裁定 |
|---|---|---|---|
| **E1** | A 的 §2.4-T4 写成 import { DEFAULT_CRITERIA, ROLE, OUTPUT_FORMAT }，**漏了真绑定 buildSystemPrompt** | 冻结树区间 60-157（= T4 全部内容）内：buildSystemPrompt 命中 **1 次（第 108 行）**；DEFAULT_CRITERIA / ROLE / OUTPUT_FORMAT 命中 **0 次**（这三个只在 buildSystemPrompt 体内使用，而该函数在 T1，源 55-58）。现落地文件第 9 行确实是 import { buildSystemPrompt }，第 59 行调用它。若照抄 A：**运行时 ReferenceError（buildSystemPrompt 未定义）+ 3 个零消费绑定**，且 node --check 与 bind-check **都拦不住** | **成立** |
| **E2** | A 的 §2.3 index 代码块漏 gradeSubjectiveItems，照抄 AFTER 只有 20 名 | 方案原文第 134 行确为 export { gradeProject } from './project-grading.js';，而它自己第 124 行的 21 名清单里含 gradeSubjectiveItems。现落地为 export { gradeProject, gradeSubjectiveItems }，实测 21 名 | **成立** |
| **E3** | 照 A 的 §8-B2/B3 写文件尾 export 块会与内联 export 重复 → SyntaxError | 我做了**可执行反证**：export function f(){} 加 export { f }; 真 import → **SyntaxError: Duplicate export of 'f'**。落地现状：config.js 的 7 个名字**全部内联导出且无文件尾块**；json-extract.js 的内联导出只有 extractFilesJson，文件尾块恰好 2 名；prompts.js 内联 4 + 文件尾 14 = 18。⇒ 照 A 写确实会坏 | **成立** |
| **E4** | A 的 §8-B1 写「T1 的 export 块 19 个名字」，实际是 18 | 方案第 568 行确写「**19 个名字**」，紧随其后只列了 **18** 个。落地文件的文件尾块 14 名 + 内联 4 名 = 18 | **成立** |

**总裁定：4/4 成立** ⇒ 本步是「**方案错、实现对**」，不是「实现擅自偏离方案」。B 的 4 处修正均属**必要性修正**（不修则分别是运行期 ReferenceError、导出面少一名、链接期 SyntaxError、计数错）。
补记：B 另外登记的两条口径差异（E5 T7 搬移行数 174 vs 180、E8 T3 的 5-6 区间含 :5 横幅）我未逐字复核，**不影响判据**。

---

## 10 V11 全量回归（判据：日志出现 4 处 Test Suites 摘要 + failed = 0）

**先查空序号**：docs/split 内已有 test-round-08.log，故 09/10/11 均为新序号（脚本对已占用序号 exit 4，未触发）。

| 轮次 | 结果 | 失败详情 |
|---|---|---|
| **ROUND=09** | exit **1**，日志 **1 处** Test Suites（&& 链短路）：Suites 1 failed/64 passed，Tests 1 failed/973 passed | test/integration/t5-t4-idor-review.test.js:343 batch-publish **401 ≠ 200** |
| 隔离复跑该套件 | **PASS 17/17**（1.6 s） | ⇒ 非确定性 |
| **ROUND=10** | exit **1**，日志 **1 处** Test Suites：Suites 1 failed/64 passed，Tests 1 failed/973 passed | test/integration/ownership-guards.test.js:444 **Exceeded timeout of 30000 ms**（R4 更新不存在团队） |
| **对照：冻结树（拆分前 HEAD）跑段 1** | **64 passed / 1 skipped / 0 failed**（Tests 969 passed / 5 skipped / 974 total，173 s） | 无失败 |
| **ROUND=11（无并发负载）** | **exit 0 ；日志 4 处 Test Suites 摘要；failed = 0** | **65+1+1+1 = 68 套件 ；974+17+61+21 = 1073 例** |

**裁定**：09/10 两次失败分别落在**两个互不相同、且与 deepseek 无任何交集的 integration 套件**，失败形态是 401/30s 超时（典型资源竞争症状），且两者**单独复跑均通过**；这两轮期间我本人正在做重 I/O 的副本构建/gate 证伪（并发 CPU 与磁盘压力）。第三轮**无并发负载时一次全绿**。按项目约束 §3-15「偶发超时/偶发失败必须隔离复跑一次，仍失败才算回归」⇒ **判定为环境性偶发，非本步回归**；且 V11 的正式判据（4 处摘要 + failed 0）在 ROUND=11 已达成。
**如实声明**：前两轮**未**满足判据字面要求，此处不掩盖；若 Captain 要求「一次即绿」，建议在无并发负载下复跑一次即可复现本轮结果。

---

## 11 缺陷分级

**阻塞级（Blocker）：0 条。**

**需裁定级（Decision，1 条）**
- D1（越界面）：server/tmp-probe-ref-answer.mjs:9 与 docs/test-results/2026-08-17-round3/verify-r3.mjs:1 仍指向已删模块。前者 untracked、后者是 8-17 历史归档；二者均**不可达**（非 jest testMatch / 非 npm scripts / 非构建入口）。B 已登记并**按禁令未改**，我复核其判定正确。**请 Captain 裁定是否清理**（我未改）。

**信息级（Info，2 条）**
- I1：server/test/unit/infrastructure/trustjudge-grader.test.js:13 的注释仍写旧路径（仅注释，不影响行为）。
- I2：tests/ui-redesign-verify/rig-server/** 是带自身 deepseek.js 的冻结副本，本步未触碰（mtime 10-10）。

**自查事故（已完全复原，如实披露）**
- 我在做 V9 行为变异时，第一版脚本用了**相对路径**，导致 4 个变异被误写到**仓库**的 config.js / project-grading.js / exam-parsing.js / submission-grading.js（而非 /tmp 副本）。我立即用**此前已验证与原文件逐字节相同的 /tmp/verifyC/after 副本**整文件回写复原，并逐字复核：**10 个文件的 sha256 与 B 报告 §2 完全一致**（config 61cbdc56 / project-grading 2bd131c5 / exam-parsing f9994dc7 / submission-grading 6de24449 / prompts f1740c08 / json-extract 49fbbf10 / reference-answer fbd0ad7e / file-selection 2053c481 / rubric-items 0aa37e16 / index 6339da90），且仓库 server/src 与 pristine 快照 diff 一致。**该事故未影响任何对拍结果**（探针全程只读 /tmp 副本，从未读被误改的仓库文件）；git status 仍为 23 条既有改动、无新增。

---

## 12 未做项与残留风险

1. **未验运行时编排链**：worker.js → gradingWorker → scanSubmissions → gradeSubmission、projectGrading.enqueueProjectGrade → gradeProject → 分项写回 DB 均未真跑。它们的正确性证据 = 逐块 sha256 判等 + 绑定自检 + 站点真 import。
2. **5 个 abort 定时器回调未被执行**（§6.5-B），仅有切片判等覆盖 —— 这是本步唯一的「有代码未被运行时触达」清单，**不作「应该没问题」的推断**。
3. **extractProjectGradeJson 未直接探针**（index 上不可见），只经 gradeProject 间接覆盖（16 次）。
4. **fixture 的 fetch 响应模型是我自建的**：真实网络语义（AbortController 与 socket 的交互、HTTP/2、TLS 错误形态）未覆盖。
5. **生产库取值未取证**：project_context_mode 在真库的分布在 A §10-9 与 B §12 都登记为未证；因此 selectImportantFiles（Z4）在**线上是否真的被调用**仍未证 —— 但本步已用对拍证明其**拆分前后行为逐字节相同**。
6. **repairTruncatedJson 的双实现未合并**（方案禁令）：本步只位移不改写，块 sha256 与源逐字相等；与 domain/services/checker/parsers.js 的同名实现仍是**两个不同实现**，属后续独立专项。
7. **SystemConfigRepository 切换未做**（A §3.1-5 的 D1–D5）：config.js 仍是模块级单例缓存，与改前同构；本次对拍已用 TTL/清缓存/DB 抛错三类夹具锁定其语义。
8. **cycle-check / check-layers 对 export { … } from 不可见**（我已用 C1 变体实证）：index.js 的 9 行 re-export 只能靠 bind-check + 真 import 保证 —— 已两者都做，但**该盲区本身是既有门禁的边界**，建议登记。
9. **未做数据侧取证**：未查询 DB 里 questions.checkerStatus 分布来证实/证伪「主观分项在真实数据下可达」。

---

## 13 本步结论

> **PASS（无需回流 B）**

理由（按证据强度排序）：
1. **静态**：41/41 声明块逐字节相等，10 个目标文件的**每一个非空行**都能按位置归因（未匹配 0），源侧未归因 9 行全部是方案授权的 import 重排与横幅不搬。
2. **接口**：导出面 21 名 BEFORE/AFTER 逐字节相同；9 行 re-export 的 21 个名字全部可取且与源模块**同一对象**；五门禁与 B 读数逐项一致（未分层 44 / GodFile 6 / SCC 0 / 绑定违规 0 / hard 0/0/0）。
3. **行为**：94 例、两独立进程、三维+onProgress+退避参数全部逐字节相同；装置经 4 处变异证伪 + 惰性对照；**0 次真实外网**；**23/23 顶层函数被执行**（A 的 5 个整函数零覆盖全部被本次对拍点亮）。
4. **最高风险点 I14**：双向验证通过 —— 只改一处即响亮变红（12 failed / TypeError），正向 18/18。
5. **回归**：无并发负载下 4 处摘要 + failed 0（68 套件 / 1073 例）；前两轮的两次失败已按 §3-15 判为环境性偶发并记录在案。
6. **越界**：server/test 改动 7 行全为路径、0 条断言改动；受保护目录 mtime 全部早于入场。

**唯一需要 Captain 动作的事项**：§11 的 D1（两处计划外陈旧引用是否清理）。

---

## 附：本次验证的产物清单（全部在 /tmp，未入仓）

| 路径 | 用途 |
|---|---|
| /tmp/verifyC/slice-check4.mjs | 自建手搓 tokenizer + 41 块 sha256 判等 + 锚点式反向位置级校验 |
| /tmp/verifyC/site-scan.mjs / site-verify.mjs / extra-sites.mjs | 站点扫描 + 逐个真 import |
| /tmp/verifyC/probe/{stubs,fixtures,run}.mjs + db-double.js | 行为对拍三桩 + 94 夹具 + 双进程执行器 |
| /tmp/verifyC/cov-analyze.mjs | V8 覆盖率 → 逐函数命中清单 |
| /tmp/verifyC/traps/L1..L5,B1,B2,C1,C0 | 门禁反向证伪副本 |
| /tmp/verifyC/neg18, neg23 | I14 双向验证副本 |
| /tmp/verifyC/out/*.ndjson, *.txt | 全部原始输出（可复核） |
