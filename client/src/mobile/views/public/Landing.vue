<script setup>
/**
 * 移动端官网（/m）—— T3 公共/平台
 *
 * 依据：docs/mobile-app/10-v1-implementation-contract.md §3（公共 6 屏）
 *       docs/mobile-app/05-page-specs.md §3.1-1（public-landing）
 *   · 纯静态营销页：不请求任何接口（契约 §6 白名单外一律不调）；
 *   · 登录态只用于把主 CTA 从「登录控制台」改成「进入移动端」（点击 /m/login 时守卫也会自动回跳）；
 *   · 页面内所有数字均为界面示意，不是真实业务数据（已在卡片下标注「界面示意」）。
 */
import { computed } from 'vue';
import MobileLayout from '../../layout/MobileLayout.vue';
import { MIcon } from '../../components/index.js';
import { useUserStore } from '../../../stores/user.js';
import { mobileHomePath } from '../../routes.js';
import { buildStamp } from '../../../composables/appVersion.js';

const userStore = useUserStore();
const loggedIn = computed(
  () => userStore.isLoggedIn && (userStore.role === 'student' || userStore.role === 'teacher')
);
const ctaTo = computed(() => (loggedIn.value ? mobileHomePath(userStore.role) : '/m/login'));
const ctaLabel = computed(() => (loggedIn.value ? '进入移动端' : '登录控制台'));
// 版本号复用 appVersion.js（真实构建时间戳；dev 下为 dev），不写死
const stamp = buildStamp();
</script>

