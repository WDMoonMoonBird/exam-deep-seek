# 教师手册演示配图（shots.mjs）

给「教师使用手册」的交互演示（client/src/components/manual/）批量产出**真实页面截图**：
一类做**兜底图**，一类做**定位图**。只读浏览，不改任何业务代码。

## 1. 两类图与命名契约

| 类型 | 文件名 | 用途 |
| --- | --- | --- |
| fallback 兜底图 | `demo-<key>-light.png` / `demo-<key>-dark.png` | 演示组件加载失败/降级时顶上的真实页面截图；尺寸≈演示框 1200×720 |
| focus 定位图 | `demo-<key>-focus-light.png` / `demo-<key>-focus-dark.png` | 只截「要点容器」：四周压暗 + 2px 品牌描边 + 序号气泡，替代"太大太全"的旧整页截图 |

```
输出目录：client/public/doc-img/   （线上路径 = /exam/doc-img/…）
```

### ⚠ key 不是随便起的

`client/src/views/Doc.vue` 里写死了兜底路径：

```js
fallback: d.meta.anchor ? '/exam/doc-img/demo-' + d.meta.anchor + '-light.png' : ''
```

所以 **key 必须等于手册章节的 anchor**（`meta.anchor`）才能被自动兜底命中：

```
quickstart(2) / classes(3) / students(4) / teams(5) / questions(6) / project(7) / assignments(8) / review(11)
```

本脚本另外产出了 `assignments-modal`（布置作业弹窗）——它**不是** anchor，属于"扩展键"，
供手册静态章节或将来新增 anchor 时使用；命名同样遵守 `demo-*` 前缀，不会误伤既有图片。

暗色图目前 Doc.vue 不会自动引用（它只拼 `-light.png`），留给以后做主题自适应时用。

## 2. 前置条件

1. 前端 dev server 已起：`http://localhost:5173`（vite `base=/exam/`）
2. 后端已起（登录走 dev server 的 `/api` 代理）
3. `client/node_modules` 里有 playwright（脚本从 `client/package.json` 解析，不装依赖、不改 package.json）

账号（写死在脚本顶部的 `ACCOUNTS`）：

| login | 账号 | 说明 |
| --- | --- | --- |
| `teacher` | e2e_teacher / e2e_teacher | 教师页全部场景（作业/题库/审核/班级/学生/团队） |
| `student` | 202600001 / 202600001 | 学生页（当前没有场景用到，保留） |
| `admin` | admin / ***REDACTED*** | 管理端（当前没有场景用到，保留） |
| `none` | — | 游客态（登录页那种公开页，不写 token） |

## 3. 用法

```bash
node docs/manual/shots.mjs                        # 全部场景 × 亮/暗 × 两类（36 张，约 2.5 分钟）
node docs/manual/shots.mjs --list                 # 只打印场景清单（key / login / url / title）
node docs/manual/shots.mjs --only classes,teams   # 只跑指定 key
node docs/manual/shots.mjs --kind focus           # fallback | focus | both（默认 both）
node docs/manual/shots.mjs --theme dark           # light | dark | both（默认 both）
node docs/manual/shots.mjs --out /tmp/x           # 换输出目录（默认 client/public/doc-img）
node docs/manual/shots.mjs --base http://localhost:5173/exam
```

跑完会打印：逐张体积 + **manifest（key → 文件 → 用途，JSON）** + 可直接贴进本文件第 6 节的 markdown 表。
超预算（>200KB）的图会在行首标 `⚠`；任何 console error / HTTP≥400 / 主题没生效都会挂在那一行下面。

## 4. 场景配置字段（SCENARIOS 数组）

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `key` | ✅ | 文件名片段；要能被兜底命中就**等于手册 anchor** |
| `title` | | 说明用（清单/manifest 显示） |
| `url` | ✅ | 路由，相对 `--base`（如 `/teacher/classes`） |
| `login` | ✅ | `teacher` / `student` / `admin` / `none` |
| `selector` | ✅ | fallback 的截取区域（页面级一般用 `.content`＝侧栏右侧主区域；整屏用 `body`） |
| `padding` | | focus 图四周留白（默认 44，要放序号气泡别低于 36） |
| `highlight` | focus 必填 | `[{ selector, label }]`：要框住的「要点容器」；label 画进序号气泡 |
| `before` | | 截图前的准备动作，见下 |
| `ready` | | 就绪选择器（默认取 `selector`） |
| `viewport` | | 覆盖默认视口（登录页无侧栏，用 1200×720 与演示框 1:1） |
| `settle` | | 就绪后再等毫秒（默认 500） |
| `note` | | manifest 备注 |

