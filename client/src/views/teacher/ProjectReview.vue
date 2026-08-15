<template>
  <div class="review-workspace">
    <!-- 顶部工具栏 -->
    <div class="review-topbar">
      <div class="topbar-left">
        <a-button type="link" @click="$router.push(`/teacher/projects/${projectId}/submissions`)" style="padding:0">
          <ArrowLeftOutlined /> 返回列表
        </a-button>
        <a-divider type="vertical" />
        <span class="student-info">{{ submission?.student?.realName }} ({{ submission?.student?.username }})</span>
      </div>
      <div class="topbar-right">
        <a-button size="small" disabled>上一位</a-button>
        <a-button size="small" disabled>下一位</a-button>
      </div>
    </div>

    <!-- 主体区域：左侧文件树 + 可拖拽分隔条 + 右侧代码区 -->
    <div class="review-main">
      <div class="file-tree-panel" :style="{ width: treeWidth + 'px' }">
        <div class="panel-title">文件结构</div>
        <div class="tree-wrap" v-if="fileTree.length">
          <a-tree
            :tree-data="fileTree"
            :fieldNames="{ children: 'children', title: 'name', key: 'path' }"
            :selectedKeys="selectedFile ? [selectedFile.path] : []"
            defaultExpandAll
            @select="onFileSelect"
            size="small"
            :showIcon="false"
          />
        </div>
        <a-empty v-else description="无文件" :image="false" />
      </div>

      <!-- 拖拽分隔条 -->
      <div class="resize-handle" @mousedown="onResizeStart"></div>

      <!-- 右侧代码区 -->
      <div class="code-panel">
        <div v-if="currentFileContent !== null" class="code-editor-wrap">
          <CodeEditor
            :modelValue="currentFileContent"
            :language="currentLang"
            :readOnly="true"
            :height="0"
          />
        </div>
        <div v-else class="code-placeholder">
          <FileTextOutlined style="font-size:48px;color:#d9d9d9" />
          <p>请从左侧文件树选择文件查看代码</p>
        </div>
      </div>
    </div>

    <!-- 底部评分面板（可折叠） -->
    <div class="review-bottom" :style="{ height: bottomHeight + 'px' }">
      <div class="bottom-handle" @mousedown="onBottomResizeStart">
        <div class="handle-bar"></div>
      </div>
      <div class="bottom-content">
        <a-tabs v-model:activeKey="activeScoreTab" size="small">
          <a-tab-pane key="machine" tab="机器校验">
            <div class="score-panel">
              <div class="score-row">
                <span class="score-label">得分：</span>
                <span class="score-value" :class="machineScoreClass">{{ submission?.machineScore ?? '-' }}</span>
              </div>
              <div class="feedback-box">
                <div class="feedback-title">反馈：</div>
                <div class="feedback-content">{{ submission?.machineFeedback || '暂无' }}</div>
              </div>
            </div>
          </a-tab-pane>
          <a-tab-pane key="ast" tab="AST 分析">
            <div class="score-panel">
              <div class="score-row">
                <span class="score-label">得分：</span>
                <span class="score-value" :class="astScoreClass">{{ submission?.astScore ?? '-' }}</span>
              </div>
              <div class="feedback-box">
                <div class="feedback-title">反馈：</div>
                <div class="feedback-content">{{ submission?.astFeedback || '暂无' }}</div>
              </div>
            </div>
          </a-tab-pane>
          <a-tab-pane key="ai" tab="AI 评审">
            <div class="score-panel">
              <div class="score-row">
                <span class="score-label">得分：</span>
                <span class="score-value" :class="aiScoreClass">{{ submission?.aiScore ?? '-' }}</span>
              </div>
              <div class="feedback-box">
                <div class="feedback-title">评语：</div>
                <div class="feedback-content">{{ submission?.aiFeedback || '暂无' }}</div>
              </div>
            </div>
          </a-tab-pane>
        </a-tabs>

        <!-- 综合得分 + 教师调整 -->
        <div class="review-actions">
          <div class="total-score-section">
            <div class="formula-text">
              综合得分 = 机器{{ (project?.machineWeight || 0.3) * 100 }}% + AST{{ (project?.astWeight || 0.3) * 100 }}% + AI{{ (project?.aiWeight || 0.4) * 100 }}%
            </div>
            <div class="total-score">
              综合得分：<strong>{{ submission?.totalScore != null ? submission.totalScore : '-' }}</strong>
            </div>
          </div>
          <a-divider type="vertical" style="height:60px" />
          <div class="teacher-adjust">
            <a-form layout="inline" size="small">
              <a-form-item label="调整分数">
                <a-input-number
                  v-model:value="finalScore"
                  :min="0"
                  :max="100"
                  :step="0.5"
                  style="width:100px"
                />
              </a-form-item>
              <a-form-item label="评语">
                <a-textarea v-model:value="teacherFeedback" :rows="2" style="width:240px" placeholder="教师评语（可选）" />
              </a-form-item>
              <a-form-item>
                <a-space>
                  <a-button type="primary" size="small" @click="saveReview('reviewed')" :loading="saving">保存</a-button>
                  <a-button type="primary" size="small" @click="saveReview('published')" :loading="saving" style="background:#52c41a;border-color:#52c41a">发布成绩</a-button>
                  <a-button size="small" @click="handleRegrade" :loading="regrading">重新评分</a-button>
                </a-space>
              </a-form-item>
            </a-form>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import { ArrowLeftOutlined, FileTextOutlined } from '@ant-design/icons-vue';
