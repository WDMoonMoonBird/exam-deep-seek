# 测试报告 — 工程项目批改功能

> **测试人**: Edward（QA Engineer）  
> **测试时间**: 2026-08-02  
> **测试环境**: 后端 localhost:3000 / 前端 localhost:5173 / MySQL exam_system  
> **测试账号**: test_teacher (teacher 角色)  
> **轮次**: Round 1 + Round 2（回归验证）

---

## Round 1 测试摘要

| 指标 | 数值 |
|------|------|
| 总测试用例 | 30 |
| 通过 | 29 |
| 失败 | 1 |
| 通过率 | 96.7% |

## Round 2 测试摘要（Bug 修复后回归）

| 指标 | 数值 |
|------|------|
| 总测试用例 | 30 |
| 通过 | 30 |
| 失败 | 0 |
| 通过率 | **100%** ✅ |

---

## 详细测试结果

### 1. 回归测试（确保现有功能未受影响）

| # | 测试用例 | 结果 | 备注 |
|---|----------|------|------|
| 1.1 | GET /api/health | ✅ PASS | `{"code":0,"data":{"status":"running"}}` |
| 1.2 | POST /api/auth/login (正常登录) | ✅ PASS | 返回 token + user 信息 |
| 1.3 | GET /api/teacher/questions | ✅ PASS | 正常返回题库列表 (total=2) |
| 1.4 | GET /api/teacher/questions?page=1&pageSize=5 | ✅ PASS | 分页正常 |

### 2. 安全测试

| # | 测试用例 | 结果 | 备注 |
|---|----------|------|------|
| 2.1 | 无 token 访问 GET /api/teacher/projects | ✅ PASS | 返回 401 (code:1002) |
| 2.2 | 无 token 访问 POST /api/teacher/projects | ✅ PASS | 返回 401 (code:1002) |
| 2.3 | 无 token 上传 zip | ✅ PASS | 返回 401 (code:1002) |
| 2.4 | 无效 token | ✅ PASS | 返回 401 (code:1002) |
| 2.5 | 非 Bearer 格式 auth header | ✅ PASS | 返回 401 (code:1002) |
| 2.6 | 错误角色 (super_admin 访问 teacher 路由) | ✅ PASS | 返回 403 (code:1003) |
| 2.7 | 文件路径目录穿越 `../../etc/passwd` | ✅ PASS | 返回 400 "非法路径" (`..` 检测) |
| 2.8 | 文件路径目录穿越 `/../../../etc/passwd` | ✅ PASS | 返回 400 "非法路径" (`..` 检测) |

### 3. 实训任务 CRUD

| # | 测试用例 | 结果 | 备注 |
|---|----------|------|------|
| 3.1 | 获取空任务列表 | ✅ PASS | total=0, list=[] |
| 3.2 | 创建任务（有效参数） | ✅ PASS | 返回创建成功的 project 对象 |
| 3.3 | 创建任务（缺少必填字段） | ✅ PASS | 正确拒绝: "标题、时间、班级为必填项" |
| 3.4 | 创建任务（classIds 为空数组） | ✅ PASS | 正确拒绝 (classIds 必填) |
| 3.5 | 创建任务（权重合计 ≠ 1） | ✅ PASS | 正确拒绝: "评分权重合计必须为100%" |
| 3.6 | 创建任务（标题 > 200 字） | ✅ PASS | 正确拒绝: "标题不能超过200字" |
| 3.7 | 获取任务详情 | ✅ PASS | 返回含 fileTree 的完整数据 |
| 3.8 | 更新任务 | ✅ PASS | 成功更新标题和状态 |
| 3.9 | 更新不存在的任务 | ✅ PASS | 返回 404 (code:1004) |
| 3.10 | 获取不存在的任务 | ✅ PASS | 返回 404 (code:1004) |
| 3.11 | 软删除任务 | ✅ PASS | 返回 "删除成功" |
| 3.12 | 获取已删除的任务 | ✅ PASS | 返回 404 (code:1004)，软删除生效 |

### 4. Zip 上传与文件树

| # | 测试用例 | 结果 | 备注 |
|---|----------|------|------|
| 4.1 | 上传标准工程 zip | ✅ PASS | 返回 tempId + fileTree + fileCount |
| 4.2 | 上传非 zip 文件 | ✅ PASS | multer 拒绝: "仅支持 zip 文件" |
| 4.3 | 创建任务关联 zip (tempId) | ✅ PASS | fileTree 正确显示 src/ 目录和 README.md |
| 4.4 | 获取含文件树的任务详情 | ✅ PASS | 文件树结构正确 |

### 5. 提交与评分

| # | 测试用例 | 结果 | 备注 |
|---|----------|------|------|
| 5.1 | 获取提交列表（空） | ✅ PASS | total=0, stats 正确 |
| 5.2 | 获取不存在的提交详情 | ✅ PASS | 返回 404 (code:1004) |
| 5.3 | 获取文件内容（缺少 path 参数） | ✅ PASS | 拒绝: "缺少 path 参数" |
| 5.4 | 保存评分（缺少 finalScore） | ✅ PASS | 拒绝: "请填写最终分数" |
| 5.5 | 保存评分（不存在的提交） | ✅ PASS | 返回 404 (code:1004) |

### 6. 前端构建检查

| # | 测试用例 | 结果 | 备注 |
|---|----------|------|------|
| 6.1 | Vite build 编译检查 (Round 1) | ❌ FAIL | saveReview 重复声明 |
| 6.2 | Vite build 编译检查 (Round 2, 修复后) | ✅ PASS | 3700 modules, 0 errors |

---

