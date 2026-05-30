<template>
  <div class="lc-page">
    <div class="lc-page-inner">
      <!-- 顶部：基本信息 -->
      <div class="lc-top">
        <a-form layout="inline" :model="form">
          <a-form-item><a-input v-model:value="form.title" placeholder="大题标题" style="width:360px; font-size:18px; font-weight:700;" /></a-form-item>
          <a-form-item><a-select v-model:value="form.difficulty" style="width:100px;">
            <a-select-option value="easy">简单</a-select-option>
            <a-select-option value="medium">中等</a-select-option>
            <a-select-option value="hard">困难</a-select-option>
          </a-select></a-form-item>
          <a-form-item label="总分">
            <a-input-number v-model:value="form.maxScore" :min="1" :max="200" style="width:100px;" />
          </a-form-item>
        </a-form>
      </div>

      <!-- 底部：左小题列表 + 右参考答案 -->
      <div class="lc-main" :style="{ '--slide-dir': slideDir }">
        <!-- 左：小题管理 -->
        <div class="lc-left">
          <div class="material-toggle" @click="showMaterial = !showMaterial">
            <span>题目材料</span>
            <a-tag v-if="hasMaterial" color="blue" size="small">已填写</a-tag>
            <a-tag v-else size="small" style="color:#999;border-color:#d9d9d9;">未填写</a-tag>
            <span class="material-arrow" :class="{ open: showMaterial }">▼</span>
          </div>
          <Transition name="collapse">
            <div v-if="showMaterial" class="material-body">
              <div class="material-body-inner">
                <a-form layout="vertical" :model="form">
                  <a-form-item><RichEditor v-model="form.material" placeholder="题目材料（选填，支持富文本）" /></a-form-item>
                  <a-form-item label="附件（暂未开放）">
                    <a-tooltip title="素材上传将在高性能服务器部署后开放，当前教学场景可通过机房极域下发素材">
                      <a-button size="small" disabled>上传 zip</a-button>
                    </a-tooltip>
                    <span v-if="form.attachmentUrl" style="margin-left:8px;font-size:13px;color:var(--ink-muted)">{{ form.attachmentUrl.split('/').pop() }}</span>
                  </a-form-item>
                </a-form>
              </div>
            </div>
          </Transition>
          <div class="lc-left-tabs">
            <TransitionGroup name="sq-list">
              <span v-for="(sq, i) in subQuestions" :key="sq._key"
                :class="['sq-tab', { active: activeIndex === i }]"
                @click="switchTo(i)">
                第{{ i + 1 }}小题
                <a-popconfirm v-if="subQuestions.length > 1" title="确定删除该小题？" ok-text="确定" cancel-text="取消" @confirm="removeSub(i)">
                  <span class="sq-del" @click.stop title="删除小题">×</span>
                </a-popconfirm>
              </span>
            </TransitionGroup>
            <button class="sq-tab sq-add" @click="addSub" title="添加小题">+</button>
          </div>
          <div class="lc-left-body">
            <Transition name="panel-switch" mode="out-in">
              <div :key="activeIndex" class="panel-wrap">
                <a-form layout="vertical" :model="form">
                  <a-row :gutter="16">
                    <a-col :span="16">
                      <a-form-item><a-input v-model:value="form.sqTitle" placeholder="小题标题（选填）" style="font-size:13px;" /></a-form-item>
                    </a-col>
                    <a-col :span="8">
                      <a-form-item><a-input-number v-model:value="form.sqScore" :min="0" :max="form.maxScore" placeholder="分值（不填均分）" style="width:100%;font-size:13px;" /></a-form-item>
                    </a-col>
                  </a-row>
                  <a-form-item class="content-item">
                    <RichEditor v-model="form.content" placeholder="请输入题目描述（支持富文本）" />
                  </a-form-item>
                  <a-form-item>
                    <a-textarea v-model:value="form.scoringCriteria" :rows="3"
                      placeholder="评分标准（若不填写，将使用默认标准：代码正确性60% + 代码效率20% + 代码可读性20%）" />
                  </a-form-item>
                </a-form>
              </div>
            </Transition>
          </div>
        </div>

        <!-- 右：参考答案编辑器 -->
        <div class="lc-right">
          <div class="lc-editor-header">
            <span class="lc-editor-label"><CodeOutlined /> 参考答案</span>
            <Transition name="tag-switch" mode="out-in">
              <a-tag color="blue" style="margin-left:6px;" :key="activeIndex">第 {{ activeIndex + 1 }} 小题</a-tag>
            </Transition>
            <div class="lc-editor-actions">
              <a-select v-model:value="form.language" size="small" style="width:120px;">
                <a-select-option v-for="l in langs" :key="l" :value="l">{{ l }}</a-select-option>
              </a-select>
              <a-button size="small" type="text" @click="formatCode" title="格式化代码">
                <template #icon><span style="font-size:14px;">&#x26A1;</span></template>
              </a-button>
            </div>
          </div>
          <div class="lc-editor-wrap">
            <Transition name="panel-switch" mode="out-in">
              <div :key="activeIndex" class="panel-wrap" style="height:100%;">
                <CodeEditor ref="codeEditorRef" v-model="form.referenceAnswer" :language="form.language" :height="0" />
              </div>
            </Transition>
          </div>
          <div class="lc-footer">
            <a-button size="large" @click="handleCancel">取消</a-button>
            <a-button type="primary" size="large" :loading="saving" @click="handleSave">保存</a-button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import { CodeOutlined } from '@ant-design/icons-vue';
