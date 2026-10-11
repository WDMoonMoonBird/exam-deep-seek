/**
 * useQuestionForm.js —— 由 client/src/views/teacher/ProjectQuestionEdit.vue 的 <script setup> 拆分而来
 * （step 5 / 批次 B2，源行 232-233 / 256-264 / 410-430）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * ⚠️ 双模式：本文件服务教师端与学生端两条路由，模式常量由接线根唯一创建（不得自行 computed）。
 */

import { ref, reactive, computed } from 'vue';
import DOMPurify from 'dompurify';

export function useQuestionForm() {

const showDescModal = ref(false);
const showRubricModal = ref(false);

// 注：本分支曾于 2026-08-18 按「教师零成本」原则移除「查看 AI 提示词」功能；合并时保留 master 的既有功能（不让合并替产品做决定）。如需下线请另行决策。
// 模态框草稿（确定才写回 form，取消即还原）
const descDraft = ref('');
const rubricDraft = ref('');

function openDescModal() { descDraft.value = form.description; showDescModal.value = true; }
function openRubricModal() { rubricDraft.value = form.scoringRubric; showRubricModal.value = true; }
function confirmDesc() { form.description = descDraft.value; showDescModal.value = false; }
function confirmRubric() { form.scoringRubric = rubricDraft.value; showRubricModal.value = false; }

const form = reactive({
  title: '',
  difficulty: 'medium',
  maxScore: 100,
  description: '',
  scoringRubric: '',
  packageFile: null,
  tempId: '',
});

/** T4-F2 类别收口（动态预置色）：学生只读态的难度徽标里 easy→green 亮 3.37:1、medium→orange 亮 3.34:1
 *  不达 AA → 改走全局语义类；hard→red 亮 5.11:1 达标，保持 antd 预置色不动。
 *  （语义类选择器 0-2-1 高于 .ant-tag-<预设色>，三色由类接管，盒模型不变。） */
const difficultyTagClass = computed(() => (form.difficulty === 'easy' ? 'tag-success' : form.difficulty === 'medium' ? 'tag-warning' : null));

// 学生端只读渲染题目描述：教师 RichEditor 产出的 HTML 可能携带脚本，渲染前必须用 DOMPurify 净化
const safeDescriptionHtml = computed(() => {
  const html = form.description || '';
  if (!html) return '<p style="color:var(--text-tertiary)">暂无题目描述</p>';
  return DOMPurify.sanitize(html);
});

  return {
    form, difficultyTagClass, safeDescriptionHtml,
    showDescModal, showRubricModal, descDraft, rubricDraft,
    openDescModal, openRubricModal, confirmDesc, confirmRubric,
  };
}

export default useQuestionForm;
