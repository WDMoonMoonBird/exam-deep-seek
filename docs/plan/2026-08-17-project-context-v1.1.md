# 实训题评分上下文管理方案（v1.1）

> 日期：2026-08-17 ｜ 状态：已审核通过，实施中 ｜ 相关代码：server/src/services/{projectGrading.js, deepseek.js} + 新增 projectContextBuilder.js

## 一、背景与目标

实训题（工程项目）AI 评分的实测问题：
- 412KB 提示词 = 137K tokens（1M 窗口装得下，但冷启动 61s、超大工程装不下）
- 推理模型 max_tokens=8000 被思考 token 占满 → 空输出/截断 → "评分异常"（实测 reasoning_tokens 5504/6448）
- 非思考模式实测评分区分度下降（三次收敛 85 分，历史思考模式 80/85/96），**业务刚需思考模式**

目标：
1. 超大工程可评分（文件树 + 精选文件 + 骨架兜底）
2. 输入 412KB → 30~80KB，降延迟
3. 修复 max_tokens 截断，稳定评分
4. 零架构风险（配置开关回滚）

## 二、整体设计

```
学生zip → 现有过滤（依赖/大小）→ 落盘
                                   ↓
【L0 结构过滤】全语言白名单 + 大小阈值 + 目录权重 → 核心文件清单
                                   ↓
【L1 两阶段】
   第一轮：文件树 + 评分标准 → 模型选"评分要细看的文件"（≤20 个，≤60KB）
   第二轮：选中文件全文 + 标准包 + 完整文件树 → 正式评分
                                   ↓
【预算兜底】>120K tokens：丢学生非核心 → AST 骨架化 → 截断 + 标记
                                   ↓
               结果写回（现有 envelope/Worker 不变）
```

## 三、L0 结构过滤（纯 JS 零依赖）

### 3.1 全语言白名单

| 类别 | 扩展名 |
|---|---|
| 前端 | js ts jsx tsx vue svelte html css scss sass less |
| 后端 | java py go c cpp h hpp cc cxx cs rb php rs kt kts swift m mm |
| 脚本/数据 | sh bash zsh ps1 sql |
| 配置（仅小文件） | json yml yaml xml toml ini properties env gradle |
| 无扩展名特殊文件 | Dockerfile Makefile Jenkinsfile Gemfile Cargo.toml go.mod |

### 3.2 兜底规则
- 未知扩展名：UTF-8 可读文本 + 源码特征（{ ( = function 等）→ 保留，否则丢弃
- 大小阈值：源码 > 256KB 折叠占位；配置文件 > 64KB 丢弃
- 目录权重：src/ app/ lib/ main* 优先；tests/ docs/ assets/ dist/ 降权

## 四、L1 两阶段（agent 式按需读取）

**第一轮 prompt**（1~3KB）：
```
你是代码审查规划师。学生提交工程如下（文件树+大小+目录权重）。
请选出评分时【必须查看完整源码】的最多 20 个文件（总大小 ≤ 60KB），
优先：入口/核心业务/被引用最多；排除：配置/资源/测试。
严格 JSON：{"files": [...], "reason": "..."}
```
- 超时 30s、重试 2 次；失败自动降级全量注入（安全回退）

**第二轮** = buildProjectGradePrompt 改造：
- 学生代码 = 选中文件全文；标准包 = 全部注入（超预算同骨架化）
- 附完整文件树，标注未提供内容文件
- 输出约束：breakdown ≤ 8 项、评语 ≤ 300 字

## 五、稳定性修复（并入本轮）

| 项 | 现状 | 修复 |
|---|---|---|
| 实训题 max_tokens | 8000 | 16000 |
| 编程题 max_tokens | 2000 | 4000 |
| 实训题重试 | 2 次 | 3 次 |
| 输出约束 | 无 | breakdown ≤ 8 项、评语 ≤ 300 字 |

## 六、配置与回滚

```
project_context_mode = off | filter | two-stage   （默认 filter）
```
1 分钟配置缓存，切换即时生效，异常一键回 off。

## 七、成本与性能预估（以 412KB/137K tokens 实测样本）

| 指标 | 现状 | two-stage 后 |
|---|---|---|
| 输入体积 | 412KB | 30~80KB |
| 输入 tokens | 137K | 10~27K |
| 冷启动耗时 | ~61s | 15~30s |
| 单次成本 | ~0.01 元（缓存命中） | 更低 |

## 八、文件改动清单

| 文件 | 改动 |
|---|---|
| 新增 server/src/services/projectContextBuilder.js | 文件树/白名单/骨架/预算 |
| server/src/services/deepseek.js | selectImportantFiles + 参数修复 |
| server/src/services/projectGrading.js | 接入新链路 + 配置读取 |
| server/src/utils/fileTree.js | 文件树序列化辅助 |
| 新增 unit 测试 + 补充 integration 测试 | 骨架/过滤/降级路径 |

前端零改动。

## 九、实施顺序

1. Step 1 稳定性修复（max_tokens/重试/输出约束）——先上线解决"评分异常"
2. Step 2 L0 过滤（默认 filter 档）
3. Step 3 L1 两阶段（two-stage 档，失败降级）
4. Step 4 观察期一周，不合格回退

## 十、风险与缓解

| 风险 | 缓解 |
|---|---|
| 模型选文件漏关键逻辑 | 第二轮附完整文件树可点名补看；骨架兜底 |
| AST 骨架丢函数体 | 仅超预算兜底，默认档保留全文 |
| 两阶段多一次调用 | 第一轮 1~3KB；失败自动降级 |
| 冷门语言 | 20+ 主流语言白名单 + 文本兜底 + 正则骨架 |
| 旧提交兼容 | 新链路仅影响重评/新提交 |

## 十一、L2 候选（本期不做）

- CodeGraph（MIT，Rust 内核 npm 包，免编译）：跨文件调用图 → 替换手写骨架 + 文件选择依据
- 前置验证：库模式嵌入、单工程索引耗时、2 核 4G 内存占用

## 十二、实测数据附录

| 实验 | 结果 |
|---|---|
| 412KB prompt 复现 | 137,060 tokens，1M 窗口正常（0.9s 缓存命中） |
| max_tokens 8000 | reasoning 5504 + 输出 944 → 思考长时空输出（finish=length, content=0） |
| max_tokens 16000 | reasoning 6477 + 输出 1984 字符，稳定，61.6s |
| max_tokens 32000 | reasoning 8636，73.4s（收益递减） |
| reasoning_effort low | 思考 22174，191.8s（更慢，不可用） |
| 非思考模式 | 0 reasoning，5.2s，但评分区分度下降（80/85/96 → 85/85/85） |
| max_tokens 上限 | 官方 API 实测 [1, 393216]（384K） |
| AST 骨架压缩 | 42 文件 211KB → 15.1KB（92.9%），129ms 纯 CPU |
