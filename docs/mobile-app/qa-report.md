# 独立设计评审报告 · Exam-DeepSeek 移动端 37 屏

> 评审对象：`docs/mobile-app/preview/`（37 屏 + Gallery）、9 篇设计文档 + SCREENS 契约、移动令牌层与 Screen Kit、`preview/shots/` 截图
> 评审方法：skill `afrexai-ui-design-system` Phase 8 八维 rubric + 自动化断言（Playwright 105 次页面加载）+ 人工抽图
> 评审时间：2026-10-17 ｜ 分支 `feat/mobile-app`（工作区即最终交付物，本报告不修改任何屏幕/文档）
> 证据目录：`/tmp/qa-scan.json`（37 屏 × 浅/深 × 全量断言）、`/tmp/qa-gallery.json`（Gallery 交互）、`/tmp/qa-shots/`（20 张新截图）

---

## 1. 评审结论摘要

| 项 | 结论 |
|---|---|
| **总分** | **84 / 100**（Gallery 自评 88，独立评审更严格，差异见 §2） |
| **等级** | **良好（75–89）· Good, minor refinements needed** |
| **P0（阻断交付）** | **0 条** |
| **P1（重要，建议交付前修）** | **4 条**（1 条交互不一致、2 条无障碍、1 条契约滞后） |
| **P2（可后续）** | **10 条**（截图时效、Gallery 工具本身、文档口径等） |
| **交付判定** | **可交付**：37 屏齐全、0 控制台报错、0 横向溢出、0 遮挡、37 屏导航/主题/平台切换全部可用；建议修复 4 条 P1（约 1–1.5 人日）后正式签字 |
| **上一轮已知问题复核** | ✅ 教师端左滑已改「锁定 / 复制链接」；✅ 审核队列提示已改为「上下滑切换 / 底部按钮审核通过」，不再「长按快速通过」；✅ 批量确认页已移除「已发布 12 份」成功 toast（修复方向正确，但契约未同步 → P1-4） |

**一句话结论**：这是一套完成度高、工程意识强的移动设计交付：37 屏全覆盖、组件与令牌复用彻底、语义/焦点/aria 基础扎实、360/深色/Android 参数均通过实测；扣分集中在**跨屏交互一致性、少数 AA 对比度与触控命中区、以及"契约比实现慢半拍"**，均属可快速修复项。

---

## 2. 八维 Rubric 打分（Phase 8）

