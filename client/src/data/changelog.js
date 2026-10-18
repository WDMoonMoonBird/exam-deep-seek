/**
 * 更新日志数据（静态维护，不依赖后端）
 *
 * 维护方式：只收「用户可感知」的大更新 —— feat/perf 里影响使用的，同主题合并为一条；
 * docs/test/chore/refactor 不进。新条目写在数组最前面（新的在上）。
 * 候选清单：git log --since=<上次更新> --pretty='%h %ad %s' --date=short
 */
export const CHANGELOG_SINCE = '10 月 9 日';
export const CHANGELOG_COMMITS = 459;

export const CHANGELOG = [
  {
    date: '2026-10-12', label: '10-12', category: '评分',
    title: '实训题评分改由 DeepSeek Harness 执行',
    summary: '评分单位从「一次模型调用」改为「一份作业一次造尺、N 次量」：在隔离环境里跑标准工程包与判据，带锚点校验与失败即停。',
    tags: ["新功能","重大"], hot: true,
  },
  {
    date: '2026-10-13', label: '10-13', category: '评分',
    title: 'AI 给分依据可读',
    summary: '分项得分带理由；新增自然语言总评；教师侧能直接看到「为什么扣分」，并支持回填。',
    tags: ["体验优化"],
  },
  {
    date: '2026-10-18', label: '10-18', category: '移动端',
    title: '教师端移动版上线',
    summary: '工作台 / 作业 / 评分审核 / 布置作业 四页打通，手机上可完成「看进度 → 逐份审核 → 发布」；实训题审核支持文件树导航。',
    tags: ["新功能"],
  },
  {
    date: '2026-10-18', label: '10-18', category: '移动端',
    title: '安卓版 APK 可下载',
    summary: '欢迎页新增安卓版入口，扫码安装即可用；启动直达登录页。',
    tags: ["新功能"],
  },
  {
    date: '2026-10-14', label: '10-14', category: '作业',
    title: '提交与评分：三个开关',
    summary: '取最高 / 取最后一次成绩、是否允许补交、答案是否可见 —— 布置作业时按题型带默认值，并给出成本提示。',
    tags: ["新功能"],
  },
  {
    date: '2026-10-13', label: '10-13', category: '手册',
    title: '教师手册改为「可播放演示」',
    summary: '8 段真实界面复刻替代全部截图：进章节自动播放、可暂停重播；右上角「放大演示」支持要点放大与手机 2×。',
    tags: ["体验优化"],
  },
  {
    date: '2026-10-13', label: '10-13', category: '错误页',
    title: '错误页体系与真状态码',
    summary: '404 / 403 / 500 等 16 个状态页（中文、深浅色、自动重试）；未知路径与超限上传返回真实状态码。',
    tags: ["新功能"],
  },
  {
    date: '2026-10-13', label: '10-13', category: '安全',
    title: '账号与链路加固',
    summary: '改密后旧令牌立即失效；弱密钥快速失败；上传超限返回 413；新增 CSP（先观察模式）。',
    tags: ["安全与稳定"],
  },
  {
    date: '2026-10-12', label: '10-12', category: '作业',
    title: '布置作业改为一页式',
    summary: '题目单选、班级带人数、起止时间默认「今天 18:00 ~ 一周后」、支持存草稿与离开确认。',
    tags: ["体验优化"],
  },
  {
    date: '2026-10-12', label: '10-12', category: '列表',
    title: '列表样式统一',
    summary: '11 个列表页统一行高与对齐，主列改两行式（标题 + 次要信息），密度更稳、扫读更快。',
    tags: ["体验优化"],
  },
  {
    date: '2026-10-12', label: '10-12', category: '个人',
    title: '「我的信息」卡片',
    summary: '教师 / 学生 / 管理员三端同形态：头像姓名角色 + 关键字段 + 一键复制，支持展开收起。',
    tags: ["新功能"],
  },
  {
    date: '2026-10-11', label: '10-11', category: '欢迎页',
    title: '欢迎页重构与二维码',
    summary: '新的首屏结构与动效；页脚加入开源地址与站点二维码，方便扫码进入。',
    tags: ["体验优化"],
  },
];

/** 最新一条的日期（用于「未读」判断） */
export const CHANGELOG_LATEST = CHANGELOG.reduce((max, it) => (it.date > max ? it.date : max), '');