<template>
  <MobileLayout bottom="none">
    <main class="scroll">
      <!-- 品牌栏 -->
      <header class="lp-top">
        <span class="brandlogo" aria-hidden="true"><MIcon name="logo" /></span>
        <span class="lp-brandname">Deadpan<small>判题</small></span>
        <span class="tag tag--neutral lp-net">校内网</span>
        <RouterLink class="lp-doclink" to="/m/doc" aria-label="查看使用文档">
          <MIcon name="book" /><span>文档</span>
        </RouterLink>
      </header>

      <!-- Hero -->
      <section class="lp-hero">
        <span class="lp-eyebrow"><i class="lp-dot" aria-hidden="true"></i>AI 评分 · 教师终审 · 私有化部署</span>
        <h1 class="lp-title">让 AI 评分<br /><em>可被信任</em></h1>
        <p class="lp-lead">客观题自动批改，主观题与实训工程包由 AI 按评分标准给分、写评语；教师只做终审，成绩一键发布。</p>
        <div class="lp-cta btn-row">
          <RouterLink class="btn btn--primary" :to="ctaTo">{{ ctaLabel }}</RouterLink>
          <RouterLink class="btn btn--secondary" to="/m/doc"><MIcon name="book" />使用文档</RouterLink>
        </div>
        <p class="lp-cta-note"><MIcon name="lock" />工号 / 学号登录 · 数据与模型 Key 留在校园网内</p>
      </section>

      <!-- 评分审核界面示意（营销用，数据为示例） -->
      <section class="page">
        <div class="card lp-shot" aria-label="评分审核界面示意">
          <div class="lp-shot-head">
            <i class="lp-live" aria-hidden="true"></i>评分审核 · 第 5 / 12 份
            <span class="tag tag--info lp-shot-tag">AI 已评分</span>
          </div>
          <div class="lp-shot-body">
            <div class="lp-student">
              <span class="avatar lp-avatar" aria-hidden="true">陈</span>
              <div class="lp-student-main">
                <div class="lp-student-name">陈嘉懿 · 2025010101</div>
                <div class="lp-student-sub">用户管理系统（前端）实训 · 21:40 提交</div>
              </div>
              <div class="lp-score"><b>92</b><small>/100</small></div>
            </div>
            <div class="lp-bars">
              <div class="lp-bar"><span class="lp-bar-k">功能完整</span><span class="bar grow"><i style="width: 90%"></i></span><span class="lp-bar-v">45/50</span></div>
              <div class="lp-bar"><span class="lp-bar-k">代码规范</span><span class="bar grow"><i style="width: 88%"></i></span><span class="lp-bar-v">22/25</span></div>
              <div class="lp-bar"><span class="lp-bar-k">异常处理</span><span class="bar grow"><i style="width: 100%"></i></span><span class="lp-bar-v">25/25</span></div>
            </div>
            <div class="quote lp-comment">思路清晰，边界条件处理到位；建议补充对大数组场景的性能说明。</div>
            <div class="lp-shot-foot">
              <span class="tag tag--success"><i class="dot"></i>教师终审通过</span>
              <span class="tag tag--neutral">周子轩 · 终审</span>
            </div>
          </div>
        </div>
        <p class="lp-shot-note">界面示意 · 示例数据（教师端「评分审核」）</p>
      </section>

      <!-- 三条价值 -->
      <div class="sec"><h2>为什么可被信任</h2><span class="sec-note">AI 给建议，人来拍板</span></div>
      <div class="page">
        <div class="card lp-points">
          <div class="lp-point">
            <span class="rowicon rowicon--success" aria-hidden="true"><MIcon name="check-circle" /></span>
            <div class="lp-point-main">
              <h3>客观题即时判分</h3>
              <p>选择、填空提交即出分；AI 评分结果逐条对应评分标准，教师可改分。</p>
            </div>
          </div>
          <div class="lp-point">
            <span class="rowicon" aria-hidden="true"><MIcon name="review" /></span>
            <div class="lp-point-main">
              <h3>每份提交都有人把关</h3>
              <p>AI 只给分数与评语，最终成绩由教师审核后发布，学生看到的是终审结果。</p>
            </div>
          </div>
          <div class="lp-point">
            <span class="rowicon rowicon--neutral" aria-hidden="true"><MIcon name="lock" /></span>
            <div class="lp-point-main">
              <h3>数据留在校园网</h3>
              <p>私有化部署，模型 Key 与学生数据不出校；公开页不加载任何第三方资源。</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 角色能力 -->
      <div class="sec"><h2>三种角色，各得其所</h2></div>
      <div class="page stack">
        <article class="card lp-role">
          <div class="lp-role-top">
            <span class="lp-role-mark" aria-hidden="true"><MIcon name="review" /></span>
            <div class="lp-role-main"><h3>教师</h3><p>碎片时间清空待办</p></div>
            <span class="tag tag--info">日常主用</span>
          </div>
          <ul class="lp-role-list">
            <li><MIcon name="check" />逐份审核 AI 评分，改分并补评语</li>
            <li><MIcon name="check" />布置作业、查看提交进度</li>
            <li><MIcon name="check" />手机上审核，电脑上编辑代码与题目</li>
          </ul>
        </article>
        <article class="card lp-role">
          <div class="lp-role-top">
            <span class="lp-role-mark lp-role-mark--student" aria-hidden="true"><MIcon name="assignments" /></span>
            <div class="lp-role-main"><h3>学生</h3><p>手机完成客观题作答</p></div>
            <span class="tag tag--success">3 步交卷</span>
          </div>
          <ul class="lp-role-list">
            <li><MIcon name="check" />查看截止时间、继续未完成的作答</li>
            <li><MIcon name="check" />编程题复制链接到电脑继续，不硬写</li>
            <li><MIcon name="check" />查成绩、看逐题得分与 AI 评语</li>
          </ul>
        </article>
        <article class="card lp-role">
          <div class="lp-role-top">
            <span class="lp-role-mark lp-role-mark--admin" aria-hidden="true"><MIcon name="chart" /></span>
            <div class="lp-role-main"><h3>管理员</h3><p>暂请使用电脑端</p></div>
            <span class="tag tag--warning">电脑端</span>
          </div>
          <ul class="lp-role-list">
            <li><MIcon name="check" />移动端 v1 暂不提供管理端页面</li>
            <li><MIcon name="check" />学校 / 班级 / 用户管理请在电脑端完成</li>
            <li><MIcon name="check" />移动管理端将在后续版本提供</li>
          </ul>
        </article>
      </div>

      <!-- 底部 CTA -->
      <div class="page mt24">
        <div class="lp-dark-cta">
          <h3>现在登录，处理今天的待办</h3>
          <p>教师端审核待办 · 学生端作业与成绩，都在一个入口</p>
          <RouterLink class="btn" :to="ctaTo">{{ ctaLabel }}<MIcon name="arrow-right" /></RouterLink>
          <div class="lp-dark-foot"><i class="lp-dark-dot" aria-hidden="true"></i>Deadpan 大学 · 信息中心</div>
        </div>
      </div>

      <!-- 页脚 -->
      <footer class="lp-foot">
        <div class="lp-foot-row">
          <div class="row">
            <span class="brandlogo lp-foot-logo" aria-hidden="true"><MIcon name="logo" /></span>
            <span class="lp-foot-name">Deadpan 判题</span>
          </div>
          <span class="lp-ver">v2.1.0</span>
        </div>
        <p>考试与作业的 AI 评分平台 · 从建题、提交到审核发布，一条链路完成。</p>
        <p>© 2026 Deadpan 大学 · 信息中心 · 仅限校内网访问</p>
        <p class="lp-foot-links">
          <RouterLink class="lp-foot-link" to="/m/doc">使用文档</RouterLink>
          <span aria-hidden="true">·</span>
          <RouterLink class="lp-foot-link" to="/m/login">登录</RouterLink>
        </p>
        <p class="lp-build">构建：{{ stamp }}</p>
      </footer>
    </main>
  </MobileLayout>
</template>