| 维度 | 权重 | 得分 | 扣分依据（证据） |
|---|---|---|---|
| **视觉层级** | 20 | **18** | 主操作几乎全部落在底部动作条/主 CTA，一屏一事成立（contact-sheet 全 37 屏巡检）；扣 2：student-answer-sheet / submit-confirm 的「主按钮 + 文字按钮」层级在深色下对比偏弱（`student-submit-confirm-dark.png`），teacher-review-queue 同时存在 TabBar + 队列条 + 双按钮，主次需靠颜色区分 |
| **一致性** | 15 | **13** | 组件/令牌/间距/圆角高度统一（`screen.css` 单库复用，0 处屏幕自造主组件）；扣 2：① `student-profile` 深色主题开关静态不生效且深色下仍显示 off（`student-profile.html:69-72`，无 `data-theme-toggle`/脚本），同功能的 `teacher-profile.html:80,150-163` 却已实现；② 演示数据与契约不一致（平均分 85.3 vs SCREENS 88.6，见 P1-4） |
| **留白** | 15 | **13** | gutter 16/14、卡片间距 12、区块 24 的节奏稳定；列表页「填满但不溢出」；扣 2：teacher-review-code / diff 首屏信息密度偏高，390 下代码区 + 工具条 + 动作条三层堆叠略挤（`teacher-review-code-dark.png`），360 档更明显 |
| **无障碍** | 15 | **11** | 强项：74 次加载中 0 个无名按钮、0 个未关联输入的 input、0 个缺 aria-hidden 的装饰 SVG、Sheet 全部 `role=dialog aria-modal=true aria-labelledby`、Tab 带 `aria-current`、switch 全部 `role=switch aria-checked`；扣 4：① 代码面板行号 2.28:1、注释 4.0:1（`screen.css:569,575`）；② 小号彩色分数 3.49/3.73:1（`teacher-assignment-detail.html:31`、`student-score-detail.html:45` 等，04 §7.1 C-2 已声明但设计稿仍在用）；③ 选中浅蓝底上的三级字 4.44:1（`student-scores.html:20`、`teacher-assign-wizard` 选中项）；④ 多处命中区 <44×44（`.sheet-close` 32px 宽、选区菜单 36px 高、批量条按钮 36px 高、头像 42px） |
| **响应式** | 10 | **8** | 390/360 两档 0 横向溢出、0 内容被固定条遮挡（scroll 底部让位断言全过）；Android 参数正确（状态栏 24px、AppBar 56px）；扣 2：430 档未实测（README 声称 360–430）；Gallery 自身在 ≤768 溢出（768 宽 scrollWidth 811、390 宽 454，评审工具未适配平板/手机，非产品屏） |
| **交互设计** | 10 | **8** | Gallery 37 屏导航 37/37 命中、iframe 内 `data-goto` 回传父级导航、主题/平台切换下发到全部 live iframe（proto 主题 dark ✓、platform android + 状态栏 24px ✓）、Sheet 开/关/Esc、选择组/分段/开关钩子均可用、0 控制台报错；扣 2：student-profile 主题开关不生效（同 P1-1）；teacher-review-queue「审核通过」与「改分」同跳 `teacher-review-detail`（`teacher-review-queue.html:136`），原型语义误导 |
| **字体** | 10 | **9** | 移动字号档 28/22/18/16/15/13/12 全来自 `--m-fs-*`，中文行高 1.6、无外部字体；扣 1：10.5px Tab 文字偏小（04 §7.1 C-4 已记录放大截断风险），代码面板 12.5px 在暗色长行下阅读压力略大 |
| **配色** | 5 | **4** | 语义状态色/评分色/深色主题整体正确，代码面板恒深色与二维码白底属预期；扣 1：深色下 `teacher-assign-wizard` 关闭态 switch 轨道仍为 `--gray-300`（`#cfd4dc`，02 §4.3.3 映射未在 §4.3.5 覆盖深色）形成小亮色孤岛；`public-landing` 深色末段白色 CTA 属有意对比（见 P2） |
| **合计** | 100 | **84** | — |

**与 Gallery 自评（88）的差异**：自评 18/14/13/13/8/7/9/5；本次在**一致性**（14→13，主题开关不生效）、**无障碍**（13→11，实测对比度/命中区扣分）、**字体**（9 保持）、**配色**（5→4，深色 switch）上更严格。Gallery 的 88 已标注「自评」，建议评审后更新为「独立评审 84」或保留双分数。

---

## 3. 问题清单（P0 / P1 / P2）

> 每条格式：**现象 / 证据 / 影响 / 建议修复**。P0 为空不影响交付；P1 建议在本轮交付前完成。

### P0（阻断交付）— 0 条

自动化与人工均未发现阻断项：37 屏文件齐全、全部可打开、无控制台错误、390×844 无横向滚动、无内容被 Tab/动作条遮挡、导航目标全部命中注册表、深色/360/Android 均可用。

### P1（重要，建议交付前修）— 4 条

#### P1-1 学生端「我的」深色主题开关是静态的，深色下状态还显示为关
- **现象**：`student-profile` 的「深色主题」switch 点击无反应、`aria-checked` 恒为 false；在 `?theme=dark` 下仍显示关闭。教师端同一开关已实现真实切换与主题同步。
- **证据**：`docs/mobile-app/preview/screens/student-profile.html:69-72`（`aria-checked="false"`，无 `data-theme-toggle`）；页末仅引入 `screens.js/screen.js`（:132-133）。对照 `teacher-profile.html:80` + `:150-163`（`#theme-switch` + 点击切换 `data-theme`）。实测：dark 主题下 student-profile 的「深色主题」仍为 off。
- **影响**：违反契约 SCREENS.md §4.2「student-profile … 主题 switch 可切」；跨屏同功能表现不一致，评审/开发会误判能力范围。
- **建议**：把 teacher-profile 的开关逻辑抽到 `screen.js`（或页面内联同样的 12 行），初始态按 `html[data-theme]` 同步；顺带修正 `aria-checked`。工作量 **S**。