import request from '../../api/request.js';
import CodeEditor from '../../components/CodeEditor.vue';
import RichEditor from '../../components/RichEditor.vue';

const router = useRouter();
const route = useRoute();
const editId = route.params.id || null;
const isEdit = !!editId;
const saving = ref(false);
const codeEditorRef = ref(null);

const form = reactive({
  title: '',
  difficulty: 'easy',
  maxScore: 100,
  material: '',
  attachmentUrl: '',
  sqTitle: '',
  sqScore: null,
  content: '',
  referenceAnswer: '',
  language: 'cpp',
  scoringCriteria: '',
});

const subQuestions = ref([]);
const activeIndex = ref(0);
const slideDir = ref(1);
const showMaterial = ref(false);
const uploading = ref(false);
const uploadFileName = ref('');
const fileInput = ref(null);
let sqKeyCounter = 0;
const hasMaterial = computed(() => {
  const html = form.material || '';
  const text = html.replace(/<[^>]*>/g, '').trim();
  return text.length > 0 || !!form.attachmentUrl;
});
function newSq(data = {}) {
  return { _key: ++sqKeyCounter, title: '', score: null, content: '', referenceAnswer: '', language: 'cpp', scoringCriteria: '', ...data };
}
const langs = ['c', 'cpp', 'csharp', 'java', 'python', 'javascript', 'typescript', 'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'sql', 'shell', 'r', 'scala', 'perl'];

function formatCode() { codeEditorRef.value?.format(); }

function saveDraft() {
  const sq = subQuestions.value[activeIndex.value];
  if (sq) {
    sq.title = form.sqTitle;
    sq.score = form.sqScore;
    sq.content = form.content;
    sq.referenceAnswer = form.referenceAnswer;
    sq.language = form.language;
    sq.scoringCriteria = form.scoringCriteria;
  }
}

function switchTo(index) {
  if (index === activeIndex.value) return;
  loadSq(index);
}

function loadSq(index, dir) {
  if (dir !== 0) saveDraft();
  if (dir == null) dir = index > activeIndex.value ? 1 : -1;
  if (dir !== 0) slideDir.value = dir;
  activeIndex.value = index;
  const sq = subQuestions.value[index];
  if (sq) {
    form.sqTitle = sq.title || '';
    form.sqScore = sq.score ?? null;
    form.content = sq.content || '';
    form.referenceAnswer = sq.referenceAnswer || '';
    form.language = sq.language || 'cpp';
    form.scoringCriteria = sq.scoringCriteria || '';
  }
}

function addSub() {
  saveDraft();
  subQuestions.value.push(newSq());
  loadSq(subQuestions.value.length - 1);
}

function removeSub(index) {
  if (subQuestions.value.length <= 1) return;
  const wasActive = activeIndex.value;
  subQuestions.value.splice(index, 1);
  const newIndex = index < wasActive ? wasActive - 1 : Math.min(wasActive, subQuestions.value.length - 1);
  loadSq(newIndex, wasActive > index ? 1 : -1);
}

async function onFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  uploading.value = true;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const r = await request.post('/teacher/upload-material', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    form.attachmentUrl = r.data.url;
    uploadFileName.value = r.data.name;
    message.success('上传成功');
  } catch { message.error('上传失败'); }
  finally { uploading.value = false; e.target.value = ''; }
}
function removeAttachment() {
  form.attachmentUrl = '';
  uploadFileName.value = '';
}

