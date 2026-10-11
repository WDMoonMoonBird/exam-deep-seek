<script setup>
/**
 * Landing —— 欢迎 / 介绍主页（公开路由 '/'，见 router/index.js 与 beforeEach 白名单）
 *
 * 定位：给教师看的门户，用「教师端真实元素」说话 —— 所有小样都是本仓库真实页面的构成
 * （侧栏分组与选中态、两行用户菜单、KPI 卡、题库表格、AI 评分终审、实训题 IDE），
 * 配色一律走 tokens.css 的令牌，故浅/深两套主题自动成立，且与真实控制台同色。
 *
 * 交互（用户要求「官网上有些元素是可交互的」）：
 *   ① 控制台窗口可切换三张视图（题库管理 / 评分审核 / 作业管理），标准 role=tablist + 方向键；
 *   ② 评分审核视图里「确认并发布」是真按钮：点一下该行变已发布、待审核计数同步减一；
 *   ③ 能力卡「题库管理」按类型筛选行、「实训题 IDE」切换文件标签（真代码片段）。
 *   动效一律受 prefers-reduced-motion 约束（见样式尾部）。
 *
 * 登录态：未登录 → 主按钮「教师登录」；已登录 → 「进入控制台」（按角色进各自首页）。
 * 公开访问：本页不读接口，无网络请求；进入系统后才走各自的守卫。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useUserStore } from '../stores/user.js';
import ThemeToggle from '../components/ThemeToggle.vue';

const userStore = useUserStore();
const loggedIn = computed(() => userStore.isLoggedIn);
/** 已登录时的落地页：与 router/index.js 守卫里的角色前缀一致 */
const consolePath = computed(() => {
  const role = userStore.role || 'teacher';
  return '/' + (role === 'super_admin' ? 'admin' : role);
});

/* ===== ① 控制台窗口：由**侧栏**切换视图（原来那行「题库管理/评分审核/作业管理 可点击切换」已按用户要求取消） ===== */
const activeView = ref('questions');
/** 「新增题目」下拉：演示用 —— 只弹出菜单，不进新建页；点外部/Esc 关闭 */
const newQOpen = ref(false);
const newQRef = ref(null);
const newQHint = ref('');
function switchView(key) {
  activeView.value = key;
  newQOpen.value = false;
  newQHint.value = '';
}
function pickNewQ(label) {
  newQOpen.value = false;
  newQHint.value = '演示：这里会进入「新建' + label + '」页（本页不跳转）';
}
function onDocPointerdown(e) {
  if (newQOpen.value && newQRef.value && !newQRef.value.contains(e.target)) newQOpen.value = false;
}
function onDocKeydown(e) {
  if (e.key === 'Escape') newQOpen.value = false;
}
onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerdown);
  document.addEventListener('keydown', onDocKeydown);
});
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerdown);
  document.removeEventListener('keydown', onDocKeydown);
});

/* ===== ② 评分审核：待审核 → 已发布（真交互，计数联动） ===== */
const reviewRows = ref([
  { id: 10340, student: '张伟01', title: '搭建 Spring MVC 数据绑定与响应综合项目', score: 92, max: 100, state: 'pending' },
  { id: 10341, student: '李芳02', title: '写出 Hello World 并解释输出', score: 8, max: 10, state: 'pending' },
  { id: 10342, student: '王娜03', title: 'Java 集合与异常处理综合', score: 17, max: 20, state: 'published' },
]);
const pendingCount = computed(() => reviewRows.value.filter((r) => r.state === 'pending').length);
/** 已发布成绩：以演示基线 127 为底，每把一行待审核发布出去就 +1（初始已有 1 行发布 → 128） */
const publishedCount = computed(() => 127 + reviewRows.value.filter((r) => r.state === 'published').length);
function publish(row) {
  if (row.state === 'pending') row.state = 'published';
}

/* ===== ③ 题库管理视图 + 能力卡：类型筛选 ===== */
const typeFilter = ref('all');
const questionRows = [
  { title: '搭建 Spring MVC 数据绑定与响应综合项目', type: 'project', diff: '中等', score: 100 },
  { title: '写出 Hello World 并解释输出', type: 'code', diff: '简单', score: 10 },
  { title: 'Java 集合与异常处理综合', type: 'code', diff: '中等', score: 20 },
];
function matchType(row) {
  return typeFilter.value === 'all' || row.type === typeFilter.value;
}
const filteredQuestions = computed(() => questionRows.filter(matchType));

/* ===== ③ 实训题 IDE 卡：文件标签切换 ===== */
const ideFiles = [
  {
    name: 'OrderController.java',
    lines: [
      { k: 'cmt', v: '// 订单控制器 —— 演示复杂 POJO 与集合数据绑定' },
      { k: 'ann', v: '@Controller' },
      { k: 'kw', v: 'public class OrderController {' },
      { k: 'code', v: '    @RequestMapping("/order/save")' },
      { k: 'kw', v: '    public String save(Order order, User user) {' },
      { k: 'code', v: '        orders.add(order);          // List 集合绑定' },
      { k: 'code', v: '        goods.put(user, order);     // Map 集合绑定' },
      { k: 'kw', v: '        return "orders";' },
      { k: 'code', v: '    }' },
      { k: 'code', v: '}' },
    ],
  },
  {
    name: 'Order.java',
    lines: [
      { k: 'cmt', v: '// 订单 POJO —— 与表单字段同名即可自动绑定' },
      { k: 'kw', v: 'public class Order {' },
      { k: 'code', v: '    private String id;' },
      { k: 'code', v: '    private List<Goods> goodsList;' },
      { k: 'kw', v: '    public String getId() { return id; }' },
      { k: 'code', v: '}' },
    ],
  },
  {
    name: 'README.md',
    lines: [
      { k: 'cmt', v: '# 实训题：Spring MVC 数据绑定' },
      { k: 'code', v: '- 上传标准工程包后，文件树与编辑器按目录展开' },
      { k: 'code', v: '- 评分标准在「评分标准」弹窗里逐条写明功能与分值' },
      { k: 'code', v: '- 若不上传工程包，本题按开放性题目评价式评分' },
    ],
  },
];
const ideFileIndex = ref(0);
const ideFile = computed(() => ideFiles[ideFileIndex.value]);

/* ===== 侧栏另外两页的演示数据（班级 / 学生） ===== */
const classRows = [
  { name: '软件工程 1 班', students: 50, assignments: 6, avg: 84.2 },
  { name: '软件工程 2 班', students: 48, assignments: 5, avg: 86.7 },
  { name: '计算机科学与技术 3 班', students: 46, assignments: 4, avg: 81.5 },
];
const studentRows = [
  { no: '202600001', name: '张伟01', cls: '软件工程 1 班', state: '已提交', ok: true },
  { no: '202600002', name: '李芳02', cls: '软件工程 1 班', state: '已提交', ok: true },
  { no: '202600003', name: '王娜03', cls: '软件工程 2 班', state: '待提交', ok: false },
];

