# Team A 作战手册 — 规则验证升级（Negative Test）

> 分支铁律：**只在 feature/rule-driven-scoring 分支操作**（当前已在该分支）。禁止 checkout 其他分支、禁止 git clean、禁止改 .env/uploads。
> 依据方案：docs/LLM_零配置自动评分系统方案(1).md §11/§13/§14（Positive + Negative Test、防过拟合、Rule Repair）
> 背景上下文：docs/plan/2026-08-18-handoff-review.md、docs/plan/2026-08-18-refactor-plan.md、KNOWN_ISSUES.md

## 目标

当前校准只验证「标准包 Pass」（Positive），导致**参考实现过拟合**：规则可能只匹配标准包的特定写法（正则脆弱、幻觉路径），学生写个同名空壳也被误判通过。本团队为校准循环增加**确定性负例验证（Negative Test）**：

- 对每条在标准包上通过的规则，从标准包**确定性派生一个违反该规则的缺陷变体工程**
- 在变体上执行规则，要求该规则必须失分（Pass→Fail）
- 区分度不足（变体仍通过）的规则 → 标记 weak rule → 进入校准反馈（Rule Repair）：「该规则无法区分缺陷实现，请改为更具体的检查」
- 全部规则均通过双验证 → 才判定达标

## 交付物

### 1. 新增 server/src/services/ruleMutator.js
导出（ESM）：
- ```js
/**
 * 为指定规则派生缺陷变体：复制工程到 variantDir 并施加最小破坏性修改，
 * 使该规则在变体上必然失分。
 * @param {object} rules 完整规则 JSON
 * @param {string} ruleId 目标规则 id
 * @param {string} projectRoot 标准包工程根（resolveProjectRoot 结果）
 * @param {string} variantDir 变体输出目录（调用方创建）
 * @returns {{ok: boolean, reason?: string}} ok=false 表示该规则类型无通用变异策略（跳过）
 */
export function mutateVariant(rules, ruleId, projectRoot, variantDir)
```
- ```js
/**
 * 全量负例验证：对每条「标准包上通过」的规则派生变体并执行 runRules。
 * @param {object} rules
 * @param {string} projectRoot
 * @param {object} opts { concurrency?: number(默认4), onlyIds?: string[] }
 * @returns {Promise<{ covered: number, skipped: Array<{id, reason}>, weakRules: Array<{id, item, reason}>, variantsRun: number }>}
 */
export async function validateNegativeTests(rules, projectRoot, opts)
```
- 变异策略（按 rule_type，读 ruleExecutor.js 确认 params 字段）：
  - file_exists {path}：重命名/删除该文件
  - dir_contains_file {dir, pattern}：删除 dir 下第一个匹配 pattern 的文件
  - contains_text {path, text}：把文件内容中 text 全部替换为干扰串（如 text+'X' 或删除）
  - count_regex {path, regex, min}：删除所有匹配，使计数 < min（若无法删到 <min 则 ok=false）
  - contains_regex {path, regex}：替换首个匹配为不匹配文本
  - file_count_in_dir {dir, pattern, min}：删除匹配文件直到计数 < min
  - syntax_check {dir, pattern, lang}：在首个匹配文件末尾追加语法错误（如 "{{{{"）
  - fact：内置 FACT_MUTATION 映射（hasVueRouter→删除 router 相关文件；hasPinia→删除 stores 目录；hasCreateRouter→删除 createRouter 调用；dependencies→从 package.json 移除该依赖；其余 fact 无映射 → ok=false 跳过并在 skipped 记录）
- 变体施加后：`import { runRules } from './ruleExecutor.js'` 在 variantDir 上执行，判定「目标规则 score===0」（用 result.items 找 ruleId）
- 注意：变异不得影响其他规则能跑（只改目标规则涉及的路径/内容）
- 临时目录由调用方清理；validateNegativeTests 内部负责逐变体清理

### 2. 接线 server/src/services/checkerService.js（只动这一处逻辑）
- 校准循环每轮正向 runRules 之后、判定达标之前：
  - 取「标准包上通过」的规则（result.items 中 score===max_score 的 id）
  - `const neg = await validateNegativeTests(rules, projectRoot, { concurrency: 4 })`（异常 catch 后置为 skipped，绝不因负例验证失败而终止生成）
  - weakRules 非空 → 写入 lastFeedback.weakRules（[{id, item, reason}]）并加入 meta.log 该轮 detail（"负例验证：N 条弱规则"）
  - 达标判定条件不变（weak 规则不阻塞达标，但进入修复反馈；3 轮上限内模型应修正）
- buildCalibrateUserPrompt：当 feedback.weakRules 非空时，追加段落：
  `【弱规则（区分度不足）】以下规则在缺陷变体上仍通过，无法区分真实实现与表面实现，请改为更具体的检查（更精确的路径/内容/组合条件），不要删除该评分项：`
  每行 `- {item}（{id}）：{reason}`
