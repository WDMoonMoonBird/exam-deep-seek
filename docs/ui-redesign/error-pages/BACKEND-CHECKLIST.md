# 错误状态码后端配合清单（前端提，待后端确认）

> **读者**：后端会话 / 后端同学（同仓库 `master` 分支）。
> **为什么放这儿**：改了 `server/` 的只有后端会话，前端这边只出清单与静态错误页产物，避免抢文件。
> **参考位置（本次实测行号）**：
> - `server/src/app.js:110` `app.use(express.static(distDir))`
> - `server/src/app.js:111-115` SPA fallback（`res.sendFile(index.html)`，**永远 200**）
> - `server/src/app.js:119-121` 统一错误中间件（`500` JSON）
> - `server/src/middleware/projectAssetGuard.js:35` `403 {error:'forbidden'}`（响应体不一致）
> - `server/src/middleware/auth.js` → 401 + `code:1002`；`server/src/middleware/role.js` → 403 + `code:1003`

目标口径（用户要求）：**所有不合理的访问都返回对应的 HTTP 状态码**，并且 HTML 请求看到错误页、API 请求拿到统一 JSON。

## 一、现状（本次实际扫描 `server/src`，非猜测）

| HTTP 状态 | 出现次数 | 说明 |
|---|---|---|
| 500 | 105 | 统一兜底（`app.js` 里 `{code:2001,message:'服务器内部错误'}`） |
| 400 | 93 | 参数/业务校验失败（`code:1001`） |
| 403 | 52 | 权限不足（`code:1003`，`middleware/role.js` 与各控制器） |
| 404 | 50 | 资源不存在（`code:1004`） |
| 409 | 4 | 冲突 |
| 429 | 3 | 限流 |
| 401 | 3 | `middleware/auth.js`（`code:1002 未登录或 Token 过期`） |

结论：**API 内部的状态码纪律已经不错**；缺的主要是「SPA/静态资源/边界」这一圈，以及少数响应体不一致的地方。

## 二、待办清单（按优先级）

### P0 —— 不做的话「未知路径 404」根本不可能实现

| # | 场景 | 现状 | 期望 | 改法（`server/src/app.js`） |
|---|---|---|---|---|
| 1 | **未知路径**（`/foo`、`/wp-login.php`、`/teacherx`） | SPA fallback 一律 `200 + index.html` | **404** + HTML 错误页（`client/public/error-pages/404.html`） | fallback 前加「**公开入口短名单**」判断：`/`、`/login`、`/doc`、`/doc/demos` 及应用前缀 `/teacher`、`/student`、`/admin` → 200 送 index.html；**其余路径 → `res.status(404).sendFile(404.html)`** |
| 2 | **静态资源未命中**（`/assets/x.js`、`/favicon.ico`） | 被 fallback 兜成 200 + HTML | **404**（纯文本或最小 HTML） | 在 fallback **之前**加：`if (/\.[a-z0-9]{2,5}$/i.test(req.path)) return res.status(404).type('text/plain').send('Not Found')` |
| 3 | **`/api` 未命中** | Express 默认 404（**HTML**，前端解析不到 message） | **404 JSON** | `app.use('/api', (req,res)=>res.status(404).json({code:1404,message:'接口不存在',data:null}))`（放在所有路由之后、错误中间件之前） |

### P1 —— 让「不合理访问」的语义完整

| # | 场景 | 期望 | 说明 |
|---|---|---|---|
| 4 | 上传超限（multer `LIMIT_FILE_SIZE`） | **413** | 现在大概率落进 500 兜底；建议在错误中间件里判断 `err.code === 'LIMIT_FILE_SIZE'` → 413 + `{code:1403,message:'文件超过大小限制'}` |
| 5 | API 方法不匹配（如 `DELETE /api/teacher/classes`） | **405** + `Allow` 头 | Express 默认给 404；可选（成本略高，收益一般） |
| 6 | 浏览器直接访问 API 出错（`Accept: text/html`） | 出错时返回 **HTML 错误页**（500/503），API 请求仍返回 JSON | 错误中间件里按 `req.accepts(['html','json'])` 分流：HTML → `sendFile('error-pages/500.html')`，其余 → 现有 JSON |
| 7 | 维护模式（可选开关） | **503** + `Retry-After` | 有开关（env）时全站返回 503 + `503.html` |
| 8 | `middleware/projectAssetGuard.js` 的响应体是 `{error:'forbidden'}` | 统一为 `{code:1003,message:'无权访问该资源',data:null}` | 前端现在读 `message`，这种响应体会让用户看到空白提示 |

### P2 —— 语义核对（建议逐条过一遍，不一定要改）

