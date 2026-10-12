# R2-B4b 修复记录（t37：F-R2C4-1 假成功 + F-R2C4-2 原始分不可追溯）

## 摘要（≤10 行）
1. **F-R2C4-1（高，阻断）已修**：新增 **slug↔平台提交 id 映射**（显式 map / manifest 源 id ↔ 学生对齐 / 有限数字直用三级优先）；**未映射 ⇒ `needs_rerun` + `reason=unmapped_submission_id:<slug>`**（绝不报成功）。
2. **`written` 语义修正**：只在 `submission.update` **成功后** +1（此前计的是「决策」⇒ 出现 done/written=2 却零写入的假成功）；`update` 抛错 ⇒ 该份记 `needs_rerun/update_failed:<msg>`。
3. **★跨系统反向复现已消除**：装置真实命名（`submission.id='s01'`）+ manifest 源 id ⇒ 经 worker 消费**真写分**（smoke JOB6：`done written=1 aiScore=59 checker_id=…`）；不可映射 ⇒ JOB7 `needs_rerun written=0`（`all_needs_rerun:unmapped_submission_id:s02`）。
4. **F-R2C4-2（中）已修**：`aiFeedback` 增加 `raw_score` / `raw_max_score` / `score_int` / `score_rounding` ⇒ 小数分 62.5 可追溯（DB `ai_score=62` 为**显式截断**，不再是静默截断）。
5. **顺带修真缺陷**：小数分直传 `aiScore` 会被 Prisma 对 INT 列**类型拒绝**（update 抛错 ⇒ 该份零写入）⇒ 改为 `Math.trunc` 显式取整。
6. **新增 w16 集成测试**（3 例，真实 slug 命名 + manifest）：真写分且 `written === DB 实际更新行数`；不可映射 ⇒ needs_rerun 零写入；62.5 可追溯。
7. **verify 七段全绿（串行）**：unit 46 套件/665 例；contract 3/50；三重度各自单跑 17/61/21；integration **37 套件/365 例**（含 w16）；db-fingerprint；smoke **8/8**。既有测试文件零修改（只新增 w16）。
8. 安全：生产库只读指纹逐位不变；历史分数未重算；装置侧 `scripts/dsh-grader/**` 一行未动（`STUB_SLUG` 只在平台侧 stub 里）。
9. 未验证项：映射的另一条路径（装置按平台 id 命名产物）需改装置侧，本批不动；真实装置 1 次联调仍留给授权窗口。
10. 自纠：本记录 §5（映射口径设计取舍、`Map` 与 manifest 的先后、单行补丁的引号坑）。

## 1 F-R2C4-1：映射 + written 语义
### 1.1 修法（三条要求逐条对应）
| 要求 | 实现 |
|---|---|
| ① 建立 slug↔平台 id 映射 | `resolveSubmissionId(slug, map)`：显式 map 优先 → 有限数字直用 → 否则 null；`matchSlugToSubmissions()` 用 manifest `submissions[].id`（源目录名）与平台学生对齐（`realName` 精确 → `username` 精确 → 源 id 以 `realName` 开头且候选唯一）；`deriveSlugMapFromRunRoot()` 读 `out/assignment/assignment-manifest.json` + 该作业的提交/学生 |
| ② written 只在 update 成功后 +1 | `consumeMeasureResults` 内 `written += 1` 只出现在 `await prisma.submission.update(...)` 成功之后；未映射/更新失败分别记 `unmapped_submission_id:<slug>` / `update_failed:<msg>` 且 `status=needs_rerun` |
| ③ 集成测试 | 新增 `server/test/integration/w16-slug-consumption.test.js`（3 例，见 §3） |
### 1.2 为什么选「manifest 源 id 对齐」而不是改装置
- 装置侧按平台 id 命名产物需改 `scripts/dsh-grader/**`（**本批 out of scope**）；worker 消费前重写产物会破坏 canonical 证据链（`canonical_sha256` 与 run-root 的对应关系）；逐份 `--submission-id` 需要装置侧支持。
- 装置 manifest 已经带 `submissions[].id`（源目录名，如「丁静45」）⇒ 平台侧与学生 `realName`/`username` 对齐是**零装置改动**且可审计的路径；歧义/未命中一律留空（fail-closed）。

## 2 F-R2C4-2：原始分可追溯
- `buildWriteback` 现在写：`raw_score`（装置原始分，可小数）、`raw_max_score`、`score_int`（落库值）、`score_rounding='trunc(ai_score INT 列；原始分见 raw_score)'`。
- **顺带修真缺陷**：`aiScore` 直接传 62.5 会被 Prisma 对 `Int` 列**类型拒绝**（整条 update 抛错 ⇒ 该份零写入，比静默截断更糟）⇒ 改为 `Math.trunc`。

