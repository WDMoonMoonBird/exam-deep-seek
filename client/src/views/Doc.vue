<template>
  <div class="doc-layout">
    <!-- 顶栏 -->
    <header class="doc-header">
      <div class="doc-header-inner">
        <img src="../assets/logo.svg" class="doc-logo" alt="logo" />
        <span class="doc-title"><span class="doc-title-main">Deadpan 判题</span><span class="doc-title-sep"> · </span><span class="doc-title-sub">教师使用文档</span></span>
        <a-button type="link" href="/exam/login" class="doc-login-btn">前往登录</a-button>
      </div>
    </header>

    <div class="doc-body">
      <!-- 左侧导航（桌面端） -->
      <aside class="doc-sidebar">
        <a-anchor :items="anchors" :targetOffset="80" :bounds="20" @click="e => e.preventDefault()" />
      </aside>

      <!-- 主内容 -->
      <main class="doc-main" ref="mainRef" @click="onMainClick">
        <!-- 1. 系统简介（交互式步骤条） -->
        <section id="intro" class="doc-section">
          <h2 class="section-title">1. 系统简介</h2>
          <div class="section-body">
            <p>Deadpan 判题是一套面向高校编程类课程的<b>AI 智能评分平台</b>，支持教师创建题目、布置作业、AI 自动评分、教师审核发布、学生在线答题的完整教学闭环。</p>
            <a-steps :current="introStep" :items="introStepItems" size="small" style="margin:20px 0;" @change="introStep = $event" />
            <div class="steps-content">{{ introSteps[introStep].content }}</div>
            <div class="steps-action">
              <a-button v-if="introStep > 0" @click="introStep--">上一步</a-button>
              <a-button v-if="introStep < introSteps.length - 1" type="primary" @click="introStep++">下一步</a-button>
              <a-button v-if="introStep === introSteps.length - 1" type="primary" @click="introStep = 0">重新浏览</a-button>
            </div>
            <p style="margin-top:20px;">系统支持三种角色：<b>超级管理员</b>（管理学校/教师/班级）、<b>教师</b>（题库/作业/审核）、<b>学生</b>（答题/查看成绩）。本文档面向教师用户。</p>
          </div>
        </section>

        <!-- 2~7 静态章节 -->
        <section v-for="sec in sections2to7" :key="sec.id" :id="sec.id" class="doc-section">
          <h2 class="section-title">{{ sec.title }}</h2>
          <div class="section-body" v-html="sec.content" />
        </section>

        <!-- 8. AI 评分流程（交互式步骤条） -->
        <section id="aiflow" class="doc-section">
          <h2 class="section-title">8. AI 评分流程</h2>
          <div class="section-body">
            <h3>8.1 评分流程</h3>
            <p>学生提交代码后，评分流程自动触发：</p>
            <a-steps :current="flowStep" :items="flowStepItems" size="small" style="margin:20px 0;" @change="flowStep = $event" />
            <div class="steps-content">{{ flowSteps[flowStep].content }}</div>
            <div class="steps-action">
              <a-button v-if="flowStep > 0" @click="flowStep--">上一步</a-button>
              <a-button v-if="flowStep < flowSteps.length - 1" type="primary" @click="flowStep++">下一步</a-button>
              <a-button v-if="flowStep === flowSteps.length - 1" type="primary" @click="flowStep = 0">重新浏览</a-button>
            </div>
            <h3 style="margin-top:24px;">8.2 评分标准</h3>
            <p>AI 评分时会参考教师自定义的评分标准（如已设置），或使用默认标准。AI 返回 JSON 格式的分数和评语，后台自动存入数据库。</p>
            <h3>8.3 实时推送</h3>
            <p>评分完成后，系统通过 <b>WebSocket</b> 实时推送给审核页面，教师无需手动刷新即可看到最新的评分状态变化。</p>
          </div>
        </section>

        <!-- 9. 性能优势 -->
        <section id="performance" class="doc-section">
          <h2 class="section-title">9. 性能优势</h2>
          <div class="section-body">
            <div class="a-alert a-alert-info">⚡ 本系统采用<b>多并发 AI 评分架构</b>，专为大规模考试场景设计。</div>
            <h3>高并发批改能力</h3>
            <p>评分 Worker 以<b>多线程并发</b>方式并行调用 AI 接口，单次可同时处理多份学生提交。<b>500 人同时交卷，10 分钟内即可完成全部 AI 评分</b>，极大缩短考试出分周期。</p>
            <h3>实时推送</h3>
            <p>评分结果通过 <b>WebSocket</b> 实时推送到教师端，无需手动刷新页面。教师可在学生交卷后立即看到 AI 评分结果，实现边交卷边审核。</p>
            <h3>数据库优化</h3>
            <p>核心查询路径均建立复合索引，Worker 轮询查询走索引覆盖，避免全表扫描。即使在高并发提交场景下，数据库响应依然保持稳定。</p>
          </div>
        </section>

        <!-- 10~11 静态章节 -->
        <section v-for="sec in sections9to10" :key="sec.id" :id="sec.id" class="doc-section">
          <h2 class="section-title">{{ sec.title }}</h2>
          <div class="section-body" v-html="sec.content" />
        </section>
      </main>
    </div>

    <!-- 移动端浮动目录按钮 -->
    <a-float-button v-if="showMobileToc" shape="square" @click="mobileTocOpen = true">
      <template #icon><BarsOutlined /></template>
    </a-float-button>
    <a-drawer v-model:open="mobileTocOpen" title="目录" placement="right" :width="280">
      <a-anchor :items="anchors" @click="mobileTocOpen = false" />
    </a-drawer>

    <!-- 图片灯箱 -->
    <Teleport to="body">
      <Transition name="lightbox-fade">
        <div v-if="lightboxOpen" class="lightbox-mask" @click="lightboxOpen = false">
          <div class="lightbox-close" @click="lightboxOpen = false">✕</div>
          <img :src="lightboxSrc" class="lightbox-img" @click.stop />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { BarsOutlined } from '@ant-design/icons-vue';

