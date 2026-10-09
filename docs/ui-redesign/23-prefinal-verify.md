# 合并前复验报告（t40）

> 验收人：verifier（独立复现）｜ 复验基线：**HEAD `7c06347`**（R-24 删除 4 个零引用依赖后；工作区干净）
> 命令：`cd "/Users/you/My Projects/My Vue/Exam-DeepSeek-ui/client" && npm run build` → **exit 0（22.70s）**
> 环境：真实后端 :3000 + vite dev :5175（真实浏览器 Playwright/Chromium）；截图 `docs/ui-redesign/preview/shots/prefinal/`（30 张）
> 覆盖：t37 Monaco 主题跟随 / t38 顶栏切换按钮 / t39 分页暗色对比度 + 顶栏相关页复跑；另按 captain 口径补验 t41 主题过渡与 t42 折叠过渡

## 0. 首要结论

# ✅ 可合并（Merge-ready）

| 判据 | 结果 |
|---|---|
| `npm run build` | **exit 0**（22.70s，含 R-24 依赖清理与 t37/t38/t39/t41/t42 全部改动） |
| 全仓 `*.vue` hex / `!important` / views `Modal.confirm` | **0 / 0 / 0**（与 captain 台账一致，无回退） |
| t37 Monaco 主题跟随 | ✅ 四个使用点浅/暗全部正确；**已打开实例切换后立即跟随（同 DOM 实例、不刷新不重建）** |
| t38 顶栏切换按钮 | ✅ 三端 × 系统亮/暗 6 组全通过；tooltip/aria、键盘、菜单同步、legacy 全通过 |
| t39 分页暗色 | ✅ 当前页号 **2.71 → 10.16:1**；浅色逐页 5.57 未变；暗色主按钮白字 6.79 未受影响；**指纹扫描 0 命中** |
| 顶栏 1024/1440 复跑 | ✅ 六页两档：按钮紧邻用户区不重叠、顶栏恒 56px、0 横向溢出 |
| 粘性表头 | ✅ 有表格可滚动的页面逐页实测 `holderTop = 56 = topbarBottom`（5 组） |
| 未达标项 | 0 项阻断；登记 2 项观察（见 §8） |

---

## 1. 方法与两处探针缺陷（先声明，避免误读）

| 项 | 说明 |
|---|---|
| 基线 | `7c06347`（R-24：移除 @codingame/monaco-vscode-api / monaco-textmate / oniguruma / prettier；`npm install` 后 node_modules 已修剪） |
| 等待窗口 | 首轮取值为「加载完成 + 4–5s」；**过渡/几何类一律等 ≥900ms（远端/本地过渡 220ms 的 4 倍余量）再取终态**；t41 类生命周期用 20ms 级轮询 + MutationObserver 双证据 |
| 探针缺陷 ① | 首轮 t41 检查的 MutationObserver 未判空 `document.documentElement` → 注入早于文档就绪即抛错，导致「类变更 0 次」假阴性；已加 guard 并用 20ms 轮询复核（§6.1） |
| 探针缺陷 ② | 首轮粘性表头在「无表格/未滚到表格」的页面取样（teacher/students 空态、student/scores 行数不足）→ 已改为「先找出真实可滚动容器，再逐步滚动到吸附」并只对有表格页下判（§5） |
| 环境事实 | 学生 submit 页面对**已提交/已发布**作业不渲染可编辑编辑器（正常业务语义）→ 编程题编辑器改用**未提交作业 302** 复验；全部非 GET 请求在 route 层拦截（零写入） |

---

## 2. ① t37 Monaco 主题跟随（四个使用点）

| 使用点 | 浅色实测 | 暗色实测 | 判定 |
|---|---|---|---|
| QuestionEdit（CodeEditor，Q329） | bg **rgb(255,255,255)** = `--bg-surface`；正文 rgb(20,25,34)；关键字 rgb(0,0,255) | bg **rgb(11,15,22)** = `--code-bg`；正文 **rgb(187,188,190)** = `--code-fg`(72% 白) 合成值；关键字 rgb(86,156,214) | ✅ |
| ProjectQuestionEdit（Q355） | 同上 | 同上 | ✅ |
| ProjectReviewNew（项目阅卷，payload 走 route mock 以便真实挂载） | bg rgb(255,255,255)；正文 rgb(20,25,34) | bg rgb(11,15,22)；正文 rgb(187,188,190) | ✅ |
| Submit（学生作答，**未提交作业 302**） | bg rgb(255,255,255)；正文 rgb(20,25,34) | bg rgb(11,15,22)；正文 rgb(187,188,190) | ✅ |

**已打开实例实时跟随（核心断言）**：同一页面先以浅色打开编辑器（记 DOM 实例标记 + 背景 rgb(255,255,255)）→ 点顶栏切换按钮（不刷新）→ 1.2s 后：`data-theme=dark`、**同一 DOM 实例**、背景 **rgb(11,15,22)**、正文 rgb(20,25,34) → **rgb(187,188,190)** ✅
（截图：`mono-*.png` 共 9 张 + `mono-live-switch-dark.png`）

