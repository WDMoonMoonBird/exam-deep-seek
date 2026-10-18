# ============================================
# security-headers.inc — ★R3-NGX-HEADERS（P2，R9/R10，2026-10-18）
# 安全响应头**单一真源**：由 nginx-exam.conf 的 server 级统一 include；
# 任何**自带 add_header 的 location** 必须同时 include 本片段。
#
# 为什么 include 化（R10 单点回归）：
#   nginx 的 add_header 是「就近覆盖」——子块只要出现**任意一条** add_header，父块的全部 add_header
#   就都不再继承 ⇒ 某个 location 手写一条头，CSP/HSTS/nosniff/XFO/Referrer/X-Robots-Tag 会**同时消失**。
#   集中到本片段后：新增 location 只需 include 一行，不会漏；也禁止把六条头手抄回 location（第二真源）。
#
# 依赖（必须在同一 nginx 配置上下文可见）：
#   · $exam_csp_policy —— map 定义在 nginx-exam.conf 的 http 上下文（map 不允许放 server 内，见该文件顶部注释）；
#   · $exam_robots_tag —— 同上（M15：隐私路径 noindex；公开页变量为空 ⇒ nginx 不下发该头）。
#
# 部署：本片段必须与 nginx-exam.conf 的 include 路径对齐（同一 nginx prefix 目录，如 /etc/nginx/ 或 C:/nginx/conf/）。
#   云上 nginx 与仓库模板不同源（见 R3-CLOUD-OPS）⇒ 云上按 nginx -T 移植后 `nginx -t` 校验。
# 全部带 always：非 2xx（404/413/429/5xx）也要下发 —— 错误页恰恰是最容易被探测的响应。
# ============================================
add_header Content-Security-Policy $exam_csp_policy always;                # ★H9：map 变量在此真正下发
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;   # ★H10
add_header X-Content-Type-Options nosniff always;                          # ★H10
add_header X-Frame-Options SAMEORIGIN always;                              # ★H10（与 CSP frame-ancestors 'self' 同口径）
add_header Referrer-Policy strict-origin-when-cross-origin always;         # ★H10
add_header X-Robots-Tag $exam_robots_tag always;                           # ★M15：隐私路径 noindex（公开页变量为空 ⇒ 不下发）
