# 基础设施层 infrastructure（P0 骨架，暂空）

**职责**：把 domain 端口翻译为技术实现——Prisma 仓储、DeepSeek 网关、编译执行器、文件存储、Socket 通知、限流、组合根装配。

**允许依赖**：domain（端口）、任意 npm 包、本层内部。

**禁止**：
- ❌ 相对路径指向 application/ 或 interface/（依赖倒置：本层只能向上实现 domain 端口）
- ❌ 包含业务规则
- ✅ 违反即 CI 失败

**落地路径**（P2 起执行）：persistence/（Prisma 适配器 + Mapper）、ai/（Gateway + PromptBuilder + 装饰器）、execution/、storage/、notifier/、rate-limit/、bootstrap/。