async function load() {
  if (!isEdit) {
    subQuestions.value = [newSq()];
    loadSq(0, 0);
    return;
  }
  const r = await request.get(`/teacher/questions/${editId}`);
  const q = r.data;
  form.title = q.title;
  form.difficulty = q.difficulty;
  form.maxScore = q.maxScore;
  form.material = q.material || '';
  form.attachmentUrl = q.attachmentUrl || '';
  if (q.material || q.attachmentUrl) showMaterial.value = true;
  uploadFileName.value = q.attachmentUrl ? q.attachmentUrl.split('/').pop() : '';
  subQuestions.value = (q.subQuestions || []).map(sq => newSq({
    id: sq.id,
    title: sq.title || '',
    score: sq.score ?? null,
    content: sq.content,
    referenceAnswer: sq.referenceAnswer,
    language: sq.language,
    scoringCriteria: sq.scoringCriteria || '',
  }));
  if (subQuestions.value.length > 0) loadSq(0, 0);
}

function handleCancel() { router.push('/teacher/questions'); }

async function handleSave() {
  saveDraft();
  if (!form.title.trim()) return message.warn('请输入题目标题');
  if (!subQuestions.value.length) return message.warn('请至少添加一道小题');
  saving.value = true;
  try {
    const payload = {
      title: form.title,
      difficulty: form.difficulty,
      maxScore: form.maxScore,
      material: form.material || undefined,
      attachmentUrl: form.attachmentUrl || undefined,
      subQuestions: subQuestions.value.map(sq => ({
        title: sq.title,
        score: sq.score ?? null,
        content: sq.content,
        referenceAnswer: sq.referenceAnswer,
        language: sq.language,
        scoringCriteria: sq.scoringCriteria || undefined,
      })),
    };
    if (isEdit) {
      await request.put(`/teacher/questions/${editId}`, payload);
    } else {
      await request.post('/teacher/questions', payload);
    }
    message.success(isEdit ? '保存成功' : '创建成功');
    router.push('/teacher/questions');
  } catch { /* handled by interceptor */ }
  finally { saving.value = false; }
}

onMounted(load);
</script>

<style scoped>
.lc-page {
  display: flex; flex-direction: column;
  height: calc(100vh - 52px);
  margin: -28px -48px -40px;
  padding: 0;
  background: var(--canvas-parchment);
}
.lc-page-inner {
  flex: 1; display: flex; flex-direction: column;
  padding: 12px; min-height: 0; gap: 12px;
}

/* 顶部 */
.lc-top {
  flex-shrink: 0;
  background: #fff; border-radius: 12px;
  padding: 16px 24px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.lc-top :deep(.ant-form-inline) { display: flex; align-items: center; gap: 8px; }
.lc-top :deep(.ant-form-item) { margin-bottom: 0; margin-right: 0; }

/* 底部主区域 */
.lc-main {
  flex: 1; display: flex; overflow: hidden; gap: 12px; min-height: 0;
}

/* 左：小题管理 */
.lc-left {
  width: 50%; min-width: 380px;
  background: #fff; border-radius: 12px;
  box-shadow:
    inset 0 8px 12px -12px rgba(0,0,0,0.15),
    inset 0 -8px 12px -12px rgba(0,0,0,0.15),
    0 1px 4px rgba(0,0,0,0.06);
  overflow: hidden; display: flex; flex-direction: column; min-height: 0;
}
.material-toggle {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px;
  font-size: 13px; font-weight: 500; color: #666;
  cursor: pointer; user-select: none;
  border-bottom: 1px solid var(--hairline);
  background: #fafafa;
}
.material-toggle:hover { background: #f0f0f0; }
.material-arrow { margin-left: auto; font-size: 10px; transition: transform 0.2s; }
.material-arrow.open { transform: rotate(180deg); }
.material-body {
  overflow: hidden;
  border-bottom: 1px solid var(--hairline);
}
.material-body-inner { padding: 16px 20px; }

.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.25s ease;
}
.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
}
.collapse-enter-to,
.collapse-leave-from {
  opacity: 1;
  max-height: 600px;
}
.material-body :deep(.tiptap) { min-height: 120px; }
.upload-row { display: flex; align-items: center; gap: 8px; }
.upload-name { font-size: 13px; color: var(--ink-muted); }