#### P1-2 三处对比度未达 WCAG AA（15% 权重维度）
- **现象与证据**（Playwright 计算样式 + WCAG 相对亮度实算；浅深色一致）：
  1. **代码面板行号 2.28:1、注释 4.0:1**：`.ln { color: rgba(255,255,255,.26) }`（`assets/screen.css:569`）、`.tk-com { #697098 }`（`screen.css:575`），出现在 `public-doc.html:189-192`、`student-answer-code.html` 代码块、`teacher-review-code/diff`。SCREENS.md §2.4 要求「深色主题下所有文字对比度 ≥4.5:1」。
  2. **小号彩色分数 3.49:1 / 3.73:1**：`teacher-assignment-detail.html:29-31`（15px/650 琥珀 `--score-pass`）、`teacher-class.html:33-35`、`student-score-detail.html:45`（16px/700 绿 `--score-excellent` 3.73）。04-interaction-a11y.md §7.1 C-2 已写「仅大字可用」，但设计稿仍在用。
  3. **选中浅蓝底上的三级字 4.44:1**：`student-scores.html:20`（`.ss-total`）、`teacher-assign-wizard` 选中题目的辅助行（`--text-tertiary` on `--bg-selected #eff6ff`）。04 §7.1 C-1 只覆盖 `--bg-sunken`，未覆盖 brand-50 选中底。
- **影响**：AA 宣称与实测不一致；这批屏幕正是「学生天天看分数」「教师看代码」的高频页。
- **建议**：行号按 04 §7.4 改为 `aria-hidden`（读屏不读）并提高不透明度至 ≥0.4；`tk-com` 调到 ≥4.5（如 `#8a91a8`）；小号分数改为 `--text-primary` + 等级 tag/图标（04 C-2 既定规则）；选中底上的辅助字改 `--text-secondary` 或加深底色。工作量 **S**。

#### P1-3 多处触控命中区不足 44×44（契约 §2.4 硬要求）
- **现象**：`.sheet-close` 视觉 32×32，末尾补丁只扩高不扩宽（`screen.css:530` + `:682-690`），命中宽仍 32——出现在 student-answer-sheet / submit-confirm / teacher-home / assignment-detail / review-detail / questions / profile 等 8+ 屏；`.selmenu button` 高 36（`screen.css:582`，teacher-review-code 选区菜单）；`teacher-batch-select.html:63-64`「全选本页 / 取消」高 36 且无补丁；`teacher-home` 头像按钮 42×42；teacher-home banner「去审核」文字链 39×16、section「全部作业」文字链 68×21（非行内豁免）。
- **证据**：Playwright 逐元素量测（可见尺寸 + ::before/::after 命中区双口径），`/tmp/qa-analysis.json`；`screen.css:682-690` 的伪元素只设 `top:50%; height:44px`，未扩左右。
- **影响**：地铁/单手场景误触率上升；与 04 §7.3 / SCREENS §2.4 的自我验收口径冲突。
- **建议**：`.sheet-close` 补 `::after { left:-6px; right:-6px }` 或直接 44×44；selmenu / batch 小按钮纳入统一补丁；头像按钮 42→44；文字链补命中区。工作量 **S**。

#### P1-4 SCREENS.md（唯一施工契约）滞后于已修复的实现，存在反向误导
- **现象 1**：SCREENS.md §4.3 仍要求 `teacher-batch-confirm`「成功 toast『已发布 12 份』」（`preview/SCREENS.md:206`），但实现已按上轮评审正确移除（`teacher-batch-confirm.html:116-119` 只有确认按钮与危险提示），且该页 `.t-toast-note` 成死代码（`:33`）。
- **现象 2**：SCREENS.md 写学生「平均分 88.6」（`SCREENS.md:190,192`），实际 `student-scores.html:64,74`、`student-profile.html:58` 均为 **85.3**（与列表 92/88/76 的算术平均一致，屏幕自身更自洽）。
- **影响**：契约是施工方唯一依据，照旧文实现会把已修问题改回去、并写入错误演示数据。
- **建议**：删除 batch-confirm 的 toast 要求、改为「成功态由发布后队列回执承担」；88.6 → 85.3（两处）。工作量 **S**。

### P2（可后续，不阻断交付）— 10 条