/* ===== 流程条：六步（点击高亮当前步） ===== */
const steps = [
  { t: '建题', d: '主观题 / 客观题 / 实训题统一建题，小题分值与总分自动核对' },
  { t: '布置作业', d: '按班级下发，设置起止时间与是否允许重交' },
  { t: '学生提交', d: '在线作答或上传标准工程包，草稿自动保存' },
  { t: 'AI 评分', d: 'Worker 每 2 秒取件、8 并发调用，按评分标准给分' },
  { t: '教师审核', d: '查看 AI 分数与评语，改分、补评语、标记异常' },
  { t: '发布成绩', d: '一键发布，学生端即时可见分数与反馈' },
];
const activeStep = ref(3);
/** 能力卡「AI 评分与教师终审」里的演示发布状态（独立开关，不复用 previewTab） */
const rubricPublished = ref(false);
</script>

<template>
  <div class="landing">
    <!-- ===== 顶部导航（公开页，不依赖 any 布局组件） ===== -->
    <header class="nav">
      <div class="nav-inner">
        <a class="brand" href="#top" aria-label="Deadpan 判题 首页">
          <img src="../assets/logo.svg" class="brand-logo" alt="" />
          <b>Deadpan</b><span>判题</span>
        </a>
        <nav class="nav-links" aria-label="首页导航">
          <a class="nav-link" href="#capability">系统能力</a>
          <a class="nav-link" href="#flow">评分流程</a>
          <a class="nav-link" href="/exam/doc" target="_blank" rel="noopener">
            <svg class="icon" aria-hidden="true"><use href="#lg-book" /></svg>使用文档
          </a>
          <ThemeToggle />
          <a class="btn btn-primary btn-sm" :href="loggedIn ? consolePath : '/login'">
            {{ loggedIn ? '进入控制台' : '教师登录' }}
          </a>
        </nav>
      </div>
    </header>

    <!-- ===== HERO ===== -->
    <main id="top">
      <section class="hero">
        <div class="hero-inner">
          <div class="hero-copy">
            <span class="pill">
              <svg class="icon" aria-hidden="true"><use href="#lg-shield" /></svg>校内网部署 · 教师端
            </span>
            <h1>面向高校编程课的<br /><em>AI 评分平台</em></h1>
            <p class="lead">
              从建题、布置、学生提交，到 AI 评分、教师审核、成绩发布 —— 一学期的作业流程收进一个控制台。
              客观题自动判分；主观题与实训工程包由 AI 按你的评分标准给出分数与评语，教师只做终审。
            </p>
            <div class="cta-row">
              <a class="btn btn-primary btn-lg" :href="loggedIn ? consolePath : '/login'">
                {{ loggedIn ? '进入控制台' : '教师登录' }}
                <svg class="icon" aria-hidden="true"><use href="#lg-arrow" /></svg>
              </a>
              <a class="btn btn-ghost btn-lg" href="/exam/doc" target="_blank" rel="noopener">
                <svg class="icon" aria-hidden="true"><use href="#lg-book" /></svg>查看使用文档
              </a>
            </div>
            <ul class="trust">
              <li><svg class="icon" aria-hidden="true"><use href="#lg-check" /></svg>客观题自动批改</li>
              <li><svg class="icon" aria-hidden="true"><use href="#lg-check" /></svg>实训工程包 AI 评审</li>
              <li><svg class="icon" aria-hidden="true"><use href="#lg-check" /></svg>校内网私有化部署</li>
            </ul>
          </div>

          <!-- 控制台窗口：教师端真实元素的可交互缩略 -->
          <div class="shot">
            <div class="frame">
              <div class="frame-top">
                <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
                <span class="frame-title">教师控制台 · 演示</span>
                <span class="frame-right">
                  <svg class="icon dim" aria-hidden="true"><use href="#lg-sun" /></svg>
                  <span class="avatar" aria-hidden="true">周</span>
                  <span class="who"><b>周子轩</b><span>教师 · Deadpan 大学</span></span>
                  <svg class="icon dim xs" aria-hidden="true"><use href="#lg-caret" /></svg>
                </span>
              </div>

              <div class="frame-body">
                <aside class="mini-sider" aria-label="控制台演示导航">
                  <div class="mini-brand">
                    <img src="../assets/logo.svg" alt="" />Deadpan 判题
                  </div>
                  <div class="mini-group">教学</div>
                  <button type="button" class="mini-item" :class="{ on: activeView === 'assignments' }"
                    :aria-current="activeView === 'assignments' ? 'true' : undefined" @click="switchView('assignments')">
                    <svg class="icon" aria-hidden="true"><use href="#lg-file" /></svg>作业管理
                  </button>
                  <button type="button" class="mini-item" :class="{ on: activeView === 'review' }"
                    :aria-current="activeView === 'review' ? 'true' : undefined" @click="switchView('review')">
                    <svg class="icon" aria-hidden="true"><use href="#lg-shield" /></svg>评分审核
                    <Transition name="pop" mode="out-in">
                      <span class="badge" :key="pendingCount">{{ pendingCount }}</span>
                    </Transition>
                  </button>
                  <button type="button" class="mini-item" :class="{ on: activeView === 'questions' }"
                    :aria-current="activeView === 'questions' ? 'true' : undefined" @click="switchView('questions')">
                    <svg class="icon" aria-hidden="true"><use href="#lg-db" /></svg>题库管理
                  </button>
                  <div class="mini-group">组织</div>
                  <button type="button" class="mini-item" :class="{ on: activeView === 'classes' }"
                    :aria-current="activeView === 'classes' ? 'true' : undefined" @click="switchView('classes')">
                    <svg class="icon" aria-hidden="true"><use href="#lg-users" /></svg>班级管理
                  </button>
                  <button type="button" class="mini-item" :class="{ on: activeView === 'students' }"
                    :aria-current="activeView === 'students' ? 'true' : undefined" @click="switchView('students')">
                    <svg class="icon" aria-hidden="true"><use href="#lg-chart" /></svg>学生管理
                  </button>
                </aside>

                <div class="mini-main">
                  <!-- 视图切换动效：整块淡入上移（mode=out-in 避免两张视图重叠） -->
                  <Transition name="view" mode="out-in">
                   <div :key="activeView" class="view-wrap">
                  <!-- 视图 A：题库管理 -->
                  <div v-if="activeView === 'questions'" class="view">
                    <div class="mini-head">
                      <div>
                        <h4>题库管理</h4>
                        <p>管理你的编程题与实训题；布置作业时从这里选题。</p>
                      </div>
                      <span ref="newQRef" class="dropdown">
                        <button type="button" class="btn btn-primary btn-sm" aria-haspopup="menu"
                          :aria-expanded="newQOpen ? 'true' : 'false'" @click="newQOpen = !newQOpen">
                          新增题目<svg class="icon xs caret" :class="{ up: newQOpen }" aria-hidden="true"><use href="#lg-caret" /></svg>
                        </button>
                        <Transition name="menu">
                          <div v-if="newQOpen" class="menu" role="menu" aria-label="新增题目类型">
                            <button type="button" role="menuitem" class="menu-item" @click="pickNewQ('编程题')">
                              <svg class="icon" aria-hidden="true"><use href="#lg-code" /></svg>
                              <span class="mi-text"><b>编程题</b><span class="mi-sub">在线作答 · AI 评分</span></span>
                            </button>
                            <button type="button" role="menuitem" class="menu-item" @click="pickNewQ('实训题')">
                              <svg class="icon" aria-hidden="true"><use href="#lg-folder" /></svg>
                              <span class="mi-text"><b>实训题</b><span class="mi-sub">上传标准工程包 · 评价式评分</span></span>
                            </button>
                          </div>
                        </Transition>
                      </span>
                    </div>
                    <Transition name="view" mode="out-in">
                      <p v-if="newQHint" :key="newQHint" class="q-hint">{{ newQHint }}</p>
                    </Transition>
                    <div class="kpis">
                      <div class="kpi"><span>待审核</span><b class="brand">{{ pendingCount }}</b></div>
                      <div class="kpi"><span>进行中作业</span><b>4</b></div>
                      <div class="kpi"><span>已发布成绩</span><b>{{ publishedCount }}</b></div>
                    </div>
                    <div class="table">
                      <div class="tr head"><span>标题</span><span>类型</span><span>难度</span><span class="num">满分</span></div>
                      <div v-for="row in filteredQuestions" :key="row.title" class="tr">
                        <span class="name">{{ row.title }}</span>
                        <span>
                          <span class="tag" :class="row.type === 'project' ? 'tag-accent' : 'tag-info'">
                            {{ row.type === 'project' ? '实训题' : '编程题' }}
                          </span>
                        </span>
                        <span>
                          <span class="tag" :class="row.diff === '简单' ? 'tag-success' : 'tag-warning'">{{ row.diff }}</span>
                        </span>
                        <span class="num">{{ row.score }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- 视图 B：评分审核（可发布） -->
                  <div v-else-if="activeView === 'review'" class="view">
                    <div class="mini-head">
                      <div>
                        <h4>评分审核</h4>
                        <p>AI 已评分，等你终审；点右侧按钮试试发布。</p>
                      </div>
                      <span class="chip">待审核 {{ pendingCount }}</span>
                    </div>
                    <ul class="review-list">
                      <li v-for="row in reviewRows" :key="row.id" class="review-row">
                        <span class="avatar sm" aria-hidden="true">{{ row.student.charAt(0) }}</span>
                        <span class="r-main">
                          <b>{{ row.student }}</b>
                          <span class="r-title">{{ row.title }}</span>
                        </span>
                        <span class="r-score"><b>{{ row.score }}</b>/{{ row.max }}</span>
                        <span v-if="row.state === 'published'" class="tag tag-success">已发布</span>
                        <button v-else type="button" class="btn btn-primary btn-xs" @click="publish(row)">确认并发布</button>
                      </li>
                    </ul>
                  </div>

                  <!-- 视图 C：作业管理 -->
                  <div v-else-if="activeView === 'assignments'" class="view">
                    <div class="mini-head">
                      <div>
                        <h4>作业管理</h4>
                        <p>布置作业、跟踪提交与评分进度。</p>
                      </div>
                      <span class="btn btn-primary btn-sm">布置作业</span>
                    </div>
                    <ul class="assign-list">
                      <li v-for="a in [
                        { t: '搭建 Spring MVC 数据绑定与响应综合项目', c: '软件工程 1 班', done: 46, total: 50, s: '评分中' },
                        { t: '写出 Hello World 并解释输出', c: '软件工程 2 班', done: 48, total: 48, s: '已发布' },
                        { t: 'Java 集合与异常处理综合', c: '软件工程 1 班', done: 12, total: 50, s: '待评分' },
                      ]" :key="a.t" class="assign-row">
                        <span class="a-main"><b>{{ a.t }}</b><span>{{ a.c }} · {{ a.done }}/{{ a.total }} 已提交</span></span>
                        <span class="bar" aria-hidden="true"><i :style="{ width: Math.round((a.done / a.total) * 100) + '%' }"></i></span>
                        <span class="tag" :class="a.s === '已发布' ? 'tag-success' : a.s === '评分中' ? 'tag-info' : 'tag-warning'">{{ a.s }}</span>
                      </li>
                    </ul>
                  </div>

                  <!-- 视图 D：班级管理 -->
                  <div v-else-if="activeView === 'classes'" class="view">
                    <div class="mini-head">
                      <div>
                        <h4>班级管理</h4>
                        <p>班级与学生名单统一维护；作业按班级下发。</p>
                      </div>
                      <span class="btn btn-primary btn-sm">新建班级</span>
                    </div>
                    <div class="table wide">
                      <div class="tr head"><span>班级</span><span>人数</span><span>作业</span><span class="num">平均分</span></div>
                      <div v-for="c in classRows" :key="c.name" class="tr">
                        <span class="name">{{ c.name }}</span>
                        <span>{{ c.students }}</span>
                        <span>{{ c.assignments }}</span>
                        <span class="num">{{ c.avg }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- 视图 E：学生管理 -->
                  <div v-else class="view">
                    <div class="mini-head">
                      <div>
                        <h4>学生管理</h4>
                        <p>名单、班级归属与提交状态一屏可见。</p>
                      </div>
                      <span class="btn btn-primary btn-sm">导入名单</span>
                    </div>
                    <div class="table stu">
                      <div class="tr head"><span>学号 / 姓名</span><span>班级</span><span>状态</span></div>
                      <div v-for="s in studentRows" :key="s.no" class="tr">
                        <span class="name">{{ s.name }} · {{ s.no }}</span>
                        <span>{{ s.cls }}</span>
                        <span><span class="tag" :class="s.ok ? 'tag-success' : 'tag-warning'">{{ s.state }}</span></span>
                      </div>
                    </div>
                  </div>
                   </div>
                  </Transition>
                </div>
              </div>
            </div>
            <p class="shot-note">以上为教师端真实界面元素（本页可交互预览，非截图）</p>
          </div>
        </div>
      </section>

      <!-- ===== 流程条 ===== -->
      <section class="section" id="flow">
        <div class="section-inner">
          <div class="sec-head">
            <div class="eyebrow">评分流程</div>
            <h2>一条闭环，六步走完</h2>
            <p>学生提交后由评分 Worker 自动取件评分，结果实时推送到「评分审核」；教师改分与评语即最终成绩。</p>
          </div>
          <ol class="flow">
            <li v-for="(s, i) in steps" :key="s.t">
              <button type="button" class="step" :class="{ on: activeStep === i }" @click="activeStep = i">
                <b>{{ i + 1 }}</b>
                <span class="step-t">{{ s.t }}</span>
                <span class="step-d">{{ s.d }}</span>
              </button>
            </li>
          </ol>
        </div>
      </section>

      <!-- ===== 系统能力（四张卡，其中三张有真实元素小样） ===== -->
      <section class="section alt" id="capability">
        <div class="section-inner">
          <div class="sec-head">
            <div class="eyebrow">系统能力</div>
            <h2>教师端里你每天会用到的东西</h2>
            <p>下面四块都取自教师控制台的真实元素，其中三块可以直接点着试。</p>
          </div>
          <div class="cards">
            <article class="card">
              <span class="card-ico"><svg class="icon" aria-hidden="true"><use href="#lg-db" /></svg></span>
              <h3>题库管理</h3>
              <p>三类题目统一建题与复用；难度、满分、类型一眼可辨，布置作业时按题库选题。</p>
              <div class="spec">
                <div class="spec-bar">
                  <svg class="icon xs" aria-hidden="true"><use href="#lg-file" /></svg>题库管理 · 第 1 页
                  <span class="filters">
                    <button type="button" :class="{ on: typeFilter === 'all' }" @click="typeFilter = 'all'">全部</button>
                    <button type="button" :class="{ on: typeFilter === 'code' }" @click="typeFilter = 'code'">编程题</button>
                    <button type="button" :class="{ on: typeFilter === 'project' }" @click="typeFilter = 'project'">实训题</button>
                  </span>
                </div>
                <!-- 筛选：行的增删走 TransitionGroup（进：淡入上移；出：淡出，绝对定位避免跳动） -->
                <TransitionGroup name="row" tag="div" class="rows">
                  <div v-for="row in filteredQuestions" :key="row.title" class="spec-row">
                    <span class="grow">{{ row.title }}</span>
                    <span class="tag" :class="row.type === 'project' ? 'tag-accent' : 'tag-info'">
                      {{ row.type === 'project' ? '实训题' : '编程题' }}
                    </span>
                  </div>
                  <div v-if="!filteredQuestions.length" key="__empty" class="spec-row">
                    <span class="grow dim">该类型下暂无题目</span>
                  </div>
                </TransitionGroup>
              </div>
            </article>

            <article class="card">
              <span class="card-ico"><svg class="icon" aria-hidden="true"><use href="#lg-code" /></svg></span>
              <h3>实训题在线 IDE</h3>
              <p>学生上传标准工程包，教师与学生都能按文件树 + 编辑器逐文件查看；不上传即为开放性题目。</p>
              <div class="spec">
                <div class="spec-bar">
                  <svg class="icon xs" aria-hidden="true"><use href="#lg-folder" /></svg>
                  <span class="file-tabs">
                    <button
                      v-for="(f, i) in ideFiles"
                      :key="f.name"
                      type="button"
                      :class="{ on: ideFileIndex === i }"
                      @click="ideFileIndex = i"
                    >{{ f.name }}</button>
                  </span>
                </div>
                <Transition name="code" mode="out-in">
                  <pre class="code" :key="ideFile.name"><code v-for="(l, i) in ideFile.lines" :key="i" :class="'l-' + l.k" :style="{ '--i': i }">{{ l.v }}</code></pre>
                </Transition>
              </div>
            </article>

            <article class="card">
              <span class="card-ico"><svg class="icon" aria-hidden="true"><use href="#lg-shield" /></svg></span>
              <h3>AI 评分与教师终审</h3>
              <p>AI 先给出分数与逐条评语，教师复核后改分、写评语、一键发布；学生只看到最终结果。</p>
              <div class="spec">
                <div class="spec-row"><span class="grow">AI 建议 92 分 · 评语已生成</span><span class="tag tag-success">已评分</span></div>
                <div class="spec-row" :class="{ flash: rubricPublished }">
                  <span class="grow">教师终审 90 分 · 评语已填</span>
                  <Transition name="pop" mode="out-in">
                    <span v-if="rubricPublished" key="done" class="tag tag-success">已发布</span>
                    <button v-else key="btn" type="button" class="btn btn-ghost btn-xs" @click="rubricPublished = true">确认并发布</button>
                  </Transition>
                </div>
              </div>
            </article>

            <article class="card">
              <span class="card-ico"><svg class="icon" aria-hidden="true"><use href="#lg-users" /></svg></span>
              <h3>班级、学生与教学团队</h3>
              <p>班级与学生名单统一维护，教学团队可多人协作同一批班级；成绩按班级维度汇总。</p>
              <div class="spec">
                <div class="spec-row"><span class="grow">软件工程 1 班</span><span class="tag tag-info">50 人</span><span class="tag tag-success">已布置</span></div>
                <div class="spec-row"><span class="grow">软件工程 2 班</span><span class="tag tag-info">48 人</span><span class="tag tag-warning">待布置</span></div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <!-- ===== 底部 CTA ===== -->
      <section class="section">
        <div class="section-inner">
          <div class="cta">
            <div>
              <h2>已经在校园网里部署好了？</h2>
              <p>{{ loggedIn ? '已登录，直接进入控制台继续建题与审核。' : '用教师账号登录，从「题库管理」开始建第一道题。' }}</p>
            </div>
            <a class="btn btn-white btn-lg" :href="loggedIn ? consolePath : '/login'">
              {{ loggedIn ? '进入控制台' : '教师登录' }}<svg class="icon" aria-hidden="true"><use href="#lg-arrow" /></svg>
            </a>
          </div>
        </div>
      </section>
    </main>

    <footer class="foot">
      <div class="section-inner">
        <a class="brand" href="#top">
          <img src="../assets/logo.svg" class="brand-logo" alt="" /><b>Deadpan</b><span>判题</span>
        </a>
        <span class="sep" aria-hidden="true"></span>
        <span>面向高校编程课的 AI 评分平台 · 校内网部署</span>
        <span class="foot-links">
          <a href="/exam/doc" target="_blank" rel="noopener">使用文档</a>
          <a :href="loggedIn ? consolePath : '/login'">{{ loggedIn ? '进入控制台' : '教师登录' }}</a>
          <a href="#capability">系统能力</a>
        </span>
      </div>
    </footer>

    <!-- 图标雪碧（lg- 前缀避免与其它页面/组件的 symbol id 冲突） -->
    <svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
      <symbol id="lg-book" viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 5.5v15" /></symbol>
      <symbol id="lg-check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></symbol>
      <symbol id="lg-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></symbol>
      <symbol id="lg-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></symbol>
      <symbol id="lg-caret" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></symbol>
      <symbol id="lg-file" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></symbol>
      <symbol id="lg-shield" viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z" /><path d="M9.5 12l1.8 1.8 3.4-3.6" /></symbol>
      <symbol id="lg-db" viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></symbol>
      <symbol id="lg-code" viewBox="0 0 24 24"><path d="M9 8l-4 4 4 4M15 8l4 4-4 4" /></symbol>
      <symbol id="lg-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><path d="M16 11a3 3 0 1 0 0-6" /><path d="M17 20c-.2-2-.8-3.6-1.8-4.7 2.6.1 4.4 1.9 4.8 4.7" /></symbol>
      <symbol id="lg-chart" viewBox="0 0 24 24"><path d="M4 20V6M4 20h16" /><path d="M8 16v-4M12 16V9M16 16v-6" /></symbol>
      <symbol id="lg-folder" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></symbol>
    </svg>
  </div>
</template>

<style scoped>
/* 说明：本页所有色值/圆角/间距一律取自 styles/tokens.css，浅色与深色自动成立 */
.landing { background: var(--bg-canvas); color: var(--text-primary); min-height: 100vh; }
.icon { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; flex: none; }
.icon.xs { width: 13px; height: 13px; }
.icon.dim { color: var(--text-tertiary); }
a { color: inherit; text-decoration: none; }

/* ===== 导航 ===== */
.nav { position: sticky; top: 0; z-index: 20; background: var(--bg-surface); border-bottom: 1px solid var(--border-subtle); }
.nav-inner { max-width: 1240px; margin: 0 auto; padding: 0 var(--space-8); height: var(--layout-topbar-h); display: flex; align-items: center; gap: var(--space-3); }
.brand { display: flex; align-items: center; gap: var(--space-2); font-size: var(--fs-title-3); font-weight: var(--fw-semibold); letter-spacing: var(--tracking-tight); }
.brand-logo { width: 28px; height: 28px; }
.brand span { color: var(--text-brand); }
.nav-links { margin-left: auto; display: flex; align-items: center; gap: var(--space-1); }
.nav-link { display: inline-flex; align-items: center; gap: var(--space-1); height: 34px; padding: 0 var(--space-3); border-radius: var(--radius-md); color: var(--text-secondary); font-size: var(--fs-body); }
.nav-link:hover { background: var(--bg-surface-2); color: var(--text-primary); }

/* ===== 按钮 ===== */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); height: 40px; padding: 0 var(--space-5);
  border: 1px solid transparent; border-radius: var(--radius-md); font-size: var(--fs-body); font-weight: var(--fw-medium);
  cursor: pointer; font-family: inherit;
  transition: background var(--duration-fast) ease, border-color var(--duration-fast) ease, color var(--duration-fast) ease,
    transform var(--duration-instant) ease, box-shadow var(--duration-fast) ease; }