- **404 vs 403**：52 处 403 里，有一部分是「资源不属于当前用户」（如别人的班级/提交）。安全实践上这类更推荐返回 **404**（不泄露资源是否存在）；「身份不够」（学生访问教师接口）保持 403。
- **409 的覆盖**：学号/校名重复、作业状态已变更等场景建议统一 409（现在部分走 400）。
- **429 的覆盖**：登录接口建议限流（防爆破），现在全站仅 3 处 429。

## 三、需要后端回答的 4 个问题

1. **线上是谁在做 SPA fallback？** 是 `server/src/app.js`（Express 直供 `client/dist`），还是前面还有 nginx 的 `try_files $uri /index.html`？——如果 nginx 先兜住，那清单 1/2 必须改在 nginx（`try_files` + 白名单 `location`），Express 根本收不到请求。
2. 生产是否用 nginx 反代？若是，是否有 `proxy_intercept_errors on` + `error_page 502 503 504 ...`（后端重启/挂掉时显示我们的页面而不是 nginx 默认页）。
3. 上传接口现在对超大文件返回什么？（需要 413 的话我按清单 4 给 diff）
4. 是否接受「公开入口短名单」这种方式（清单 1）？如果将来新增路由前缀（如 `/api-docs`），需要同步加进名单——我会在代码里写注释提示。

## 四、前端这边同步会做的（不需要后端配合）

| 前端状态 | 行为 |
|---|---|
| 路由未匹配（SPA 内） | 显示 404 页（ghost 视觉），显示用户访问的地址、可复制 |
| 守卫角色不符 | 403 页，**保留登录态**，提供「切换到我的工作台」 |
| 接口 401（含 token 过期） | 提示「登录已过期」→ 跳登录并带 `?redirect=` 回跳原页面 |
| 接口 403 | 403 页（或就地提示，按场景） |
| 接口 404 | 提示「资源不存在或已被删除」 |
| 接口 409 / 413 / 429 | 各自的就地提示文案（冲突/文件过大/请求过于频繁） |
| 接口 5xx | 500 页（ghost 视觉），带错误编号与重试 |
| `router.onError`（chunk 加载失败） | 「系统已更新，请刷新」提示，避免白屏 |

## 五、L1 静态错误页产物（与前端同一份视觉）

已生成/将生成：`client/public/error-pages/{400,401,403,404,405,408,409,410,413,418,429,500,501,502,503,504}.html`
（基于 MIT 授权的 tarampampam/error-pages ghost 模板改写，中文文案，**保留版权声明**）。
nginx 用法：`error_page 404 /exam/error-pages/404.html;`（含 `internal;` 限定）或由 Express `sendFile` 提供。

## 六、前端产出的可直接使用产物（后端无需自己写页面）

- 静态错误页：`client/public/error-pages/<code>.html`（ghost 视觉、中文文案、MIT 声明保留、深浅色自动、429/5xx 自带 30 秒自动重试）
  → Express 用法：`res.status(404).sendFile(path.join(__dirname, '../../client/public/error-pages/404.html'))`
  → nginx 用法：`error_page 404 /exam/error-pages/404.html;`（建议配 `internal;`）+ `proxy_intercept_errors on`（502/503/504 才有用）
- 视觉/文案与前端 SPA 内的错误页一致（同一份来源），不会出现两套长得不一样。

## 七、如果要我出补丁

P0 三项合计约 12 行（都在 `server/src/app.js`）。我可以直接写成 diff 发出来，但**不主动改 `server/`**（避免与后端会话撞车）——
后端会话说一声「要补丁」，我就把 diff 贴进本文件。

## 八、状态与口径更新（后端 2026-10-13 回复后）

| 项 | 结论 |
|---|---|
| **静态错误页对外路径** | **`/exam/error-pages/<code>.html`**（本站 base 是 `/exam/`，vite 把 `client/public/error-pages/` 拷成 `dist/error-pages/`，对外即 `/exam/error-pages/`）→ nginx：`error_page 404 /exam/error-pages/404.html;` |
| 实现方式 | **本文不再给 Express 写法**（服务端实现由后端决定）；本文只保留 ①nginx 口径 ②接口契约（状态码 + JSON 形状） |
| **P0-3（`/exam/api/*` 未命中）** | 代码**已修好**，等一条小修复后发版：**发版前**仍是 HTML 404，**发版后**为 JSON `{code:1404,message:'接口不存在',data:null}` ✓ |
| 短名单 | **采用 A**（前缀白名单 + 前端 404 页）；后端已核对白名单，**无误伤** ✓ |
| 前端过渡期应对 | 发版前 `/exam/api/*` 未命中会返回 HTML：前端请求层已按「响应体不是 JSON 时不解析、不崩」处理，统一提示「接口不存在或服务未就绪」 |
