# 应用层 application（P0 骨架，暂空）

**职责**：用例编排——谁在什么条件下做什么；事务边界；领域事件发布。

**允许依赖**：domain（实体、端口、事件）、本层内部、dto。

**禁止**：
- ❌ import 外部框架/基础设施包（express / prisma / @prisma/client / axios / socket.io / mysql2 / multer / adm-zip / mammoth / dotenv / jsonwebtoken / bcryptjs / pino / helmet / cors / qrcode / xlsx …）
- ❌ import node 内置 IO（fs / path / child_process / http …）
- ❌ 相对路径指向 infrastructure/ 或 interface/
- ✅ 违反即 CI 失败

**落地路径**（P3 起执行）：use-cases/（review, submission, project-review, auth …）、dto/、services/（ReviewOrchestrator）。