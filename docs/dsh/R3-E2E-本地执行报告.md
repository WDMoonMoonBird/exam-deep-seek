# R3-E1 本地端到端执行报告（S1–S15 本地可验部分 + 全班 59 人 A–F 真包上传）

> 执行者：C（qa）｜执行时间：2026-10-14 12:0x｜环境：本地 API `:3000`（新代码）+ vite `:5173` + **本地开发库 `exam_system`（localhost:3306）**
> ★**云上零写入**：全程只连本机；脚本守卫对非 localhost 目标默认拒绝（见 §2）。跑全量/批改前后均 `pgrep -fl jest` 确认无并发。

## 0 结论摘要
1. **S2 全班上传通过**：真实班级 117「软件工程1班」**59/59 人**各自上传 A–F 真包（A10/B10/C10/D10/E10/F9），全部 **200 + 版本目录 + 入队 + 状态 submitted**；**失败上传不消耗次数**（前 3 人先传损坏包 ⇒ 400 拒收，随后成功提交 attemptCount=1）。
2. **本地可验场景 23 项全绿**：S1（409+1011 正确拒答）、S3–S7（开关组合）、S8a–d（权限矩阵）、S9a–d（状态机/发布/发布后再改分）、S10–S13（异常 4xx）、S15（跨路径口径一致）。
3. **S14 前端真浏览器 7 项全绿** + 关键 **5 屏截图**；`verify-frontend` **checks=51 failed=0 rc=0**。
4. **装置相关 4 类显式 SKIP**（真装置评分 / AI 总评 / 判据复用 / 预期分差表）——本地无装置与模型 key，留待上云（§5）。
5. 产物：2 份机器可读 JSON + 包→学生映射表 + 5 屏截图 + 清理脚本（dry-run 已跑：39 条 E2E-* 作业待清）。

## 1 环境与边界（计划 §14.1 复核）
| 能力 | 本地结果 |
|---|---|
| 编程题：建作业/三开关/提交/重交/上限拦截/教师改分/发布/学生可见 | ✅ 全绿（S1/S3–S9/S15） |
| 编程题真评分 | ⚠️ 无标准包 ⇒ 409+1011 已验（S1）；真出分需 checker ⇒ SKIP |
| 实训题：zip 上传/版本目录/入队/状态/次数不消耗 | ✅ 全绿（S2，59 人） |
| 实训题：真装置评分 + AI 总评 + 判据复用 + 预期分差 | ⛔ SKIP（需装置/模型 key） |
| 权限矩阵 / 异常 4xx / 前端真浏览器 / 门禁回归 | ✅ 全绿 |

## 2 脚本加固三项（计划 §11.5 / §13.4，落在 `scripts/e2e/_guard.mjs`）
1. **非 localhost 默认拒绝**：目标 host 不在 {localhost,127.0.0.1,::1} 时直接 `exit 2`；确需远程须 `E2E_ALLOW_REMOTE=1`。
2. **打印将写入的库名**：启动即打印 `base=… | 将写入库=exam_system @localhost | 本机目标=true | 已批准的本地开发库=…`。
3. **--i-know 确认**：本地开发库 `exam_system` 之外的库一律要求 `--i-know`（或 `E2E_I_KNOW=1`）；本轮 **4 个执行脚本全部带 `--i-know` 运行**（班长脚本语义见下）。
4. **`E2E_MATERIALS_DIR`**：素材目录可覆盖（默认指向真实材料目录）。
> 说明：契约里的 `node scripts/e2e/r3-cross-role.mjs`（无 `--i-know`）之所以仍可跑通，是因为它命中"本机 + 已批准开发库"这一豁免；其余四个脚本均为强制确认。

## 3 S2 全班 59 人上传（真实材料 A–F）
- 素材（真实）：`…/第六章实验/` 标准包 `《Spring MVC 数据绑定和响应》期末实践考试.zip`（19.1MB）+ 学生包 `A–F.zip`（各 19.1MB）+ `题目描述.txt`（15.0KB）+ `评分标准.txt`（13.8KB）。
- 作业：`E2E-S2-202610140403`（**aid=331**，题 **qid=361**）｜三开关 = 允许重交 **开** / 上限 **2** / 口径 **取最后** / 可见性 **发布后**（回显一致）｜教师 teacher_a(id 1063)｜班级 117。
- 分配：按 studentId 升序循环 A,B,…,F ⇒ **A10/B10/C10/D10/E10/F9**（映射表 `e2e-class-upload-map.json`，含每人工号+姓名+包+结果）。
- 逐人结果：**59 ok / 0 fail**；每人响应均含 `version=1`（版本目录）+ `submission.id` + 文件树非空；DB 复核 `submissions=59`；教师视角 59 行状态全为 `submitted`（等待评分）。
- 失败上传不消耗次数：前 3 人（202600001-202600003）先传**截断包** ⇒ 400「压缩包内容非法」；随后真包成功 ⇒ `attemptCount=1`（未计失败次数）。
- 学生口令：本轮把 59 名学生的本地口令重置为统一测试口令（**仅本地开发库**，云上未涉及；已在 JSON 报告记录该动作）。
- 入队/状态：上传即生成版本目录并入队（`status=submitted`）；**轮询到评分完成不可达**（无装置）⇒ 见 §5。