- 校准轮 prompt 的生成：在生成 lastFeedback 时携带 weakRules（若本轮无正向通过规则则空数组）

### 3. 新增 server/test/unit/infrastructure/rule-mutator.test.js
- 用 fixture 小工程（内存临时目录）逐规则类型断言：变异后目标规则必然失分（score===0），且变异前在标准包上该规则得满分（先验证前提）
- 断言 validateNegativeTests：一个故意过拟合的规则（如 contains_text 检查标准包特有字符串）在「变体仍含该字符串」的工程上被标记 weak；正常规则不误报
- 注意 jest tree-sitter 状态破坏问题：本套件若 import ruleExecutor（含 tree-sitter）必须与 fact-extractor/rule-executor 套件**分开进程**跑（三段式）

### 4. 修改 server/test/unit/infrastructure/checker-service.test.js（仅当需要）
- 若接线引入了可单测的导出（建议导出 `attachNegativeFeedback(lastFeedback, weakRules)` 之类纯函数），补 1-2 个用例；不要动既有 35 个用例的语义

## 测试命令（三段式，防 tree-sitter 状态破坏）

```bash
cd server
export PATH=/usr/local/bin:$PATH
TEST_URL=$(sed 's|/exam_system$|/exam_system_test|' .env | grep '^DATABASE_URL=' | cut -d= -f2-)
# 套件1（非 tree-sitter）——注意：位置参数必须前置，否则被 --testPathIgnorePatterns（数组选项）吞掉（BUG-A-02）
DATABASE_URL="$TEST_URL" NODE_OPTIONS=--experimental-vm-modules npx jest --config test/jest.config.js --runInBand --forceExit test/unit --testPathIgnorePatterns="(fact-extractor|rule-executor|rule-mutator)"
# 套件2（tree-sitter 相关，各自独立进程，禁止同进程组合——进程内状态污染 BUG-A-01）
DATABASE_URL="$TEST_URL" NODE_OPTIONS=--experimental-vm-modules npx jest --config test/jest.config.js --runInBand --forceExit test/unit/infrastructure/fact-extractor.test.js
DATABASE_URL="$TEST_URL" NODE_OPTIONS=--experimental-vm-modules npx jest --config test/jest.config.js --runInBand --forceExit test/unit/infrastructure/rule-executor.test.js
DATABASE_URL="$TEST_URL" NODE_OPTIONS=--experimental-vm-modules npx jest --config test/jest.config.js --runInBand --forceExit test/unit/infrastructure/rule-mutator.test.js
# 套件3：checker-service（独立进程）
DATABASE_URL="$TEST_URL" NODE_OPTIONS=--experimental-vm-modules npx jest --config test/jest.config.js --runInBand --forceExit test/unit/infrastructure/checker-service.test.js
```

## 角色与流程（每轮）

实现工程师 → 测试工程师（产 docs/reports/batch-a-round-N.md）→ 缺陷分析师（产缺陷清单 docs/reports/batch-a-bugs.md）→ 修复工程师 → 回归验证。≤5 轮；每轮独立 commit：
- 实现/修复：`git add -A && git commit -m "feat(A): ..." / "fix(A-BUG-xx): ..."`（只提交本团队文件）

## 文件所有权（团队 A）

- 可写：server/src/services/ruleMutator.js、server/src/services/checkerService.js（负例接线部分）、server/test/unit/infrastructure/rule-mutator.test.js、server/test/unit/infrastructure/checker-service.test.js（仅新增用例）
- 只读：server/src/services/ruleExecutor.js、server/src/services/factExtractor.js、docs/plan/*、KNOWN_ISSUES.md、client/*
- 禁止：切换分支、git clean、修改 .env / uploads / node_modules、真实 LLM 调用（本团队全程 mock/确定性验证；真实 LLM 仅由总控在验收点执行）

## 测试报告模板（docs/reports/batch-a-round-N.md）

1. 环境：commit id、node 版本
2. 测试矩阵：套件 1/2/3 各通过/失败数 + 新增用例明细
3. 缺陷清单：BUG-A-xx | P0/P1/P2 | 现象 | 复现步骤 | 根因 | 影响文件
4. 门禁对照（下表逐项 ✅/❌）
5. 结论：通过 / 需修复（引用缺陷号）

## Exit Criteria（团队 A 门禁，全部 ✅ 才移交 Team B）

- [ ] ruleMutator 覆盖全部 8 种 rule_type（fact 无映射的允许 skipped 并说明）
- [ ] validateNegativeTests：正常规则不误报 weak；过拟合规则必报 weak
- [ ] checkerService 接线：weakRules 进校准反馈；负例验证异常不影响生成流程
- [ ] 三段式全量测试通过（含新增，零回归）
- [ ] 总控验收：353 与 355 各真实生成一次，校准日志含负例验证信息，脚本可用