/* 悬停微抬 + 按下回弹；带图标的按钮（进入系统 / 教师登录 / 进入控制台）图标右移一点 */
.btn:hover { transform: translateY(-1px); box-shadow: var(--shadow-sm); }
.btn:active { transform: translateY(0) scale(.98); box-shadow: none; }
.btn .icon { transition: transform var(--duration-fast) cubic-bezier(.16,1,.3,1); }
.btn-primary:hover .icon, .btn-white:hover .icon { transform: translateX(3px); }
.btn-primary { background: var(--brand-600); color: var(--text-on-brand); }
.btn-primary:hover { background: var(--brand-700); }
.btn-ghost { background: var(--bg-surface); border-color: var(--border-default); color: var(--text-primary); }
.btn-ghost:hover { border-color: var(--border-strong); background: var(--bg-surface-2); }
.btn-white { background: var(--bg-surface); color: var(--brand-700); }
.btn-lg { height: 46px; padding: 0 var(--space-6); font-size: var(--fs-body-lg); }
.btn-sm { height: 32px; padding: 0 var(--space-3); font-size: var(--fs-body-sm); }
.btn-xs { height: 26px; padding: 0 var(--space-2); font-size: var(--fs-caption); }
.btn:focus-visible, .mini-item:focus-visible, .menu-item:focus-visible, .step:focus-visible,
.filters button:focus-visible, .file-tabs button:focus-visible, .theme-toggle:focus-visible { outline: none; box-shadow: var(--ring-focus); }