> 浅色侧与改前的已知差异（t37 已声明、本次实测复现）：背景 `rgb(255,255,254)` → `rgb(255,255,255)`（差 1/255）、默认正文 `rgb(0,0,0)` → `rgb(20,25,34)`（对比度 21:1 → 17.6:1，均远超 AA）。判定：**可接受**，登记为信息项（§8-②）。

---

## 3. ② t38 顶栏主题切换按钮

| 断言 | 实测 | 判定 |
|---|---|---|
| 三端按钮存在 + aria-label | teacher/admin/student 均为 `BUTTON.theme-toggle`；aria-label 例：「切换主题：当前浅色主题，当前跟随系统，点击切换为深色主题」 | ✅ |
| tooltip | `.ant-tooltip-inner` = 「切换主题」 | ✅ |
| system 下点按钮 → 显式模式 | 系统亮 → `dark` + `localStorage='dark'`；系统暗 → `light` + `'light'`（三端 × 两态 = 6/6） | ✅ |
| 下拉三项保留且同步 | 按钮切到深色后菜单 = [浅色, **深色 ✓**, 跟随系统]；系统暗下切浅色后 = [**浅色 ✓**, 深色, 跟随系统] | ✅ |
| 键盘可达 | 无鼠标干预 Tab：第 1 步即命中 `.theme-toggle`；Enter → dark/'dark' | ✅ |
| legacy（Chrome 69 模拟） | `html.legacy` 生效、按钮可见（offsetWidth>0）、点击 → dark/'dark'、0 pageerror | ✅ |
| 错误 | 全部场景 0 pageerror / 0 console error | ✅ |

---

## 4. ③ t39 分页暗色对比度 + 指纹扫描

| 断言 | 实测 | 判定 |
|---|---|---|
| 暗色当前页号 | `rgb(142,197,255)` = `--text-link` on `rgb(20,20,20)` → **10.16:1**（5 页一致） | ✅ ≥4.5 |
| 浅色当前页号（未回退） | `rgb(0,102,204)` → **5.57:1**（5 页**逐值等于**改前） | ✅ |
| 暗色跳跃图标（非文字） | `rgb(142,197,255)` on `rgb(20,25,34)` → **9.72:1** | ✅ ≥3 |
| 暗色主按钮白字（全局 colorPrimary 未动） | 白 on `rgb(3,90,176)` → **6.79:1** | ✅ ≥4.5 |
| **指纹扫描**（computed color === `rgb(3, 90, 176)`） | 11 页 × 深浅两主题：**暗色 0 命中（文字 0 / 图标 0）**；浅色 0 命中 | ✅ |

> 扫描页面：teacher/assignments、teacher/questions、teacher/review、teacher/questions/329/edit、teacher/review/10400、admin/schools、admin/teachers、admin/monitor、student/scores、student/assignments、/doc。

---

## 5. ④ 顶栏相关页复跑（三端 × 两档）

| 页面 | 1440 | 1024 |
|---|---|---|
| teacher/assignments | 按钮右缘 1168 = 用户区左缘 1168、overlap ✗、顶栏 56、溢出 0 | 752 = 752、顶栏 56、溢出 0 |
| teacher/students | 1168 = 1168、顶栏 56、溢出 0 | 752 = 752、顶栏 56、溢出 0 |
| admin/schools | 1278 = 1278、顶栏 56、溢出 0 | 862 = 862、顶栏 56、溢出 0 |
| admin/students | 1278 = 1278、顶栏 56、溢出 0 | 862 = 862、顶栏 56、溢出 0 |
| student/assignments | 1099 = 1099、顶栏 56、溢出 0 | 683 = 683、顶栏 56、溢出 0 |
| student/scores | 1099 = 1099、顶栏 56、溢出 0 | 683 = 683、顶栏 56、溢出 0 |

- **按钮与用户区不重叠**（右缘 = 左缘，紧邻），12/12 组通过；截图 `topbar-*.png`（12 张）。
- **粘性表头**：teacher/assignments@1440 **56**、@1024 **56**、admin/schools@1440/1024 **56**、admin/students@1440/1024 **56** → `holderTop = topbarBottom = 56` 全部成立 ✅
- teacher/students@1440 与 student/scores@1440 取不到吸附：前者未选班级为**空态无表格**，后者仅 5 行**不足一屏**（无可滚动表格）→ 按 N/A 说明，非回退。

---

## 6. 追加：t41 主题过渡 + t42 折叠过渡（按 captain 口径）

### 6.1 t41 主题切换过渡

