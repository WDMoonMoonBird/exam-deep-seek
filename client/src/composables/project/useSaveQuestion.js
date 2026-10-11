/**
 * useSaveQuestion.js —— 由 client/src/views/teacher/ProjectQuestionEdit.vue 的 <script setup> 拆分而来
 * （step 5 / 批次 B4，源行 523-580）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * ⚠️ 双模式：本文件服务教师端与学生端两条路由，模式常量由接线根唯一创建（不得自行 computed）。
 */

import { message } from 'ant-design-vue';
import request from '../../api/request.js';

export function useSaveQuestion({ form, isEdit, route, router, checker }) {
  // 解构 W4 的返回对象：:529/:530/:550/:532/:541/:546/:559 的引用因此保持逐字
  const { isLoaded, checkerStatus, checkerStale, checkerMeta, ensureCheckerState, openCheckerModal } = checker;

async function handleSave() {
  if (!form.title) return message.warn('请输入题目名称');

  // 保存守卫（2026-08-18）：实训题必须有已确认启用的自动评分器；新建题首次保存放行（评分器按题目 id 生成）
  if (isEdit.value) {
    if (!isLoaded()) await ensureCheckerState();
    const st = checkerStatus.value;
    if (checkerStale.value) {
      message.warning('标准工程包已更换，请重新生成自动评分器');
      openCheckerModal();
      return;
    }
    if (st === 'generating' || st === 'calibrating') {
      message.warning('自动评分器生成中，请稍候再保存');
      return;
    }
    if (st === 'review') {
      message.warning('自动评分器已生成但未确认启用，请打开自动评分器完成确认');
      openCheckerModal();
      return;
    }
    if (st !== 'ready') {
      message.warning('请先生成自动评分器（当前状态：' + st + '）');
      openCheckerModal();
      return;
    }
    // 输入一致性：评分标准/满分/题目描述变更 → 评分器过期（描述为 HTML，双方去标签后比较）
    const snap = checkerMeta.value?.inputsSnapshot;
    if (snap) {
      const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
      const changed = [];
      if (String(snap.rubric || '') !== String(form.scoringRubric || '').trim()) changed.push('评分标准');
      if (Number(snap.maxScore) !== Number(form.maxScore)) changed.push('满分');
      if (stripHtml(snap.description) !== stripHtml(form.description)) changed.push('题目描述');
      if (changed.length) {
        message.warning('已变更：' + changed.join('、') + '，请重新生成自动评分器');
        openCheckerModal();
        return;
      }
    }
  }

  const payload = { title: form.title, difficulty: form.difficulty, maxScore: form.maxScore, type: 'project', material: form.description, scoringRubric: form.scoringRubric };
  try {
    if (isEdit.value) {
      await request.put(`/teacher/questions/${route.params.id}`, payload);
      message.success('保存成功');
    } else {
      // 标准工程包可选：未上传即开放性题目（attachmentUrl 为 null），payload 不携带 tempId
      if (form.tempId) payload.tempId = form.tempId;
      await request.post('/teacher/questions', payload);
      message.success('创建成功，请为该题生成自动评分器');
    }
    router.push('/teacher/questions');
  } catch (e) {
    message.error('保存失败：' + (e.response?.data?.message || e.message));
  }
}

  return { handleSave };
}

export default useSaveQuestion;