`before` 支持的步骤（顺序执行）：

```js
{ clickText: '布置作业' }            // 按可访问名/按钮文字点第一个
{ click: '.content .ant-select' }    // 按选择器点
{ pickOption: { index: 0 } }         // 在已展开的 antd 下拉里选第 N 项（也可 { text: '…' }）
{ waitFor: '.ant-table-tbody > tr.ant-table-row' }   // 等某元素可见
{ wait: 500 }                        // 纯等待
```

## 5. 怎么加 / 删一个场景

**加：**

1. 在手册里先定 `meta.anchor`（如 `classes`）——它就是 `key`。没有 anchor 的场景（弹窗、子页面）用 `assignments-modal` 这类扩展键。
2. 在 `SCENARIOS` 里抄一段最像的（列表页抄 `classes`，弹窗抄 `assignments-modal`，公开页抄 `quickstart`）。
3. `node docs/manual/shots.mjs --only <key> --theme light` 单跑，先看 fallback 是否截到了想要的区域。
4. **一定要看 focus 图**：`highlight` 的 selector 经常"能选中但框住的是空容器"——
   例如班级页的 `.content .toolbar` 只有一句"共 10 个班级"，真正的按钮在 `.page-head` 里。
   本仓库已验证可用的容器：`.page-head`（标题＋主按钮）、`.ant-table-thead`（列含义）、
   `.kpi-row`（统计卡）、`.content .ant-select`（筛选下拉）、`.meta-row`（实训题基本信息行）、
   `.assign-side`（布置作业弹窗右侧概要）、`.login-card`（登录卡）。
5. 跑全量，把打印出来的 markdown 表贴回本文件第 6 节。

**删：**

1. 从 `SCENARIOS` 删掉那一项；
2. 删掉它对应的 `client/public/doc-img/demo-<key>*.png`（4 张）；
3. 不用动 Doc.vue：`ManualStep.vue` 里 `img.onerror` 会把缺失的兜底图自动隐藏（`fallbackOk`），不会出现破图。

## 6. 产物清单（最近一次全量运行）

> 生成命令：`node docs/manual/shots.mjs` ｜ 视口 1440×725（登录页 1200×720）｜ 单张预算 200KB