| # | 现象 | 证据 | 影响 / 建议 |
|---|---|---|---|
| P2-1 | 2 张截图早于对应屏 2 分钟 | `shots/screens/teacher-assignments.png` 16:50 vs html 16:52；`teacher-review-queue.png` 16:50 vs html 16:52 | 评审看到的不是最终版；重出这两张（S） |
| P2-2 | Gallery 首屏偶发白屏（`gallery.js` 请求被重置） | 本机 Playwright 首载 2/5 次 `ERR_CONNECTION_RESET`；reload 后 37 项/37 卡全部渲染，`curl` 6/6 返回 200；`/tmp/qa-gallery.json` | 属本机静态服务偶发，非设计缺陷；建议 `<script onerror>` 兜底提示刷新，README 注明（S） |
| P2-3 | Gallery 在 ≤768 宽溢出 | 1440 无溢出；1024 无；**768 时 scrollWidth 811**；**390 时 454** | Gallery 是桌面评审工具，非产品屏；建议加一句「建议 ≥1280 桌面浏览」或补 768 断点（M） |
| P2-4 | 深色下开关关闭态仍是浅灰 | `teacher-assign-wizard.html:110` 实测 `#cfd4dc`；02-design-tokens.md §4.3.3 将 `--van-switch-background` 映射 `--gray-300`，§4.3.5 深色段未重映射 | 小亮色孤岛；在 `mobile-vant-theme.css` 深色段补 `--van-switch-background: var(--gray-700)`（S） |
| P2-5 | Review 队列「审核通过」与「改分」同跳审核详情 | `teacher-review-queue.html:136` | 原型语义误导；通过应「下一位/成功态」，改分才跳 detail（S） |
| P2-6 | 设计稿代码行号未 `aria-hidden` | `public-doc.html:189-192` 等 `<span class="ln">`；04-interaction-a11y.md:468 要求行号列 `aria-hidden` | 与自身 a11y 规范不符；实现 `MCodeViewer` 时按规范落地即可（S） |
| P2-7 | 文档数量口径不一 | README.md:4「9 篇设计文档」，实际 `docs/mobile-app/*.md + SCREENS` = 10 个 md（另有 qa-report） | 统一为「9 篇正文 + SCREENS 契约」表述（S） |
| P2-8 | Gallery 自评分与独立评审不一致 | `preview/index.html:340` 显示 88「自评」 | 已将报告链接到 qa-report；建议同步为「自评 88 / 独立 84」，避免读者误解（S） |
| P2-9 | 430 档未实测 | 本次只覆盖 390/360 + Android；README 声称 360–430 | 补 430×932 截图 2–3 张即可（S） |
| P2-10 | `teacher-batch-confirm` 死代码 `.t-toast-note` | `teacher-batch-confirm.html:33` | 随 P1-4 一起清理（S） |

**人工/自动化均通过、不计问题的点**（避免误伤）：37 屏状态栏时间统一由 runtime 注入 16:32；TabBar 数量/选中态/角标全对（学生 4、教师 4、管理员 3）；表单 label/for、开关 role/aria-checked 全覆盖；深色下未发现亮色孤岛（代码面板/二维码/深色底部 CTA 除外，均属预期）；360 档 8 屏抽检 0 溢出 0 遮挡；Android 状态栏 24px/AppBar 56px 生效。

---

## 4. 完整性核对表（37 屏）

> 文件 = `preview/screens/<id>.html` 是否存在；关键要素 = SCREENS.md §4 必含项是否可见（结合全量扫描 + contact-sheet + 单屏截图）；「问题」列只列该屏相关项。