/* ===== HERO ===== */
.hero { position: relative; overflow: hidden; border-bottom: 1px solid var(--border-subtle); }
.hero::before { content: ''; position: absolute; inset: -30% -10% auto -10%; height: 620px; pointer-events: none;
  background: radial-gradient(680px 340px at 72% 18%, var(--brand-50), transparent 66%); }
.hero-inner { position: relative; max-width: 1240px; margin: 0 auto; padding: var(--space-12) var(--space-8) var(--space-12);
  display: grid; grid-template-columns: minmax(0, .92fr) minmax(0, 1.28fr); gap: var(--space-12); align-items: center; }
/* 首屏进场：文案与窗口各淡入上移一次（reduced-motion 下关闭） */
.hero-copy { animation: fadeUp .5s cubic-bezier(.16,1,.3,1) both; }
.shot { animation: fadeUp .6s .08s cubic-bezier(.16,1,.3,1) both; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
/* 待审核徽标数字变化时弹一下 */
.pop-enter-active { animation: badgePop .24s cubic-bezier(.34,1.56,.64,1); }
@keyframes badgePop { from { transform: scale(.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.pill { display: inline-flex; align-items: center; gap: var(--space-2); height: 28px; padding: 0 var(--space-3);
  border-radius: var(--radius-pill); background: var(--status-info-bg); border: 1px solid var(--status-info-bd);
  color: var(--status-info-fg); font-size: var(--fs-caption); font-weight: var(--fw-medium); }
.hero h1 { margin: var(--space-4) 0 0; font-size: 40px; line-height: 1.22; letter-spacing: -.02em; color: var(--text-strong); font-weight: var(--fw-bold); }
.hero h1 em { font-style: normal; color: var(--text-brand); }
.lead { margin: var(--space-4) 0 0; max-width: 520px; font-size: var(--fs-body-lg); line-height: var(--lh-body); color: var(--text-secondary); }
.cta-row { display: flex; gap: var(--space-3); margin-top: var(--space-6); flex-wrap: wrap; }
.trust { display: flex; gap: var(--space-5); margin: var(--space-6) 0 0; padding: 0; list-style: none; flex-wrap: wrap;
  color: var(--text-tertiary); font-size: var(--fs-body-sm); }
.trust li { display: inline-flex; align-items: center; gap: var(--space-1); }
.trust .icon { color: var(--status-success-fg); }

/* ===== 控制台窗口 ===== */
.shot { position: relative; }
.frame { background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); overflow: hidden; }
.frame-top { display: flex; align-items: center; gap: var(--space-3); height: 48px; padding: 0 var(--space-3); border-bottom: 1px solid var(--border-subtle); }
.dots { display: flex; gap: 6px; }
.dots i { width: 9px; height: 9px; border-radius: 50%; background: var(--border-strong); }
.frame-title { font-size: var(--fs-body-sm); color: var(--text-tertiary); }
.frame-right { margin-left: auto; display: flex; align-items: center; gap: var(--space-2); }
.avatar { width: 24px; height: 24px; border-radius: 50%; background: var(--brand-600); color: var(--text-on-brand);
  display: grid; place-items: center; font-size: 11px; font-weight: var(--fw-semibold); flex: none; }
.avatar.sm { width: 22px; height: 22px; font-size: 10px; }
.who { display: flex; flex-direction: column; line-height: 1.25; }
.who b { font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-primary); }
.who span { font-size: 11px; color: var(--text-tertiary); }
.frame-body { display: grid; grid-template-columns: 180px minmax(0, 1fr); min-height: 412px; }
/* 允许收缩：grid/flex 子项默认 min-width:auto，内部「一行放不下」的内容（如评分审核行的
   头像+姓名+题目+分数+按钮，min-content 实测 463px）会把窗口顶宽 → 窗口被 .hero 的 overflow:hidden 切掉右边。
   下面这几条让链路每一层都能收缩，由内层自己换行/省略。 */
.frame-body > *,
.view-wrap,
.view,
.mini-main,
.review-row,
.assign-row,
.table,
.tr { min-width: 0; }

/* 侧栏小样：与线上同一批令牌（浅色 gray-100 / 深色 gray-900，与内容区差一档） */
.mini-sider { background: var(--sider-bg); border-right: 1px solid var(--sider-bd); padding: var(--space-3) var(--space-2); display: flex; flex-direction: column; gap: 2px; }
.mini-brand { display: flex; align-items: center; gap: var(--space-2); padding: 2px var(--space-2) var(--space-3);
  color: var(--sider-fg-strong); font-weight: var(--fw-semibold); font-size: var(--fs-body-sm); }
.mini-brand img { width: 20px; height: 20px; }
.mini-group { padding: var(--space-2) var(--space-2) var(--space-1); font-size: 11px; letter-spacing: var(--tracking-wide); color: var(--sider-group-fg); }
/* 侧栏项：可点击切换视图（原生 button，保留键盘可达性）；底色/文字色带过渡，选中项左侧有滑入强调条 */
.mini-item { position: relative; display: flex; align-items: center; gap: var(--space-2); width: 100%; height: 32px;
  padding: 0 var(--space-2); border: 0; background: transparent; border-radius: var(--radius-md); cursor: pointer;
  font-family: inherit; text-align: left; font-size: var(--fs-body-sm); color: var(--sider-fg);
  transition: background-color var(--duration-fast) ease, color var(--duration-fast) ease, transform var(--duration-instant) ease; }
.mini-item:hover { background: var(--sider-item-hover-bg); color: var(--sider-fg-strong); }
.mini-item:active { transform: scale(.985); }
.mini-item::before { content: ''; position: absolute; left: -6px; top: 50%; width: 3px; height: 18px; border-radius: var(--radius-pill);
  background: var(--brand-600); transform: translateY(-50%) scaleY(0); transition: transform var(--duration-base) cubic-bezier(.34,1.4,.64,1); }
.mini-item.on { background: var(--sider-item-active-bg); color: var(--sider-fg-active); font-weight: var(--fw-medium); }
.mini-item.on::before { transform: translateY(-50%) scaleY(1); }
.mini-item .icon { transition: transform var(--duration-base) cubic-bezier(.34,1.4,.64,1); }
.mini-item.on .icon { transform: scale(1.08); }
.badge { margin-left: auto; min-width: 20px; height: 18px; padding: 0 6px; border-radius: var(--radius-pill);
  background: var(--status-danger-bg); border: 1px solid var(--status-danger-bd); color: var(--status-danger-fg);
  font-size: 11px; font-weight: var(--fw-semibold); display: grid; place-items: center; }

/* 内容区 */
.mini-main { padding: var(--space-4); background: var(--bg-canvas); display: flex; flex-direction: column; gap: var(--space-3); }
/* 视图容器：Transition 的子节点要有稳定的盒，故外面套一层 .view-wrap（.view 保持原来的纵向 flex） */
.view-wrap { min-height: 100%; }
.view { display: flex; flex-direction: column; gap: var(--space-3); }

/* 视图切换动效 */
.view-enter-active { transition: opacity 200ms ease, transform 200ms cubic-bezier(.16,1,.3,1); }
.view-leave-active { transition: opacity 120ms ease, transform 120ms ease; }
.view-enter-from { opacity: 0; transform: translateY(8px); }
.view-leave-to { opacity: 0; transform: translateY(-6px); }

/* 「新增题目」下拉（演示：只弹菜单，不跳新建页） */
.dropdown { position: relative; display: inline-flex; margin-left: auto; }
.caret { transition: transform var(--duration-fast) ease; }
.caret.up { transform: rotate(180deg); }
.menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 6; min-width: 236px; padding: var(--space-1);
  background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg); display: flex; flex-direction: column; gap: 2px; }