<style scoped>
/* ============ 移动官网页内样式：只用令牌（颜色/字号/间距/圆角均取变量） ============ */
.lp-top { display: flex; align-items: center; padding: 10px var(--m-gutter) 0; }
.lp-brandname { margin-left: 9px; font-size: var(--m-fs-title-3); font-weight: 700; letter-spacing: var(--m-tracking-tight); }
.lp-brandname small { margin-left: 4px; font-size: 11px; font-weight: 500; color: var(--text-tertiary); }
.lp-net { margin-left: 8px; height: 21px; }
.lp-doclink { margin-left: auto; display: inline-flex; align-items: center; justify-content: flex-end; min-height: var(--m-touch-min); padding: 0 2px;
  color: var(--text-secondary); font-size: var(--m-fs-body-sm); font-weight: var(--m-fw-medium); }
.lp-doclink .icon { width: 16px; height: 16px; margin-right: 4px; color: var(--text-tertiary); }

.lp-hero { position: relative; overflow: hidden; padding: 16px var(--m-gutter) 20px; }
.lp-hero::before { content: ""; position: absolute; left: -30px; right: -30px; top: -130px; height: 360px; pointer-events: none;
  background: radial-gradient(300px 210px at 76% 16%, var(--brand-50), transparent 72%); }
html[data-theme="dark"] .lp-hero::before { background: radial-gradient(300px 210px at 76% 16%, var(--brand-800), transparent 72%); opacity: .5; }
.lp-hero > * { position: relative; }
.lp-eyebrow { display: inline-flex; align-items: center; height: 30px; padding: 0 12px; border-radius: var(--m-radius-chip);
  background: var(--status-info-bg); border: 1px solid var(--status-info-bd); color: var(--status-info-fg);
  font-size: var(--m-fs-caption); font-weight: var(--m-fw-medium); letter-spacing: 0.01em; }
.lp-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; margin-right: 6px; }
.lp-title { margin-top: 14px; font-size: calc(var(--fs-display-1) + 2px); line-height: 1.18; font-weight: 700; letter-spacing: -0.03em; color: var(--text-strong); }
.lp-title em { font-style: normal; color: var(--text-brand); }
.lp-lead { margin-top: 12px; font-size: var(--m-fs-body); line-height: 1.68; color: var(--text-secondary); }
.lp-cta { margin-top: 20px; }
.lp-cta .btn { height: var(--m-btn-h); font-size: var(--m-fs-body); }
.lp-cta .btn .icon { width: 17px; height: 17px; }
.lp-cta-note { display: flex; align-items: center; margin-top: 10px; font-size: var(--m-fs-caption); color: var(--text-tertiary); }
.lp-cta-note .icon { width: 13px; height: 13px; margin-right: 5px; flex: none; }

/* 界面示意卡 */
.lp-shot { margin-top: 12px; overflow: hidden; padding: 0; }
.lp-shot-head { display: flex; align-items: center; height: 40px; padding: 0 var(--m-card-pad); background: var(--bg-surface-2);
  border-bottom: 1px solid var(--border-subtle); font-size: var(--m-fs-caption); color: var(--text-tertiary); }
.lp-shot-tag { margin-left: auto; }
.lp-live { width: 6px; height: 6px; border-radius: 50%; background: var(--green-600); margin-right: 6px; flex: none; }
.lp-shot-body { padding: var(--m-card-pad); }
.lp-student { display: flex; align-items: center; }
.lp-avatar { width: 38px; height: 38px; font-size: var(--m-fs-body); }
.lp-student-main { flex: 1; min-width: 0; margin-left: 10px; }
.lp-student-name { font-size: var(--m-fs-body-sm); font-weight: var(--m-fw-semibold); color: var(--text-primary); }
.lp-student-sub { margin-top: 1px; font-size: var(--m-fs-caption); color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lp-score { display: flex; align-items: baseline; color: var(--text-brand); font-variant-numeric: tabular-nums; }
.lp-score b { font-size: 30px; line-height: 1; font-weight: 700; letter-spacing: -0.02em; }
.lp-score small { margin-left: 2px; font-size: var(--m-fs-caption); color: var(--text-tertiary); font-weight: 400; }
.lp-bars { margin-top: 12px; }
.lp-bar { display: flex; align-items: center; font-size: var(--m-fs-caption); color: var(--text-secondary); }
.lp-bar + .lp-bar { margin-top: 8px; }
.lp-bar-k { width: 58px; flex: none; }
.lp-bar .bar { margin: 0 10px; }
.lp-bar-v { width: 46px; flex: none; text-align: right; font-variant-numeric: tabular-nums; color: var(--text-tertiary); }
.lp-comment { margin-top: 12px; font-size: var(--m-fs-body-sm); }
.lp-shot-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; padding-top: 11px; border-top: 1px solid var(--border-subtle); }
.lp-shot-note { margin-top: 8px; font-size: var(--m-fs-caption); color: var(--text-tertiary); text-align: center; }

