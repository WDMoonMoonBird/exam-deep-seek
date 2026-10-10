# TrustJudge 评分一致性实验与缺陷预检方案设计（2026-09-06）

> 分支：feat/trustjudge-scoring（基于 master）｜ 状态：实验验证完成，方案待接入
> 关联：docs/experiments/trustjudge-variance-report.md、selfconsistency-report.md、
>       docs/test-results/2026-09-06/trustjudge-regression.md

## 一、背景与问题

master 的实训题评分 = deepseek.js gradeProject（LLM 直评，temperature 0.3，单点打分）。
实测同一份学生代码多次评分差距大（作业 353，62 名学生实际仅 6 种代码内容）：

| 代码组 | 人数 | LLM 单次评分范围 | std |
|---|---|---|---|
| A（=标准包原样） | 20 | 92~100 | 2.4 |
| B（完整实现） | 20 | 62~88 | 8.8 |
| C（故意缺陷：缺 Login.vue/user.js 且被 import） | 19 | **36~95** | **15.5~18.5** |

C 组分裂根因：**"发现代码缺陷"对 LLM 是概率行为**——117K tokens 长上下文中注意力随机，
部分采样"看到"缺失文件打 36 分，部分"没看到"打 95 分（幻觉高分）。

## 二、实验结论（三条路线对比，同 3 份真实提交）

| 方案 | C 组 std | 说明 |
|---|---|---|
| legacy 直评 ×5 | 15.5~18.5 | 原问题 |
| TrustJudge（logprobs softmax 期望）×5 | 4.4（3 样本均值） | 消除单次内 argmax 跳档，**无法消除跨调用模式漂移**；且 prompt 宽松导致系统性偏高（+24 分） |
| 自一致性中位数 ×5 | 2.4（对称误差样本） | 对称误差有效；**对双峰模式切换（LLM 在严格/宽松解释间摇摆）失效**（10326 组 std 4.65） |
| **缺陷预检 + 确定性折算 + LLM 评剩余** | **3.3** | **缺陷被确定性捕获，LLM 只评剩余空间（std 18.5→3.3，缩减 82%）** |

根本结论：**LLM 直评（无论单次/聚合/概率化）无法稳定检测"代码缺陷"这类确定性事实；
可穷举检查的维度应交规则引擎（std=0），LLM 只评剩余的主观质量维度。**

## 三、方案设计：确定性缺陷预检层（推荐接入）

### 3.1 架构

```
学生提交目录
   │
   ├─ ① defectPrecheck.js（确定性扫描，零 LLM，~5ms）
   │      ├─ import 断裂：每个源码文件的 import/require 相对引用 → 目标文件存在？
   │      │    （含 .js/.ts/.vue 扩展名补全、index 解析、目录前缀容忍）
   │      └─ 关键文件缺失：标准包存在、学生缺失（basename 比对，容忍目录名差异
   │            如 UserManagement vs UserManagement_副本）
   │
   ├─ ② defectScoring.js（确定性折算）
   │      ├─ import 断裂 → fatal + rubric「项目初始化与可运行」项全扣
   │      └─ 缺失关键文件 → 按 rubric 分项标题映射扣分（标题级匹配，避免正文关键词误命中）
   │      输出：{ hardDeductions[], totalHardDeduct, fatal }
   │
   └─ ③ LLM 评分（剩余空间）
          prompt 注入预检事实 + 限定剩余满分 → LLM 只评未受缺陷影响的功能项
          实测 C 组：std 18.5 → 3.3
```

### 3.2 折算规则（保守原则：只扣 rubric 明确对应的项）

| 缺陷 | 折算 |
|---|---|
| import 引用不存在文件（运行必崩） | fatal；扣 rubric「可运行」项全分 |
| 缺 Login.vue | 扣「登录功能」项（标题含"登录"） |
| 缺 Register.vue | 扣「注册功能」项 |
| 缺 User.vue | 扣「用户主页/个人信息」项 |
| 缺 UserList.vue | 扣「用户列表」项 |
| 缺 user.js / counter.js | 扣「Pinia 状态管理」项 |
| 未映射文件 | 不硬扣（保守，留给 LLM） |

### 3.3 关键设计决策

