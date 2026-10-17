<script setup>
/**
 * 使用文档（/m/doc）—— T3 公共/平台
 *
 * 依据：docs/mobile-app/10-v1-implementation-contract.md §3
 *       docs/mobile-app/05-page-specs.md §3.1-3（public-doc）
 *   · 静态内容（把桌面 Doc.vue 的核心章节转成移动版阅读稿），不请求任何接口；
 *   · 交互只做本地能力：搜索过滤目录（300ms 防抖）、目录定位高亮（滚动监听）、代码块复制；
 *   · 不加载桌面版交互 Demos（体积大、手机娱乐性低）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import { MIcon, MSearchBar } from '../../components/index.js';
import { useMobileToast } from '../../composables/useMobileToast.js';

const toast = useMobileToast();

const SECTIONS = [
  { id: 'start', label: '快速开始', sub: '登录、布置第一份作业、完成一次审核', keywords: '登录 工号 学号 工作台 待审核 通知' },
  { id: 'classes', label: '班级管理', sub: '建班、导入名单、教学团队协作', keywords: '班级 学生 名单 导入 教师团队' },
  { id: 'assign', label: '作业布置', sub: '选题、设置截止时间、评分标准', keywords: '布置 选题 截止 时间 评分标准 实训题' },
  { id: 'review', label: '评分审核', sub: 'AI 评分说明、改分、发布成绩', keywords: '审核 改分 评语 发布 成绩 AI' },
];
const sections = ref(SECTIONS);

/* ---------------------------------------------------------------- 搜索（300ms 防抖，本地过滤） */
const keyword = ref('');
const debouncedKeyword = ref('');
let debounceTimer = null;
watch(keyword, (next) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    debouncedKeyword.value = String(next || '').trim();
  }, 300);
});
onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (scrollEl.value) scrollEl.value.removeEventListener('scroll', onScroll);
});
const filteredSections = computed(() => {
  const q = debouncedKeyword.value.toLowerCase();
  if (!q) return sections.value;
  return sections.value.filter((item) => (item.label + ' ' + item.sub + ' ' + item.keywords).toLowerCase().indexOf(q) >= 0);
});
function clearSearch() {
  keyword.value = '';
  debouncedKeyword.value = '';
}