import { getSubmissionDetail, getFileContent, saveReview as saveReviewApi, regrade } from '../../api/projects.js';
import { getLanguage } from '../../utils/fileLang.js';
import CodeEditor from '../../components/CodeEditor.vue';

const route = useRoute();
const projectId = +route.params.id;
const submissionId = +route.params.submissionId;

// 数据
const submission = ref(null);
const project = ref(null);
const fileTree = ref([]);
const selectedFile = ref(null);
const currentFileContent = ref(null);
const currentLang = ref('plaintext');
const activeScoreTab = ref('ai');
const finalScore = ref(null);
const teacherFeedback = ref('');
const saving = ref(false);
const regrading = ref(false);

// 布局
const treeWidth = ref(250);
const bottomHeight = ref(320);
let isResizing = false;
let isBottomResizing = false;

// 计算属性
const machineScoreClass = computed(() => {
  const s = submission.value?.machineScore;
  if (s == null) return '';
  return s >= 80 ? 'score-good' : s >= 60 ? 'score-ok' : 'score-bad';
});
const astScoreClass = computed(() => {
  const s = submission.value?.astScore;
  if (s == null) return '';
  return s >= 80 ? 'score-good' : s >= 60 ? 'score-ok' : 'score-bad';
});
const aiScoreClass = computed(() => {
  const s = submission.value?.aiScore;
  if (s == null) return '';
  return s >= 80 ? 'score-good' : s >= 60 ? 'score-ok' : 'score-bad';
});

// 文件树点击
async function onFileSelect(keys) {
  if (!keys.length) return;
  const node = keys[0];
  if (node.type === 'directory') return;

  selectedFile.value = node;
  currentLang.value = node.language || getLanguage(node.name);

  try {
    const r = await getFileContent(projectId, submissionId, node.path);
    currentFileContent.value = r.data.content;
  } catch {
    message.error('读取文件失败');
  }
}

// 拖拽分隔条
function onResizeStart(e) {
  isResizing = true;
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onResizeEnd);
  e.preventDefault();
}
function onResizeMove(e) {
  if (!isResizing) return;
  const w = Math.max(160, Math.min(500, e.clientX - 260));
  treeWidth.value = w;
}
function onResizeEnd() {
  isResizing = false;
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);
}

// 底部拖拽
function onBottomResizeStart(e) {
  isBottomResizing = true;
  document.addEventListener('mousemove', onBottomResizeMove);
  document.addEventListener('mouseup', onBottomResizeEnd);
  e.preventDefault();
}
function onBottomResizeMove(e) {
  if (!isBottomResizing) return;
  const h = Math.max(200, Math.min(600, window.innerHeight - e.clientY));
  bottomHeight.value = h;
}
function onBottomResizeEnd() {
  isBottomResizing = false;
  document.removeEventListener('mousemove', onBottomResizeMove);
  document.removeEventListener('mouseup', onBottomResizeEnd);
}