const showMobileToc = ref(false);
const mobileTocOpen = ref(false);

// 图片灯箱
const lightboxOpen = ref(false);
const lightboxSrc = ref('');
function onMainClick(e) {
  const img = e.target.closest('.doc-img');
  if (img) {
    lightboxSrc.value = img.src;
    lightboxOpen.value = true;
  }
}

// 系统简介步骤条
const introStep = ref(0);
const introSteps = [
  { title: '建题', content: '教师创建编程题目，设置参考答案和评分标准。每道题包含大题和若干小题，支持多种编程语言。' },
  { title: '布置', content: '选择题目、选择班级、设定作业起止时间，一键布置。可设置是否允许补交。' },
  { title: '提交', content: '学生在截止时间前登录系统，在线编写代码并提交。系统支持草稿自动保存和截止时间强制提交。' },
  { title: 'AI 评分', content: '后台评分 Worker 每 2 秒轮询数据库，获取待评分提交后调用 DeepSeek 大模型进行 AI 评分，返回分数和详细评语。' },
  { title: '审核发布', content: '教师查看 AI 评分结果，可修改分数并填写评语。「审核」保存评分，「发布」后学生才能看到成绩。发布后仍可修改分数并重新发布。' },
  { title: '出分', content: '学生登录后在「查看成绩」页面查看已发布的分数和教师评语，支持按作业查看各小题得分。' },
];
const introStepItems = introSteps.map(s => ({ title: s.title }));

// AI 评分流程步骤条
const flowStep = ref(0);
const flowSteps = [
  { title: '学生提交', content: '学生在答题页面选择编程语言、编写代码后点击「提交代码」。提交后该小题状态变为「待评分」，不可再修改（除非作业开启了补交）。' },
  { title: 'Worker 获取', content: '评分 Worker 每 2 秒轮询数据库，批量获取最多 8 条状态为「待评分」的提交记录，以 8 并发方式并行调用 AI 接口。' },
  { title: '构建提示词', content: '系统根据题目要求、参考答案、教师自定义评分标准和学生提交的代码，自动构建完整的 AI 提示词，确保评分公正、意见具体。' },
  { title: 'AI 评分', content: 'DeepSeek 大模型返回 JSON 格式的评分结果：包含分数（score）和详细评语（feedback）。系统解析后存入数据库，状态变为「AI 已评分」。' },
  { title: '实时推送', content: '评分完成后通过内部 HTTP 回调通知主进程，主进程通过 WebSocket 实时推送给教师的审核页面，无需手动刷新。' },
  { title: '教师审核', content: '教师可在审核页面查看 AI 评分详情，支持修改最终分数并填写教师评语。审核后点击「发布」，学生即可查看成绩。' },
];
const flowStepItems = flowSteps.map(s => ({ title: s.title }));