.lc-left-tabs {
  display: flex; align-items: center; gap: 4px;
  position: relative;
  padding: 8px 16px;
  border-bottom: 1px solid var(--hairline);
  background: #fafafa;
  flex-shrink: 0;
  overflow-x: auto;
}
.sq-tab {
  display: inline-flex; align-items: center; gap: 4px;
  height: 28px; padding: 0 12px;
  border: 1px solid transparent; border-radius: 6px;
  background: transparent; cursor: pointer;
  font-size: 13px; color: #666;
  white-space: nowrap;
  transition: all 0.15s;
}
.sq-tab:hover { background: #e8e8e8; }
.sq-tab.active {
  background: #fff; border-color: #d9d9d9;
  color: #1677ff; font-weight: 500;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
}
.sq-del {
  font-size: 14px; color: #ccc; line-height: 1;
  margin-left: 2px;
}
.sq-del:hover { color: #ff4d4f; }
.sq-add {
  width: 28px; height: 28px; padding: 0;
  border: none; font-size: 16px; color: #999;
  display: inline-flex; align-items: center; justify-content: center;
}
.sq-add:hover { color: #1677ff; background: #e0edff; }

/* 标签切换动画 */
.tag-switch-enter-active,
.tag-switch-leave-active {
  transition: all 0.15s ease;
}
.tag-switch-enter-from {
  opacity: 0; transform: translateX(calc(-12px * var(--slide-dir)));
}
.tag-switch-leave-to {
  opacity: 0; transform: translateX(calc(12px * var(--slide-dir)));
}

/* 编辑面板切换动画 */
.panel-switch-enter-active,
.panel-switch-leave-active {
  transition: all 0.15s ease;
}
.panel-switch-enter-from {
  opacity: 0; transform: translateX(calc(8px * var(--slide-dir)));
}
.panel-switch-leave-to {
  opacity: 0; transform: translateX(calc(-8px * var(--slide-dir)));
}

/* 小题列表动画 */
.sq-list-enter-active,
.sq-list-leave-active,
.sq-list-move {
  transition: all 0.2s ease;
}
.sq-list-enter-from {
  opacity: 0; transform: scale(0.8);
}
.sq-list-leave-to {
  opacity: 0; transform: scale(0.8);
}
.sq-list-leave-active {
  position: absolute;
}

.lc-left-body {
  padding: 16px 20px;
  flex: 1; overflow-y: auto; min-height: 0;
}
.panel-wrap { flex: 1; min-height: 0; }
.content-item :deep(.tiptap) {
  min-height: calc(100vh - 480px);
}

/* 右：参考答案 */
.lc-right {
  flex: 1; display: flex; flex-direction: column;
  background: #fff; min-width: 400px;
  border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  overflow: hidden; min-height: 0;
}
.lc-editor-header {
  display: flex; align-items: center;
  padding: 0 16px; height: 36px;
  border-bottom: 1px solid var(--hairline);
  background: #fafafa; flex-shrink: 0;
}
.lc-editor-label { font-size: 13px; font-weight: 600; color: var(--ink-muted); }
.lc-editor-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.lc-editor-wrap { flex: 1; overflow: hidden; min-height: 0; }

.lc-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 12px;
  padding: 12px 20px; border-top: 1px solid var(--hairline);
  background: #fafafa; flex-shrink: 0;
}

</style>