| # | id | 文件 | 关键要素（§4） | 问题 |
|---|---|---|---|---|
| 1 | public-landing | ✅ | 品牌/大标题/能力卡/要点/CTA/版本 ✅ | P2 深色末段白 CTA 属有意 |
| 2 | public-login | ✅ | 品牌/错误 banner/记住我/主按钮/文档链接 ✅ | 无 |
| 3 | public-doc | ✅ | 搜索/目录/正文/上一节下一节 ✅ | P1-2 代码注释对比度；P2-6 行号 aria |
| 4 | error-404 | ✅ | 404/地址可复制/双按钮 ✅ | 无 |
| 5 | error-403 | ✅ | 锁/权限文案/身份卡/回作业 ✅ | 无 |
| 6 | error-500 | ✅ | 500/ERR 编号/重试/联系管理员 ✅ | 无 |
| 7 | student-home | ✅ | 问候/今日待办/快捷入口/最近成绩/角标 2 ✅ | 无 |
| 8 | student-assignments | ✅ | 标题/筛选+计数/截止 banner/4 卡 ✅ | 无 |
| 9 | student-assignment-detail | ✅ | 返回/状态/考试信息/6 题/提醒/动作条 ✅ | 无 |
| 10 | student-answer-objective | ✅ | 倒计时/答题卡角标/选项/标记/上下题/交卷 ✅ | 无 |
| 11 | student-answer-code | ✅ | 接力卡二维码/复制链接/草稿 16:30/说明/动作条 ✅ | P1-2 代码注释对比度 |
| 12 | student-answer-sheet | ✅ | 遮罩+Sheet/进度/题号四态/图例/双按钮 ✅ | P1-3 sheet-close 32px |
| 13 | student-submit-confirm | ✅ | 警告/统计/剩余时间/不可修改/双按钮 ✅ | P1-3 同上 |
| 14 | student-assignment-done | ✅ | 成功/提交摘要/四步时间线/返回 ✅ | 无 |
| 15 | student-scores | ✅ | 概览/等级分布/3 条成绩/待出分 ✅ | P1-4 平均分口径；P1-2 三级字 4.44 |
| 16 | student-score-detail | ✅ | 92/等级/均分/构成/逐题/AI 评语 ✅ | P1-2 小号绿分数 3.73 |
| 17 | student-profile | ✅ | 身份卡/数据条/设置组/退出 ✅ | **P1-1 主题开关不生效**；P1-4 均分口径 |
| 18 | teacher-home | ✅ | 问候/待办三卡/4 快捷/最近作业/banner/角标 12 ✅ | P1-3 头像 42 + 文字链 |
| 19 | teacher-assignments | ✅ | 标题+搜索/状态胶囊/4 卡/左滑锁定·复制链接 ✅（上轮问题已修） | P2-1 截图过期 |
| 20 | teacher-assignment-detail | ✅ | 进度环/催交导出/分段/学生行/动作条 ✅ | P1-2 15px 分数 3.49 |
| 21 | teacher-review-queue | ✅ | 5/12 进度/陈嘉懿卡/手势提示（已改文案）/双按钮 ✅（上轮问题已修） | P2-5 通过跳错屏；P2-1 截图过期 |
| 22 | teacher-review-detail | ✅ | 分数卡/改分/分段/AI 评语/快捷评语/动作条 ✅ | 无 |
| 23 | teacher-review-code | ✅ | 文件名/深色代码/行号/选区浮层/工具条/动作条 ✅ | P1-2 注释/行号；P1-3 选区菜单 36 |
| 24 | teacher-review-diff | ✅ | 只看差异 switch/折叠块/着色/行号/引用 ✅ | P1-2 行号；P2-6 |
| 25 | teacher-batch-select | ✅ | 已选 3/全选/学生行/底部批量条 ✅ | P1-3 36px 按钮 |
| 26 | teacher-batch-confirm | ✅ | 筛选 chips/命中 12/影响范围/危险提示/双按钮 ✅（无成功 toast ✅） | P1-4 契约仍写 toast；P2-10 死代码 |
| 27 | teacher-assign-wizard | ✅ | 步骤条 2/4/题型 chips/选题/已选/上下步 ✅ | P2-4 深色 switch |
| 28 | teacher-questions | ✅ | 搜索/筛选/题目卡/电脑端说明 ✅ | P1-3 sheet-close |
| 29 | teacher-class | ✅ | 班级统计 45/38/12/作业进度/学生卡 ✅ | P1-2 15px 分数 |
| 30 | teacher-profile | ✅ | 身份卡/通知/主题（可用）/字号/桌面版/退出 ✅ | 无（主题开关已实现） |
| 31 | teacher-code-unsupported | ✅ | 三条原因/二维码+链接 10 分钟/导出/主按钮 ✅ | 无 |
| 32 | admin-home | ✅ | 4 KPI/系统状态/2 异常/快捷/只读 ✅ | 数据源缺口见 §6 |
| 33 | admin-directory | ✅ | 搜索/4 分段/列表/只读 banner ✅ | 无 |
| 34 | admin-monitor | ✅ | 实时 tag/318 趋势/队列/日志/刷新 ✅ | 无 |
| 35 | platform-install | ✅ | 收益 3 条/双平台指引/平台提示/按钮 ✅ | 无 |
| 36 | platform-splash | ✅ | 深色启动屏/logo/版本/检查更新/手势条 ✅ | 预期无状态栏 |
| 37 | states-overview | ✅ | 四态同屏/说明/分段切换 ✅ | 无 |