.menu-item { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2); border: 0; background: transparent;
  border-radius: var(--radius-md); cursor: pointer; font-family: inherit; text-align: left; color: var(--text-primary);
  transition: background-color var(--duration-fast) ease, transform var(--duration-instant) ease; }
.menu-item:hover { background: var(--bg-surface-2); }
.menu-item:active { transform: scale(.985); }
.menu-item .icon { color: var(--text-brand); }
.mi-text { display: flex; flex-direction: column; line-height: 1.35; }
.mi-text b { font-size: var(--fs-body-sm); font-weight: var(--fw-medium); }
.mi-sub { font-size: var(--fs-caption); color: var(--text-tertiary); }
.menu-enter-active { transition: opacity var(--duration-fast) ease, transform var(--duration-fast) cubic-bezier(.16,1,.3,1); }
.menu-leave-active { transition: opacity var(--duration-instant) ease, transform var(--duration-instant) ease; }
.menu-enter-from, .menu-leave-to { opacity: 0; transform: translateY(-6px) scale(.97); }
.q-hint { margin: 0; font-size: var(--fs-caption); color: var(--text-tertiary); }
.mini-head { display: flex; align-items: flex-end; gap: var(--space-3); }
.mini-head h4 { margin: 0; font-size: var(--fs-title-2); font-weight: var(--fw-semibold); color: var(--text-strong); letter-spacing: var(--tracking-tight); }
.mini-head p { margin: 2px 0 0; font-size: var(--fs-caption); color: var(--text-tertiary); }
.mini-head .btn, .mini-head .chip { margin-left: auto; }
.chip { display: inline-flex; align-items: center; height: 24px; padding: 0 var(--space-2); border-radius: var(--radius-pill);
  background: var(--status-warning-bg); border: 1px solid var(--status-warning-bd); color: var(--status-warning-fg); font-size: var(--fs-caption); }
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); }
.kpi { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: var(--space-2) var(--space-3); box-shadow: var(--shadow-xs); }
.kpi span { display: block; font-size: 11px; color: var(--text-tertiary); }
.kpi b { font-size: var(--fs-title-1); font-weight: var(--fw-semibold); color: var(--text-strong); font-variant-numeric: tabular-nums; }
.kpi b.brand { color: var(--text-brand); }
.table { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); overflow: hidden; }
.tr { display: grid; grid-template-columns: minmax(0, 1fr) 68px 62px 52px; gap: var(--space-2); align-items: center;
  padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border-subtle); font-size: var(--fs-body-sm); }
