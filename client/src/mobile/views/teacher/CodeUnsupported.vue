<script setup>
/**
 * 手机编辑说明页 —— v1 零后端版
 *
 * 依据：10-v1-implementation-contract §3/§6/§7.7、05-page-specs 屏 31、09 §4 接力降级口径。
 * v1 只承诺「复制需登录的电脑端链接」：不出现免登录 token / 10 分钟有效 / 已同步等延期能力；
 * 链接目标按 ?submissionId= 定位到题目编辑页（失败回退题库列表），不请求任何新接口。
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import { MIcon } from '../../components/index.js';
import request from '../../../api/request.js';
import { useSafeRequest } from '../../../composables/useSafeRequest.js';
import { useMobileToast } from '../../composables/useMobileToast.js';
import { withAppBase } from '../../../domain/appPath.js';

const route = useRoute();
const router = useRouter();
const toast = useMobileToast();
const { safeLoad } = useSafeRequest({ tag: 'MobileTeacherCodeUnsupported.vue', action: '加载说明' });

const submissionId = computed(() => {
  const n = Number(route.query.submissionId);
  return Number.isInteger(n) && n > 0 ? n : null;
});
const desktopUrl = ref(withAppBase('/teacher/questions'));
const questionTitle = ref('');
const locating = ref(false);
const copyDone = ref(false);
const locateError = ref('');

const backTo = computed(() => (submissionId.value
  ? '/m/teacher/review/' + submissionId.value + '/code'
  : '/m/teacher/review'));

async function locateQuestion() {
  if (!submissionId.value) return;
  locating.value = true;
  locateError.value = '';
  const r = await safeLoad(
    () => request.get('/teacher/submissions/' + submissionId.value, { silent: true }),
    { notify: false }
  );
  locating.value = false;
  if (r.error) {
    locateError.value = r.message || '无法定位题目，将打开题库列表';
    return;
  }
  const data = r.data || {};
  const question = data.question || {};
  if (!question.id) {
    locateError.value = '无法定位题目，将打开题库列表';
    return;
  }
  questionTitle.value = question.title || '';
  desktopUrl.value = withAppBase(
    question.type === 'project'
      ? '/teacher/questions/' + question.id + '/edit-project'
      : '/teacher/questions/' + question.id + '/edit'
  );
}

async function copyLink() {
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(desktopUrl.value);
      ok = true;
    }
  } catch { /* 回退旧接口 */ }
  if (!ok) {
    try {
      const ta = document.createElement('textarea');
      ta.value = desktopUrl.value;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch { ok = false; }
  }
  copyDone.value = ok;
  toast.show(ok ? '已复制电脑端链接，登录后打开即可编辑' : '复制失败，请长按链接手动复制');
}

function openDesktop() {
  window.location.assign(desktopUrl.value);
}

onMounted(locateQuestion);
</script>