**分组数量核对**：公共 6 + 学生 11 + 教师 14 + 管理 3 + 平台状态 3 = **37**（与 `assets/screens.js` 注册表、README §3、01 §3、05 §1.2 完全一致）；注册表 37 id 与 37 个文件一一对应，无缺文件、无未注册文件；`data-goto` 静态目标 100% 命中注册表；37 张 `shots/screens/*.png` 齐全（2 张时效见 P2-1）。

---

## 5. 修复优先级与建议工作量

| 优先级 | 项目 | 工作量 | 建议节奏 |
|---|---|---|---|
| **交付前** | P1-1 学生端主题开关（S）· P1-2 对比度三处（S）· P1-3 触控命中区（S）· P1-4 契约同步（S） | **约 1–1.5 人日** | 一轮提交内完成，复跑本报告 §7 命令回归 |
| **交付时知会** | P2-1 重出 2 张截图、P2-8 Gallery 分数同步、P2-7 文档口径 | 约 0.3 人日 | 与 P1 同批 |
| **落地阶段（M0–M3）** | P2-3 Gallery 宽度提示、P2-4 Vant 深色 switch 映射、P2-5 原型跳转修正、P2-6 行号 aria、P2-9 430 档、P2-10 死代码 | 约 0.5–1 人日 | 随 07 实施计划 M0/M1 消化 |
| 等级判定 | 修完 4 条 P1 后可达 **88–90（Ship-ready 边缘）**；剩余 10 条 P2 不阻断 | — | — |

---

## 6. 已知限制与「待产品/后端确认」清单（均来自现有文档，不新增需求）

**评审层面限制**
1. 本次只实测 390×844 与 360×800 两档；430/414 未截图（README 声称 360–430）。
2. 真实手势（左滑、上下滑切换、下拉刷新、Sheet 拖拽）在设计稿中是静态/说明态，未做交互验证；01/04 已明确「手势仅为加速，按钮等价物必须存在」。
3. 截图与断言运行在无 env() 的 headless Chromium：安全区底部取 `max(20px, env)=20px`（真机 iPhone 为 34px），因此预览截图底部留白略小于真机，属环境差异。
4. Gallery 是桌面评审工具，≤768 宽会横向溢出（P2-3），不视为产品屏响应式缺陷。
5. 本机 `python http.server` 偶发对 `assets/gallery.js` 连接重置，刷新即恢复（P2-2），非代码缺陷。

**文档已列、需产品/后端确认（原文口径，评审不改范围）**
- G1–G14 后端缺口（05 §6）：在线人数/评分队列/平均响应无现成接口；催交无接口；diff/答题卡/逐份队列/二维码接力为新增设计。
- 批量语义：真实接口为班级级 batch-review/batch-publish，设计稿为「筛选命中 N 份」（01 §9-4 / 07 待确认）。
- 缺页判定：学生实训题工程包提交、教师实训题审核 37 屏未覆盖（00 §9-1/9-2）。
- iOS Gate：无 Xcode、$99/年、Guideline 4.2、TestFlight 90 天、企业证书门槛、中国区备案；本轮只做 Safari/PWA 兜底（06 §6.1/§6.3）。
- PWA/Android 壳：远程加载 + 断网兜底、推送不做、APK 校内扫码分发与备案（06 §5/§9 Q1–Q10）。
- 设置项范围（记住我/字号三档）、≥768 回退口径（宽度 vs pointer: coarse）仍待确认（README §7）。

---

## 7. 评审方法与环境复现命令

**环境**：macOS · Node v24.19.0 · Playwright 1.60.0（`client/node_modules`）· Chromium headless · 静态服务 `http://127.0.0.1:8123`（仓库根）

