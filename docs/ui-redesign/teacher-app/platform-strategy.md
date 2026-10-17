# 平台策略：Android 优先（决策记录）

> 用户提出「受苹果限制，优先安卓」。以下是据此整理的技术判断与本机实测证据。

## 一、本机实测（决定"现在能不能出包"）

| 依赖 | 状态 |
|---|---|
| JDK | ✅ OpenJDK **24** |
| Android SDK | ✅ `~/Library/Android/sdk`（build-tools / platforms / platform-tools / emulator 齐全） |
| Xcode | ❌ 未安装（只有 Command Line Tools）→ **iOS 出包当前不可行**，且需 Apple Developer 账号（$99/年） |
| 项目内移动壳 | 无 `android/`、`ios/` 目录；未装 Capacitor / Vant / PWA 插件（干净起点） |

## 二、为什么 Android 优先（比"苹果限制"更具体的四条）

1. **分发成本**：Android 可**扫码装 APK**（校内私有工具最省事的路径）；iOS 只能 TestFlight（每次审核 + 90 天有效期）或 App Store（企业账号需 D-U-N-S 资质）或企业证书（500 人门槛）。
2. **迭代速度**：Android 壳 + Web 层远程更新 → 改 UI 当天生效；iOS 动功能就要过审。
3. **审核风险**：App Store **Guideline 4.2 会拒"纯壳"应用** —— 必须补原生价值（推送/相机/离线/生物识别），成本更高。
4. **本机条件**：Android 工具链已就绪，iOS 需要先装 Xcode（约 15GB）。

## 三、但"安卓优先"≠"只写安卓原生"

目标是 **一份 Vue 代码，三层复用**：

```
client/src（现有 Web，桌面不动）
   └── /m 移动 Web + PWA      ← 双端先用，0 审核（阶段 1）
         └── Capacitor Android 壳  ← APK 内部分发（阶段 2）
               └── Capacitor iOS 壳 ← 有 iPhone 需求时再出包，代码不改（阶段 4）
```

如果为安卓单独写 Kotlin/Compose：**iOS 与 Web 都要重做** ✗

## 四、四步落地（每步可验收）

| 阶段 | 内容 | 验收 | 需要后端？ |
|---|---|---|---|
| 1 | `/m` 移动 Web + PWA（清单 + 离线骨架） | 手机浏览器可用、可"添加到主屏" | 否 |
| 2 | Capacitor Android：推送/相机/文件/返回手势/启动屏 | Debug APK 扫码安装，教师试用 | 推送才需要 |
| 3 | Release 分发：签名 keystore、版本号、升级提示 | 校内扫码升级可用 | 否 |
| 4 | iOS（可选）：TestFlight | iPhone 教师可用 | 若本地打包需 CORS |

## 五、待确认（决策依据，非技术细节）

1. **教师 iPhone 占比**（决定 iOS 时间点；建议先发问卷）
2. **分发口径**：校内扫码安装 / 学校应用中心 / 应用商店（后者涉及 App 备案与签名流程，需学校 IT 确认）
3. **签名与证书归属**：Android keystore 若丢失将无法升级已装应用，必须有交接人与备份

## 六、风险提示

- Android 厂商后台杀进程 → **推送不可靠**，需引导用户加白名单/允许自启动
- Android WebView 版本碎片化 → 移动 UI 只用成熟 CSS（已在设计稿中避免新特性）
- iOS 若先用 PWA：需"添加到主屏"才有推送（16.4+），且长期不用可能被清存储
- 真机验收需让手机能访问开发服务：`vite --host` 暴露局域网 IP，或先部署到服务器再看