function checkMobile() {
  showMobileToc.value = window.innerWidth < 992;
}
onMounted(() => { checkMobile(); window.addEventListener('resize', checkMobile); });
onUnmounted(() => window.removeEventListener('resize', checkMobile));

const sections2to7 = [
  { id: 'quickstart', title: '2. 快速入门', content: `
    <h3>2.1 登录系统</h3>
    <p>使用学校分配的<b>工号</b>和<b>密码</b>登录。打开系统地址后，在登录页输入工号和密码，点击「登录」按钮进入系统。</p>
    <img class="doc-img" src="/exam/doc-img/01-login.png" alt="登录页面" />

    <h3>2.2 界面概览</h3>
    <p>登录后进入教师工作台，左侧为<b>导航菜单</b>，顶部为<b>操作栏</b>。</p>
    <img class="doc-img" src="/exam/doc-img/02-classes.png" alt="教师主界面" />

    <table class="doc-table">
      <tr><th style="width:120px">菜单项</th><th>功能说明</th></tr>
      <tr><td>班级管理</td><td>创建和管理班级，可指定教学团队</td></tr>
      <tr><td>学生管理</td><td>逐个新增或批量导入学生名单</td></tr>
      <tr><td>教学团队</td><td>创建教师团队，共享班级和作业</td></tr>
      <tr><td>题库管理</td><td>创建和编辑编程题目（大题+小题）</td></tr>
      <tr><td>作业管理</td><td>布置作业、设置时间、控制补交</td></tr>
      <tr><td>评分审核</td><td>查看 AI 评分、修改分数、发布成绩</td></tr>
    </table>

    <h3>2.3 个人信息与密码</h3>
    <p>点击右上角头像 →「我的信息」，可查看个人信息和修改密码。展开「修改密码」面板，输入原密码和新密码后确认即可。</p>
    <img class="doc-img" src="/exam/doc-img/14-profile.png" alt="个人信息弹窗" />
  `},

  { id: 'classes', title: '3. 班级管理', content: `
    <h3>3.1 创建班级</h3>
    <p>点击「新增班级」按钮，在弹出的模态框中填写<b>班级名称</b>，可选择性地将班级加入已有的<b>教学团队</b>（留空则不加入任何团队）。点击「确定」完成创建。</p>
    <img class="doc-img" src="/exam/doc-img/03-class-add.png" alt="新增班级模态框" />

    <h3>3.2 指定教学团队</h3>
    <p>创建或编辑班级时，可通过「指定教学团队」下拉框选择一个或多个团队。班级加入团队后，团队内所有教师均可查看和管理该班级的学生、作业和审核。</p>
    <div class="a-alert a-alert-info">💡 <b>提示：</b>班级的创建者自动成为该班级的授课教师。通过团队共享的班级，非创建者教师对班级仅有只读权限。</div>

    <h3>3.3 团队共享班级标识</h3>
    <p>在班级列表中，来自团队共享的班级会显示<span class="doc-tag doc-tag-purple">团队共享 · 教师姓名</span>。这类班级的「编辑」和「删除」按钮会被禁用。</p>
    <img class="doc-img" src="/exam/doc-img/02-classes.png" alt="团队共享班级标签" />
  `},

  { id: 'students', title: '4. 学生管理', content: `
    <h3>4.1 选择班级</h3>
    <p>进入学生管理页后，须先在顶部下拉框中选择一个班级。选择后页面显示该班学生列表。团队共享的班级选项旁会显示<span class="doc-tag doc-tag-purple">团队</span> 标签。</p>

    <h3>4.2 单个新增学生</h3>
    <p>点击「单个新增」按钮，填写<b>学号</b>和<b>姓名</b>，选择班级后确认。学号不可重复，若学号已存在则自动关联到新班级。</p>

    <h3>4.3 批量导入学生</h3>
    <p>点击「批量导入」按钮，弹出导入模态框：</p>
    <ol>
      <li>下载模板（可选）：点击「下载模板」获取标准 Excel 模板</li>
      <li>上传文件：拖拽或点击上传区域选择 Excel 文件（仅支持 .xlsx / .xls）</li>
      <li>系统自动校验：检查表头（学号、姓名）和每行数据完整性</li>
      <li>查看结果：导入完成后显示成功/失败数量及具体错误原因</li>
    </ol>
    <div class="a-alert a-alert-info">💡 <b>模板格式：</b>Excel 第一行为表头（<b>学号</b>、<b>姓名</b>），每行一个学生，两列均不可为空。示例如下：</div>
    <table class="doc-table" style="width:auto;min-width:280px;">
      <tr><th>学号</th><th>姓名</th></tr>
      <tr><td>teststudent1</td><td>测试学生1</td></tr>
      <tr><td>teststudent2</td><td>测试学生2</td></tr>
    </table>
    <img class="doc-img" src="/exam/doc-img/05-import-modal.png" alt="批量导入模态框" />

    <h3>4.4 团队班级只读限制</h3>
    <p>当选择了团队共享的班级时：</p>
    <ul>
      <li>页面顶部出现 <span class="doc-tag doc-tag-purple">团队共享班级 · 只读</span> 提示</li>
      <li>「单个新增」和「批量导入」按钮被禁用</li>
      <li>表格中的「编辑」「删除」按钮被禁用</li>
      <li>学生名单仍可正常查看</li>
    </ul>
  `},

  { id: 'teams', title: '5. 教学团队', content: `
    <h3>5.1 创建团队</h3>
    <p>进入「教学团队」页面，点击「创建团队」按钮，输入团队名称即可创建。创建者自动成为团队成员，角色标注为「创建者」。</p>
    <img class="doc-img" src="/exam/doc-img/06-teams.png" alt="团队列表页" />

    <h3>5.2 管理团队成员</h3>
    <p>点击团队的「管理」按钮进入详情页，默认显示「教师管理」标签：</p>
    <ul>
      <li><b>添加教师：</b>在搜索框中搜索同校教师，选中即可添加（300ms 防抖自动保存）</li>
      <li><b>移除教师：</b>点击表格中的「移除」按钮，弹出确认框后移除</li>
      <li><b>创建者保护：</b>创建者不可被移除，其「移除」按钮为禁用状态</li>
    </ul>
    <img class="doc-img" src="/exam/doc-img/07-team-detail.png" alt="团队详情-教师管理" />

    <h3>5.3 管理团队班级</h3>
    <p>切换到「班级管理」标签：</p>
    <ul>
      <li><b>添加班级：</b>搜索并选择同校班级，自动保存</li>
      <li><b>移除班级：</b>点击「移除」按钮</li>
      <li><b>归属标注：</b>自己的班级显示「自己」，他人的班级显示 <span class="doc-tag doc-tag-purple">他人</span> 标签</li>
    </ul>
    <img class="doc-img" src="/exam/doc-img/07-team-classes.png" alt="团队详情-班级管理" />

    <h3>5.4 退出 / 删除团队</h3>
    <ul>
      <li><b>创建者：</b>只能「删除」整个团队（级联删除团队下的教师和班级关联）</li>
      <li><b>非创建者：</b>只能「退出」团队，从成员列表中移除自己</li>
    </ul>

    <h3>5.5 团队协作场景</h3>
    <p>假设教师 A 创建了班级「计应1班」，教师 B 创建了班级「计应2班」：</p>
    <ul>
      <li>A 创建团队「计算机教研组」，将 B 加入团队，并添加自己的班级</li>
      <li>B 也可以将自己的班级添加到团队中</li>
      <li>此后 A 和 B 都能看到两个班级的学生名单、布置作业、审核评分</li>
      <li>但对非自己创建的班级，操作按钮为只读状态</li>
    </ul>
  `},

  { id: 'questions', title: '6. 题库管理', content: `
    <h3>6.1 题目结构</h3>
    <p>每道题目为「<b>大题 + N 道小题</b>」的结构。大题包含标题、难度、满分、题目材料；每道小题包含内容描述、分值、参考答案、评分标准、编程语言。</p>
    <img class="doc-img" src="/exam/doc-img/08-questions.png" alt="题库列表页" />

    <h3>6.2 创建题目</h3>
    <p>点击「新增题目」进入编辑页：</p>
    <ol>
      <li><b>基本信息：</b>填写大题标题、选择难度（简单/中等/困难）、设定满分</li>
      <li><b>题目材料（选填）：</b>点击「题目材料」展开编辑区，支持富文本</li>
      <li><b>小题管理：</b>默认一道小题，点击「+」添加更多。每道小题独立设置标题、分值、题目描述、参考答案、编程语言和评分标准</li>
      <li>点击「保存」按钮</li>
    </ol>
    <img class="doc-img" src="/exam/doc-img/09-question-edit.png" alt="题目编辑页" />

    <h3>6.3 评分标准</h3>
    <p>每道小题可自定义评分标准。若留空，系统使用默认标准：<b>代码正确性 60% + 代码效率 20% + 代码可读性 20%</b>。</p>

    <h3>6.4 编辑 / 删除</h3>
    <p>在题库列表中可「编辑」或「删除」已有题目。删除前请确认该题目未被作业引用。</p>
  `},

  { id: 'assignments', title: '7. 作业管理', content: `
    <h3>7.1 布置作业</h3>
    <p>点击「布置作业」进入三步向导：</p>
    <div class="a-alert a-alert-info">💡 本系统每份作业只包含<b>一道题目</b>（可含多道小题）。如需布置多道题目，请分别创建多份作业。</div>
    <p><b>第一步 · 选题：</b>搜索并选择一道题目（单选）。</p>
    <p><b>第二步 · 选班：</b>左侧为可选班级列表，点击选中；右侧为已选班级。团队共享班级会显示 <span class="doc-tag doc-tag-purple">团队</span> 标签，选中后显示归属教师名。</p>
    <img class="doc-img" src="/exam/doc-img/11-assign-classes.png" alt="布置作业-选班步骤" />
    <p><b>第三步 · 设置时间：</b>填写作业标题、说明，选择起止时间（精确到分钟），设置是否允许补交。</p>
    <img class="doc-img" src="/exam/doc-img/12-assign-time.png" alt="布置作业-时间设置" />

    <h3>7.2 补交控制</h3>
    <p>「允许补交」开关：</p>
    <ul>
      <li><b>关闭（默认）：</b>提交后不可修改，截止时间后未交视为过期</li>
      <li><b>开启：</b>学生提交后可多次重新提交，截止后仍可补交</li>
    </ul>

    <h3>7.3 作业列表</h3>
    <p>作业管理页显示所有已布置的作业，包括标题、题目数、提交数、起止时间。点击表格行可查看详情。</p>
  `},
];