```bash
# 1) 启动静态服务（评审需要跨目录引用 client/src/styles/tokens.css）
python3 -m http.server 8123 --bind 127.0.0.1

# 2) 单屏截图（注意参数必须等号形式）
node docs/mobile-app/preview/tools/shot.mjs teacher-review-queue /tmp/qa-t-rq.png --theme=dark
node docs/mobile-app/preview/tools/shot.mjs student-home /tmp/qa-sh.png --platform=android
node docs/mobile-app/preview/tools/shot.mjs student-assignments /tmp/qa-360.png --width=360 --height=800

# 3) 全量断言（本次使用，脚本在 /tmp，不新增仓库文件）
node /tmp/qa-scan.mjs      # 37 屏 × 浅/深（390×844）+ 360 × 8 + Android × 3 + 20 张截图 → /tmp/qa-scan.json
node /tmp/qa-analyze.mjs   # 汇总溢出/遮挡/对比度/命中区/aria → /tmp/qa-analysis.json
node /tmp/qa-dark.mjs      # 深色 650ms 稳定后复测（避免主题过渡误报）
node /tmp/qa-gallery.mjs   # Gallery：37 屏导航、主题/平台切换、Sheet、iframe 内 data-goto → /tmp/qa-gallery.json
# 依赖解析：createRequire(仓库/client/package.json) → playwright

# 4) 契约与文档静态核对（本次使用）
node /tmp/doc-check.mjs    # 文档引用路径存在性 / 05 是否覆盖 37 id / 02 md 与 css 令牌值一致性
grep -rnoE 'data-goto="[^"]+"' docs/mobile-app/preview/screens/*.html | # 目标均已在 screens.js 注册
grep -rn '#[0-9a-fA-F]{3,8}' docs/mobile-app/preview/screens/*.html   # 仅 meta theme-color/白字/#fff 例外
```

**关键实测结果（可复现）**
- 74 次屏幕加载（37×浅/深）+ 8×360 + 3×Android：**0 控制台错误、0 pageerror、0 横向溢出、0 底部遮挡**（干净串行运行时；并发跑两个浏览器会话时曾出现 1 次本机静态服务连接重置，刷新恢复）。
- Gallery：**37/37 导航命中**；主题切换后 proto/hero 的 `html[data-theme]=dark`；平台切换后 proto `data-platform=android` 且状态栏 24px；Sheet 打开→关闭、iframe 内 `data-goto` → Gallery 切换屏均通过；**0 控制台错误**；`g-priority` 按钮渲染正常（hero CTA 40px/品牌底、无失样）。
- 无障碍：0 无名按钮、0 未关联 input、0 缺 aria-hidden 装饰 SVG、Sheet 全部 dialog+aria-modal+labelledby、Tab 全部 aria-current、switch 全部 role/aria-checked。

---

*本报告由独立设计评审（QA）产出，仅写入本文件；未修改任何屏幕、文档或生产代码，未执行 git 操作。*


---

## 8. 交付前修复记录（Lead · 2026-10-17 · 响应本报告 P1）

| 项 | 处理 | 验证 |
|---|---|---|
| **P1-1** 学生端主题开关 | student-profile.html 增加 #pf-theme-switch 与主题同步脚本（移除 data-switch 避免双触发）；初始态按 html[data-theme] 同步，切换同时更新 aria-checked 与副文案 | Playwright 实测：dark 初始 theme=dark / aria=true；点击后 theme=light / aria=false |
| **P1-2** 对比度 | ① 行号 rgba(255,255,255,.26) 调整为 .50、注释 #697098 调整为 #9aa3c0；② 小号彩色分数改用语义色（--status-warning-fg / --status-success-fg / --text-brand）；③ 浅色 --text-tertiary 由 #6b7280 加深为 #5f6773（brand-50 上 4.44 提升到 5.27:1，深色不受影响） | 令牌/组件已改；02-design-tokens.md §7 记录；截图重出 |
| **P1-3** 触控命中区 | .sheet-close 直接 44×44；.selmenu button / .chip / .seg / .switch / 小按钮补 44px 命中区；.avatar 42 调整为 44；.sec .link / .banner-link 44px 命中区；批量条按钮 36 调整为 44 | screen.css 末尾统一补丁 + 页面级修正 |
| **P1-4** 契约滞后 | SCREENS.md 批量确认页删除「已发布 12 份 toast」，确认动作改为「二次确认（不提供撤销）」；平均分 88.6 调整为 85.3（SCREENS/05）；01/03 同步；清理 .t-toast-note 死代码 | 契约与 screens/文档一致 |

**P2 顺手处理**：重出 37 屏截图与拼版；Gallery 分数同步为「独立评审 84」；README 文档口径与「≥1280 桌面浏览」提示；审核队列「审核通过」改为下一份 toast 反馈；代码行号改为 aria-hidden；补 430 档截图 3 张；Gallery 加载兜底提示。

**结论**：4 条 P1 已闭环；P2-3/P2-4/P2-5 等已在设计稿层面处理，其余留待 M0–M3 落地阶段。设计稿可签字进入实现阶段。
