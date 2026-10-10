# trustjudge-server — TrustJudge 概率化评分 Sidecar

本目录实现一个独立的 **TrustJudge 评分 Python sidecar 服务**（FastAPI），忠实复现
ICLR 2026 论文 *TrustJudge: Inconsistencies of LLM-as-a-Judge and How to Alleviate
Them*（arXiv:2509.21117）的 **SingleAnswerGrade** 单答评分路径：

1. 对每个"评分单元"（总分 / 每个分项）**独立**调用一次大模型，并要求返回
   logprobs / top_logprobs（DeepSeek OpenAI 兼容接口，实测支持，上限 20）。
2. 从输出 token 的方括号分值序列（Score: [X]）中取出模型对每个候选分数的
   概率质量 —— trustjudge_core.extract_middle_dict（移植自原仓库
   trustjudge/common.py）。
3. 用温度 softmax 把分数分布折算成连续期望分 ——
   trustjudge_core.compute_softmax_weighted_score（移植自原仓库
   ConflictCalculator.compute_softmax_weighted_score，T=0.2）。

因此返回的分数是 0~maxScore 的**浮点期望值**（非整数），能保留判断置信度信息，
两次输入近似时分数方差显著小于离散整数分。

本 sidecar 走 **API 模式**（无 vllm / torch / transformers），仅被 Node.js 后端
通过 HTTP 调用，不改动 server/ 下任何代码；API Key 复用父仓库
server/.env 中的 DEEPSEEK_API_KEY（只读，不修改该文件）。

---

## 目录结构

    trustjudge-server/
    ├── app.py               # FastAPI 服务：POST /grade、GET /health
    ├── trustjudge_core.py   # TrustJudge 算法核心（纯 stdlib，忠实移植）
    ├── requirements.txt     # 轻量依赖
    ├── README.md
    └── .gitignore           # .venv/、__pycache__/

## 运行

    cd trustjudge-server
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt

启动（端口 8901）：

    uvicorn app:app --host 127.0.0.1 --port 8901
    # 或：python app.py

自检：

    curl -s http://127.0.0.1:8901/health
    # -> {"status":"ok"}

## 配置

服务启动时按以下顺序取值（显式环境变量 > server/.env > 内置默认值）：

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| TRUSTJUDGE_API_KEY / DEEPSEEK_API_KEY | （必填，取自 ../server/.env） | DeepSeek API Key |
| TRUSTJUDGE_BASE_URL | https://api.deepseek.com/v1 | OpenAI 兼容 base |
| TRUSTJUDGE_MODEL | deepseek-chat | 主模型（非推理，logprobs 干净） |
| TRUSTJUDGE_FALLBACK_MODEL | deepseek-v4-flash | 失败回退模型（max_tokens 4000） |
| TRUSTJUDGE_TOP_LOGPROBS | 20 | top_logprobs 数量 |
| TRUSTJUDGE_MAX_TOKENS | 2000 | 主模型 max_tokens |
| TRUSTJUDGE_TEMPERATURE | 1.0 | 论文同款 temperature |
| TRUSTJUDGE_TIMEOUT | 180 | HTTP 超时（秒） |

调用参数与论文一致：temperature 1.0、logprobs=true、top_logprobs=20；单次失败
重试 2 次（退避 2s / 5s），仍失败则回退 TRUSTJUDGE_FALLBACK_MODEL 再试 2 次。

## API

### POST /grade

请求体：

    {
      "title": "Java 期末程序设计（简答题：银行账户类）",
      "rubric": "评分标准：……",
      "maxScore": 100,
      "standardFiles": "参考实现……",
      "studentFiles": "学生提交的 Java/Vue 代码……",
      "items": [
        { "id": "f1", "item": "功能正确性（20 分）：……", "maxScore": 20 },
        { "id": "q1", "item": "代码质量（10 分）：……", "maxScore": 10 }
      ]
    }

items 可为空数组（此时只评总分，一次模型调用）。总分与每个 item 各自独立做一次
TrustJudge 分布敏感评分。每个评分单元的调用详情（所用模型、top-5 分数概率分布、
softmax 加权期望分）会打印在服务端日志中。

响应：

    {
      "totalScore": 86.2413,
      "breakdown": [
        { "id": "f1", "item": "功能正确性……", "maxScore": 20, "score": 17.0531 },
        { "id": "q1", "item": "代码质量……", "maxScore": 10, "score": 8.9176 }
      ]
    }

curl 示例（请自行替换引号内的字段）：

    curl -s -X POST http://127.0.0.1:8901/grade -H 'Content-Type: application/json' -d '{"title":"Java OOP","rubric":"按标准评分","maxScore":100,"standardFiles":"...","studentFiles":"...","items":[{"id":"f1","item":"功能正确性","maxScore":20}]}'

### GET /health

    {"status": "ok"}

## 说明与限制

- 分布敏感评分只对出现在 top_logprobs 中的候选分数有效（与论文一致）；若模型违反
  格式（无 Score: [X] 行），服务端退回正则解析文本并按整数分处理，并在日志告警。
- trustjudge_core.py 中 extract_middle_dict 额外支持了 DeepSeek 分词器把多位分数
  拆成多个 token 的情况（1~3 位整数，详见模块 docstring），这是相对原仓库唯一的
  功能性增强；compute_softmax_weighted_score 与原文逐行一致。
- **本服务不支持的入参（M6 核实，2026-10-10）**：`GradeRequest` 只有 title/rubric/maxScore/
  standardFiles/studentFiles/items 六个字段且 `model_config={"extra":"ignore"}` —— Node 侧除这六个
  字段外的入参（如 mode / fixedItems）会被**静默丢弃**；`build_messages` 无条件输出
  `== Reference / standard solution ==` 段（开放题只会渲染成 `(none provided)`）；items 由 rubric
  文本正则推导，不消费调用方的固定分项。
  因此 Node 侧 `gradeProjectTrustJudge` 在 `mode==='open'` 或带有效固定分项时**显式让位**给
  legacy gradeProject（不再把语义寄希望于本服务）；取舍与后续对齐待办见 KNOWN_ISSUES.md「P2 已知限制」第 14 条。
