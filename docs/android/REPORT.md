# Android APK 首轮构建与 BlueStacks 验收报告

> 生成时间：2026-10-18 00:35（Asia/Shanghai）  
> 分支：feat/mobile-app  
> 约束：未修改 server/**、prisma/**、数据库；仅新增 Capacitor Android 壳与构建产物。

## 1. 结论

首轮“能装、能开、能登录”的 Android 链路已经跑通：

- Debug APK 构建成功，并安装到 BlueStacks（Android 13 / API 33 / arm64-v8a / WebView 101）
- App 成功加载本机 Vite 页面：http://10.0.2.2:5175/exam/m
- 通过 WebView CDP 实测：登录页 → teacher_a 登录 → 教师工作台，页面正常渲染
- 手机分辨率 1080x1920 下移动端布局正常
- Release APK 已生成并使用正式 keystore 签名，apksigner 校验通过
- 图标由仓库根目录 学习中.svg 生成，应用名 Deadpan 判题，包名 asia.deadpan.exam
- **阻塞项（已定位到两层）：**
  1. **正式服务器还没有移动端路由**：外部实测 https://deadpan.asia/exam/ 和 /exam/doc 返回 200，但 **https://deadpan.asia/exam/m 与 /exam/m/login 返回 404**（Ghost 404 页面）。说明生产部署的仍是旧前端/或 nginx 未把 /exam/m 纳入 SPA fallback。
  2. **本机到正式域名的 TLS 链路不稳定**：curl 直连返回 000 / TLS reset；BlueStacks WebView 报 SSL handshake failed / net_error -101。这是本机网络/防火墙/白名单问题，不是 APK 权限问题。
  - 因此 Release APK 的 URL、INTERNET 权限、签名都是正确的；无法联网是“生产未部署 /m + 本机网络不可达”共同导致。

## 1.1 生产路由诊断证据（2026-10-18 00:55）

| 地址 | HTTP | 页面 |
|---|---|---|
| https://deadpan.asia/exam/ | 200 | Deadpan 判题 |
| https://deadpan.asia/exam/doc | 200 | Deadpan 判题 |
| https://deadpan.asia/exam/m | 404 | Ghost 404 页面不存在 |
| https://deadpan.asia/exam/m/login | 404 | Ghost 404 页面不存在 |

结论：正式服务器当前部署的前端不包含 /m 移动端路由（或 nginx 未配置 /exam/m fallback）；不是 Capacitor 壳不会联网。

## 2. 环境

| 项 | 结果 |
|---|---|
| 主机 | macOS |
| JDK | 默认 JDK 24；已固定 JDK 17：/Users/you/Library/Java/JavaVirtualMachines/ms-17.0.15/Contents/Home |
| Android SDK | /Users/you/Library/Android/sdk（platform 36 / build-tools 36.1.0） |
| Gradle | 使用缓存 Gradle 8.14.3（wrapper 8.2.1 下载过慢，未作为阻塞） |
| 测试设备 | BlueStacks：127.0.0.1:5555，Android 13 / API 33 / arm64-v8a / WebView 101 |
| ADB | 必须使用 BlueStacks 自带 hd-adb 或只保留一个 ADB daemon；SDK adb 与 hd-adb 同时运行会出现 error: closed |
| 本地 Web | Vite 5175 --host 203.0.113.10，VITE_API_BASE_URL=/api → Vite 代理 → 本机后端 3000 |
| 设备到宿主 | 10.0.2.2 可达，BlueStacks 页面加载正常 |

## 3. 产物

| 产物 | 路径 | 大小 / 结果 |
|---|---|---|
| Debug APK | client/android/app/build/outputs/apk/debug/app-debug.apk | 约 21 MB，已安装到 BlueStacks |
| Release APK | client/android/app/build/outputs/apk/release/app-release.apk | 约 18 MB，签名校验通过 |
| 图标源 | 学习中.svg | 已生成各密度 mipmap / 启动屏 |
| 签名证书 | ~/.deadpan-android/deadpan-release.jks | 证书 DN=CN=Deadpan |
| 签名口令 | ~/.deadpan-android/credentials.properties | 权限 600，不提交 Git |

Release 证书 SHA-256：3be465e0ba7f5599b472f8002170181cdedb2a699698e589e253a983a3229ca0

Debug SHA-256：b59c72b715bd9cb1782d8cf8395847cd68068b4a3d4d111940001079632f745f  
Release SHA-256：203536289f0bae7be07ff303ee73baf6264135eafb349aa19872f1e26d289310

## 4. 已执行的验证

### 4.1 本地构建

- Capacitor 6 Android 工程生成
- @capacitor/assets 从 学习中.svg 生成图标/启动屏
- Debug：gradle assembleDebug → 成功
- Release：gradle assembleRelease → 成功
- apksigner verify --print-certs → 通过
- Release APK 安装到 BlueStacks → Success
- Debug APK 安装到 BlueStacks → Success

### 4.2 页面实测

- App 启动后加载本地 Vite 页面
- 1080x1920 截图：docs/android/shots/apk-phone.png
- 登录 teacher_a / teacher_a 后工作台截图：docs/android/shots/apk-teacher-home.png
- WebView CDP 检查：
  - 登录页 h1 = Deadpan 判题
  - 原 logo 正常
  - 3 个输入框（账号/密码/记住账号）
  - 登录后 URL = /exam/m/teacher/home，h1 = 工作台
- logcat 未发现 AndroidRuntime/FATAL；本地开发包无 ERR_CONNECTION/CLEARTEXT 错误

## 5. 网络策略（这次重点）

为了避免之前“装上后反复修网络”的问题，已经按两条构建线设计：

### 开发调试 APK

- App 壳加载 http://10.0.2.2:5175/exam/m
- Vite 以 --host 203.0.113.10 启动
- VITE_API_BASE_URL=/api，让页面请求走同源 Vite 代理，再由 Vite → localhost:3000
- Debug manifest 允许 cleartext
- 结果：登录成功，说明设备 → 宿主 → Vite → 后端链路通

### 正式 APK

- App 壳加载 https://deadpan.asia/exam/m
- API 走同源 /exam/api
- 禁止 cleartext
- 当前失败：从本机访问 https://deadpan.asia 时 TLS 握手被对端 reset（curl 与 BlueStacks Chromium 均报 SSL error），因此正式包无法联网验证

## 6. P 清单

| 级别 | 项 | 状态 |
|---|---|---|
| P0 | JDK/Android SDK/Gradle 环境 | 通过 |
| P0 | BlueStacks ADB 稳定连接 | 通过（重启 BlueStacks 后使用 hd-adb；仍需固定单 daemon） |
| P0 | Debug APK 构建/安装/启动 | 通过 |
| P0 | 本地网络链路 10.0.2.2 → Vite → API | 通过 |
| P0 | 教师登录 + 工作台 | 通过 |
| P1 | Release APK + 正式签名 | 通过（签名/安装通过） |
| P1 | 正式 URL 联网验证 | 阻塞：TLS reset，需部署/网络白名单 |
| P1 | 全量页面回归（作业/审核/成绩/工程代码） | 未完成 |
| P2 | Android 返回键、键盘、safe-area、文件选择 | 未完成 |
| P2 | APK 自动循环流水线（失败自动修复/重跑） | 首轮手动链路已通，自动编排待接 |
| P2 | 真机安装/Play Protect/未知来源 | 需真机验证 |

## 7. 复现命令（当前本机）

~~~bash
# 1) 后端
cd server
INTERNAL_SECRET="$(openssl rand -hex 32)" node src/app.js

# 2) 本地 Web（供 APK 开发包访问）
cd client
VITE_API_BASE_URL=/api npm run dev -- --port 5175 --host 203.0.113.10

# 3) BlueStacks
/Applications/BlueStacks.app/Contents/MacOS/hd-adb connect 127.0.0.1:5555
/Applications/BlueStacks.app/Contents/MacOS/hd-adb -s 127.0.0.1:5555 shell 'wm size 1080x1920; wm density 420'

# 4) 构建 Debug APK（capacitor.config.json 指向 10.0.2.2:5175）
cd client
npx cap sync android
export JAVA_HOME=/Users/you/Library/Java/JavaVirtualMachines/ms-17.0.15/Contents/Home
cd android
/Users/you/.gradle/wrapper/dists/gradle-8.14.3-all/10utluxaxniiv4wxiphsi49nj/gradle-8.14.3/bin/gradle assembleDebug --no-daemon

# 5) 安装
/Applications/BlueStacks.app/Contents/MacOS/hd-adb -s 127.0.0.1:5555 install -r app/build/outputs/apk/debug/app-debug.apk

# 6) Release（正式 URL）
# 先改 client/capacitor.config.json → server.url=https://deadpan.asia/exam/m
cd ../client
npx cap sync android
cd android
/Users/you/.gradle/wrapper/dists/gradle-8.14.3-all/10utluxaxniiv4wxiphsi49nj/gradle-8.14.3/bin/gradle assembleRelease --no-daemon
~~~

## 8. 下一步（解除阻塞后）

1. 先解决正式服务器 https://deadpan.asia/exam/m 的部署/TLS/防火墙访问
2. 用正式包重新跑登录、作业、审核、工程代码、成绩全链路
3. 接 Android 返回键、文件选择、键盘、safe-area 自动回归
4. 真正实现失败可重跑的自动循环，产出每日报告

> 说明：本轮未执行服务器部署（没有服务器登录凭据）；Release APK 已构建并签名，但不能宣称正式环境可用。


## 11. 云端部署与 Release APK 复测（2026-10-18 01:05）

### 11.1 已部署

- 本地重新构建 client/dist（base /exam/，VITE_API_BASE_URL=/exam/api）
- 上传到云主机 /var/www/html/exam.mobile-new-*，清理 AppleDouble 后原子换位
- 旧前端备份：/root/backups/exam-html-mobile-*.tar.gz；旧目录：/var/www/html/exam.mobile-old-*
- nginx 增加 /exam/m SPA fallback：
  - 配置备份：/root/backups/exam-nginx-mobile-*.conf
  - nginx -t 通过，reload 成功
- 外部实测：
  - https://deadpan.asia/exam/ → 200
  - https://deadpan.asia/exam/m → 200
  - https://deadpan.asia/exam/m/login → 200
  - https://deadpan.asia/exam/api/health → 200
- 截图：docs/android/shots/release-proxy-phone.png

### 11.2 Release APK 复测

- Release APK（asia.deadpan.exam，已签名）重新安装到 BlueStacks
- BlueStacks 通过本机 SSH CONNECT 代理加载 https://deadpan.asia/exam/m，页面完整渲染，已截图
- 1080x1920 手机分辨率下布局正常；未再出现之前的 RenderThread 崩溃（原生分辨率启动后切换）

### 11.3 仍存在的网络边界

- 本机（Mac）与 BlueStacks 直接访问 deadpan.asia:443 仍会被 reset；nginx access log 中看不到该来源请求，说明阻断在服务器之前（运营商/安全组/防火墙/WAF）。
- 使用 ssh -L 8443:127.0.0.1:443 root@203.0.113.10 + 本机 CONNECT 代理后，Release APK 可以正常加载生产页面。
- 这是本机到生产的网络链路问题，不是 APK 配置问题；手机在另一网络下需要实测。
- 生产数据库账号与本地不同（teacher_a 在生产返回用户名或密码错误），因此此轮只验证到生产页面加载，未验证生产账号登录后的业务链路。

### 11.4 结论

- 云端已完成移动端 /m 部署：外部可访问，200
- Release APK 已能加载线上生产页面（经本机网络隧道；直接链路仍被阻断）
- 剩余 P1：解决本机/当前网络到生产 443 的 reset（安全组/ISP/WAF 白名单），以及用生产账号跑登录后全链路