1. **确定性步骤不交给 LLM**：文件缺失/import 断裂可穷举检查 → 规则扫描 100% 稳定；
2. **折算保守**：只扣 rubric 明确对应的功能项，不越权扣"实现质量"；
3. **标题级匹配**：文件→分项映射用「第X项标题关键字」匹配，避免正文关键词（如"用户主页"出现在第二项正文中）误命中；
4. **剩余空间限定**：prompt 明确"已扣 N 分，只评剩余满分 M"，消除 LLM 对已扣项的重复评估与幻觉高分；
5. **与既有链路正交**：可接入 legacy 直评（注入事实）或 rule-driven（作为前置门禁），页面零改动。

### 3.4 实测折算结果（修复标题级匹配后）

| 代码组 | 缺陷 | 硬扣 |
|---|---|---|
| A/B（完整） | 0 | 0 |
| C（缺 Login.vue/user.js + import 断裂） | 3 缺陷，fatal | **40**（可运行 10 + 登录 20 + Pinia 10） |
| 2304（缺 User.vue） | 1 | **15**（用户主页项） |
| 2305（缺 UserList.vue） | 1 | **10**（用户列表项） |

## 四、接入改造点（待实施）

1. **legacy 路径**：projectGrading.js 在调 gradeProject 前执行 precheckProject；
   gradeProject 增加可选 precheckReport 参数，prompt 注入缺陷事实；
   响应信封不变（页面零改动）。
2. **TrustJudge 路径**：trustJudgeGrader.js 同法注入（sidecar /grade 已支持 rubric 文本）。
3. **rule-driven 路径**：defectPrecheck 作为 checker 生成前置门禁（或与 ruleExecutor 合并检查项）。
4. 配置开关：可复用 GRADING_MODE；缺陷折算也可做成 DB 配置（每作业可调）。

## 五、交付物清单

| 文件 | 说明 |
|---|---|
| server/src/services/defectPrecheck.js | 确定性预检器（import 完整性 + 关键文件比对） |
| server/src/services/defectScoring.js | rubric 折算（fatal/硬扣分，标题级映射） |
| server/test/unit/infrastructure/defect-precheck.test.js | 5 用例（真实提交，A/B 0 缺陷、C 必被抓） |
| server/src/services/trustJudgeGrader.js | TrustJudge sidecar 接线（GRADING_MODE=trustjudge，信封同构，故障降级 legacy） |
| server/src/services/projectGrading.js | GRADING_MODE 开关（默认 legacy） |
| trustjudge-server/ | Python sidecar（TrustJudge 算法忠实移植，FastAPI /grade） |
| server/scripts/trustjudge-dataset.mjs | 测试集提取（62 行 JSONL，可复现） |
| server/scripts/trustjudge-experiment.mjs | TrustJudge 方差实验（可复现） |
| server/scripts/selfconsistency-experiment.mjs | 自一致性聚合实验（可复现） |
| server/scripts/full-selfconsistency-353.mjs | 353 全量聚合评分（6 组 ×10 次） |
| server/scripts/fix-variance-experiment.mjs | prompt 改进对照实验（注入/checklist） |
| server/scripts/cgroup-remaining-experiment.mjs | C 组剩余空间验证（std 18.5→3.3） |
| docs/experiments/trustjudge-variance-report.md | TrustJudge 实验报告 |
| docs/experiments/selfconsistency-report.md | 自一致性实验报告 |
| docs/test-results/2026-09-06/trustjudge-regression.md | 接线回归报告（677→690 零回归） |
| 数据（gitignored） | server/test-results/trustjudge/*.jsonl / *.json（含实验原始数据与结果） |

## 六、结论与建议

1. TrustJudge / 自一致性 / prompt 改进对 LLM 直评的方差有缓解但**无法根治"缺陷检测不稳定"**；
2. **确定性预检 + 折算 + LLM 评剩余**是本实验验证的最优组合（C 组 std 18.5→3.3，缺陷零漏检）；
3. 与 rule-driven 分支的关系：defectPrecheck 本质是 ruleExecutor 的轻量前置版——若合并 rule-driven，
   该方案可作为其标准包校准/学生评分的补充门禁；若暂不合并，可作为 master 直评链路的独立加固；
4. 环境备注：本机 system_configs.deepseek_api_key 已同步为有效值（server/.env 同款，gitignored，不入库）。
