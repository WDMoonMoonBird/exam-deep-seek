# R3-E2E 云上阶段执行报告（S3：59 人真评分 + 复用核查 + 权限抽查）

> 执行者：C（qa）｜环境：**云上生产** 203.0.113.10（SSH root）｜应用 `/var/www/exam-new/server`（pm2 `exam-server-new` :3002 + `dsh-grader-worker`）｜库 `exam_system` @localhost
> 硬边界遵守：**只创建/操作 e2e_ 前缀对象**；未改任何真实教师口令、真实班级、真实作业与提交（对真实对象仅只读查询）
> 注：本任务上一 attempt（10a3c5a0…）中途中断，云上实质工作已完成；本次（attempt 063a8d1a…）**只做只读核查 + 报告**，未重复写入、未重复评分

## 0 结论摘要
1. **59/59 真评分完成**（应用内实训题 AI 评分，真实 DeepSeek 调用）：状态全 `ai_graded`，aiScore **min 83 / max 100 / avg 94.08**，全部 ≤ ~3.5 分钟完成（并发 16）。
2. **预期分差成立**：云端 **F 99.22 最高**、**A 88.00 最低**，与本地实测（F 99.11 / A 86.0）高度一致（§4）。
3. **★判据复用：证伪（不是"命中复用"，而是根本没走尺路径）** —— aid=17 **无 ruler 绑定**、**0 条 grading_jobs**、**0 条用量记账**；59 份评分全部由应用 **legacy AI 路径**完成（`gradingMode=legacy`）。故 ⑤ 记为 **SKIP/未验（前置缺失）**，理由见 §5。
4. **★新缺陷（真实、非 R3 引入）**：落库的 `ai_feedback.breakdown` **7 项 score 全为 0、comment 全空**，而总分与文字结论正确 ⇒ 任何"按失分项分布"的聚合都会失真（§6）。
5. 权限抽查通过：不可见教师查看/改分 **403**，零写入（§7）。**费用：本轮 legacy 路径不记账（如实说明）**，历史尺路径数值见 §8。

## 1 e2e_ 写入清单（逐条列出，供日后清理）
| 对象 | 内容 | 计数 |
|---|---|---|
| 用户 | `e2e_teacher`(1247，**既有**)、`e2e_s01`…`e2e_s59`（本次建，统一口令 `E2e@12345`）、`e2e_teacher2`(1307，本次建，越权抽查用) | 61 个 `e2e%` 用户（1247–1307）|
| 班级 | `e2e_云测班`（id=21，school 1，e2e_teacher 已入班） | 1 |
| 题目 | `E2E-云-S2-实训题-202610140522`（id=16，type=project，标准包已挂 `project-questions/16/standard`，material=题目描述、scoringRubric=评分标准） | 1 |
| 作业 | `E2E-云-S2-202610140523`（id=17；三开关 **重交=开 / maxAttempts=2 / policy=last / visibility=after_publish**；绑定 qid=16 + 班级 21） | 1 |
| 提交 | aid=17 下 59 条（每人 1 条，version=1；包分布 **A10/B10/C10/D10/E10/F9**） | 59 |
| 磁盘 | `uploads/project-submissions/16` = **8.7M**（59 个学生目录）、`uploads/project-questions/16` = **152K**、临时 temp 目录 `temp_1791955351500_8cq0yv` | — |
| 无写入确认 | 未新增/修改任何 ruler、checker、assignment_question_rulers 行（仍为 2 把尺 / 3 条绑定 / 3 个 checker） | 0 |

## 2 资产与侦察（步骤①）
- 云上 `questions` 共 15 题：**checkerStatus=ready 为 0**（9 code + 6 project 全 none）；`grading_rulers` = **2**（id1 创建于 10-13 09:32、id4 于 10-13 14:25，均 ready，绑定真实作业 9/15/16）。
- 标准包挂载方式：`POST /teacher/projects/upload-package`（multipart）→ `tempId` → `POST /teacher/questions {type:'project', tempId, material, scoringRubric}`，落 `uploads/project-questions/<qid>/standard`。本次按此路径上传**裁剪 target/.idea 后的标准包（20KB）**，服务端抽取面与全包一致（本地实证：抽取跳过忽略目录）。
- 材料：`A–F.zip`（各裁至 15–16KB）+ `standard.zip` + `rubric.txt` + `description.txt` 已送至云 `/tmp/e2e-materials`（**不在仓库、不在生产数据对象内**）。