.tr:last-child { border-bottom: 0; }
.tr.head { background: var(--bg-surface-2); color: var(--text-tertiary); font-size: var(--fs-caption); font-weight: var(--fw-medium); }
.tr .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tr .num { text-align: right; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
/* 非标题列不换行（班级名 6~10 字，窄列会把「软件工程 1 班」折成两行） */
.tr > span:not(.name) { white-space: nowrap; }
/* 班级 / 学生两页的列宽与题库表格不同，各给一个变体 */
.table.wide .tr { grid-template-columns: minmax(0, 1fr) 64px 56px 68px; }
.table.stu .tr { grid-template-columns: minmax(0, 1fr) 116px 72px; }
.tag { display: inline-flex; align-items: center; height: 20px; padding: 0 var(--space-2); border-radius: var(--radius-sm);
  font-size: 11px; font-weight: var(--fw-medium); border: 1px solid transparent; white-space: nowrap; }
.tag-info { background: var(--status-info-bg); border-color: var(--status-info-bd); color: var(--status-info-fg); }
.tag-accent { background: var(--status-accent-bg); border-color: var(--status-accent-bd); color: var(--status-accent-fg); }
.tag-warning { background: var(--status-warning-bg); border-color: var(--status-warning-bd); color: var(--status-warning-fg); }
.tag-success { background: var(--status-success-bg); border-color: var(--status-success-bd); color: var(--status-success-fg); }

/* 评分审核视图 */
.review-list, .assign-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.review-row, .assign-row { display: flex; align-items: center; gap: var(--space-3); background: var(--bg-surface);
  border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: var(--space-2) var(--space-3); box-shadow: var(--shadow-xs); }
.r-main { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.r-main b { font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-primary); }
.r-title { font-size: var(--fs-caption); color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.r-score { font-size: var(--fs-caption); color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.r-score b { font-size: var(--fs-title-3); color: var(--text-brand); }
.a-main { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.a-main b { font-size: var(--fs-body-sm); font-weight: var(--fw-medium); }
.a-main span { font-size: var(--fs-caption); color: var(--text-tertiary); }
.bar { width: 96px; height: 6px; border-radius: var(--radius-pill); background: var(--score-track); overflow: hidden; flex: none; }
/* 进度条：每次切到「作业管理」都从 0 长出来（动画随节点挂载自动播放，无需 JS） */
.bar i { display: block; height: 100%; background: var(--brand-600); transform-origin: left center; animation: barGrow var(--duration-slow) cubic-bezier(.16,1,.3,1) both; }
@keyframes barGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.shot-note { margin: var(--space-3) 0 0; font-size: var(--fs-caption); color: var(--text-tertiary); text-align: right; }

/* ===== 区块 ===== */
.section { padding: var(--space-12) 0; }
.section.alt { background: var(--bg-surface); border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle); }
.section-inner { max-width: 1240px; margin: 0 auto; padding: 0 var(--space-8); }
.sec-head { max-width: 620px; margin-bottom: var(--space-6); }
.sec-head h2 { margin: var(--space-2) 0 0; font-size: var(--fs-display-2); line-height: 1.3; letter-spacing: -.02em; color: var(--text-strong); font-weight: var(--fw-bold); }
.sec-head p { margin: var(--space-2) 0 0; color: var(--text-secondary); font-size: var(--fs-body); }
.eyebrow { font-size: var(--fs-caption); font-weight: var(--fw-semibold); letter-spacing: .08em; text-transform: uppercase; color: var(--text-brand); }

/* 流程条：可点击高亮；六张卡等高 —— 网格项（li）默认 stretch，卡片本身要 height:100% 才跟着撑满，
   否则「建题」那条说明多一行就会比其余五张高出一截（实测 147.4 vs 127.6，差 19.8px）。 */
.flow { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(6, 1fr); gap: var(--space-3);
  align-items: stretch; grid-auto-rows: 1fr; }   /* 多行时（手机两列 = 三行）行与行也等高，六张卡始终一个高度 */
.flow > li { display: flex; }
.step { position: relative; width: 100%; height: 100%; text-align: left; background: var(--bg-surface); border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg); padding: var(--space-4) var(--space-3); box-shadow: var(--shadow-xs); cursor: pointer;
  font-family: inherit; display: flex; flex-direction: column; gap: var(--space-1);
  transition: border-color var(--duration-fast) ease, background var(--duration-fast) ease,
    transform var(--duration-base) cubic-bezier(.16,1,.3,1), box-shadow var(--duration-base) ease; }
.step:hover { border-color: var(--border-strong); transform: translateY(-2px); box-shadow: var(--shadow-sm); }
.step:active { transform: translateY(0) scale(.99); }
.step.on { border-color: var(--brand-600); background: var(--bg-selected); }
.step b { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--status-info-bg);
  color: var(--text-brand); font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); font-variant-numeric: tabular-nums; }