| 断言 | 实测（含 20ms 级轮询 + MutationObserver 双证据） | 判定 |
|---|---|---|
| **首帧不触发**（normal） | 冷启动即暗色偏好：`html` 类变更 **0 次**、`theme-transition` **从未出现**（8 条挂载期无关过渡，elapsed 均为 0ms=1ms 级） | ✅ |
| **首帧不触发**（reduce） | 同上：类变更 0 次、类未出现（33 条无关过渡） | ✅ |
| 用户切换触发过渡 | `data-theme` 与类**同刻变更**（先挂类后改属性 ✓）：`{t:3716, has:true}` + `{t:3716, th:'dark'}`；挂类期间 `body.transitionDuration = **0.22s**`（= `--duration-base`）；轮询在 177/254/373ms 三点均见类生效 | ✅ |
| **类存活时长** | MutationObserver：挂类 3716ms → 摘类 4132ms = **416ms**（t41 自测为 301ms） | ⚠️ 观察项（§8-①） |
| reduce 降级 | `--duration-base = **1ms**`；切换后过渡 elapsed 全 **0ms**；类同样自然收尾 | ✅ |

### 6.2 t42 评分面板折叠过渡（三点采样）

| 页面 | 折叠前（面板/编辑器宽） | +60ms | +130ms | **+900ms（终态）** | 判定 |
|---|---|---|---|---|---|
| ReviewDetail（10400） | 384 / 504 | 85 / 803 | 48 / 840 | **44 / 844** | ✅ 中间态介于起止之间、稳定值=终值 |
| ProjectReviewNew（10297） | 384 / 564 | 85 / 863 | 48 / 900 | **44 / 904** | ✅（编辑器 564→904 与 t42 报告逐值一致） |

- **Monaco 持焦**：先点入编辑器（activeElement 在 `.monaco-editor` 内）→ 折叠后 activeElement 仍为 Monaco 内的 `DIV.native-edit-context`，实例数 1→1 不变，`aria-expanded` `true→false` ✅（`collapse-focus-retained.png`）
- **reduce 降级**：`emulateMedia('reducedMotion: reduce')` 下 t60 即等于终态（44 / 844 与 44 / 904）→ 动画即时完成 ✅
- 0 pageerror（两页 × 两档）；截图 `collapse-*.png`（7 张）

---

## 7. 硬指标与 R-24 交叉还原

| 指标 | 台账基线 | 实测 | 说明 |
|---|---|---|---|
| `*.vue` 六位 hex | 0 | **0** | 无回退 |
| `*.vue` `!important` | 0 | **0** | 无回退 |
| views `Modal.confirm` | 0 | **0** | 无回退 |
| 依赖（R-24） | 移除 4 个零引用依赖 | **prod 30 / dev 5；`prettier`/`oniguruma`/`monaco-textmate`/`@codingame` 均已不在 node_modules** | ✅ |
| `npm run build` | exit 0 | **exit 0（22.70s）** | ✅ |
| `client/dist` | — | 11M | — |

---

## 8. 未达标项 / 登记项（无阻断）

| # | 项 | severity | 说明与建议 |
|---|---|---|---|
| ① | t41 过渡类存活 **416ms**（t41 自测 301ms） | low（观察） | 同一实现、同一机器不同轮次的时序差异（收尾锚定 body 的 transitionend，主题切换会重启部分元素过渡）。功能/视觉/降级均正常，**不影响合并**；若要求精确 ~300ms，可改为对 body 过渡加最小/最大时限保险（需 captain 决策是否值得） |
| ② | t37 浅色编辑器与改前的位级差异 | info | bg `rgb(255,255,254)→rgb(255,255,255)`、默认正文 `rgb(0,0,0)→rgb(20,25,34)`（对比度 21→17.6）。t37 已按令牌口径声明；判定**可接受**（若要求位级一致，把 app-light 的 colors 留空即可，一行改动） |
| ③ | 学生 submit 页对已提交作业不渲染可编辑编辑器 | info | 业务语义正确（提交后只读/展示评分）；本次改用未提交作业 302 完成编辑器主题复验 |
| ④ | 探针缺陷两处（observer 未判空 / 粘性页选错） | info | 已修正并复测；记录以免后续复跑误判 |

---

## 9. 证据索引

| 组 | 文件（`docs/ui-redesign/preview/shots/prefinal/`） |
|---|---|
| t37 Monaco | `mono-QuestionEditCodeEditor-{light,dark}.png`、`mono-ProjectQuestionEdit-{light,dark}.png`、`mono-ProjectReviewNew-{light,dark}.png`、`mono-Submit-{light,dark}.png`、`mono-live-switch-dark.png` |
| t38/t40 顶栏 | `topbar-{teacher,teacher2,admin,admin2,student,student2}-{1024,1440}.png`（12 张） |
| t41/t42 过渡 | `collapse-ReviewDetail10400{,-reduce}.png`、`collapse-ProjectReviewNew10297{,-reduce}.png`、`collapse-ReviewDetail10293{,-reduce}.png`、`collapse-focus-retained.png` |

原始数据：`/tmp/prefinal/{p1,p2,p3,p4,p5}.json` 与对应 `.log`；构建日志 `/tmp/prefinal/build.log`。

---

**签名**：verifier ｜ 本报告为合并前独立复跑结论；所有数值均来自本轮真实浏览器实测（含计算样式与过渡事件双证据）。