## 4 本地可验场景（S1/S3–S13/S15）逐条结果（23 PASS / 0 FAIL / 2 SKIP）
| 场景 | 期望 | 实测 |
|---|---|---|
| S1 无标准包触发批改 | 409+1011+requiresChecker | ✅ 409 / `CHECKER_NOT_READY` / requiresChecker=true |
| S3 上限=1 | 第 2 次 400+文案+次数不动 | ✅ 400「已达提交次数上限（最多 1 次）」，attemptCount=1 |
| S4 不允许重交 | 第 2 次 400 | ✅「已提交，不可重复提交」 |
| S5 口径回显 | best/last 落库回显 | ✅ best/last（真分影响 ⇒ SKIP，见 §5） |
| S6 after_publish 未发布 | 无答案/AI 值 | ✅ aiScore/aiFeedback 键不存在；6 个 referenceAnswer 键**全为 null**（已裁剪） |
| S7 不限次 | 3 次均 200 | ✅ [200,200,200] |
| S8a 他师看提交 | 403 | ✅ 403/1003 |
| S8b 他师改分 | 403+零写入 | ✅ 403 且 DB 三字段未变 |
| S8c 教师走管理员端点 | 403/404 | ✅ 404/1404 |
| S8d 非本班学生提交 | 4xx | ✅ 403「无权访问该作业」 |
| S9a 改分 | reviewed | ✅ DB=reviewed |
| S9b 发布（真端点） | published | ✅ DB=published |
| S9c 发布后学生可见 88 | 88 | ✅ 学生端=88 |
| S9d 已发布再改分（G3） | 仍 published 且可见新分 | ✅ DB=published，学生端=90 |
| S10 非法 questionId | 400+文案 | ✅「题目不存在或不属于该作业」 |
| S11 非 zip | 400「压缩包内容非法」 | ✅ |
| S12 穿越包（真实 `../../evil.txt`） | 400「压缩包内容非法」 | ✅ |
| S13a 过期作业 | 4xx+文案 | ✅ 400「已过截止时间，不可提交」（LOCKED 才是 403，已按实况修正断言） |
| S13b 锁定作业 | 403 | ✅「作业已被锁定，无法提交」 |
| S15 跨路径一致 | 详情=列表=成绩页 | ✅ 77/77/77 |

## 5 SKIP 清单（含具体理由，不自欺）
| 项 | 理由 |
|---|---|
| 真装置评分 | 本地无 DSH 装置/材料根 ⇒ 造尺不可完成（实测：checker/generate 返回 200「已开始生成」后**终态仍 generating**；作业级批改返回 409/1011 `RULER_NOT_READY`） |
| AI 总评 | 需模型 key（本地未配置/不调用） |
| 判据复用（同包二次提交命中复用） | 依赖装置产物（本地无尺可复用） |
| 预期分差表（F≥95、B 模块二 < F 等） | 需真评分结果，本地不可得 |
| S6b immediate 正例（评分完成即可见答案） | 无评分 ⇒ 状态停在 submitted，正例不可达（门本身在 C2-S4 与 r3-d4 套件有覆盖） |
| S5b 口径对机器分的真分影响 | 同上；纯函数与读路径已由 C1（Q1–Q6）与集成套件覆盖 |
| S2-11b 服务端 assignmentId 过滤 | 本地 `:3000` 进程**启动早于 D12 修复**（服务端 total=1651≠59）⇒ 仅记录运行态；D12 已由 C8 同代码库验证（8/8）。**建议重启 :3000 后复跑一次以消除该观察** |

## 6 S14 前端真浏览器 + verify-frontend
- Playwright（`scripts/e2e/r3-frontend-shots.mjs`）驱动 vite :5173 + 真 API：**7 PASS / 0 FAIL**，5 屏截图：
  `docs/dsh/evidence/agent-c/shots/s14-1-teacher-new-assignment.png`（建作业弹窗三开关）、`s14-2-student-submit-attempts.png`（学生端「已提交 1 次 · 本次为第 2 次 / 还可提交 1 次」）、`s14-3-teacher-project-review.png`（实训审核页）、`s14-4-student-scores.png`（成绩页已出分）、`s14-5-student-assignment-detail.png`（作业详情 得分 77/100）。
- `verify-frontend`：**checks=51 failed=0 rc=0**（原样复跑）。

## 7 产物清单
| 产物 | 路径 |
|---|---|
| JSON 报告（全班上传） | `docs/dsh/evidence/agent-c/e2e-class-upload-202610140403.json`（附 smoke 版 …0402.json） |
| 包→学生映射表（含逐人结果） | `docs/dsh/evidence/agent-c/e2e-class-upload-map.json` |
| JSON 报告（本地场景） | `docs/dsh/evidence/agent-c/e2e-local-plan-202610140404.json` |
| 5 屏截图 | `docs/dsh/evidence/agent-c/shots/s14-*.png` |
| 清理 dry-run 输出 | `docs/dsh/evidence/agent-c/e2e-cleanup-dryrun.txt` |
| 契约 verify 输出 | `docs/dsh/evidence/agent-c/e2e-cross-role-verify.txt` |
| 脚本 | `scripts/e2e/{_guard,r3-class-upload,r3-local-plan,r3-frontend-shots,r3-local-cleanup}.mjs` + `r3-cross-role.mjs`（接入守卫） |

## 8 清理清单（本地；**默认不动手，等确认**）
- 命中：**39 条 E2E-* 作业**（含计划 §13.3 的 319–327 + 本轮新建 328–358 等）+ **6 个 E2E- 题** + **7 个磁盘目录**（`server/uploads/project-submissions/{358,359,360,361}`、`project-questions/{358..361}`，合计 ≈5MB）。
- 脚本：`node scripts/e2e/r3-local-cleanup.mjs --i-know`（dry-run，只列不删）→ 加 `--execute` 才删，并在删后做「0 命中」复核。
- 用户已接受"真实学生测试留痕"（计划 §14 决策③）⇒ 我**未执行删除**；如需清理请给一条指令（`--execute`）。云上仍零涉及。