```
| --- | --- | --- | --- | --- | --- |
| quickstart | fallback | light | client/public/doc-img/demo-quickstart-light.png | 22.3KB | 演示兜底图（Doc.vue 自动引用 /exam/doc-img/demo-quickstart-light.png） |
| quickstart | fallback | dark | client/public/doc-img/demo-quickstart-dark.png | 22.3KB | 演示兜底图（暗色主题，Doc.vue 暂未自动引用） |
| quickstart | focus | light | client/public/doc-img/demo-quickstart-focus-light.png | 22.2KB | 定位图（要点：工号 + 密码登录；四周压暗 + 2px 品牌描边 + 序号气泡） |
| quickstart | focus | dark | client/public/doc-img/demo-quickstart-focus-dark.png | 22.1KB | 定位图（要点：工号 + 密码登录；四周压暗 + 2px 品牌描边 + 序号气泡） |
| classes | fallback | light | client/public/doc-img/demo-classes-light.png | 87.8KB | 演示兜底图（Doc.vue 自动引用 /exam/doc-img/demo-classes-light.png） |
| classes | fallback | dark | client/public/doc-img/demo-classes-dark.png | 88.1KB | 演示兜底图（暗色主题，Doc.vue 暂未自动引用） |
| classes | focus | light | client/public/doc-img/demo-classes-focus-light.png | 39.1KB | 定位图（要点：新增班级 + 班级 / 人数 / 操作列；四周压暗 + 2px 品牌描边 + 序号气泡） |
| classes | focus | dark | client/public/doc-img/demo-classes-focus-dark.png | 39.2KB | 定位图（要点：新增班级 + 班级 / 人数 / 操作列；四周压暗 + 2px 品牌描边 + 序号气泡） |
| students | fallback | light | client/public/doc-img/demo-students-light.png | 107.5KB | 演示兜底图（Doc.vue 自动引用 /exam/doc-img/demo-students-light.png） |
| students | fallback | dark | client/public/doc-img/demo-students-dark.png | 109.7KB | 演示兜底图（暗色主题，Doc.vue 暂未自动引用） |
| students | focus | light | client/public/doc-img/demo-students-focus-light.png | 38.8KB | 定位图（要点：单个新增 / 批量导入 + 先选班级；四周压暗 + 2px 品牌描边 + 序号气泡） |
| students | focus | dark | client/public/doc-img/demo-students-focus-dark.png | 39.2KB | 定位图（要点：单个新增 / 批量导入 + 先选班级；四周压暗 + 2px 品牌描边 + 序号气泡） |
| teams | fallback | light | client/public/doc-img/demo-teams-light.png | 56.3KB | 演示兜底图（Doc.vue 自动引用 /exam/doc-img/demo-teams-light.png） |
| teams | fallback | dark | client/public/doc-img/demo-teams-dark.png | 56.7KB | 演示兜底图（暗色主题，Doc.vue 暂未自动引用） |
| teams | focus | light | client/public/doc-img/demo-teams-focus-light.png | 35.5KB | 定位图（要点：创建团队 + 团队 / 成员 / 操作列；四周压暗 + 2px 品牌描边 + 序号气泡） |
| teams | focus | dark | client/public/doc-img/demo-teams-focus-dark.png | 35.5KB | 定位图（要点：创建团队 + 团队 / 成员 / 操作列；四周压暗 + 2px 品牌描边 + 序号气泡） |
| questions | fallback | light | client/public/doc-img/demo-questions-light.png | 85.3KB | 演示兜底图（Doc.vue 自动引用 /exam/doc-img/demo-questions-light.png） |
| questions | fallback | dark | client/public/doc-img/demo-questions-dark.png | 85.5KB | 演示兜底图（暗色主题，Doc.vue 暂未自动引用） |
| questions | focus | light | client/public/doc-img/demo-questions-focus-light.png | 40.3KB | 定位图（要点：新增题目 + 标题 / 类型 / 难度 / 满分；四周压暗 + 2px 品牌描边 + 序号气泡） |
| questions | focus | dark | client/public/doc-img/demo-questions-focus-dark.png | 40.5KB | 定位图（要点：新增题目 + 标题 / 类型 / 难度 / 满分；四周压暗 + 2px 品牌描边 + 序号气泡） |
| assignments | fallback | light | client/public/doc-img/demo-assignments-light.png | 108.2KB | 演示兜底图（Doc.vue 自动引用 /exam/doc-img/demo-assignments-light.png） |
| assignments | fallback | dark | client/public/doc-img/demo-assignments-dark.png | 107.9KB | 演示兜底图（暗色主题，Doc.vue 暂未自动引用） |
| assignments | focus | light | client/public/doc-img/demo-assignments-focus-light.png | 40.0KB | 定位图（要点：布置作业 + 作业概况（含待审核）；四周压暗 + 2px 品牌描边 + 序号气泡） |
| assignments | focus | dark | client/public/doc-img/demo-assignments-focus-dark.png | 40.0KB | 定位图（要点：布置作业 + 作业概况（含待审核）；四周压暗 + 2px 品牌描边 + 序号气泡） |
| assignments-modal | fallback | light | client/public/doc-img/demo-assignments-modal-light.png | 69.3KB | 演示兜底图（Doc.vue 自动引用 /exam/doc-img/demo-assignments-modal-light.png） |
| assignments-modal | fallback | dark | client/public/doc-img/demo-assignments-modal-dark.png | 69.0KB | 演示兜底图（暗色主题，Doc.vue 暂未自动引用） |
| assignments-modal | focus | light | client/public/doc-img/demo-assignments-modal-focus-light.png | 22.3KB | 定位图（要点：布置概要 · 立即布置；四周压暗 + 2px 品牌描边 + 序号气泡） |
| assignments-modal | focus | dark | client/public/doc-img/demo-assignments-modal-focus-dark.png | 22.5KB | 定位图（要点：布置概要 · 立即布置；四周压暗 + 2px 品牌描边 + 序号气泡） |
| project | fallback | light | client/public/doc-img/demo-project-light.png | 45.0KB | 演示兜底图（Doc.vue 自动引用 /exam/doc-img/demo-project-light.png） |
| project | fallback | dark | client/public/doc-img/demo-project-dark.png | 44.9KB | 演示兜底图（暗色主题，Doc.vue 暂未自动引用） |
| project | focus | light | client/public/doc-img/demo-project-focus-light.png | 23.8KB | 定位图（要点：返回题库管理 + 难度 / 满分 / 题目描述 / 保存；四周压暗 + 2px 品牌描边 + 序号气泡） |
| project | focus | dark | client/public/doc-img/demo-project-focus-dark.png | 23.8KB | 定位图（要点：返回题库管理 + 难度 / 满分 / 题目描述 / 保存；四周压暗 + 2px 品牌描边 + 序号气泡） |
| review | fallback | light | client/public/doc-img/demo-review-light.png | 112.7KB | 演示兜底图（Doc.vue 自动引用 /exam/doc-img/demo-review-light.png） |
| review | fallback | dark | client/public/doc-img/demo-review-dark.png | 113.2KB | 演示兜底图（暗色主题，Doc.vue 暂未自动引用） |
| review | focus | light | client/public/doc-img/demo-review-focus-light.png | 32.4KB | 定位图（要点：按班级筛选 + AI状态 / 审核状态 / 已交未交；四周压暗 + 2px 品牌描边 + 序号气泡） |
| review | focus | dark | client/public/doc-img/demo-review-focus-dark.png | 32.4KB | 定位图（要点：按班级筛选 + AI状态 / 审核状态 / 已交未交；四周压暗 + 2px 品牌描边 + 序号气泡） |
```

