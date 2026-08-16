# 接口层 interface（P0 骨架，暂空）

**职责**：HTTP / Socket 出入口——参数解析、调用应用用例、响应与错误码映射；不含业务规则。

**允许依赖**：application（用例）、domain（DTO / 类型）、任意 npm 包、本层内部。

**禁止**：
- ❌ 相对路径指向 infrastructure/（如 utils/prisma.js、services/deepseek.js——现状违规，逐步清零）
- ❌ 编写业务规则 / 直接调用 AI、Prisma
- ✅ 违反即 CI 失败

**落地路径**（P3 起执行）：http/routes、http/controllers（薄）、http/middleware、socket/。