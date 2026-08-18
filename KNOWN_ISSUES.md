# KNOWN_ISSUES — 规则驱动实训评分 v1 遗留问题清单（2026-08-18 分支基线）

> 分支：feature/rule-driven-scoring ｜ 用途：后续研究/开发对照清单
> 背景：LLM 直评（master，已部署）存在评分一致性缺陷（同代码 ±22~35 分波动），
> 本分支为规则驱动重构 v1。已知问题按优先级排列。

## ✅ 已验证基线（回归基准，改动后必须重跑）

- 作业 311（题目 353 用户管理系统前端）59 人重评：**3 个文件组 → 90/90/65，组内零波动**
  （组哈希 a76f577051×20、2a235b6b7e×20、7f2fc70f65×19）
- 单测：checker-service 35/35、rule-executor 57/57、fact-extractor 13/13（**必须三段式独立进程**，见 P1）
- 生成链路实测：353（Vue）2 轮 100/100 ready；355（Java）缺陷候选豁免后 review

## 🔴 P0 待研究（"脚本功能不满意"的核心）

1. **fact 提取仅 JS（tree-sitter-javascript）**：Java/Python/Go 题没有事实维度，
   prompt 事实字段清单全是 JS 向 → 模型只能硬写文件/正则规则，质量波动大
   （355 曾 8 轮最高 61/100 failed；也出现过 100/100 ready，取决于模型发挥）
2. **正则规则脆弱**：标准包写法差异即失分（如 pom.xml 依赖格式、方法链顺序），
   校准只能修参数，修不了"规则表达力"上限
3. **研究方向**（未定稿）：
   - 代码语义比对：AST 指纹 / 与标准包语义 diff / embedding 相似度
   - 规则生成 few-shot 示例库（用 353/355 成熟规则做样本）
   - 混合架构：确定性规则打底 + LLM 只评主观项（现状雏形，需打磨）

## 🟡 P1 工程债

4. jest 多套件复用 tree-sitter 原生模块状态破坏（轮流失败/静默失效）→ npm test 三段式规避，未根治
5. 规则版本存 checkerMeta.versions（JSON），未迁移 RuleVersion 表（方案 §7）
6. 模板库 / factExtractor 语言插件架构未实现（方案 §4.4 / §5.1，阶段 4）
7. 教师"豁免"后标准包得分不回算（仅标记状态，不影响就绪判定）

## 🟢 P2 已知限制

8. 规则生成用 deepseek-chat（非思考，env DEEPSEEK_RULES_MODEL 可覆盖）；
   其他评分流程仍用全局 deepseek-v4-flash（思考模型，教训：长输出会被思考 token 挤占 → 空内容）
9. 模型偶发结构崩坏（缺 subjective_items、item 写成 name）→ 已三重兜底：
   提示词硬性要求 + 解析容错（name 兼容、subjective 缺省为空）+ 每轮同 prompt 重试 2 次
10. LLM 调用超时 180s（网络挂起保护）；生成状态 >15min 视为陈旧可重启（防孤儿态）
11. 校准上限 3 轮（2026-08-18 由 8 轮收紧）；缺陷候选豁免 + 阈值（≥90）达标进 review
12. 保存守卫：标准包更换检测依赖前端上传事件；服务端 inputsSnapshot 存指纹可做更强校验
13. 帮助弹窗/UI 文案未接入 i18n；学生端明细渲染用规则中文标签（FACT_LABELS/evidence）

## 运行备忘

- 规则生成模型：server/.env → DEEPSEEK_RULES_MODEL=deepseek-chat（非思考，长输出稳定）
- 测试：DATABASE_URL 库名必须为 exam_system_test（test/setup.js 白名单护栏）
- 重置脚本（清空全部 checker 状态）：
  prisma question.updateMany({ where: { type: 'project' }, data: { checkerScript: null, checkerStatus: 'none', checkerMeta: null } })