// 保存评分
async function saveReview(status) {
  if (finalScore.value == null) return message.warn('请填写调整分数');
  saving.value = true;
  try {
    await saveReviewApi(projectId, submissionId, {
      finalScore: finalScore.value,
      teacherFeedback: teacherFeedback.value,
      status,
    });
    message.success(status === 'published' ? '已发布' : '已保存');
  } catch { /* ignore */ }
  saving.value = false;
}

// 重新评分
async function handleRegrade() {
  regrading.value = true;
  try {
    await regrade(projectId, submissionId);
    message.success('已触发重新评分');
    // 延迟刷新
    setTimeout(() => fetchDetail(), 2000);
  } catch { message.error('重新评分失败'); }
  regrading.value = false;
}

async function fetchDetail() {
  try {
    const r = await getSubmissionDetail(projectId, submissionId);
    submission.value = r.data;
    project.value = r.data.project;
    fileTree.value = r.data.fileTree || [];
    finalScore.value = r.data.finalScore;
    teacherFeedback.value = r.data.teacherFeedback || '';

    // 自动选中第一个文件
    if (fileTree.value.length && !selectedFile.value) {
      const firstFile = findFirstFile(fileTree.value);
      if (firstFile) {
        onFileSelect([firstFile]);
      }
    }
  } catch { /* ignore */ }
}

function findFirstFile(nodes) {
  for (const n of nodes) {
    if (n.type === 'file') return n;
    if (n.children?.length) {
      const f = findFirstFile(n.children);
      if (f) return f;
    }
  }
  return null;
}

onMounted(fetchDetail);
</script>

<style scoped>
.review-workspace {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin: -16px -24px -16px -32px;
}

/* 顶部工具栏 */
.review-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 16px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
}
.topbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.student-info {
  font-weight: 600;
  font-size: 15px;
}
.topbar-right {
  display: flex;
  gap: 8px;
}

/* 主体 */
.review-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 文件树面板 */
.file-tree-panel {
  width: 250px;
  min-width: 160px;
  background: #fafafa;
  border-right: 1px solid #e8e8e8;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.panel-title {
  padding: 10px 12px;
  font-weight: 600;
  font-size: 13px;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
}
.tree-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.tree-wrap :deep(.ant-tree) {
  background: transparent;
}

/* 拖拽分隔条 */
.resize-handle {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.2s;
  flex-shrink: 0;
}
.resize-handle:hover {
  background: #d9d9d9;
}

/* 代码面板 */
.code-panel {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.code-editor-wrap {
  flex: 1;
  overflow: hidden;
}
.code-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #bfbfbf;
  gap: 12px;
}

/* 底部评分面板 */
.review-bottom {
  height: 320px;
  min-height: 200px;
  background: #fff;
  border-top: 1px solid #e8e8e8;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.bottom-handle {
  height: 6px;
  cursor: row-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.bottom-handle:hover {
  background: #f0f0f0;
}
.handle-bar {
  width: 40px;
  height: 2px;
  background: #d9d9d9;
  border-radius: 1px;
}
.bottom-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px;
}

/* 评分面板 */
.score-panel {
  padding: 8px 0;
}
.score-row {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}
.score-label {
  font-size: 13px;
  color: var(--ink-muted);
  margin-right: 8px;
}
.score-value {
  font-size: 24px;
  font-weight: 700;
}
.score-good { color: #52c41a; }
.score-ok { color: #fa8c16; }
.score-bad { color: #ff4d4f; }

.feedback-box {
  background: #fafafa;
  border-radius: 6px;
  padding: 10px 12px;
}
.feedback-title {
  font-size: 12px;
  color: var(--ink-muted);
  margin-bottom: 4px;
}
.feedback-content {
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 底部操作区 */
.review-actions {
  display: flex;
  align-items: center;
  padding: 12px 0;
  gap: 16px;
  border-top: 1px solid #f0f0f0;
  margin-top: 8px;
}
.total-score-section {
  flex-shrink: 0;
}
.formula-text {
  font-size: 12px;
  color: var(--ink-muted);
  margin-bottom: 4px;
}
.total-score {
  font-size: 16px;
}
.teacher-adjust {
  flex: 1;
}
.teacher-adjust :deep(.ant-form-item) {
  margin-bottom: 8px;
}
</style>
