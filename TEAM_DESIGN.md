# 教学团队功能设计方案

## 一、背景

多教师需要协作管理班级。现有方案是 `getAllClasses` 返回全校班级，同校教师默认共享所有班级——这导致教师在不知情下成为其他班级的管理者。

## 二、核心概念

**教学团队（Team）** 是介于教师和班级之间的共享层：

- 团队由一位教师创建，邀请同校教师加入
- 团队内任何教师可将其直连班级加入团队
- 团队班级的作业、审核对全体成员可见可操作
- 教师的个人班级（不加入任何团队）不受影响

## 三、数据模型

```sql
-- 新增：教学团队表
CREATE TABLE teams (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  school_id INT UNSIGNED NOT NULL,
  created_by INT UNSIGNED NOT NULL,   -- 创建者
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (school_id) REFERENCES schools(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 新增：团队-教师关联
CREATE TABLE team_teachers (
  team_id INT UNSIGNED NOT NULL,
  teacher_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (team_id, teacher_id),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES users(id)
);

-- 新增：团队-班级关联
CREATE TABLE team_classes (
  team_id INT UNSIGNED NOT NULL,
  class_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (team_id, class_id),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES classes(id)
);
```

## 四、权限规则

### 班级可见性

```
教师可见班级 = 教师直连班级 + SUM(所在团队的班级)
```

### 作业可见性

```
教师可见作业 = 自己对可见班级布置的作业 + 团队内其他教师对团队班级布置的作业
```

### 审核发布权限（方案 B）

**团队内任何教师均可对本团队班级的任意作业进行审核和发布**，包括一键审核/一键发布。

- 审核记录会保存操作人 ID，可追溯
- 自己的非团队班级仅自己可审核

## 五、路由和菜单

```
教师端新增菜单项：/teacher/teams（教学团队）
```

### 团队列表页

| 功能 | 说明 |
|------|------|
| 查看我的团队 | 我是创建者 或 我是成员 |
| 创建团队 | 输入团队名称 |
| 删除团队 | 仅创建者可删除 |
| 退出团队 | 成员可退出（非创建者） |

### 团队详情/编辑页

| Tab | 功能 |
|-----|------|
| 教师管理 | 搜索添加同校教师 → 勾选加入团队；列表显示已有教师，可移除 |
| 班级管理 | 显示团队当前班级；每个教师可勾选自己的直连班级加入团队 |

## 六、受影响接口

| 接口 | 当前逻辑 | 新逻辑 |
|------|---------|--------|
| `GET /teacher/classes` | 返回全校班级 | 返回直连 + 团队班级 |
| `GET /teacher/students` | 全校班级学生 | 直连 + 团队班级学生 |
| `GET /teacher/assignments` | 只看自己的作业 | 自己的 + 团队内对团队班级布置的 |
| `GET /teacher/review-summary` | 同上 | 同上 |
| `GET /teacher/review-class` | 同上 | 同上 |
| `POST /teacher/submissions/batch-review` | — | 增加团队权限检查 |
| `POST /teacher/submissions/batch-publish` | — | 增加团队权限检查 |
| `PUT /teacher/submissions/:id/score` | — | 增加团队权限检查 |
| `PUT /teacher/submissions/:id/review` | — | 增加团队权限检查 |

### 新增接口

| 接口 | 说明 |
|------|------|
| `GET /teacher/teams` | 我的团队列表（创建者+成员） |
| `POST /teacher/teams` | 创建团队 |
| `GET /teacher/teams/:id` | 团队详情（含教师+班级） |
| `PUT /teacher/teams/:id` | 更新团队（增删教师、增删班级） |
| `DELETE /teacher/teams/:id` | 删除团队（仅创建者） |
| `POST /teacher/teams/:id/leave` | 退出团队 |

## 七、场景验证

### 场景 1：基本协作

T1 创建团队，添加 T2，T1 加 C1，T2 加 C2

| 教师 | 可见班级 | 可审作业 |
|------|---------|---------|
| T1 | C1, C2 | C1, C2 的全部 |
| T2 | C1, C2 | C1, C2 的全部 |

### 场景 2：交叉团队

T1 创建团队1（T2, T3, C1, C2），T2 创建团队2（T1, T3, C2, C3）

| 教师 | 班级 | 说明 |
|------|------|------|
| T1 | C1, C2 | 团队1 |
| T2 | C1, C2, C3 | 团队1+2 |
| T3 | C1, C2, C3 | 团队1+2 |

### 场景 3：个人班级不受影响

T1 有个人班级 C3（未加入任何团队），T2、T3 看不到 C3，C3 的作业仅 T1 可审。

## 八、实施顺序

| 步骤 | 内容 | 预计 |
|:---:|------|:---:|
| 1 | 数据库建表 + Prisma schema + `npx prisma db push` | 15min |
| 2 | 后端：团队 CRUD API | 30min |
| 3 | 后端：改造现有接口（班级/学生/作业/审核）加团队权限 | 40min |
| 4 | 前端：团队管理页面（列表+详情/编辑） | 1h |
| 5 | 前端：班级选择/作业/审核自动感知团队 | 30min |
| 6 | 测试验证 | 30min |