const sections9to10 = [
  { id: 'review', title: '10. 评分审核', content: `
    <h3>9.1 审核列表</h3>
    <p>进入「评分审核」页面，选择班级后查看所有作业的审核状态。</p>
    <table class="doc-table">
      <tr><th>指标</th><th>说明</th></tr>
      <tr><td>AI 状态</td><td><span class="doc-tag doc-tag-blue"><span class="doc-spinner"></span>待评分</span> <span class="doc-tag doc-tag-green">已评分</span> <span class="doc-tag doc-tag-red">评分异常</span></td></tr>
      <tr><td>审核状态</td><td><span class="doc-tag doc-tag-orange">待审核</span> <span class="doc-tag doc-tag-green">已审核</span></td></tr>
      <tr><td>已交/未交</td><td>该班学生提交情况统计</td></tr>
    </table>
    <img class="doc-img" src="/exam/doc-img/13-review.png" alt="评分审核列表页" />

    <div class="a-alert a-alert-info">💡 <b>审核 vs 发布：</b>「审核」仅保存教师的最终分数和评语，学生此时<b>看不到成绩</b>。教师需要点击「发布」按钮，学生端才会显示分数和评语。发布后如需修改分数，修改后重新点击「发布」即可覆盖更新。</div>

    <h3>9.2 逐人审核</h3>
    <p>点击「审核」按钮进入审核详情页：</p>
    <ul>
      <li><b>左侧：</b>题目内容（材料、各小题描述）+ 切换小题的标签</li>
      <li><b>右侧：</b>学生代码（只读）+ AI 评分面板（分数和评语）</li>
      <li>教师可在「最终分数」处修改分数，在评语框中填写教师评语</li>
      <li>点击「审核」保存教师评分，点击「发布」将成绩推送给学生</li>
    </ul>
    <img class="doc-img" src="/exam/doc-img/15-review-detail.png" alt="审核详情页" />

    <h3>9.3 一键操作</h3>
    <p>在班级审核页面（审核列表点击「审核」后的列表页），可使用：</p>
    <ul>
      <li><b>一键审核全班：</b>将所有 AI 已评分的提交自动审核通过</li>
      <li><b>一键发布全班：</b>将所有已审核的提交全部发布</li>
    </ul>

    <h3>9.4 重新评分</h3>
    <p>在审核详情页，可对单道小题点击「重新评分」按钮，系统将重新调用 AI 对该小题进行评分。</p>

    <h3>9.5 导出 Excel</h3>
    <p>在审核列表和班级审核页均可使用「导出」功能，导出包含每道小题分数的 Excel 报表。Excel 中动态生成各小题得分列，方便成绩统计。</p>
  `},

  { id: 'faq', title: '11. 常见问题', content: `
    <h3>Q: 学生说看不到作业？</h3>
    <p>请检查：① 作业起止时间——若当前时间早于开始时间，学生端显示 <span class="doc-tag doc-tag-orange">未开始</span>；② 是否选对了班级——作业只对布置时选中的班级学生可见。</p>

    <h3>Q: AI 评分显示<span class="doc-tag doc-tag-red">评分异常</span>？</h3>
    <p>可能原因：AI 接口超时、返回格式异常、学生提交的代码为空。可在审核详情页点击「重新评分」重试。</p>

    <h3>Q: 为什么团队共享的班级不能编辑学生？</h3>
    <p>团队共享班级的编辑权限归创建该班级的教师所有。其他教师可以查看学生名单、布置作业和审核评分，但不能增删改学生信息。如需修改，请联系班级创建者。</p>

    <h3>Q: 批量导入时提示「缺少表头：学号」？</h3>
    <p>请确保 Excel 第一行包含<b>「学号」</b>和<b>「姓名」</b>两列（或英文 <code>username</code> 和 <code>realName</code>），列名不区分中英文，但不能缺失或为空。</p>

    <h3>Q: 可以多名教师同时审核同一份作业吗？</h3>
    <p>可以。通过教学团队，多名教师都可以进入同一班级的审核页面进行审核。但审核结果以最后保存的为准。</p>

    <h3>Q: 如何切换学校？</h3>
    <p>若您的账号关联了多所学校，点击右上角头像菜单中的「切换单位」，选择目标学校后页面自动刷新。</p>

    <h3>Q: 学生提交后还能修改代码吗？</h3>
    <p>取决于作业的「允许补交」设置：关闭则提交后不可修改；开启则可多次重新提交。截止时间后提交的状态取决于补交开关。</p>
  `},

  { id: 'opensource', title: '12. 开源', content: `
    <p>本项目完全开源，代码托管在 <a href="https://gitee.com/WD_MoonMoonBird/exam-deep-seek" target="_blank">Gitee</a>，欢迎 Star、Fork 和 PR。</p>
    <div style="text-align:center;padding:32px 20px;margin:24px 0;background:linear-gradient(135deg,#f9f0ff,#e6f4ff);border-radius:12px;">
      <p style="font-size:18px;font-weight:600;color:#333;margin-bottom:8px;">"From each according to his ability, to each according to his needs."</p>
      <p style="font-size:15px;color:#666;margin-bottom:16px;">「各尽所能，按需分配」</p>
      <p style="font-size:13px;color:#999;">— Karl Marx, <em>Critique of the Gotha Programme</em> / 卡尔·马克思，《哥达纲领批判》（1875）</p>
    </div>
    <p>开源精神与马克思笔下的理想社会不谋而合：开发者<b>各尽所能</b>贡献代码，使用者<b>各取所需</b>自由获取。代码如知识，共享方能放大其价值。</p>
  `},
];

