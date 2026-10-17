/* ============================================================================
 * Exam-DeepSeek · Mobile Screens Registry v1.0
 * 单一事实来源：gallery(index.html) / screen runtime / 截图脚本 共用本文件。
 * 新增屏幕：在 screens/ 下加 <id>.html，然后在本文件对应分组追加一项。
 * ==========================================================================*/
(function () {
  var GROUPS = [
    {
      id: 'public', name: '公共与认证', role: 'public', accent: '#0b0f16',
      desc: '落地页、登录、帮助文档与全站异常页：所有角色共用，移动端第一印象。'
    },
    {
      id: 'student', name: '学生端', role: 'student', accent: '#0066cc',
      desc: '首页 → 作业 → 作答 → 成绩 → 我的：一条 3 步内可完成的提交与查看闭环。'
    },
    {
      id: 'teacher', name: '教师端', action: '', role: 'teacher', accent: '#6938ef',
      desc: '工作台 → 作业 → 评分审核 → 批量 → 布置作业：碎片时间清空待办的移动工作流。'
    },
    {
      id: 'admin', name: '管理端', role: 'super_admin', accent: '#dc6803',
      desc: '只读的概览、组织目录与实时监控；高风险配置明确引导到电脑端。'
    },
    {
      id: 'platform', name: '平台与状态', role: 'platform', accent: '#039855',
      desc: 'PWA 安装、Android 启动屏、空态/骨架/错误态体系：跨端一致性的最后一公里。'
    }
  ];

  var SCREENS = [
    /* ---------------------------------------------------------------- 公共与认证 */
    { id: 'public-landing', group: 'public', title: '移动官网', caption: '品牌 + 角色入口 + 能力概览；一根主 CTA 直达登录，滚动克制。', tags: ['营销', '375 档'] },
    { id: 'public-login', group: 'public', title: '登录', caption: '账号密码 + 记住我 + 错误态；登录后按角色跳到各自工作台。', tags: ['认证', '表单'] },
    { id: 'public-doc', group: 'public', title: '使用文档', caption: '搜索 + 目录 + 文章；长文阅读版式，图片可点开大图。', tags: ['文档'] },
    { id: 'error-404', group: 'public', title: '404 · 页面不存在', caption: '保留当前地址可复制、给返回入口；不再粗暴丢掉登录态。', tags: ['异常'] },
    { id: 'error-403', group: 'public', title: '403 · 无权限', caption: '展示当前身份与所需角色，提供“回到我的首页”。', tags: ['异常'] },
    { id: 'error-500', group: 'public', title: '500 · 服务异常', caption: '错误编号 + 重试 + 返回；与桌面端错误页共用语言。', tags: ['异常'] },

    /* ---------------------------------------------------------------- 学生端 */
    { id: 'student-home', group: 'student', title: '学生首页', caption: '今日待办 + 截止提醒 + 最近成绩；首屏 3 秒知道下一步做什么。', tags: ['Tab 1/4'] },
    { id: 'student-assignments', group: 'student', title: '作业列表', caption: '状态筛选 + 截止分组 + 卡片；进度与截止时间直接可读。', tags: ['Tab 2/4'] },
    { id: 'student-assignment-detail', group: 'student', title: '作业详情', caption: '规则/题目/附件 + 底部“开始作答”；开考前一次把规则讲清。', tags: ['详情页'] },
    { id: 'student-answer-objective', group: 'student', title: '作答 · 客观题', caption: '单词干聚焦 + 大选项 + 计时；顶部答题卡入口随处可达。', tags: ['核心页'] },
    { id: 'student-answer-code', group: 'student', title: '作答 · 编程题', caption: '手机写代码体验差 → 扫码接力到电脑 + 草稿状态可见；不假装能写。', tags: ['硬骨头', '决策'] },
    { id: 'student-answer-sheet', group: 'student', title: '答题卡', caption: '底部 Sheet：已答/未答/标记三态；一屏完成检查与跳题。', tags: ['Sheet'] },
    { id: 'student-submit-confirm', group: 'student', title: '交卷确认', caption: '未答题数 + 剩余时间 + 不可修改提示；把误交卷风险放在确认前。', tags: ['确认'] },
    { id: 'student-assignment-done', group: 'student', title: '已提交详情', caption: '提交摘要 + 评分进度；等待 AI/教师时不空白，给回执。', tags: ['状态页'] },
    { id: 'student-scores', group: 'student', title: '成绩列表', caption: '学期概览 + 分数等级 + 逐次作业；分数永远配文字等级。', tags: ['Tab 3/4'] },
    { id: 'student-score-detail', group: 'student', title: '成绩详情', caption: '总分构成 + AI 评语 + 逐题得分；让学生看懂“为什么”。', tags: ['详情页'] },
    { id: 'student-profile', group: 'student', title: '我的', caption: '身份卡 + 设置项（主题/字号/通知）+ 退出；个人中心不做功能堆砌。', tags: ['Tab 4/4'] },

    /* ---------------------------------------------------------------- 教师端 */
    { id: 'teacher-home', group: 'teacher', title: '教师工作台', caption: '待办三卡 + 快捷入口 + 最近作业；打开就知道今天要做什么。', tags: ['Tab 1/4'] },
    { id: 'teacher-assignments', group: 'teacher', title: '作业列表', caption: '卡片替代表格 + 状态胶囊 + 左滑操作；4 个字段就能决策。', tags: ['Tab 2/4'] },
    { id: 'teacher-assignment-detail', group: 'teacher', title: '作业详情', caption: '进度环 + 提交/题目/概况分段 + 催交导出；底部直达审核。', tags: ['详情页'] },
    { id: 'teacher-review-queue', group: 'teacher', title: '评分审核队列', caption: '逐份队列 + 上下滑切换；审完一份自动进下一份，不断流。', tags: ['Tab 3/4', '核心页'] },
    { id: 'teacher-review-detail', group: 'teacher', title: '审核详情 · 评分', caption: 'AI 分与分项 + 评语 + 改分；底部固定“改分 / 审核通过”。', tags: ['核心页'] },
    { id: 'teacher-review-code', group: 'teacher', title: '代码只读 + 选区', caption: '行号固定、横滑不跑行号；长按选中 → 引用到评语。', tags: ['硬骨头'] },
    { id: 'teacher-review-diff', group: 'teacher', title: '代码差异', caption: '并排 diff 放不下 → 逐块折叠 + 只看差异；390px 可读。', tags: ['硬骨头'] },
    { id: 'teacher-batch-select', group: 'teacher', title: '批量审核 · 多选', caption: '长按进入多选 + 已选 N + 全选本页；底部只保留一个主操作。', tags: ['批量'] },
    { id: 'teacher-batch-confirm', group: 'teacher', title: '批量审核 · 确认', caption: '筛选驱动批量 + 影响范围摘要 + 二次确认；不提供撤销就先把风险说清。', tags: ['批量', '安全'] },
    { id: 'teacher-assign-wizard', group: 'teacher', title: '布置作业 · 4 步', caption: '基本信息/题目/班级/时间分步走；每步一件事，底部固定主按钮。', tags: ['表单', '向导'] },
    { id: 'teacher-questions', group: 'teacher', title: '题库', caption: '搜索 + 题型筛选 + 题目卡；移动端只读预览，编辑引导到电脑。', tags: ['二级页'] },
    { id: 'teacher-class', group: 'teacher', title: '班级详情', caption: '班级进度 + 学生卡列表 + 搜索；学生状态一眼可扫。', tags: ['二级页'] },
    { id: 'teacher-profile', group: 'teacher', title: '教师 · 我的', caption: '身份/学校 + 通知、主题、字号 + 桌面版入口；设置项可验证。', tags: ['Tab 4/4'] },
    { id: 'teacher-code-unsupported', group: 'teacher', title: '手机编辑说明页', caption: '不假装能在手机上写代码：说明原因 + 扫码/复制链接接力到电脑。', tags: ['决策页'] },

    /* ---------------------------------------------------------------- 管理端 */
    { id: 'admin-home', group: 'admin', title: '管理概览', caption: '学校/班级/用户/在线 KPI + 系统状态 + 今日异常；只读也信息完整。', tags: ['只读'] },
    { id: 'admin-directory', group: 'admin', title: '组织目录', caption: '学校/班级/教师/学生分段列表 + 搜索；新增编辑明确去电脑端。', tags: ['只读'] },
    { id: 'admin-monitor', group: 'admin', title: '实时监控', caption: '在线人数 + 评分队列 + 日志流；手机上只看不操作。', tags: ['只读'] },

    /* ---------------------------------------------------------------- 平台与状态 */
    { id: 'platform-install', group: 'platform', title: 'PWA 安装引导', caption: '添加到主屏的两种入口（iOS Safari / Android Chrome）+ 离线可用说明。', tags: ['PWA'] },
    { id: 'platform-splash', group: 'platform', title: 'Android 启动屏', caption: 'Capacitor 壳启动屏 + 版本/更新检查；冷启动不白屏。', tags: ['Android'] },
    { id: 'states-overview', group: 'platform', title: '状态体系', caption: '空态/骨架/错误/断网四态同屏对照；所有列表页都必须有四态。', tags: ['状态'] }
  ];

  var TABBARS = {
    teacher: [
      { key: 'home', label: '工作台', icon: 'home', goto: 'teacher-home' },
      { key: 'assignments', label: '作业', icon: 'assignments', goto: 'teacher-assignments' },
      { key: 'review', label: '审核', icon: 'review', goto: 'teacher-review-queue', badge: '12' },
      { key: 'me', label: '我的', icon: 'user', goto: 'teacher-profile' }
    ],
    student: [
      { key: 'home', label: '首页', icon: 'home', goto: 'student-home' },
      { key: 'assignments', label: '作业', icon: 'assignments', goto: 'student-assignments', badge: '2' },
      { key: 'scores', label: '成绩', icon: 'scores', goto: 'student-scores' },
      { key: 'me', label: '我的', icon: 'user', goto: 'student-profile' }
    ],
    admin: [
      { key: 'home', label: '概览', icon: 'chart', goto: 'admin-home' },
      { key: 'directory', label: '管理', icon: 'users', goto: 'admin-directory' },
      { key: 'monitor', label: '监控', icon: 'activity', goto: 'admin-monitor' }
    ]
  };

  var API = {
    groups: GROUPS,
    screens: SCREENS,
    tabbars: TABBARS,
    byId: function (id) {
      for (var i = 0; i < SCREENS.length; i++) { if (SCREENS[i].id === id) return SCREENS[i]; }
      return null;
    },
    group: function (id) {
      for (var i = 0; i < GROUPS.length; i++) { if (GROUPS[i].id === id) return GROUPS[i]; }
      return null;
    }
  };

  if (typeof window !== 'undefined') { window.MDS = API; }
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})();
