# 合并对账清单：`feat/ui-redesign` ↔ `feature/rule-driven-scoring`

> captain 整理 ｜ 目的：把「唯一有失败风险的环节」变成可执行的清单
> 事实基础：`git diff --name-only master...<branch>` + `--stat`（已实测，非推测）

## 1. 事实

| 项 | UI 分支 | rule-driven-scoring |
|---|---|---|
| 相对 master 领先 | 28 提交 | 20 提交 |
| 改动的 client/src 文件 | 20+ | **11** |
| master 现状 | `152ec99` = 双方共同分叉点，master 领先 0 | 同 |

**重叠文件只有 3 个**（其余 8 个是对方新增：`components/checker/*`、`api/checker.js`、`domain/projectType.js`、`views/teacher/RuleQuality.vue`、`router/index.js` —— 我们未动，可干净合并）：

| 文件 | 我方改动 | 对方改动 | 冲突性质 |
|---|---|---|---|
| `views/teacher/Layout.vue` | 199 行（侧栏分组 + 待审核徽标 + 令牌化） | **5 行**（新增菜单项「规则质量」+ 引入 `LineChartOutlined`） | 极易对账：把该菜单项并入我方分组侧栏即可 |
| `views/teacher/ProjectReviewNew.vue` | 195 行（三栏工作台壳重写） | **4 行**（折叠面板标题「分项明细」→「评分标准」；两处 `a-tag` 加「检查/主观」标记） | 易对账：4 行重新落到新结构上 |
| `views/teacher/ProjectQuestionEdit.vue` | 150 行（FormPage 迁移 + 令牌化） | **244 行**（实训题相关功能扩展） | ⚠️ **真冲突点**，需人工对账 |

## 2. 建议：**UI 分支先合并**

理由：我方改动是**结构性/壳层**（20+ 文件的组件化与令牌体系），对方改动是**功能增量**（新页面 + 规则引擎接入）。后合并方的成本不对称：

- 对方后合并 → 需要对账 **3 个文件**（其中 1 个 244 行的增量要重新落到新壳上）
- 我方后合并 → 需要对账同样 3 个文件，但要在 20+ 文件的新体系下逐一验证，且我方 4 份验收报告的结论全部作废需重跑

**因此：`feat/ui-redesign` 先合 master → 对方 rebase/merge 后按本清单对账。**

## 3. 三个文件的对账动作（给后合并方）

1. **`Layout.vue`**：把 `<a-menu-item key="/teacher/rule-quality">规则质量</a-menu-item>` 加进我方侧栏的合适分组（建议「教学」组）；图标 import 合并。注意我方侧栏已有分组结构与待审核徽标，勿整块替换。
2. **`ProjectReviewNew.vue`**：
   - 折叠面板标题改成「评分标准（N 项）」
   - 两处 `a-tag`（检查=blue / 主观=orange）并入新的评分面板结构
   - ⚠️ 对方写法是 `style="font-size:10px"` **内联硬编码** —— 与新体系冲突（我方硬检查要求 hex/!important 为零、字号走令牌）。请改为令牌或语义类；10px 属 off-scale（字阶下沿 12px），若确有需要请提出来，captain 会决定是否扩字阶而不是内联写死。
3. **`ProjectQuestionEdit.vue`**：以我方版本为基准，逐块把对方的 244 行增量落回（FormPage 外壳 / 对话框 useConfirm / 令牌化样式保留），必要时由双方共同 review。

## 4. 新体系速查（对方 rebase 后写代码请遵循）

| 旧写法 | 新写法 |
|---|---|
| 自定义表格 + `DataTable.vue` | `ListPage.vue`（分页/每页条数/error 插槽内建） |
| `Modal.confirm({...})` | `useConfirm()({ title, content, okText, danger, onOk })` |
| 硬编码色值 / `!important` | 语义令牌（`--text-*`/`--bg-*`/`--border-*`…），禁 `!important` |
| 内联 `style="font-size:10px"` | 令牌（`--fs-caption` 等）或语义类 |
| 页面自绘页头 | `PageShell.vue`；表单页用 `FormPage.vue` |
| 自动保存自写 setTimeout | `useDraftAutosave`（`schedule()` 防抖入口 / `saveNow()` 立即保存） |
| Modal 宽度任意值 | 480 / 640 / 820 三档 |

## 5. 合并检查清单（谁合谁跑）

- [ ] 合并后 `cd client && npm run build` 通过
- [ ] `grep -rE '#[0-9a-fA-F]{6}' client/src --include='*.vue' | wc -l` 不比合并前变差（当前 **71**）
- [ ] `grep -r '!important' client/src --include='*.vue' | wc -l`（当前 **6**）
- [ ] `grep -rn 'Modal.confirm' client/src/views | wc -l` = **0**
- [ ] 三端抽页截图（列表 / 表单 / 工作台 / 作答）无回归
- [ ] `npm run build` 后重启 server（`express.static(client/dist)`）并观察
- [ ] **回滚预案**：`git revert -m 1 <merge-commit>` + 重新 build（无灰度开关，回滚即重新发布）

## 6. 需要对方回答的三个问题

1. `ProjectQuestionEdit.vue` 的 244 行是否含**结构性**改动（模板骨架/样式体系），还是纯逻辑与字段扩展？后者对账会快很多。
2. 他们的 20 提交是否已全部完成、可以 rebase（还是仍在开发中）？若仍在开发，建议他们先合 master 再继续。
3. 他们是否也在等 master 上的其他分支（`feat/chrome69-legacy-adaptation`、`feat/open-project`、`feat/trustjudge-scoring`、`feat/ui-api-batch1` 目前均 0–1 提交，基本已并入）？