const allSections = [
  { id: 'intro', title: '1. 系统简介' },
  ...sections2to7,
  { id: 'aiflow', title: '8. AI 评分流程' },
  { id: 'performance', title: '9. 性能优势' },
  ...sections9to10,
];
const anchors = allSections.map(s => ({
  key: s.id,
  href: `#${s.id}`,
  title: s.title,
}));
</script>

<style scoped>
.doc-layout {
  min-height: 100vh;
  background: #f5f5f5;
}
.doc-header {
  position: sticky; top: 0; z-index: 100;
  background: #fff; border-bottom: 1px solid #e8e8e8;
  box-shadow: 0 2px 12px rgba(0,0,0,0.10);
  height: 56px; display: flex; align-items: center;
}
.doc-header-inner {
  max-width: 1200px; width: 100%; margin: 0 auto;
  display: flex; align-items: center; gap: 12px;
  padding: 0 24px;
}
.doc-logo { width: 28px; height: 28px; flex-shrink: 0; }
.doc-title { font-size: 18px; font-weight: 600; flex: 1; }
.doc-login-btn { flex-shrink: 0; }

.doc-body {
  max-width: 1200px; margin: 0 auto; padding: 32px 24px 80px;
  display: flex; gap: 40px; align-items: flex-start;
}

