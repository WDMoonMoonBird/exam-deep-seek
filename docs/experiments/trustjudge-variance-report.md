# TrustJudge 方差实验报告 — legacy 直评 ×5 vs TrustJudge ×5

> 分支：feat/trustjudge-scoring（master 基线）｜ 作业 353（用户管理系统前端）｜ 数据源：真实提交（server/test-results/trustjudge/dataset.jsonl）
> 实验：server/scripts/trustjudge-experiment.mjs ｜ 生成：2026-09-06
> legacy = deepseek.js gradeProject（temperature 0.3 单点，v4-flash）；TrustJudge = sidecar 分布敏感评分（deepseek-chat，temperature 1.0 + top_logprobs 20 → softmax 期望分，round 后对比）

## 汇总

| 指标 | legacy 直评 | TrustJudge |
|---|---|---|
| 参与提交数 | 3 | 3 |
| 单提交 std 范围 | [2.74, 5.86] | [2.95, 5.22] |
| 平均 std | **4.74** | **4.40** |
| 同分率（5 次全同分） | 0/3 | 0/3 |
| legacy 基线 vs 实际均值偏差（mean abs） | 10340:+7 / 10342:-12.4 / 10326:-4.2 | 10340:+0.8 / 10342:+24.4 / 10326:+5.8 |

## 明细

| submission | student | legacy 基线 | legacy ×5 | mean | std | TrustJudge ×5 | mean | std |
|---|---|---|---|---|---|---|---|---|
| 10340（copy 标准包） | 1066 | 90 | [95, 95, 100, 95, 100] | 97.0 | 2.74 | [88, 88, 95, 91, 92] | 90.8 | 2.95 |
| 10342 | 1068 | 65 | [59, 51, 50, 58, 45] | 52.6 | 5.86 | [89, 95, 94, 85, 84] | 89.4 | 5.03 |
| 10326 | 2305 | 81 | [81, 67, 78, 78, 80] | 76.8 | 5.63 | [88, 92, 78, 88, 88] | 86.8 | 5.22 |

## 观察

1. **方差（std）：TrustJudge 未显著优于 legacy**——平均 4.40 vs 4.74，仅 -7%；单样本互有胜负（10340 甚至 tj 2.95 > legacy 2.74）。
   原因：TrustJudge 论文的分布敏感评分是"**单次调用内**把离散概率转期望"（消除 argmax 跳档），但本项目实验是"**多次独立调用**"——temperature 1.0 下每次调用的概率分布本身在漂移，期望分随之波动，跨调用方差并未被消除。
2. **均值漂移：TrustJudge 系统性偏高**——对 10342（legacy 认为 65 的差提交）给出 89.4 分均值（+24 分偏移）；对 copy 标准包的 10340 反而低于 legacy（90.8 vs 97）。
   结合 TrustJudge 在"总分+9 分项各一次调用"的 10 单元结构，逐项期望累加可能放大宽松偏向；且 prompt 未按 legacy 的严格 rubrics 约束（对比 legacy 的 PROJECT_ROLE 有明确打分纪律）。
3. **legacy 自身不稳定再现**：10342 五轮 45~59（std 5.86），10326 五轮 67~81（std 5.63）——原"同答案分差大"问题在 master 直评下确认存在。
4. 10340 是标准包 copy（20/62 学生如此），legacy 对其 95~100、TrustJudge 88~95：两份实现都未能把"与标准包相同"识别为满分——**两链路都缺少确定性基准比对**。

## 结论（初步）

- 在当前集成方式下（每次提交独立调用 sidecar ×N），TrustJudge 的**跨调用一致性收益不显著**，且存在系统性偏高的新问题（分项累加 + 宽松 prompt）。
- TrustJudge 分布敏感评分的价值在论文场景（单次调用内消 argmax 跳档 + 成对比较消位置偏差）成立；但本项目"绝对分数 + 多次重评一致性"需求下，**单纯换评分后端不能解决同答案方差**。
- 若要沿 TrustJudge 路线继续，应改为：① 用与 legacy 一致的严格评分 prompt（仅把输出层换成 logprobs 期望）；② 或对同一提交做**单次调用的分布聚合**（论文本意）而非多次独立调用；③ 或引入确定性规则做基准锚定（即 rule-driven 分支路线）。
- 与 feature/rule-driven-scoring 对比：该分支实测 59 人重评组内 std=0（确定性执行），远优于此处两条 LLM 链路的 std≈3~6——**规则驱动仍是本项目一致性问题的根本解**。
