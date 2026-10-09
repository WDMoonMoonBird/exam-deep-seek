# Wave 4 之后的路线图（合并 · 发布 · 收口）

> captain 整理 ｜ 分支 `feat/ui-redesign`（25 提交，已推送 origin）｜ 工作区干净
> 本文回答「Wave 4 之后还有什么」，并给出完成定义（DoD）与建议顺序。

---

## 0. 先说三个硬约束（已实测）

| 事实 | 数据 | 影响 |
|---|---|---|
| master 就是分叉点 | `merge-base = 152ec99 = master`，master 领先 0 提交 | UI 分支可**干净合并**，无冲突 |
| **另一条分支会撞车** | `feature/rule-driven-scoring` **领先 master 20 提交、改动 11 个 client/src 文件** | 必须先与它对账合并顺序，否则后合并方要大面积 rebase（很可能撞上我们重写过的页面） |
| 发布形态 | `server/src/app.js:109` 直接 `express.static(client/dist)` | 发布 = 合并 + `npm run build` + 重启 server；**回滚 = revert 合并提交 + 重新 build**（无灰度/无开关） |
| 无 lint / 无单测 | `client/package.json` 只有 dev/build/preview | 合并前的自动化闸门只有 build + Playwright；若要 lint 需先引入 |

---

## 1. 剩余工作（按优先级）

### ① 合并与发布（真正的风险点）
- 与 `feature/rule-driven-scoring` 的负责人对账：**谁先合并**、后合并方如何 rebase（建议：UI 分支先合，因为它是横切全站的壳层改动；对方按新组件重排）
- 合并到 master（当前可直接合）→ `npm run build` → 重启 server
- **回滚预案**：保留 tag/分支指针，出问题 `git revert -m 1 <merge>` + 重新 build（预计 1 个构建周期）
- 合并后需复跑：Wave 1–3 的验收报告结论在 master 上仍成立（build + 抽页截图）

### ② 后端配套（前端无法单方面完成）
| 项 | 内容 | 状态 |
|---|---|---|
| R-5 | 7 个列表接口服务端分页（admin 4 页 + teacher classes/students/teams），前端已留 `TODO(P1-7)` 与前端切片 | 待后端 |
| 其余 | `06-api-gap.md` 中除 Batch1（已交付 152ec99）外的项 | 需复核清单 |

### ③ 人工走查（UAT）——自动化替代不了
关键链路端到端走一遍（建议用真实教师/学生账号）：
1. 教师：布置作业（含开放性题软警告）→ 班级/学生/团队管理 → 导入导出
2. 学生：作答（**含断网/关页场景**，验证 t22 修好的草稿链路）→ 提交 → 看成绩与反馈
3. 教师：AI 评分 → 逐题批改（含「使用 AI 评语」）→ 实训题双源阅卷 → 批量发布
4. 管理端：学校/班级/教师/学生/监控/AI 配置
5. **三端 × 亮/暗色 × 两档密度** 各抽一遍

### ④ 上线前技术体检（Wave 4 未覆盖）
| 项 | 现状 | 建议 |
|---|---|---|
| Bundle 体积 | `client/dist` = 11M（含 `*-legacy-*` 产物） | 补一次改动前后对比；确认 legacy 产物只对 Chrome 69 生效 |
| 浏览器矩阵 | 只测过 Chromium（含 legacy 近似） | **Safari / 真机未测**；至少抽主要页面 |
| 无障碍 | 有 aria 修补（S3、aria-live、label），**未跑全站 axe 扫描** | 跑一次 axe，登记问题 |
| 性能 | 未测 | 大数据量列表（如 130 行）与 Monaco 冷启动（已知 ≈27s） |
| 死代码/残留 CSS | `style.css` 仍有 18 处 hex、旧 :root 块 | Wave 4 收口时清 |
| Lint | 无 | 可选：引入 ESLint（或明确放弃并记录） |

### ⑤ 文档收口（防止文档继续误导）
- **as-built 对账**：设计稿 ↔ 实现的差异清单（至少含：倒计时未实现、学生作业卡片变体、密度分档、Modal 宽度未全收敛 R-14、10/11px 字阶缺口 R-13）
- 组件手册补「实际 API」（useConfirm 的 thenable 细节、useDraftAutosave 的 schedule/saveNow、FormPage 插槽、ListPage 三开关）
- README / onboarding 更新为新结构

### ⑥ 团队与知识资产
- 待确认队列：技能 `delivery-verification`、`agent-wave-orchestration`（后者确认后我会 patch 进边界三条硬规则与验证层级教训）；若干记忆建议
- AgentTeams 团队归档（保留分支、文档、报告、截图）

---

## 2. 完成定义（DoD）

一个 UI 重构批次什么时候算「做完」：

- [ ] 全部页面迁移完成，收口池中没有「归属本批」的未决项
- [ ] 三个验收报告（10/12/14 + 15）的结论在当前 HEAD 上可复算
- [ ] `npm run build` 通过；硬检查（hex / !important / Modal.confirm）达到目标值
- [ ] 亮/暗 × 两档密度 × 三端 抽验通过
- [ ] legacy（Chrome 69）逐页扫描无阻断问题
- [ ] 关键链路 UAT 通过（真人走查签字）
- [ ] 与并行分支的合并顺序已对账，master 合并 + 发布成功
- [ ] 回滚预案已书面化（revert + rebuild）
- [ ] as-built 文档与设计稿对账完成
- [ ] 团队归档、技能/记忆入库

---

## 3. 建议顺序

```
Wave 4（清扫波：Doc/Login + 全局收口 + legacy 扫描 + 暗色/移动端复核）
  ↓
技术体检（bundle / Safari / axe / 性能）＋ as-built 对账        ← 可与 Wave 4 并行
  ↓
UAT（真人走查关键链路，重点验草稿链路修复）
  ↓
与 feature/rule-driven-scoring 对账合并顺序
  ↓
合并 master → build → 发布 → 观察
  ↓
文档收口 + 团队归档
```