.doc-sidebar {
  position: sticky; top: 88px;
  width: 200px; flex-shrink: 0;
  background: #fff; border-radius: 8px;
  padding: 16px; border: 1px solid #e8e8e8;
  max-height: calc(100vh - 120px); overflow-y: auto;
}

.doc-main {
  flex: 1; min-width: 0; overflow: hidden;
}

.doc-section {
  background: #fff; border-radius: 12px;
  padding: 32px 40px; margin-bottom: 24px;
  border: 1px solid #e8e8e8;
}
.section-title {
  font-size: 24px; font-weight: 700; margin: 0 0 20px 0;
  padding-bottom: 12px; border-bottom: 2px solid #1677ff;
}
.section-body { font-size: 15px; line-height: 1.9; color: #333; }
.section-body :deep(h3) { font-size: 18px; font-weight: 600; margin: 28px 0 12px; }
.section-body :deep(h3:first-child) { margin-top: 0; }
.section-body :deep(p) { margin: 8px 0 16px; }
.section-body :deep(ul), .section-body :deep(ol) { margin: 8px 0 16px; padding-left: 24px; }
.section-body :deep(li) { margin: 4px 0; }
.section-body :deep(b) { color: #1a1a1a; }

/* 流程图 */
.flow-overview {
  display: flex; align-items: flex-start; gap: 6px;
  margin: 20px 0; overflow-x: auto;
  padding: 16px; background: #fafafa; border-radius: 8px;
  flex-wrap: wrap;
}
.flow-step {
  display: flex; align-items: center; gap: 8px;
  background: #fff; border: 1px solid #e8e8e8; border-radius: 8px;
  padding: 10px 14px; white-space: nowrap; flex-shrink: 0;
  font-size: 14px;
}
.flow-num {
  width: 24px; height: 24px; border-radius: 50%;
  background: #1677ff; color: #fff; font-size: 13px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.flow-arrow { font-size: 18px; color: #bbb; flex-shrink: 0; align-self: center; }


/* 截图占位（未截图时的兜底） */
.img-placeholder {
  background: #fafafa; border: 2px dashed #d9d9d9; border-radius: 8px;
  padding: 40px 20px; text-align: center; color: #999; font-size: 15px;
  margin: 20px 0;
}

/* 滚动偏移 */
:target { scroll-margin-top: 80px; }

/* 响应式 */
@media (max-width: 992px) {
  .doc-header { box-shadow: 0 2px 12px rgba(0,0,0,0.10), 0 4px 24px rgba(0,0,0,0.08); }
  .doc-title-sep { display: none; }
  .doc-title-sub { display: block; font-size: 14px; font-weight: 400; color: var(--ink-muted); }
  .doc-sidebar { display: none; }
  .doc-body { padding: 16px 12px 60px; }
  .doc-section { padding: 20px 16px; }
  .section-title { font-size: 20px; }
  .doc-table { font-size: 13px; }
  .doc-table th, .doc-table td { padding: 6px 8px; }
  .flow-overview { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .flow-arrow { display: inline; }
  .flow-step { padding: 8px 10px; font-size: 13px; }
}
</style>
<style>
.doc-table {
  width: 100%; border-collapse: separate; border-spacing: 0;
  margin: 16px 0; font-size: 14px;
  border: 1px solid #e8e8e8; border-radius: 10px; overflow: hidden;
}
.doc-table th, .doc-table td {
  padding: 10px 14px; text-align: left;
  border-bottom: 1px solid #f0f0f0;
  border-right: 1px solid #f0f0f0;
}
.doc-table th:last-child, .doc-table td:last-child { border-right: none; }
.doc-table tr:last-child td { border-bottom: none; }
.doc-table th { background: #fafafa; font-weight: 600; font-size: 13px; color: #666; }
.doc-table td { color: #333; }
.a-alert { padding: 12px 16px; border-radius: 8px; margin: 16px 0; font-size: 14px; line-height: 1.7; }
.a-alert-info { background: #e6f4ff; border: 1px solid #91caff; color: #0958d9; }
.doc-tag {
  display: inline-block; padding: 0 7px; font-size: 12px; line-height: 20px;
  border-radius: 999px; margin: 0 2px; vertical-align: middle; font-weight: 500;
}
.doc-tag-blue { color: #1677ff; background: #e6f4ff; border: 1px solid #91caff; }
.doc-tag-green { color: #52c41a; background: #f6ffed; border: 1px solid #b7eb8f; }
.doc-tag-red { color: #ff4d4f; background: #fff2f0; border: 1px solid #ffccc7; }
.doc-tag-orange { color: #fa8c16; background: #fff7e6; border: 1px solid #ffd591; }
.doc-tag-purple { color: #722ed1; background: #f9f0ff; border: 1px solid #d3adf7; }
.doc-tag-default { color: #666; background: #fafafa; border: 1px solid #d9d9d9; }
@keyframes doc-spin { to { transform: rotate(360deg); } }
.doc-spinner {
  display: inline-block; width: 10px; height: 10px; margin-right: 4px; vertical-align: middle;
  border: 2px solid #91caff; border-top-color: #1677ff; border-radius: 50%;
  animation: doc-spin 0.8s linear infinite;
}
.doc-steps {
  display: flex; gap: 0; margin: 24px 0; flex-wrap: wrap;
}
.doc-step {
  flex: 1; min-width: 150px; position: relative;
  padding: 20px 16px 16px 40px; background: #fff;
  border: 1px solid #e8e8e8; border-radius: 8px; margin-right: -1px;
}
.doc-step:first-child { border-radius: 8px 0 0 8px; }
.doc-step:last-child { border-radius: 0 8px 8px 0; margin-right: 0; }
.doc-step-num {
  position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
  width: 22px; height: 22px; border-radius: 50%; background: #1677ff;
  color: #fff; font-size: 12px; font-weight: 700; text-align: center; line-height: 22px;
}
.doc-step b { display: block; font-size: 14px; margin-bottom: 2px; }
.doc-step span { font-size: 12px; color: #666; line-height: 1.5; }
.doc-step-arrow {
  position: absolute; right: -8px; top: 50%; transform: translateY(-50%);
  color: #d9d9d9; font-size: 16px; z-index: 1;
}
.doc-step:last-child .doc-step-arrow { display: none; }
.steps-content {
  min-height: 60px; padding: 20px 24px; margin-top: 4px;
  border: 1px dashed #d9d9d9; border-radius: 8px;
  background: #fafafa; font-size: 14px; color: #555; line-height: 1.8;
}
.steps-action { margin-top: 16px; display: flex; gap: 8px; }

.doc-img {
  width: 100% !important;
  max-width: 100% !important;
  height: auto !important;
  border-radius: 8px;
  border: 1px solid #e8e8e8;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  margin: 20px 0;
  display: block;
  object-fit: contain; cursor: zoom-in;
}

.lightbox-mask {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.85); display: flex;
  align-items: center; justify-content: center;
  cursor: zoom-out; -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
}
.lightbox-close {
  position: absolute; top: 16px; right: 24px;
  color: #fff; font-size: 32px; cursor: pointer; z-index: 1;
  width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
  border-radius: 50%; background: rgba(255,255,255,0.15);
}
.lightbox-close:hover { background: rgba(255,255,255,0.3); }
.lightbox-img {
  max-width: 95vw; max-height: 95vh; object-fit: contain;
  border-radius: 8px; cursor: default;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}
.lightbox-fade-enter-active, .lightbox-fade-leave-active { transition: opacity 0.2s; }
.lightbox-fade-enter-from, .lightbox-fade-leave-to { opacity: 0; }

@media (max-width: 768px) {
  .doc-steps { flex-direction: column; }
  .doc-step { margin-right: 0; margin-bottom: -1px; border-radius: 0 !important; }
  .doc-step:first-child { border-radius: 8px 8px 0 0 !important; }
  .doc-step:last-child { border-radius: 0 0 8px 8px !important; }
}
</style>