## 3 复算命令与真实输出
### 3.1 集成测试（真实 slug 命名 + manifest）
```bash
cd server && npx jest --config test/jest.config.js --runInBand --forceExit test/integration/w16-slug-consumption.test.js
```
```
✓ W16-1 装置 slug 产物 + manifest（源 id=学生姓名）⇒ 真写分，written 等于 DB 实际更新行数
✓ W16-2 ★不可映射（manifest 源 id 无人匹配）⇒ needs_rerun + unmapped_submission_id:<slug>，零写入
✓ W16-3 F-R2C4-2：小数分 62.5 可追溯（aiFeedback.raw_score + 取整口径）
Test Suites: 1 passed ｜ Tests: 3 passed
```
- W16-1 的「真写分」判据：`out.written===2` **且** DB 中 `ai_score` 非空行数 === `out.written`（对拍写进断言）；每行还断言 `checkerId` 为该 checker、`canonicalSha256` 形如 `sha256:`、`gradingStale=false`。
### 3.2 stub 端到端（新增两条 slug 断言 ⇒ 8/8）
```bash
cd server && node scripts/r2b4-smoke.mjs
# JOB6(slug) status=done written=1 aiScore=59 checker_id=sha256:1cd80765…   ← ★修前是 done/零写入（假成功）
# JOB7(slug-unmapped) status=needs_rerun written=0 reason=all_needs_rerun:unmapped_submission_id:s02
# CHECK slug_mapped_real_write=PASS ｜ CHECK slug_unmapped_needs_rerun=PASS
# R2B4_SMOKE=PASS checks=8 failed=0 ｜ SMOKE_EXIT=0
```
### 3.3 verify 七段（串行，最终代码）
```
verify1: check-layers 违规 0 条；unit（排除三重度）46 套件/665 例 ｜ UNIT_EXIT=0；contract 3/50 ｜ CONTRACT_EXIT=0
verify2-4: fact-extractor 17/17 ｜ rule-executor 61/61 ｜ rule-mutator 21/21 ｜ 均 exit 0
verify5: integration 37 套件/365 例 ｜ INTEGRATION_EXIT=0（含新增 w16 3 例）
verify6: 生产库只读指纹 before/after 逐位相同 ｜ FINGERPRINT_OK
verify7: node scripts/r2b4-smoke.mjs ⇒ R2B4_SMOKE=PASS checks=8 failed=0 ｜ SMOKE_EXIT=0
```

## 4 安全与铁律
| 项 | 证据 |
|---|---|
| 生产库未写 | 只读指纹 before/after 两段**逐位相同**（users=1252/questions=32/assignments=52/assignment_questions=52 columns=3/submissions=1601/system_configs=4 + max_id + max_submitted + 2 迁移 ok + TABLE_COUNT=22） |
| 历史分数未重算 | 本批只改消费侧映射/写分载荷；未新增任何对既有 `submissions.ai_score` 的重算语句（w16 只写自建探针行并在 afterAll 清理） |
| 装置侧未动 | `git status --porcelain scripts/dsh-grader` 为空；`STUB_SLUG` 仅存在于平台侧 stub-device.mjs |
| 既有测试未改 | `git status --porcelain server/test` 只有 `?? server/test/integration/w16-slug-consumption.test.js` |
| 无安装/构建 | 未 npm install、未构建；未改 `server/package.json` |

## 5 自纠清单
1. **补丁引号坑**：用 Python 单引号字符串包 JS 单引号（`path.join(runRoot, 'out')`）直接语法错误；改为 JS 侧用双引号。另一次把 `\n` 写进 Python 双引号字符串导致「多行字符串」语法错误 ⇒ 单行替换。
2. **映射口径取舍**：首选「manifest 源 id ↔ 学生 realName/username」，因为它**零装置改动**且可审计；未命中/歧义一律 fail-closed（`unmapped_submission_id`）而不是猜顺序对齐（顺序对齐在 skip/identical 分支下会错位）。
3. **取整口径**：验证过程中发现「小数分直传 INT 列」会被 Prisma 拒绝（update 抛错 ⇒ 零写入），比 C 报告的静默截断更严重 ⇒ 改为显式 `Math.trunc` 并把口径写进 `score_rounding`。
4. **smoke 与测试的清理**：新增探针学生（slug 映射载体）在 finally 里删除；w16 用 `afterAll` 清理提交/checker/作业/题目/学生。

## 6 未验证项（单列）
1. **装置按平台 id 命名产物**（另一条映射路径）需改 `scripts/dsh-grader/**`（本批 out of scope）⇒ 未实现；当前依赖 manifest 对齐。
2. **真实装置 1 次联调**（C 已做）未由本批复跑：会消耗真实模型调用；本批用真实产物**结构与命名**（slug + manifest）在测试库复现同一路径。
3. **`written` 与实际更新的极端一致性**：并发写同一提交时以最后一次为准（未加行锁）；作业级流程下每份提交由一个 job 写，风险低但未做并发压测。
4. **`raw_score` 的可视化**：教师/学生端展示（client）不在本批 scope。