## 3 59 人上传与真评分（步骤③④）
- 建作业后逐人上传（内部 API `:3002`，真 multipart）：**59/59 返回 200 + code 0 + version=1 + submission.id**；单次上传 20–64ms（裁剪包）。
- 评分：**应用内实训题 AI 评分**并行执行（日志 `gradingMode=legacy`、`实训题 AI 评分完成`），单份耗时样本 **21.8 / 22.2 / 24.4 / 25.1 / 36.0 / 38.7 / 40.0 s**；13:23 完成上传、13:26:35 轮询即 **59/59 ai_graded**。
- aiScore 分布：83×1 / 84×1 / 85×4 / 86×2 / 87×1 / 91×2 / 92×5 / 93×1 / 94×9 / 95×7 / 96×3 / 97×14 / 99×7 / 100×2。
- **job 状态**：`grading_jobs WHERE assignment_id=17` = **0** ⇒ 本轮**未经过 grading_jobs 队列**（这是如实结论，不是缺失证据）。

## 4 预期分差对照（步骤⑥）
| 包 | 云上 n | 云上 avg（min–max） | 本地参照 avg | 关系校验 |
|---|---|---|---|---|
| **A** | 10 | **88.00**（83–97） | 86.0 | **最低 ✓** |
| B | 10 | 96.80（95–97） | 96.4 | — |
| C | 10 | 96.10（95–97） | 95.5 | — |
| D | 10 | 94.10（94–95） | 94.0 | — |
| E | 10 | 90.80（86–93） | 89.8 | — |
| **F** | 9 | **99.22**（99–100） | 99.11 | **最高 ✓** |
- 结论：**F 最高、A 最低**成立，且六包排序与本地完全一致（A<E<D<C<B<F）；A 包方差最大（83–97，含 1 例 97 异常），F 包最稳（99–100）。

## 5 ★判据复用（步骤⑤）：**SKIP / 证伪**（前置缺失，不假通过）
- **证伪"命中既有尺复用"**：aid=17 **不在** `assignment_question_rulers`（绑定只有 aid9→ruler1、aid15/16→ruler4）；`grading_jobs`(aid17)=0；`grading_run_usage` 中 aid17 相关行=0；`grading_rulers` 仍为 2（未新建、也未"复用"——因为**与尺无关**）。
- **实际路径**：59 份全部为应用 legacy AI 评分（`gradingMode=legacy`），其真实复用面是**评分标准快照复用**：日志 `from_snapshot=true, snapshot_origin=publish`（同一份 rubric 快照被 59 次评分反复使用）。
- **尺路径为何不可用**（前置缺失，建议修）：`POST /teacher/assignments/17/grade` → **409 + 1011 `RULER_NOT_READY` / `reason=no_ruler_source` / `rulerStatus=missing` / contentKey=`f046e38f…`**；根因两条：①应用侧无 builder（ruler store 返回 `no_builder_available`，只能"调用方即 builder"）；②worker 的装置参数 `scripts/dsh-grader/run.sh` 相对 cwd `/var/www/exam-new/server` **不存在**（装置实际在 `/var/www/exam-new/scripts/dsh-grader/run.sh`）。
- **历史对照（机制有效、本轮不可复现）**：job21 造尺+量尺 ¥**1.498937**、job25 ¥**1.460335**（deepseek-flash、peak 档、缓存命中 97.1%/95.4%、各 40 份）；job22/23/24/26 为 `no_model_session=1 / cost_total=0` ⇒ 复用态**零 LLM 记账**（这正是"判据复用"的记账特征，可用于上云修复后复验）。

## 6 ★breakdown 逐项分数异常：判定为**缺陷（字段未填充）**
- 完整结构（`submissions.ai_feedback`，样例 id=3612，aiScore=84）：
  `{"breakdown":[{"item":"SpringMVC核心配置","score":0,"maxScore":22,"comment":""},{"item":"实体类定义","score":0,"maxScore":10,...},{"item":"PageController跳转","score":0,"maxScore":16},{"item":"日期转换器配置","score":0,"maxScore":8},{"item":"请求参数绑定","score":0,"maxScore":26},{"item":"DataController响应","score":0,"maxScore":12},{"item":"JSP页面","score":0,"maxScore":6}],"highlights":[…5 条…],"issues":["未提交 DataController.java，响应输出模块完全缺失",…],"overallComment":"…总分 84 分。"}`
