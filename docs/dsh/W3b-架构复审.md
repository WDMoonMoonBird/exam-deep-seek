# W3b 架构复审（t5）—— 「失败 ⇒ 整页崩」这类缺陷的机制闭环 + 残留风险（复审 W1/r2 = commit 5a21e8a）

- 复审对象：t4 修复（commit **5a21e8a**，在 W1=77f8d7e 之上）；上一轮结论见 `docs/dsh/W3-架构审查.md`（本报告取代其 verdict）
- **verdict：pass**（high/blocker = 0；仅 1 条低severity口径残留 F6，不阻塞）
- 独立证据（我自建工具 + 原始输出）：`docs/dsh/evidence/agent-arch/W3b-独立证据输出.txt`

## ① W1 的 6 项 acceptance 逐条复核
1. **ApiError 规范化 ✅** 我自建矩阵 `w3-r2-matrix.mjs` **14/14 PASS**：控制流码四态（200+1002+schools ⇒ resolve 且零提示；schools 空 / 缺 data ⇒ reject；401/404/429 + 同码 ⇒ reject，401 仍走统一出口「1 提示 + 1 跳转」）、200+1004 ⇒ reject、1007 ⇒ reject 零提示、5xx 原文不上屏（两道闸）、4xx 业务文案仍优先、原文仍留在 response/cause。
2. **safe* + 全量替换 ✅** 我的 AST 扫描：145 文件 / 140 命中 / **naked=0**（与上一轮同结论）；Monaco 5 处调用点全量核对 ⇒ 全部 `safeInitMonaco(initMonaco, …)`（⑮i 另有全仓 0 裸 await 断言）。
3. **表单提交前校验 ✅** 未受 t4 影响；68 项里的 ⑮h 故障① 仍 PASS。
4. **错误边界可诊断 ✅** 未受 t4 影响；⑮g 仍 PASS（三按钮 + 诊断串）。
5. **门禁 0 命中 + 自检必红 ✅** `verify-frontend` **checks=68 failed=0 rc=0**；`self-test` 实跑 neg1/neg2/neg3/**neg4** 全 rc=1，**neg4 精确打红 ⑮c4 + ⑮c5 + ⑮h故障③ 三条**（证明新断言有承载）、pos_rc=0；跑后 request.js/Login.vue/Schools.vue md5 与跑前逐字节一致、HEAD 不变、dist=173 不变、git status 一致。
6. **arch rc=0 / 无新依赖 / server 纪律 ✅** W1 自身零 server 改动仍成立；t4 按上一轮 F5 改了 1 个 server 文件（3 处 500 固定文案）并登记其余 6 处（属 t4 契约内）；t4 亦未引入依赖（package*/lock 零 diff）。

## ② 上一轮 findings 的闭环核验
| id | 上轮严重度 | 本轮独立核验 | 结论 |
|---|---|---|---|
| F1 多学校登录（1002） | high | `w3-r2-login-replay.mjs`：**抽 Login.vue 真实 handleLogin 函数体 + 真拦截器**回放同一份服务端响应 ⇒ 296508c 基线=选校 2 项/默认 S1；t1=**0 项 + 报错**（回归复现）；5a21e8a=**2 项/默认 S1、未 setAuth、未跳转、无报错** | **closed** |
| F2 门禁无控制流码断言 | medium | ⑮c4（四态 + 载荷不齐反例）、⑮c5（同响应回放三实现 A/B/C）、⑮h故障③（真实 handleLogin）；self-test 反例 4 三条同时红 | **closed** |
| F3 monaco 无兜底 | low | monacoGuard.safeInitMonaco 覆盖 5/5；失败不抛、一次故障只提示一次、骨架降级（⑮i 三态 + 我 grep 复核） | **closed** |
| F4 raw fetch 口径例外 | low | ⑮ 头部显式登记（⑮j 自检登记与被登记处兜底同时存在）；useExamImport catch 文案改走 errorCopyOf | **closed（登记式）** |
| F5 5xx 原文可能上屏 | low | 客户端双闸（apiError.curatedMessage ≥500 用 HTTP 口径 + errorCopy.isServerFault）+ server 3 处固定文案；我实测 R10–R12 均通过（原文只在 console/response） | **closed（客户端侧）**；server 余 6 处=已登记后续项，客户端已兜住不上屏 |

## ③ 残留同类风险清单（★独立扫描；命令与输出见证据）
方法：我自建 AST 扫描 `w3-scan.mjs`（145 文件；覆盖 `request.*` / api 封装 / `fetch` + async 回调逃逸 + floating promise；带正反例对照）+ `w3-handlers.mjs`（async 含 await 却无 catch/safe*）。

| id | 严重度 | 位置 | 问题 |
|---|---|---|---|
| F6 | low | client/src/api/apiError.js（curatedMessage）+ client/scripts/verify-frontend.mjs ⑮d | 401 的 `ApiError.message` 仍是服务端原文（我实测 '未登录或 Token 过期'），与「401 统一语义只用一句文案」的注释/⑮d 断言口径不一致 —— ⑮d 的假 401 是**空 message**，掩盖真实形态；全局提示仍统一（handleAuthExpired），但页面自行渲染 `r.message`（safeLoad 空态 / silent 请求）时会显示服务端文案 |
| — | 情报 | useExamImport（SSE）、useDraftSave（keepalive） | 两处不经 axios 实例 ⇒ 不受 ApiError 口径覆盖；已登记为口径例外且各自兜底（不会崩） |
| — | 情报 | server 6 处 500 仍拼 err.message（assignments×2 / scores×2 / project-question / project-submit） | 客户端已兜住（不上屏）；server 侧后续项 |
| — | 情报 | `initMonaco` 定义体本身仍会 reject | 调用侧统一由 safeInitMonaco 承接；新增裸调用会被 ⑮i 拦下 |

"0 命中"类：裸 `await request.*` / 裸 api 封装调用 / 未处理 raw fetch = **0**（扫描命令与正反例对照：`node docs/dsh/evidence/agent-arch/w3-scan.mjs`，输出见证据 [3] 及上一轮 [2][3]）。
F6 的 requiredFix：`curatedMessage` 对 401 强制 `AUTH_EXPIRED_MESSAGE`（或 errorCopy 增 401 分支），并把 ⑮d 的假响应换成服务端真实形态（401 + code 1002 + message）回放断言。

## ④ 门禁四项 + 提示口径
- **arch-metrics rc=0**（layerViolations 0 / GodFile>800 0 / staticGuardIo 0 / unmigrated 41 ≤ 基线 42）｜**check-layers rc=0**（177 文件、违规 0）｜**cycle-check rc=0**（177 文件/392 边、SCC 0/自环 0）｜**hard-metrics rc=1（历史红灯）**：hex6=6、important=4，命中文件与 `git archive 296508c` 基线完全相同，且 t4 未触碰任何 `.vue`/style.css ⇒ **未加剧**。
- 口径：单一提示出口（拦截器一次；silent 与 1007 白名单例外）+ safe* 仅 WeakSet 判"没人提示过"时补一次 + 原始错误只进 console；Monaco 失败改为「提示一次 + 页面骨架降级」，不再被误报成"加载失败/提交失败"；剩余不一致仅 F6（low）。

## ⑤ verdict
**pass**（high/blocker 0）。F6 属低severity口径残留，建议随下轮门禁小修（不阻塞本类缺陷的根治结论）。
证据文件：`docs/dsh/evidence/agent-arch/W3b-独立证据输出.txt`、`w3-r2-matrix.mjs`、`w3-r2-login-replay.mjs`。