## 失败用例详情

### ❌ 6.1 — Vite 前端构建失败

**错误信息**:
```
[vue/compiler-sfc] Identifier 'saveReview' has already been declared. (104:15)
```

**文件**: `client/src/views/teacher/ProjectReview.vue`

**根本原因**: 第 146 行 import 了 `saveReview` API 函数，同时第 244 行又声明了同名的本地函数 `async function saveReview(status)`，导致标识符重复声明。

**代码冲突**:
```javascript
// Line 146: 导入 API 函数
import { getSubmissionDetail, getFileContent, saveReview, regrade } from '../../api/projects.js';

// Line 244: 本地包装函数（同名冲突！）
async function saveReview(status) {
  // ...
  await saveReview(projectId, submissionId, { ... }); // Line 248: 递归调用自身而非 API
}
```

**影响**: 
1. Vite/Rolldown 编译报错，无法构建生产包
2. 即使忽略编译错误，运行时也会产生无限递归（本地函数调用自身而非 API）

**修复建议** (给 Engineer):
将导入的 API 函数重命名，避免与本地包装函数冲突：

```diff
- import { getSubmissionDetail, getFileContent, saveReview, regrade } from '../../api/projects.js';
+ import { getSubmissionDetail, getFileContent, saveReview as saveReviewApi, regrade } from '../../api/projects.js';

  async function saveReview(status) {
    if (finalScore.value == null) return message.warn('请填写调整分数');
    saving.value = true;
    try {
-     await saveReview(projectId, submissionId, {
+     await saveReviewApi(projectId, submissionId, {
        finalScore: finalScore.value,
        teacherFeedback: teacherFeedback.value,
        status,
      });
```

---

## Round 2 回归验证

### 修复验证

Engineer 已修复 `ProjectReview.vue` 的 `saveReview` 标识符冲突：
- Line 146: `import { ..., saveReview as saveReviewApi, ... }` ✅
- Line 248: `await saveReviewApi(projectId, submissionId, { ... })` ✅

### Vite Build 结果

```
vite v8.0.14 building client environment for production...
✓ 3700 modules transformed.
✓ built in 904ms
```

- ✅ 零编译错误
- ✅ ProjectReview 组件正常打包 (`ProjectReview-BpF_yLxb.js` + `ProjectReview-CC4Dyw9j.css`)
- ⚠️ 仅 chunk 大小优化建议（非阻塞）

---

## 智能路由判定 (Round 2)

### 路由: **Send To → NoOne** ✅

| 判定依据 | 结论 |
|----------|------|
| Bug 已修复 | ✅ Engineer 修复了 `saveReview` 重复声明 |
| 编译验证 | ✅ 3700 modules, 0 errors |
| 全部测试 | ✅ 30/30 PASS |

**所有测试通过，无需进一步操作。**

---

## 后端 API 总体评价

- ✅ 所有后端 API 测试通过 (29/29)
- ✅ 认证/鉴权正确 (401/403 区分明确)
- ✅ 路径穿越防护有效 (`..` 检测 + `path.resolve` 双重防护)
- ✅ 参数校验完备 (必填项、权重、标题长度)
- ✅ 软删除实现正确
- ✅ 回归测试全部通过

## 前端构建总体评价

- ✅ Round 2 构建成功，零编译错误
- ✅ 所有 Vue SFC 组件正确编译
- ⚠️ 建议后续优化 chunk 分包策略（非阻塞）

---

## Round 2 独立回归验证 (qa-r2, 2026-08-02)

> **验证人**: Edward（QA Engineer, qa-r2）
> **验证范围**: 修复项确认 + API 快速回归
> **测试环境**: 沙箱内 localhost:3000

### 1. 修复验证：`saveReview` 重复声明

| # | 验证项 | 结果 | 详情 |
|---|--------|------|------|
| F1 | import 使用别名 `saveReview as saveReviewApi` | ✅ | Line 146 正确 |
| F2 | 本地函数调用 `saveReviewApi(...)` | ✅ | Line 248 正确，无递归 |
| F3 | Vite 模块转换 | ✅ | 3700 modules transformed，零错误 |

### 2. API 快速回归

| # | 测试用例 | 结果 | 备注 |
|---|----------|------|------|
| R1 | GET /api/health | ✅ | `{"code":0,"data":{"status":"running"}}` |
| R2 | POST /api/auth/login (admin) | ✅ | 返回 token + super_admin 用户 |
| R3 | POST /api/auth/login (test_teacher) | ✅ | 返回 token + teacher 角色 |
| R4 | GET /api/teacher/projects (teacher token) | ✅ | total=1，正常返回 |
| R5 | GET /api/teacher/questions (teacher token) | ✅ | total=2，正常返回 |
| R6 | GET /api/teacher/projects (无 token) | ✅ | 401 (code:1002)，安全拦截正确 |
| R7 | GET /api/teacher/projects (super_admin token) | ✅ | 403 (code:1003)，角色隔离正确 |

### 3. 构建环境说明

Vite build 在沙箱环境中因 `safe-delete` 保护（dist/assets 超过 50 文件阈值）无法完成 `prepareOutDir` 阶段，但 **3700 个模块全部成功转换**，确认零编译错误。这是沙箱文件系统限制，非代码问题。

### 判定

**路由: Send To → NoOne** ✅

- ✅ Bug 修复已验证：`saveReview as saveReviewApi`，无重复声明
- ✅ 模块转换：3700 modules，0 errors
- ✅ API 回归：7/7 全部通过
- ✅ 安全拦截：401/403 行为正确

**所有测试通过。工程项目批改功能交付完成。**