## 7. 实现要点与踩过的坑

- **尺寸**：视口 1440×725，`.content` 实测 1208×725，≈演示框 1200×720；focus 图按"要点并集 + padding"裁，宽高随内容变。
- **sips 会越压越大**：`sips --resampleWidth 1200` 是对 1208 宽做重编码，实测把 87.8KB 变成 137.3KB。
  所以脚本只在**宽度超出目标 5%** 时才缩，且仅在**超过 200KB 预算**时按 12% 递减宽度继续压（下限 900）。
- **主题**：写 `localStorage['ui-theme'] = 'light' | 'dark'`（`useTheme.js` 的 key），
  脚本会断言 `<html data-theme>` 真的等于目标主题，不等就记进该图的 errors。
- **可复现**：截图前注入 CSS 冻结动画/过渡、隐藏 `.ant-message/.ant-notification`、`blur()` 掉点击后的焦点圈，并 `window.scrollTo(0,0)`（clip 用视口坐标，窗口不能滚）。
- **定位图覆盖层**：4 条压暗带（只留要点并集那块"挖空"）+ 每个要点 2px 品牌描边（`--brand-600`）+ 序号气泡。
  气泡落点顺序：目标上方留白 → 目标下方留白 → 目标内部左上角；并做互撞右移与出界夹取。
  ⚠ 踩坑：覆盖层**必须先 `appendChild` 进文档再量 `getBoundingClientRect()`**，
  detached 元素 rect 全 0，会让所有气泡都被判定"放不下"而缩进目标内部、盖住文字。
- **只读**：除登录换 token 外不发任何写请求；"布置作业"只用来**打开弹窗**，不点"立即布置"；
  新建实训题页只截不保存；不点删除/锁定/提交。
- **体积**：当前 36 张共 1.93MB，最大 113.2KB（`demo-review-dark.png`），全部 < 200KB。

## 8. 边界（硬约束）

- 不改 `client/src` 下任何文件、不改后端、不 git、不装依赖、不 `npm run build`；
- 落盘只写 `--out` 目录下、且文件名以 `demo-` 开头的文件（脚本里有前缀断言，非 demo- 直接拒写）；
- 已有的 `01-login.png … 15-review-detail.png` 一律不动。

## 9. 复现（自证）

```bash
node docs/manual/shots.mjs --list                     # 场景清单
node docs/manual/shots.mjs                            # 全量出图（打印 manifest + markdown 表）
ls -la client/public/doc-img | grep demo-             # 产物与体积
```
