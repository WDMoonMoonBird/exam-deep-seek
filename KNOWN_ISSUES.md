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

1. ~~**fact 提取仅 JS**~~ → ✅ **P0-1 已交付（2026-08-31，多语言插件架构）**：
   - factExtractor.js 重构为注册中心：语言检测（扩展名统计 + 清单文件加权）→ 按语言分派 adapter；
   - 新增 factExtractors/{common,javascript,java,python}.js：javascript 为 v1 逻辑迁入（行为不变，
     13 原用例全绿）；java（tree-sitter-java：类名/import/包名/@Controller/@RequestMapping 映射/
     SpringBoot·MyBatis·JPA·Lombok 标志）；python（tree-sitter-python：类/函数/import/@app.route
     路由/Flask·Django·FastAPI·Pydantic 标志）；
   - Schema v2：v1 字段全保留 + 24 个语言扩展字段（空目录断言已同步）；
   - 接线：ruleExecutor.FACT_LABELS 扩展、checkerService FACTS_SCHEMA 按语言注入
     （buildGenerateUserPrompt 新增 language 参数，generateChecker 检测标准包语言）、
     ruleMutator.FACT_MUTATION 扩展（9 个新布尔事实变异映射）；
   - 修复 resolveProjectRoot：清单文件 = 工程根强信号，否则 Java 工程（pom.xml + src/）
     被误下钻到 src/ 导致清单失配（JS 工程同理，属既有缺陷一并修复）；
   - 测试：fact-extractor 17/17、rule-executor 57/57、rule-mutator 21/21、checker-service 42/42、
     全量 736/736（51 suites）全绿；
   - 遗留：Go 等语言仍无 adapter；355 Java 题真实重测待环境就绪后执行。
2. ~~**正则规则脆弱**~~ → ✅ **P0-2 已交付（2026-08-31，语义级规则原语）**：
   - ruleExecutor 新增 3 种语义级规则类型（RULE_TYPES +3）：
     * ast_pattern{path, pattern}：tree-sitter 解析后按节点类型链匹配（如 "class_declaration > method_declaration"），
       无视空格/换行/引号/缩进差异——解决方法链顺序、格式风格导致的误失分；
     * count_imports{path, module, min}：跨语言 import/require/from/include 行统计（行扫描），
       无视引号风格——解决 pom.xml 依赖格式、import 写法差异；
     * normalized_text{path, text}：归一化（去空白）后包含匹配——解决声明/配置内容的格式差异；
   - 多语言解析器复用 P0-1（JS/Vue/Java/Python 自动分派）；
   - ruleMutator 负例变异扩展：ast_pattern/normalized_text → 删除目标文件；count_imports → 删除 import 行；
   - checkerService 生成提示词补充语义级规则使用说明（优先于文本级规则）；
   - 测试：rule-executor 61/61（+4 新用例：格式差异匹配/跨语言 import/归一化/白名单）、
     rule-mutator 21/21、checker-service 42/42、fact-extractor 17/17、全量 736/736 全绿；
   - 遗留：AST 语义 diff/embedding 相似度（研究方向 3）未做；ast_pattern 目前匹配节点类型链，
     不做语义等价判定（两个方法体不同但同名仍匹配）。
3. **研究方向**（未定稿）：

## ✅ Team A 已交付（2026-08-18，规则验证升级）

- **负例验证（Negative Test）**：ruleMutator.js 为每条在标准包上通过的规则派生确定性缺陷变体，
  验证"标准包 Pass + 缺陷变体 Fail"（8 种 rule_type 全覆盖，fact 走 FACT_MUTATION 映射）；
  weak 规则（区分度不足）进入校准反馈（Rule Repair）——防参考实现过拟合（方案 §11/§13/§14）
- **修复 BUG-A-03（P1）**：ruleMutator 误用已解析 projectRoot 导致 runRules 二次下钻
  （嵌套单子目录工程负例覆盖为 0）→ 改为 rootDir 语义 + 嵌套工程回归用例
- **验收实测**：353 ready 100/100（负例覆盖 61）、355 review 96（负例覆盖 113）；3 轮上限内收敛
- 全量测试 680 用例全绿（含 rule-mutator 21、checker-service 37）
- 测试命令注意：套件1 位置参数前置；tree-sitter 套件必须独立进程且**串行**（BUG-A-01/A-02/BUG-B-02 已修正 playbook）

## ✅ Team B 已交付（2026-08-18，评分项三分类 + 教师文案）

- **Rubric Analyzer 三分类**：summarizeRubricItems/normalizeRubricItems 输出 automation_level
  （deterministic/semi/subjective，旧数据兜底 deterministic）；prompt 按分类引导
  （主观项禁生成客观规则、确定性项必须全生成、semi 允许混合）；findMisplacedSubjective 校验误入
- **BUG-B-03（P1）修复**：rubricItems 提炼结果写回缓存（此前只读不写，每次生成重复提炼且分类不可复查）
- **文案**：全量「评分脚本」→「自动评分器」（client/src 0 残留、server 教师可见消息 0 残留）
- **验收实测**：353 rubricItems 落库 7 deterministic + 2 subjective，主观分类项零误入客观规则
- 全量测试 694 用例全绿（含 rubric-items +4、checker-service +5）

## ✅ Team C 已交付（2026-08-18，实验证据 + 冻结版本）

- **方差实验**（docs/experiments/variance-report.md，作业 311 真实数据）：LLM 直评同工程 ×5
  **同分率 0.0%**、std 区间 [0.45, 7.66]、mean vs 确定性平均绝对偏差 10.64；
  确定性评分（runRules）恒定同分 → RQ6 证据（方案 §26）
- **冻结版本**：评分信封 grading 段写入 ruleVersionHash（activeVersionId 'vN' → 规则 sha1 前 12 位 → null 兼容旧记录）；
  白名单同步（projectView.js）教师视图可回显
- **修复**：BUG-C-01（白名单断言同步）、BUG-C-02（fallback 对称）；BUG-C-03 确认已有覆盖
- 全量测试 702 用例全绿（project-view 同步后 569+13+57+21+42）

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