/* ---------------------------------------------------------------- 目录定位 + 滚动高亮 */
const scrollEl = ref(null);
const activeSection = ref('start');
function goSection(id) {
  activeSection.value = id;
  const node = document.getElementById('doc-' + id);
  if (node && typeof node.scrollIntoView === 'function') {
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
function onScroll() {
  const el = scrollEl.value;
  if (!el) return;
  const scrollTop = el.scrollTop;
  // 已到页底：最后一节内容较短、无法滚到顶部时也应高亮最后一节
  const atBottom = scrollTop + el.clientHeight >= el.scrollHeight - 8;
  const base = el.getBoundingClientRect().top;
  let current = sections.value[0].id;
  for (const item of sections.value) {
    const node = document.getElementById('doc-' + item.id);
    if (!node) continue;
    const relTop = node.getBoundingClientRect().top - base + scrollTop;
    if (relTop - 96 <= scrollTop) current = item.id;
  }
  if (atBottom) current = sections.value[sections.value.length - 1].id;
  activeSection.value = current;
}
onMounted(() => {
  if (scrollEl.value) scrollEl.value.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
});

/* ---------------------------------------------------------------- 上一节 / 下一节 */
const activeIndex = computed(() => {
  const at = sections.value.findIndex((item) => item.id === activeSection.value);
  return at < 0 ? 0 : at;
});
const prevSection = computed(() => (activeIndex.value > 0 ? sections.value[activeIndex.value - 1] : null));
const nextSection = computed(() =>
  activeIndex.value < sections.value.length - 1 ? sections.value[activeIndex.value + 1] : null
);

/* ---------------------------------------------------------------- 评分标准示例（可复制） */
const RUBRIC_LINES = [
  '功能完整性: 50   # 增删改查 30',
  '代码规范: 25     # 路由 12 / 注释',
  '健壮性: 25       # 异常提示 8',
  '总分: 100        # 合计自动校验',
  '',
  '# 未上传标准包 = 开放性题目',
];
function copyText(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return Promise.reject(new Error('clipboard 不可用'));
}
async function copyRubric() {
  try {
    await copyText(RUBRIC_LINES.join('\n'));
    toast.show('已复制评分标准示例');
  } catch {
    toast.show('复制失败，请长按代码块手动复制');
  }
}
</script>

<template>
  <MobileLayout bottom="none">
    <MobileAppBar title="使用文档" back back-to="/m">
      <template #right>
        <RouterLink class="iconbtn" to="/m/login" aria-label="前往登录"><MIcon name="user" /></RouterLink>
      </template>
    </MobileAppBar>

    <main ref="scrollEl" class="scroll">
      <!-- 搜索 -->
      <div class="doc-search">
        <MSearchBar
          v-model="keyword"
          placeholder="搜索文档：布置作业、审核、导出…"
          label="搜索文档"
        />
      </div>

      <!-- 目录卡 -->
      <nav class="card doc-toc" aria-label="文档目录">
        <div class="doc-toc-head"><h2>本篇目录</h2><span>教师使用文档 · 共 4 节</span></div>
        <template v-if="filteredSections.length">
          <button
            v-for="item in filteredSections"
            :key="item.id"
            type="button"
            class="doc-toc-item"
            :class="{ active: activeSection === item.id }"
            :aria-current="activeSection === item.id ? 'true' : undefined"
            @click="goSection(item.id)"
          >
            <span class="doc-toc-idx" aria-hidden="true">{{ String(sections.findIndex((s) => s.id === item.id) + 1).padStart(2, '0') }}</span>
            <span class="doc-toc-main">
              <span class="doc-toc-name">{{ item.label }}</span>
              <span class="doc-toc-sub">{{ item.sub }}</span>
            </span>
            <span v-if="activeSection === item.id" class="doc-toc-cur">当前</span>
            <MIcon v-else name="chevron-right" class="doc-toc-arrow" />
          </button>
        </template>
        <div v-else class="doc-empty">
          <MIcon name="search" />
          <p>没有匹配「{{ debouncedKeyword }}」的章节</p>
          <button type="button" class="btn btn--sm btn--secondary" @click="clearSearch">清除搜索</button>
        </div>
      </nav>

      <!-- 文章正文 -->
      <article class="doc-article">
        <div class="doc-eyebrow">第 1 节 · 快速开始</div>
        <h2 class="doc-article-title">3 分钟完成第一次布置与审核</h2>
        <div class="doc-meta">
          <span>更新于 2026-10-17</span><i aria-hidden="true"></i><span>阅读约 8 分钟</span><i aria-hidden="true"></i><span>适用于 v2.1.0</span>
        </div>

        <div class="doc-body">
          <p>Deadpan 判题把「建题 → 布置 → 学生提交 → AI 评分 → 教师终审 → 发布成绩」收进一条链路。本页带你用 3 分钟走完第一次布置与审核。</p>

          <section id="doc-start" class="doc-sec">
            <h3 class="doc-h3"><span class="doc-h3-no" aria-hidden="true">1</span>登录并进入工作台</h3>
            <p>打开控制台，使用学校分配的工号登录；教师与学生共用同一个入口，系统会按账号角色进入对应端。</p>
            <ol class="doc-steps">
              <li class="doc-step">
                <span class="doc-step-no" aria-hidden="true">1</span>
                <div class="doc-step-main"><b>输入工号与密码</b>，例如 T2026001；学生使用学号。<span class="s">忘记密码请联系任课教师或信息中心重置。</span></div>
              </li>
              <li class="doc-step">
                <span class="doc-step-no" aria-hidden="true">2</span>
                <div class="doc-step-main"><b>登录后默认进入「工作台」</b>，顶部「审核」角标显示待处理份数。<span class="s">学生端入口为「首页 → 我的作业」。</span></div>
              </li>
              <li class="doc-step">
                <span class="doc-step-no" aria-hidden="true">3</span>
                <div class="doc-step-main"><b>在「我的」中可切换深色主题</b>，设置会随账号在当前设备保存。</div>
              </li>
            </ol>
            <div class="banner banner--info doc-tip">
              <MIcon name="info" />
              <div><b>小提示</b>：手机端可以完成审核与查看，但编辑题目、上传标准工程包等操作请在电脑端进行。</div>
            </div>
          </section>

          <section id="doc-classes" class="doc-sec">
            <h3 class="doc-h3"><span class="doc-h3-no" aria-hidden="true">2</span>班级管理</h3>
            <p>班级与学生名单由学校统一维护；教师可在电脑端把学生加入自己的教学班级，手机上用于查看进度。</p>
            <ul class="doc-list">
              <li>建班与导入名单：电脑端「班级管理 → 新建 / 导入」；</li>
              <li>教学团队：同桌教师可共同协作同一批班级；</li>
              <li>手机端：「班级」列表可查看人数与作业进度。</li>
            </ul>
            <div class="readonly-tip doc-tip">
              <MIcon name="info" />
              <div>移动端 v1 只读查看班级数据；新增、编辑与导入请在电脑端完成。</div>
            </div>
          </section>

          <section id="doc-assign" class="doc-sec">
            <h3 class="doc-h3"><span class="doc-h3-no" aria-hidden="true">3</span>作业布置</h3>
            <p>进入「作业」标签页，在电脑端点击「布置作业」按向导完成：基本信息 → 选题 → 班级 → 确认。</p>
            <ol class="doc-steps">
              <li class="doc-step">
                <span class="doc-step-no" aria-hidden="true">1</span>
                <div class="doc-step-main"><b>填写名称与截止时间</b>，建议至少提前 3 天发布，给学生留出缓冲。</div>
              </li>
              <li class="doc-step">
                <span class="doc-step-no" aria-hidden="true">2</span>
                <div class="doc-step-main"><b>从题库选择题目并指定班级</b>，系统会按班级名单生成提交清单。</div>
              </li>
              <li class="doc-step">
                <span class="doc-step-no" aria-hidden="true">3</span>
                <div class="doc-step-main"><b>确认发布</b>，学生端立即出现待办；提交后 AI 自动评分并推送到审核队列。</div>
              </li>
            </ol>

            <div class="codebox doc-code">
              <div class="codebar">
                <span class="file"><MIcon name="file" /><span>评分标准.yaml</span><span class="badge-file">实训题</span></span>
                <button type="button" class="doc-copy" aria-label="复制评分标准示例" @click="copyRubric">
                  <MIcon name="copy" />复制
                </button>
              </div>
              <div class="codebody">
                <div v-for="(line, index) in RUBRIC_LINES" :key="index" class="codeline">
                  <span class="ln">{{ index + 1 }}</span><span>{{ line }}</span>
                </div>
              </div>
            </div>

            <div class="banner banner--warning doc-tip">
              <MIcon name="alert" />
              <div><b>注意</b>：实训题的标准工程包只能在电脑端上传；未上传时 AI 只按评分标准做评价式评分，不臆造标准答案。</div>
            </div>

            <div class="readonly-tip doc-tip">
              <MIcon name="info" />
              <div>催交、通知提醒等能力暂未开放，本版本不提供。</div>
            </div>
          </section>

          <section id="doc-review" class="doc-sec">
            <h3 class="doc-h3"><span class="doc-h3-no" aria-hidden="true">4</span>评分审核</h3>
            <p>学生提交后，AI 在 1–2 分钟内完成评分并推送到「评分审核」。教师确认或改分后，再发布成绩让学生可见。</p>
            <ul class="doc-list">
              <li>审核列表按待审核排序，点开可查看 AI 总分与评语；</li>
              <li>改分与教师评语会保留在审核记录里，学生只看到最终结果；</li>
              <li>发布后学生立即可见，且不可撤销 —— 发布前请先检查低分提交。</li>
            </ul>
            <div class="banner banner--danger doc-tip">
              <MIcon name="lock" />
              <div><b>高风险操作</b>：批量发布不可撤销。建议先处理分数偏低或评分异常的提交，再发布其余部分。</div>
            </div>
          </section>
        </div>

        <!-- 上一节 / 下一节 -->
        <div class="doc-nav">
          <div class="doc-nav-title">继续阅读</div>
          <div class="card doc-pager">
            <button
              type="button"
              class="doc-pager-btn"
              :disabled="!prevSection"
              @click="prevSection && goSection(prevSection.id)"
            >
              <MIcon name="arrow-left" />
              <span class="doc-pager-main">
                <span class="doc-pager-dir">上一节</span>
                <span class="doc-pager-label">{{ prevSection ? prevSection.label : '已经是第一节' }}</span>
              </span>
            </button>
            <button
              type="button"
              class="doc-pager-btn doc-pager-btn--next"
              :disabled="!nextSection"
              @click="nextSection && goSection(nextSection.id)"
            >
              <span class="doc-pager-main">
                <span class="doc-pager-dir">下一节</span>
                <span class="doc-pager-label">{{ nextSection ? nextSection.label : '已经是最后一节' }}</span>
              </span>
              <MIcon name="arrow-right" />
            </button>
          </div>
        </div>

        <footer class="doc-foot">
          <p>Deadpan 判题 · 教师使用文档 v2.1.0</p>
          <p>文档内容与产品版本同步更新 · 最后更新 2026-10-17</p>
        </footer>
      </article>
    </main>
  </MobileLayout>
</template>

<style scoped>
/* ============ 文档页页内样式：只用令牌 ============ */
.doc-search { padding: 8px var(--m-gutter) 0; }
.doc-toc { margin: 12px var(--m-gutter) 0; padding: 0; overflow: hidden; }
.doc-toc-head { display: flex; align-items: center; justify-content: space-between; padding: 13px var(--m-card-pad) 10px; }
.doc-toc-head h2 { font-size: var(--m-fs-body-sm); font-weight: var(--m-fw-semibold); color: var(--text-secondary); letter-spacing: 0.01em; }
.doc-toc-head span { font-size: var(--m-fs-caption); color: var(--text-tertiary); }
.doc-toc-item { display: flex; align-items: center; width: 100%; text-align: left; min-height: 48px; padding: 6px var(--m-card-pad); position: relative; }
.doc-toc-item + .doc-toc-item { box-shadow: inset 0 1px 0 var(--border-subtle); }
.doc-toc-item:active { background: var(--bg-hover); }
.doc-toc-item .doc-toc-idx { flex: none; width: 26px; font-size: 11px; font-weight: 600; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.doc-toc-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.doc-toc-name { font-size: var(--m-fs-body-sm); font-weight: var(--m-fw-medium); color: var(--text-primary); }
.doc-toc-sub { margin-top: 1px; font-size: 11.5px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-toc-item.active { background: var(--bg-selected); }
.doc-toc-item.active .doc-toc-idx,
.doc-toc-item.active .doc-toc-name { color: var(--text-brand); }
.doc-toc-item.active .doc-toc-name { font-weight: var(--m-fw-semibold); }
.doc-toc-item.active::before { content: ""; position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px; border-radius: 0 3px 3px 0; background: var(--brand-600); }
.doc-toc-cur { margin-left: 8px; font-size: 10.5px; font-weight: 600; color: var(--text-brand); background: var(--bg-surface); border-radius: 5px; padding: 2px 5px; flex: none; }
.doc-toc-arrow { color: var(--text-disabled); flex: none; }
.doc-empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 22px 16px 20px; }
.doc-empty .icon { width: 26px; height: 26px; color: var(--text-tertiary); }
.doc-empty p { margin: 8px 0 12px; font-size: var(--m-fs-body-sm); color: var(--text-secondary); }

.doc-article { padding: 22px var(--m-gutter) 0; }
.doc-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; color: var(--text-brand); }
.doc-article-title { margin-top: 7px; font-size: var(--m-fs-title-1); line-height: 1.35; font-weight: 700; letter-spacing: var(--m-tracking-tight); color: var(--text-strong); }
.doc-meta { display: flex; align-items: center; flex-wrap: wrap; margin-top: 8px; font-size: var(--m-fs-caption); color: var(--text-tertiary); }
.doc-meta i { width: 3px; height: 3px; border-radius: 50%; background: var(--text-disabled); margin: 0 7px; }
.doc-body { margin-top: 18px; font-size: var(--m-fs-body); line-height: 1.75; color: var(--text-primary); }
.doc-body p { color: var(--text-secondary); }
.doc-sec { scroll-margin-top: 10px; margin-top: 18px; }
.doc-sec + .doc-sec { margin-top: 26px; }
.doc-h3 { display: flex; align-items: center; font-size: var(--m-fs-title-2); line-height: 1.4; font-weight: 700; letter-spacing: var(--m-tracking-tight); color: var(--text-strong); }
.doc-h3-no { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; margin-right: 8px;
  border-radius: 8px; background: var(--bg-selected); color: var(--text-brand); font-size: 12.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
.doc-sec > p { margin-top: 8px; }

.doc-steps { margin-top: 12px; }
.doc-step { position: relative; display: flex; align-items: flex-start; padding: 0 0 14px 38px; }
.doc-step:last-child { padding-bottom: 0; }
.doc-step::after { content: ""; position: absolute; left: 11px; top: 26px; bottom: 2px; width: 1.5px; background: var(--border-default); }
.doc-step:last-child::after { display: none; }
.doc-step-no { position: absolute; left: 0; top: 1px; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: var(--bg-selected); color: var(--text-brand); font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
.doc-step-main { flex: 1; min-width: 0; font-size: var(--m-fs-body); line-height: 1.65; color: var(--text-secondary); }
.doc-step-main b { color: var(--text-primary); font-weight: var(--m-fw-semibold); }
.doc-step-main .s { display: block; margin-top: 2px; font-size: var(--m-fs-caption); color: var(--text-tertiary); }

.doc-tip { margin-top: 14px; }
.doc-list { margin-top: 10px; }
.doc-list li { position: relative; padding-left: 16px; font-size: var(--m-fs-body); line-height: 1.7; color: var(--text-secondary); }
.doc-list li + li { margin-top: 6px; }
.doc-list li::before { content: ""; position: absolute; left: 2px; top: 0.66em; width: 5px; height: 5px; border-radius: 50%; background: var(--border-strong); }

.doc-code { margin-top: 14px; }
.doc-code .codebody { max-height: none; }
.doc-copy { display: inline-flex; align-items: center; height: var(--m-touch-min); padding: 0 6px; color: rgba(255, 255, 255, 0.72); font-size: 12px; }
.doc-copy .icon { width: 14px; height: 14px; margin-right: 4px; }

.doc-nav { margin-top: 26px; }
.doc-nav-title { margin-bottom: 8px; font-size: var(--m-fs-caption); font-weight: 600; color: var(--text-tertiary); letter-spacing: 0.06em; }
.doc-pager { display: flex; padding: 0; overflow: hidden; }
.doc-pager-btn { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; min-height: 64px; padding: 10px 14px; text-align: left; }
.doc-pager-btn + .doc-pager-btn { border-left: 1px solid var(--border-subtle); }
.doc-pager-btn:active { background: var(--bg-hover); }
.doc-pager-btn[disabled] { opacity: 0.45; }
.doc-pager-btn .icon { width: 18px; height: 18px; color: var(--text-tertiary); flex: none; }
.doc-pager-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.doc-pager-btn--next .doc-pager-main { text-align: right; }
.doc-pager-dir { font-size: 11px; font-weight: 600; color: var(--text-tertiary); letter-spacing: 0.04em; }
.doc-pager-label { margin-top: 1px; font-size: var(--m-fs-body-sm); font-weight: var(--m-fw-medium); color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.doc-foot { margin-top: 24px; padding: 18px 0 4px; border-top: 1px solid var(--border-subtle); text-align: center; }
.doc-foot p { font-size: 11.5px; line-height: 1.7; color: var(--text-tertiary); }

@media (max-width: 374px) {
  .doc-article-title { font-size: var(--m-fs-title-2); }
}
</style>