<template>
  <MobileLayout role="" active="" bottom="actionbar">
    <MobileAppBar title="编辑标准答案" back :back-to="backTo" />

    <main class="scroll">
      <div class="page mt8">
        <div class="hero-icon" aria-hidden="true"><MIcon name="code" /></div>
        <h2 class="page-heading">手机不提供代码编辑</h2>
        <p class="page-sub">编辑标准答案需要连续输入与调试。为保证准确性与效率，手机端只做只读预览，请在电脑端完成编辑。</p>

        <div class="card mt16">
          <div class="card-title mb8">为什么不支持</div>
          <div class="reason-row">
            <span class="rowicon rowicon--warning" aria-hidden="true"><MIcon name="edit" /></span>
            <div>
              <div class="reason-title">软键盘会遮挡行号与缩进</div>
              <div class="reason-sub">代码需要精确缩进，手机输入法的自动纠错容易破坏语法。</div>
            </div>
          </div>
          <div class="reason-row">
            <span class="rowicon rowicon--warning" aria-hidden="true"><MIcon name="code" /></span>
            <div>
              <div class="reason-title">没有补全与语法检查</div>
              <div class="reason-sub">无法提示 API、括号匹配与编译错误，改错成本远高于电脑。</div>
            </div>
          </div>
          <div class="reason-row">
            <span class="rowicon rowicon--warning" aria-hidden="true"><MIcon name="alert" /></span>
            <div>
              <div class="reason-title">误触可能破坏测试用例</div>
              <div class="reason-sub">评分标准与标准工程包关联评分链路，一次误删可能影响整题判分。</div>
            </div>
          </div>
        </div>
      </div>

      <div class="sec"><h2>接力到电脑</h2><span class="sec-note">需登录</span></div>

      <div class="page stack">
        <div class="card">
          <div class="card-title">复制链接，在电脑上编辑</div>
          <p class="relay-desc">{{ questionTitle ? '当前题目：' + questionTitle : '将打开题库列表，再选择题目编辑。' }}</p>
          <div class="link-box">
            <MIcon name="link" />
            <span class="link-text">{{ desktopUrl }}</span>
          </div>
          <div class="relay-actions">
            <button type="button" class="btn btn--secondary" @click="copyLink">
              <MIcon name="copy" />复制链接
            </button>
            <button type="button" class="btn btn--primary" @click="openDesktop">
              <MIcon name="external" />在电脑上打开
            </button>
          </div>
          <p v-if="copyDone" class="copy-note" role="status">已复制。请在电脑浏览器中登录同一账号后打开。</p>
          <p v-if="locating" class="copy-note">正在定位当前题目…</p>
          <p v-if="locateError" class="copy-note warn">{{ locateError }}</p>
        </div>

        <div class="banner banner--warning">
          <MIcon name="alert" />
          <div><b>手机端不会缓存编辑内容。</b>请以电脑端保存结果为准；链接需要登录同一账号后才能打开。</div>
        </div>

        <p class="readonly-tip"><MIcon name="info" />文件上传、标准工程包管理同样请在电脑端完成。</p>

        <button type="button" class="btn btn--ghost btn--block" @click="router.push(backTo)">返回代码页</button>
      </div>
    </main>

    <div class="actionbar">
      <button type="button" class="btn btn--primary btn--block" @click="openDesktop">
        <MIcon name="external" />在电脑上打开
      </button>
    </div>
  </MobileLayout>
</template>

<style scoped>
.hero-icon {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: var(--bg-selected);
  color: var(--text-brand);
  display: flex;
  align-items: center;
  justify-content: center;
}
.hero-icon .icon { width: 26px; height: 26px; }
.page-heading {
  margin-top: 14px;
  font-size: var(--m-fs-title-1);
  line-height: var(--m-lh-title-1);
  font-weight: 700;
  letter-spacing: var(--m-tracking-tight);
  color: var(--text-strong);
}
.page-sub { margin-top: 6px; font-size: 13px; line-height: 1.6; color: var(--text-secondary); }
.reason-row { display: flex; align-items: flex-start; padding: 9px 0; }
.reason-row + .reason-row { border-top: 1px solid var(--border-subtle); }
.reason-title { font-size: 14px; font-weight: 500; line-height: 1.4; }
.reason-sub { margin-top: 2px; font-size: 12px; line-height: 1.55; color: var(--text-tertiary); }
.relay-desc { margin-top: 6px; font-size: 12.5px; line-height: 1.55; color: var(--text-secondary); }
.link-box {
  display: flex;
  align-items: center;
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-sunken);
  color: var(--text-secondary);
  font-size: 12px;
}
.link-box .icon { width: 15px; height: 15px; margin-right: 8px; flex: none; }
.link-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.relay-actions { display: flex; margin-top: 12px; }
.relay-actions .btn { flex: 1; }
.relay-actions .btn + .btn { margin-left: 10px; }
.copy-note { margin-top: 10px; font-size: 12px; color: var(--text-tertiary); }
.copy-note.warn { color: var(--status-warning-fg); }
</style>