/* 三条价值 */
.lp-points { padding: 4px var(--m-card-pad); }
.lp-point { display: flex; align-items: flex-start; padding: 14px 0; }
.lp-point + .lp-point { border-top: 1px solid var(--border-subtle); }
.lp-point-main { flex: 1; min-width: 0; margin-left: 12px; }
.lp-point h3 { font-size: var(--m-fs-body); font-weight: var(--m-fw-semibold); color: var(--text-primary); }
.lp-point p { margin-top: 3px; font-size: var(--m-fs-body-sm); line-height: 1.6; color: var(--text-secondary); }

/* 角色能力卡 */
.lp-role { padding: 0; overflow: hidden; }
.lp-role-top { display: flex; align-items: center; padding: 14px var(--m-card-pad) 12px; }
.lp-role-mark { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
  background: var(--bg-selected); color: var(--text-brand); flex: none; }
.lp-role-mark .icon { width: 21px; height: 21px; }
.lp-role-mark--student { background: var(--status-success-bg); color: var(--status-success-fg); }
.lp-role-mark--admin { background: var(--status-warning-bg); color: var(--status-warning-fg); }
.lp-role-main { flex: 1; min-width: 0; margin-left: 12px; }
.lp-role-main h3 { font-size: var(--m-fs-title-3); font-weight: var(--m-fw-semibold); }
.lp-role-main p { margin-top: 1px; font-size: var(--m-fs-caption); color: var(--text-tertiary); }
.lp-role-list { padding: 0 var(--m-card-pad) 14px; }
.lp-role-list li { display: flex; align-items: flex-start; font-size: var(--m-fs-body-sm); line-height: 1.6; color: var(--text-secondary); }
.lp-role-list li + li { margin-top: 5px; }
.lp-role-list .icon { width: 14px; height: 14px; margin: 3px 7px 0 0; flex: none; color: var(--status-success-fg); }

/* 底部深色 CTA */
.lp-dark-cta { position: relative; overflow: hidden; padding: 22px 18px 20px; border-radius: var(--m-radius-card);
  background: var(--gray-950); color: var(--gray-0); }
.lp-dark-cta::before { content: ""; position: absolute; right: -60px; top: -80px; width: 220px; height: 220px; border-radius: 50%;
  background: radial-gradient(circle at center, var(--brand-700), transparent 68%); opacity: .55; }
.lp-dark-cta > * { position: relative; }
.lp-dark-cta h3 { font-size: var(--m-fs-title-2); font-weight: 700; letter-spacing: var(--m-tracking-tight); color: var(--gray-0); }
.lp-dark-cta p { margin-top: 6px; font-size: var(--m-fs-body-sm); line-height: 1.6; color: var(--gray-300); }
.lp-dark-cta .btn { margin-top: 16px; height: var(--m-touch-min); padding: 0 18px; background: var(--gray-0); border-color: var(--gray-0);
  color: var(--brand-700); border-radius: 11px; font-size: var(--m-fs-body-sm); }
.lp-dark-cta .btn .icon { width: 16px; height: 16px; }
.lp-dark-foot { display: flex; align-items: center; margin-top: 14px; font-size: var(--m-fs-caption); color: var(--gray-400); }
.lp-dark-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--green-200); margin-right: 6px; }
html[data-theme="dark"] .lp-dark-cta { background: var(--gray-900); border: 1px solid var(--border-default); }

/* 页脚 */
.lp-foot { margin-top: 28px; padding: 18px var(--m-gutter) 4px; border-top: 1px solid var(--border-subtle); }
.lp-foot-row { display: flex; align-items: center; justify-content: space-between; }
.lp-foot-logo { width: 26px; height: 26px; border-radius: 8px; }
.lp-foot-logo .icon { width: 15px; height: 15px; }
.lp-foot-name { margin-left: 8px; font-size: var(--m-fs-body-sm); font-weight: 700; }
.lp-foot p { margin-top: 8px; font-size: var(--m-fs-caption); line-height: 1.6; color: var(--text-tertiary); }
.lp-foot-links { display: flex; align-items: center; justify-content: center; }
.lp-foot-links span { margin: 0 6px; }
.lp-foot-link { display: inline-flex; align-items: center; min-height: var(--m-touch-min); padding: 0 6px; color: var(--text-link); font-weight: var(--m-fw-medium); }
.lp-build { font-variant-numeric: tabular-nums; opacity: .8; }
.lp-ver { font-size: var(--m-fs-caption); color: var(--text-tertiary); }

@media (max-width: 374px) {
  .lp-title { font-size: var(--fs-display-1); }
  .lp-cta .btn { font-size: var(--m-fs-body-sm); }
}
</style>