.step.on b { background: var(--brand-600); color: var(--text-on-brand); }
.step-t { font-size: var(--fs-body); font-weight: var(--fw-semibold); color: var(--text-strong); }
.step-d { font-size: var(--fs-caption); color: var(--text-tertiary); line-height: 1.65; }

/* 能力卡 */
.cards { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-5); }
.card { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: var(--space-5);
  box-shadow: var(--shadow-xs); display: flex; flex-direction: column; gap: var(--space-3);
  transition: transform var(--duration-base) cubic-bezier(.16,1,.3,1), box-shadow var(--duration-base) ease, border-color var(--duration-base) ease; }
.card:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); border-color: var(--border-default); }
.card-ico { width: 38px; height: 38px; border-radius: var(--radius-md); display: grid; place-items: center;
  transition: transform var(--duration-base) cubic-bezier(.34,1.56,.64,1), background-color var(--duration-base) ease;
  background: var(--status-info-bg); border: 1px solid var(--status-info-bd); color: var(--text-brand); }
.card h3 { margin: 0; font-size: var(--fs-title-3); font-weight: var(--fw-semibold); color: var(--text-strong); }
.card p { margin: 0; color: var(--text-secondary); font-size: var(--fs-body-sm); line-height: var(--lh-body); }
.spec { border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--bg-surface-2); overflow: hidden; }
.spec-bar { display: flex; align-items: center; gap: var(--space-2); padding: 6px var(--space-2) 6px var(--space-3);
  border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface); font-size: 11px; color: var(--text-tertiary); }
.spec-row { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border-subtle); font-size: var(--fs-body-sm);
  transition: background-color var(--duration-fast) ease, color var(--duration-fast) ease; }
.spec-row:hover { background: var(--bg-hover); }
/* 卡片悬停时图标轻微弹一下 */
.card:hover .card-ico { transform: scale(1.08) rotate(-3deg); }
/* 筛选列表容器：leave 阶段的行绝对定位，避免整块高度突跳 */
.rows { position: relative; }
.row-enter-active { transition: opacity var(--duration-base) ease, transform var(--duration-base) cubic-bezier(.16,1,.3,1); }
.row-leave-active { transition: opacity var(--duration-fast) ease, transform var(--duration-fast) ease; position: absolute; left: 0; right: 0; }
.row-enter-from { opacity: 0; transform: translateY(-6px); }
.row-leave-to { opacity: 0; transform: translateX(8px); }
.row-move { transition: transform var(--duration-base) cubic-bezier(.16,1,.3,1); }
/* 发布成功：该行背景闪一下绿色 */
.spec-row.flash { animation: rowFlash 900ms ease both; }
@keyframes rowFlash { 0% { background: var(--status-success-bg); } 100% { background: transparent; } }
.spec-row:last-child { border-bottom: 0; }
.spec-row .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spec-row .dim { color: var(--text-tertiary); }
.filters, .file-tabs { margin-left: auto; display: flex; gap: 4px; }
.filters button, .file-tabs button { height: 22px; padding: 0 var(--space-2); border: 1px solid var(--border-default); background: var(--bg-surface);
  border-radius: var(--radius-sm); font-family: inherit; font-size: 11px; color: var(--text-secondary); cursor: pointer;
  transition: background-color var(--duration-fast) ease, border-color var(--duration-fast) ease, color var(--duration-fast) ease,
    transform var(--duration-instant) ease; }
.filters button:hover, .file-tabs button:hover { border-color: var(--border-strong); color: var(--text-primary); transform: translateY(-1px); }
.filters button:active, .file-tabs button:active { transform: scale(.94); }
.filters button.on, .file-tabs button.on { background: var(--brand-600); border-color: var(--brand-600); color: var(--text-on-brand);
  animation: chipPop var(--duration-base) cubic-bezier(.34,1.56,.64,1); }
@keyframes chipPop { from { transform: scale(.88); } to { transform: scale(1); } }
/* 代码框固定高度：切换文件时框高不变，卡片与本行高度也就不会跟着跳
   （曾经 10 行 / 6 行 / 4 行三个文件把卡片在 445.6 / 362.4 / 320.8px 之间来回拉，连页脚位置都在动）。
   232px = 10 行 × 20.8px（--fs-code 13 × --lh-code 1.6）+ 上下内边距 24px（2×--space-3）；
   行数更多的文件在框内滚动（overflow: auto），不会撑高卡片。 */
.code { margin: 0; padding: var(--space-3); height: 232px; background: var(--code-bg); color: var(--code-fg); overflow: auto;
  font-family: var(--font-mono); font-size: var(--fs-code); line-height: var(--lh-code); }
/* 每个文件切换：整块淡入 + 逐行错峰滑入（--i 由模板按行号下发） */
.code code { display: block; white-space: pre; animation: lineIn var(--duration-base) cubic-bezier(.16,1,.3,1) both;
  animation-delay: calc(var(--i, 0) * 16ms); }
