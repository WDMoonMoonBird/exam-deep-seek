<script setup>
/**
 * 教师题库 —— v1 零后端版
 *
 * 依据：10-v1-implementation-contract §3/§6/§7.6、05-page-specs 屏 28、09 §4 题库降级口径。
 * 数据：GET /teacher/questions?page&pageSize&keyword（服务端关键字 + 分页）
 *      GET /teacher/questions/:id（点卡只读预览）
 * 题型 chips 为前端过滤（后端无 type 参数）；不显示使用次数/最近使用；编辑引导电脑端。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import { MEmpty, MIcon, MChips, MSheet, MSkeleton, MStatusTag } from '../../components/index.js';
import request from '../../../api/request.js';
import { useSafeRequest } from '../../../composables/useSafeRequest.js';
import { useMobileToast } from '../../composables/useMobileToast.js';
import { formatDateTime } from '../../../domain/format.js';
import { withAppBase } from '../../../domain/appPath.js';

const router = useRouter();
const toast = useMobileToast();
const { safeLoad } = useSafeRequest({ tag: 'MobileTeacherQuestions.vue', action: '加载题库' });

const list = ref([]);
const total = ref(0);
const page = ref(1);
const PAGE_SIZE = 50;
const loading = ref(false);
const loadingMore = ref(false);
const errorText = ref('');
const keyword = ref('');
const typeFilter = ref('');

const previewOpen = ref(false);
const previewId = ref(0);
const previewLoading = ref(false);
const previewError = ref('');
const preview = ref(null);

const typeOptions = [
  { label: '全部', value: '' },
  { label: '编程题', value: 'code' },
  { label: '实训题', value: 'project' },
];
const filtered = computed(() => {
  if (!typeFilter.value) return list.value;
  return list.value.filter((item) => (item.type || 'code') === typeFilter.value);
});
const hasMore = computed(() => list.value.length < total.value);

let searchTimer = null;
watch(keyword, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => reload(), 300);
});
onBeforeUnmount(() => clearTimeout(searchTimer));

function typeLabel(type) {
  return type === 'project' ? '实训题' : '编程题';
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchList(append) {
  if (append) loadingMore.value = true;
  else loading.value = true;
  errorText.value = '';
  const params = { page: page.value, pageSize: PAGE_SIZE };
  if (keyword.value.trim()) params.keyword = keyword.value.trim();
  const r = await safeLoad(() => request.get('/teacher/questions', { params }));
  loading.value = false;
  loadingMore.value = false;
  if (r.error) {
    errorText.value = r.message || '题库加载失败，请重试';
    return;
  }
  const d = r.data || {};
  list.value = append ? list.value.concat(d.list || []) : (d.list || []);
  total.value = d.total || 0;
}

function reload() {
  page.value = 1;
  fetchList(false);
}

function loadMore() {
  if (loading.value || loadingMore.value) return;
  page.value += 1;
  fetchList(true);
}

function newQuestion() {
  toast.show('移动端仅预览，新建题目请在电脑端完成');
}

function editUrl(question) {
  const id = question && question.id;
  if (!id) return withAppBase('/teacher/questions');
  return withAppBase(question.type === 'project' ? '/teacher/questions/' + id + '/edit-project' : '/teacher/questions/' + id + '/edit');
}

async function openPreview(item) {
  previewId.value = item.id;
  previewOpen.value = true;
  previewLoading.value = true;
  previewError.value = '';
  preview.value = null;
  const r = await safeLoad(() => request.get('/teacher/questions/' + item.id));
  previewLoading.value = false;
  if (r.error) {
    previewError.value = r.message || '题目预览加载失败';
    return;
  }
  preview.value = r.data || null;
}

function retryPreview() {
  if (previewId.value) openPreview({ id: previewId.value });
}

function openDesktopEdit() {
  if (!preview.value) return;
  window.location.assign(editUrl(preview.value));
}

function previewSubQuestions() {
  if (!preview.value) return [];
  return preview.value.subQuestions || [];
}

function previewMaterial() {
  if (!preview.value) return '';
  return stripHtml(preview.value.material || '');
}

function goDoc() {
  router.push('/m/doc');
}

onMounted(() => {
  fetchList(false);
});
</script>

<template>
  <MobileLayout role="" active="" bottom="none">
    <MobileAppBar title="题库" back back-to="/m/teacher/home">
      <template #right>
        <button type="button" class="iconbtn" aria-label="新建题目（需在电脑端）" @click="newQuestion">
          <MIcon name="plus" />
        </button>
      </template>
    </MobileAppBar>

    <main class="scroll">
      <div class="page mt8">
        <label class="searchbar">
          <MIcon name="search" />
          <input v-model="keyword" type="search" placeholder="搜索题目名称" aria-label="搜索题目名称" enterkeyhint="search" />
        </label>
        <div class="chips-wrap">
          <MChips v-model="typeFilter" :options="typeOptions" label="题型筛选" />
        </div>
      </div>

      <div class="page">
        <MSkeleton v-if="loading && !list.length" variant="card" :count="3" />
        <div v-else-if="errorText" class="banner banner--danger" role="alert">
          <MIcon name="alert" /><div>{{ errorText }}<button type="button" class="banner-link" @click="reload">重试</button></div>
        </div>
        <MEmpty
          v-else-if="!filtered.length"
          icon="book"
          :title="list.length ? '当前筛选没有题目' : '题库还没有题目'"
          :description="list.length ? '切换题型筛选后再看' : '在电脑端新建题目后，这里会显示题目列表'"
        >
          <button type="button" class="btn btn--secondary" @click="goDoc">查看使用文档</button>
        </MEmpty>

        <div v-else class="stack">
          <button
            v-for="item in filtered"
            :key="item.id"
            type="button"
            class="card question-card"
            :aria-label="'预览题目：' + item.title"
            @click="openPreview(item)"
          >
            <div class="question-head">
              <span class="grow question-title">{{ item.title }}</span>
              <MStatusTag :type="item.type === 'project' ? 'accent' : 'info'">{{ typeLabel(item.type) }}</MStatusTag>
            </div>
            <div class="question-meta">
              <span>{{ item.maxScore }} 分</span>
              <span v-if="item._count && item._count.subQuestions">{{ item._count.subQuestions }} 小题</span>
              <span>更新于 {{ formatDateTime(item.createdAt) || '未知' }}</span>
            </div>
            <div class="question-foot">
              <MIcon name="eye" size="sm" />
              <span>只读预览</span>
              <MIcon name="chevron-right" class="chevron" />
            </div>
          </button>

          <button v-if="hasMore" type="button" class="btn btn--secondary btn--block" :disabled="loadingMore" @click="loadMore">
            {{ loadingMore ? '加载中…' : '加载更多' }}
          </button>
        </div>

        <p class="readonly-tip mt16"><MIcon name="info" />移动端仅预览题目，编辑与新建请在电脑端完成。</p>
      </div>
    </main>

    <MSheet v-model:open="previewOpen" :title="preview ? preview.title : '题目预览'" :subtitle="preview ? (typeLabel(preview.type) + ' · ' + preview.maxScore + ' 分') : '只读'">
      <div v-if="previewLoading" class="mt8"><MSkeleton variant="line" :count="5" /></div>
      <div v-else-if="previewError" class="banner banner--danger" role="alert">
        <MIcon name="alert" /><div>{{ previewError }}<button type="button" class="banner-link" @click="retryPreview">重试</button></div>
      </div>
      <template v-else-if="preview">
        <div class="preview-section">
          <h3 class="preview-title">题目材料</h3>
          <p v-if="previewMaterial()" class="preview-text">{{ previewMaterial() }}</p>
          <p v-else class="preview-text subtle">该题目没有文字材料。</p>
        </div>
        <div class="preview-section" v-if="previewSubQuestions().length">
          <h3 class="preview-title">小题（{{ previewSubQuestions().length }}）</h3>
          <div v-for="(sq, index) in previewSubQuestions()" :key="sq.id" class="preview-sub">
            <span class="preview-sub-index">{{ index + 1 }}</span>
            <span class="grow">
              <span class="preview-sub-title">{{ sq.title || ('小题 ' + (index + 1)) }}</span>
              <span class="preview-sub-meta">{{ sq.type === 'objective' ? '客观题' : '编程题' }}<template v-if="sq.score != null"> · {{ sq.score }} 分</template></span>
            </span>
          </div>
        </div>
        <div class="preview-section">
          <h3 class="preview-title">评分标准</h3>
          <p v-if="preview.scoringRubric" class="preview-text">{{ stripHtml(preview.scoringRubric) }}</p>
          <p v-else class="preview-text subtle">该题目未填写评分标准。</p>
        </div>
        <p class="readonly-tip mt12"><MIcon name="lock" />手机端只读；编辑请在电脑端完成。</p>
      </template>
      <template #foot>
        <button type="button" class="btn btn--secondary btn--block" @click="previewOpen = false">关闭</button>
        <button type="button" class="btn btn--primary btn--block" :disabled="!preview" @click="openDesktopEdit">在电脑端编辑</button>
      </template>
    </MSheet>
  </MobileLayout>
</template>

<style scoped>
.chips-wrap { margin-top: 12px; }
.question-card {
  display: block;
  width: 100%;
  text-align: left;
  font: inherit;
  color: inherit;
}
.question-head { display: flex; align-items: flex-start; }
.question-title { min-width: 0; font-size: 15px; font-weight: 600; line-height: 1.45; }
.question-head .tag { margin-left: 10px; }
.question-meta {
  display: flex;
  flex-wrap: wrap;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-tertiary);
}
.question-meta > * + * { margin-left: 14px; }
.question-foot {
  display: flex;
  align-items: center;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-subtle);
  font-size: 12px;
  color: var(--text-tertiary);
}
.question-foot .icon { width: 14px; height: 14px; margin-right: 5px; }
.question-foot .chevron { margin-left: auto; width: 16px; height: 16px; }
.preview-section + .preview-section { margin-top: 18px; }
.preview-title { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
.preview-text { font-size: 13.5px; line-height: 1.65; color: var(--text-secondary); white-space: pre-wrap; }
.preview-text.subtle { color: var(--text-tertiary); }
.preview-sub { display: flex; align-items: flex-start; padding: 8px 0; }
.preview-sub + .preview-sub { border-top: 1px solid var(--border-subtle); }
.preview-sub-index {
  flex: none;
  width: 24px;
  height: 24px;
  margin-right: 8px;
  border-radius: 7px;
  background: var(--bg-selected);
  color: var(--text-brand);
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
.preview-sub-title { display: block; font-size: 13.5px; font-weight: 500; }
.preview-sub-meta { display: block; margin-top: 2px; font-size: 12px; color: var(--text-tertiary); }
</style>