- 判定依据：`maxScore` 齐全（22/10/16/8/26/12/6 = 100）、`overallComment` 与 `issues` 明确指向失分模块（"DataController 缺失 = 12 分丢失"）⇒ **模型确实分模块判过**，但 `score`/`comment` 未回填；消费者无法区分"该项 0 分"与"未填" ⇒ **不是"由 status 承载"，是真实缺陷**。
- 影响面：任何按 `breakdown[].score` 聚合的"按班看失分项分布"页面必然全 0（失真）；本波 R3 的取最高/取最后与总分展示不受影响（它们只用总分）⇒ **R3 未引入、但会阻碍 E2E 计划的模块级定位断言**。
- 修复建议：legacy 路径在生成 breakdown 时回填 `score/comment`（或按模块名对齐规则量尺结果）；若短期不修，前端/报告须显式标注"逐项分数不可用（仅总分）"。

## 7 权限抽查（步骤⑦）
- 不可见教师 `e2e_teacher2`(1307，不在班级 21)：`GET /teacher/submissions/3612` ⇒ **403 / 1003**；`PUT /teacher/submissions/3612/score` ⇒ **403 / 1003**；`GET /teacher/assignments/17` ⇒ **404 / 1004**。
- **零写入** ✅：改动前后 `{final_score, teacher_feedback, status, ai_score}` 完全一致（`{null,null,ai_graded,84}`）；此前一次 `zeroWrite=false` 系脚本比较键包含 `id` 的误判，已修正复测。
- **管理员重评 ⇒ SKIP**：云上 `super_admin` 账号口令不可用（不得改真实账号），如实跳过。

## 8 费用记账
- **本轮（legacy AI 路径）不写 `grading_run_usage`**（aid17 相关用量行 = 0）⇒ **本轮真实费用无法从库中取得**（如实说明，不编数）。
- 可给数值：历史尺路径 **¥1.460335 / ¥1.498937** 每次"造尺+40 份量尺"（peak，deepseek-flash），复用态 **¥0**；按此量级，若走尺路径 59 份 ≈ **¥1.5–2.2**（造尺一次 + 复用），legacy 路径 59 份 = 59 次独立 LLM 评分（无记账，量级按历史单次缓存命中价推算约 ¥2 上下，仅供参考）。

## 9 残留与风险
1. **e2e_ 残留待清**（§1 清单）：61 用户 / 1 班 / 1 题 / 1 作业 / 59 提交 / 8.9M 磁盘 + `temp_1791955351500_8cq0yv`；清理顺序建议：submissions → assignment_question_rulers(若有) → assignment_classes → assignments(17) → questions(16) → classes(21) → users(e2e_s%，e2e_teacher2) → 磁盘目录；`e2e_teacher`(1247) 为既有资产，是否保留由队长定。
2. **尺路径前置缺失**（§5）：worker 装置路径 + 应用侧 builder ⇒ 判据复用/真装置量尺在当前部署不可跑；上云"不等峰谷"结论**不含**判据复用一项。
3. **breakdown 未回填**（§6）：建议开修复项，否则模块级失分分析（E2E 计划 11.2 的定位断言）无法落地。
4. 运行期观察：59 份 legacy 评分并发 16、单份 21.8–40.0s，与用户"不等峰谷"的时延预期一致；A 包出现 1 例 97 分异常（同包其余 83–86），提示同包内 AI 波动可达 ±7，做"同包内一致性 ≤5"断言时需放宽或取中位数。
5. 未越界确认：仅创建/操作 e2e_ 对象；未改真实教师口令/班级/作业/提交；对真实对象只有只读查询；云上临时脚本与素材位于 `/tmp/e2e-cloud`、`/tmp/e2e-materials`。

## 10 证据索引
- `docs/dsh/evidence/agent-c/e2e-cloud-db-evidence.txt`（云上只读核查原始输出：状态/尺/绑定/checker/用量/对象清单/权限前后快照/日志样本）
- `docs/dsh/evidence/agent-c/e2e-cloud-report.json`（结构化：资产清单、分差表、判定与证据）
- 云上原始：`/tmp/e2e-cloud/{state,report,evidence,perm,reuse,final2,final3}.json|txt`、`/root/.pm2/logs/exam-server-new-out.log`