@keyframes lineIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
.code-enter-active { transition: opacity var(--duration-base) ease, transform var(--duration-base) cubic-bezier(.16,1,.3,1); }
.code-leave-active { transition: opacity var(--duration-fast) ease, transform var(--duration-fast) ease; }
.code-enter-from { opacity: 0; transform: translateY(6px); }
.code-leave-to { opacity: 0; transform: translateY(-4px); }
.code .l-cmt { color: #8b929e; }
.code .l-ann { color: #c4b5fd; }
.code .l-kw { color: #8ec5ff; }

/* CTA */
.cta { background: var(--brand-600); color: var(--text-on-brand); border-radius: var(--radius-xl); padding: var(--space-8) var(--space-10);
  display: flex; align-items: center; gap: var(--space-6); box-shadow: var(--shadow-lg); }
.cta h2 { margin: 0; font-size: var(--fs-display-2); font-weight: var(--fw-bold); letter-spacing: -.02em; }
/* 副文案：白字压在 brand-600 实底上 —— .82 的透明度实测只有 4.25:1（14px 正文不达 AA），提到 .92 → 4.97:1 */
.cta p { margin: var(--space-2) 0 0; color: rgba(255, 255, 255, .92); font-size: var(--fs-body); }
.cta .btn { margin-left: auto; flex: none; }

/* 页脚 */
.foot { padding: var(--space-6) 0 var(--space-10); color: var(--text-tertiary); font-size: var(--fs-body-sm); }
.foot .section-inner { display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap; }
.foot .brand { font-size: var(--fs-body); }
.sep { width: 1px; height: 14px; background: var(--border-default); }
.foot-links { margin-left: auto; display: flex; gap: var(--space-4); }
.foot-links a:hover { color: var(--text-link); }

/* ===== 响应式 ===== */
@media (max-width: 1080px) {
  .hero-inner { grid-template-columns: 1fr; gap: var(--space-8); padding-top: var(--space-8); }
  .lead { max-width: none; }
  .flow { grid-template-columns: repeat(3, 1fr); }
  .cards { grid-template-columns: 1fr; }
}
@media (max-width: 768px) {
  .nav-inner, .section-inner { padding: 0 var(--space-4); }
  .nav-link { display: none; }
  .hero h1 { font-size: 30px; }
  .hero-inner { padding: var(--space-6) var(--space-4); }
  .frame-body { grid-template-columns: 1fr; }
  .mini-sider { display: none; }
  .flow { grid-template-columns: repeat(2, 1fr); }   /* 六张卡两列：单列要滑一屏半 */
  .cta { flex-direction: column; align-items: flex-start; padding: var(--space-6); }
  .cta .btn { margin-left: 0; }
  .foot-links { margin-left: 0; }
}

/* ===== 手机竖屏（≤640px）：以下全部只作用于手机，电脑端（>1080）不受影响 ===== */
@media (max-width: 640px) {
  /* 节奏与排版：内距 16、区块上下 32，标题收到 26px */
  .nav-inner, .section-inner { padding: 0 var(--space-4); }
  .section { padding: var(--space-8) 0; }
  .hero-inner { padding: var(--space-6) var(--space-4) var(--space-8); gap: var(--space-6); }
  .hero h1 { font-size: 26px; }
  .lead { font-size: var(--fs-body); }
  .trust { gap: var(--space-3); }
  .sec-head h2 { font-size: var(--fs-title-1); }

  /* 两个 CTA 并排一行、各占一半（按钮保留、字号与内距收一档：46 → 40） */
  .cta-row { flex-direction: row; gap: var(--space-2); }
  .cta-row .btn { flex: 1 1 0; min-width: 0; padding: 0 var(--space-2); font-size: var(--fs-body-sm); }
  .btn-lg { height: 40px; font-size: var(--fs-body-sm); }
  .btn { white-space: nowrap; }                     /* 「新增题目」这类按钮不再折成两行 */
  .nav-links .btn-sm { height: 34px; }

  /* 列表行允许换行：窄屏时分数与按钮自动让到第二行，而不是把窗口顶宽 */
  .review-row, .assign-row { flex-wrap: wrap; row-gap: var(--space-1); }

  /* 演示控制台：窄屏省略单位副行、表格只留「标题 + 类型」 */
  .frame-top { padding: 0 var(--space-2); }
  .who span { display: none; }
  .frame-body { min-height: 380px; }
  .mini-main { padding: var(--space-3); }
  .tr { grid-template-columns: minmax(0, 1fr) 62px; }
  .tr > span:nth-child(3), .tr .num { display: none; }
  .mini-head .btn { height: 30px; padding: 0 var(--space-2); font-size: var(--fs-caption); }

  /* 能力卡：治好横向溢出的关键 —— 网格/弹性子项必须显式 min-width: 0，
     否则代码块 <pre> 的 min-content（最长那行 ≈ 419px）会顶破卡片并让整页横向滚动 */
  .card, .spec, .step { min-width: 0; }
  .card { padding: var(--space-4); }
  .spec-bar { flex-wrap: wrap; row-gap: var(--space-1); }
  .filters, .file-tabs { margin-left: 0; }
  .filters button, .file-tabs button { height: 28px; padding: 0 var(--space-2); }
  .code { height: 176px; font-size: 12px; }         /* 8 行高，长行在框内横向滚动 */

  .cta { padding: var(--space-6) var(--space-5); }
  .cta h2 { font-size: var(--fs-title-1); }
  .shot-note { text-align: left; }
}

/* ===== 极窄屏（≤480px）：演示窗口退化为「KPI + 一行记录」的静态小样，省约 280px 竖向空间 ===== */
@media (max-width: 480px) {
  .frame-body { min-height: 320px; }   /* 0 会让演示窗口太矮（实测 157~227px），320 与「KPI + 两行记录」相称 */
  .mini-main { gap: var(--space-2); }
  .mini-head { align-items: center; }
  .mini-head p { display: none; }
  .mini-head h4 { font-size: var(--fs-title-3); }
  .kpis { gap: var(--space-1); }
  .kpi { padding: var(--space-1) var(--space-2); }
  .kpi span { font-size: 10px; }
  .kpi b { font-size: var(--fs-title-3); }
  /* 只留表头 + 前两条记录（其余视图的列表同理只留前两条） */
  .tr:nth-child(n+4),
  .review-list li:nth-child(n+3),
  .assign-list li:nth-child(n+3) { display: none; }
  .tr { padding: var(--space-1) var(--space-2); }
  .frame-top { height: 40px; }
  .who b { font-size: var(--fs-caption); }
}

/* 动效降级：尊重系统「减少动态效果」—— 关闭全部过渡与入场动画（含侧栏强调条、下拉、视图切换、进度条、徽标弹跳） */
@media (prefers-reduced-motion: reduce) {
  .btn, .step, .card, .mini-item, .menu-item, .caret, .bar i, .card-ico, .spec-row,
  .filters button, .file-tabs button, .code code { transition: none; animation: none; }
  .btn:hover, .btn:active, .step:hover, .card:hover, .mini-item:active, .menu-item:active { transform: none; }
  .hero-copy, .shot { animation: none; }
  .view-enter-active, .view-leave-active, .menu-enter-active, .menu-leave-active,
  .row-enter-active, .row-leave-active, .row-move, .code-enter-active, .code-leave-active { transition: none; }
  .view-enter-from, .view-leave-to, .menu-enter-from, .menu-leave-to,
  .row-enter-from, .row-leave-to, .code-enter-from, .code-leave-to { opacity: 1; transform: none; }
  .spec-row.flash { animation: none; }
  .pop-enter-active { animation: none; }
}
</style>
