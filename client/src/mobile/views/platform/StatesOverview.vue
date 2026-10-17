<script setup>
/**
 * 状态体系样板（/m/platform/states）—— T3 公共/平台
 *
 * 依据：10-v1-implementation-contract.md §3（平台与状态 3 屏）
 *       docs/mobile-app/05-page-specs.md §3.5-37
 *   · 把空态 / 加载 / 错误 / 断网四态做成同屏样板，供各列表页对照实现；
 *   · 纯静态 mock（不请求接口、不造业务数据），页内按钮只演示状态切换。
 */
import { onBeforeUnmount, ref } from 'vue';
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import { MEmpty, MIcon, MSeg, MSkeleton } from '../../components/index.js';

const STATE_OPTIONS = [
  { label: '空态', value: 'empty' },
  { label: '加载中', value: 'loading' },
  { label: '错误', value: 'error' },
  { label: '断网', value: 'offline' },
];
const state = ref('empty');

let demoTimer = null;
function clearDemoTimer() {
  if (demoTimer) clearTimeout(demoTimer);
  demoTimer = null;
}
onBeforeUnmount(clearDemoTimer);

function selectState(next) {
  clearDemoTimer();
  state.value = next;
}

/** 演示「重试 → 骨架 → 结果」的真实时序；仅本样板页使用 */
function demoReload(next) {
  clearDemoTimer();
  state.value = 'loading';
  demoTimer = setTimeout(() => {
    demoTimer = null;
    state.value = next;
  }, 900);
}
</script>

<template>
  <MobileLayout bottom="none">
    <MobileAppBar title="状态体系" back back-to="/m">
      <template #right><span class="tag tag--neutral">四态</span></template>
    </MobileAppBar>

    <main class="scroll">
      <header class="st-head">
        <h2 class="st-title">一套状态，覆盖所有列表页</h2>
        <p class="st-sub">空态、加载、错误、断网 —— 每个列表与详情页都必须具备，且文案要告诉用户下一步做什么。</p>
      </header>

      <div class="st-seg">
        <MSeg :model-value="state" :options="STATE_OPTIONS" label="状态类型" @update:model-value="selectState" />
      </div>

      <!-- ① 空态 -->
      <section v-show="state === 'empty'" class="st-panel" aria-label="空态">
        <p class="st-note">
          <MIcon name="info" aria-hidden="true" />
          <span><b>空态</b>先解释为什么为空，再给一个能继续的动作。</span>
        </p>
        <div class="st-demo">
          <div class="st-demo-head"><span class="st-demo-title">我的作业</span><span class="tag tag--neutral">共 0 项</span></div>
          <div class="st-demo-body">
            <MEmpty icon="inbox" title="还没有待办作业" description="老师发布新作业后会出现在这里；今晚 23:59 前截止的作业会优先提醒。">
              <button type="button" class="btn btn--primary" @click="demoReload('empty')">重新加载</button>
            </MEmpty>
          </div>
        </div>
        <div class="st-spec">
          <div class="st-spec-head"><MIcon name="check-circle" aria-hidden="true" />使用说明</div>
          <p>空态不是错误：用<b>图标 + 一句「为什么为空」+ 一个主操作</b>把用户带到下一步，不要只写「暂无数据」。</p>
          <div class="st-spec-chips">
            <span class="tag tag--neutral">说明 ≤ 2 行</span>
            <span class="tag tag--neutral">主按钮唯一</span>
            <span class="tag tag--neutral">不误导为加载失败</span>
          </div>
        </div>
      </section>

      <!-- ② 加载中 -->
      <section v-show="state === 'loading'" class="st-panel" aria-label="加载中">
        <p class="st-note">
          <MIcon name="info" aria-hidden="true" />
          <span><b>加载中</b>骨架按真实内容的结构排列，减少等待焦虑。</span>
        </p>
        <div class="st-demo">
          <div class="st-demo-head"><span class="st-demo-title">我的作业</span><span class="tag tag--info"><i class="dot"></i>加载中</span></div>
          <div class="st-demo-body">
            <div class="st-sk-chips" aria-hidden="true">
              <span class="sk" style="width: 58px; height: 34px; border-radius: var(--m-radius-chip)"></span>
              <span class="sk" style="width: 76px; height: 34px; border-radius: var(--m-radius-chip)"></span>
              <span class="sk" style="width: 84px; height: 34px; border-radius: var(--m-radius-chip)"></span>
              <span class="sk" style="width: 64px; height: 34px; border-radius: var(--m-radius-chip)"></span>
            </div>
            <div class="st-sk-wrap">
              <MSkeleton variant="card" :count="3" />
            </div>
            <p class="sr-only" role="status">正在加载作业列表</p>
          </div>
        </div>
        <div class="st-spec">
          <div class="st-spec-head"><MIcon name="check-circle" aria-hidden="true" />使用说明</div>
          <p>首次加载用<b>骨架屏</b>而不是转圈：骨架形状要与真实卡片一致，避免内容出现时跳动。</p>
          <div class="st-spec-chips">
            <span class="tag tag--neutral">骨架 ≥ 3 条</span>
            <span class="tag tag--neutral">保留页面标题</span>
            <span class="tag tag--neutral">读屏播报加载中</span>
          </div>
        </div>
      </section>

      <!-- ③ 错误 -->
      <section v-show="state === 'error'" class="st-panel" aria-label="错误">
        <p class="st-note">
          <MIcon name="info" aria-hidden="true" />
          <span><b>错误态</b>说明发生了什么、是否影响数据，并给出重试入口。</span>
        </p>
        <div class="st-demo">
          <div class="st-demo-head"><span class="st-demo-title">我的作业</span><span class="tag tag--danger"><i class="dot"></i>加载失败</span></div>
          <div class="st-demo-body">
            <div class="errorbox">
              <div class="st-err-icon" aria-hidden="true"><MIcon name="x-circle" /></div>
              <h3>作业加载失败</h3>
              <p>请求超时，请检查网络后重试。已提交的作业不会丢失。</p>
              <button type="button" class="btn btn--primary" @click="demoReload('error')">重新加载</button>
            </div>
          </div>
        </div>
        <div class="st-spec">
          <div class="st-spec-head"><MIcon name="check-circle" aria-hidden="true" />使用说明</div>
          <p>错误文案要分清「发生了什么」和「我的数据是否安全」；<b>错误码放在小字</b>，主操作只留一个重试。</p>
          <div class="st-spec-chips">
            <span class="tag tag--neutral">人话 + 错误码</span>
            <span class="tag tag--neutral">重试主按钮</span>
            <span class="tag tag--neutral">数据安全说明</span>
          </div>
        </div>
      </section>

      <!-- ④ 断网 -->
      <section v-show="state === 'offline'" class="st-panel" aria-label="断网">
        <p class="st-note">
          <MIcon name="info" aria-hidden="true" />
          <span><b>断网态</b>离线横幅显性提示，缓存内容保持可读，并说明恢复后的行为。</span>
        </p>
        <div class="st-demo">
          <div class="st-demo-head"><span class="st-demo-title">我的作业</span><span class="tag tag--warning"><i class="dot"></i>离线</span></div>
          <div class="st-demo-body">
            <div class="banner banner--danger st-offline-banner" role="alert">
              <MIcon name="wifi-off" />
              <div><b>网络连接失败</b>：请检查网络后重试；本版本不提供离线缓存，恢复网络后才能加载最新内容。</div>
            </div>
            <div class="st-cache-list" aria-hidden="true">
              <div class="st-cache-row">
                <div class="grow"><b>数据结构实验三：图的最短路径</b><span>进行中 · 6 题已答 4 题</span></div>
                <span class="tag tag--neutral">示例</span>
              </div>
              <div class="st-cache-row">
                <div class="grow"><b>Java 程序设计期末考试</b><span>已评分 · 12 题</span></div>
                <span class="tag tag--neutral">示例</span>
              </div>
              <div class="st-cache-row">
                <div class="grow"><b>数据库原理期中测验</b><span>未开始 · 20 题</span></div>
                <span class="tag tag--neutral">示例</span>
              </div>
            </div>
            <button type="button" class="btn btn--secondary btn--block st-offline-btn" @click="demoReload('empty')">已恢复网络，重试</button>
          </div>
        </div>
        <div class="st-spec">
          <div class="st-spec-head"><MIcon name="check-circle" aria-hidden="true" />使用说明</div>
          <p>断网态要<b>显性提示离线</b>并给出恢复路径；v1 没有离线缓存，因此不要声称「已缓存可见」。</p>
          <div class="st-spec-chips">
            <span class="tag tag--neutral">离线横幅</span>
            <span class="tag tag--neutral">恢复后重试</span>
            <span class="tag tag--neutral">不造假缓存</span>
          </div>
        </div>
      </section>

      <p class="st-foot">四态检查项：每个列表页 / 每块列表卡片 / 每个详情页<br />Deadpan 判题 v2.1.0 · 本页为四态样板，按钮仅演示状态切换</p>
    </main>
  </MobileLayout>
</template>

<style scoped>
/* ============ 四态样板页样式：只用令牌 ============ */
.st-head { padding: 14px var(--m-gutter) 0; }
.st-title { font-size: var(--m-fs-title-1); line-height: 1.3; font-weight: 700; letter-spacing: var(--m-tracking-tight); color: var(--text-strong); }
.st-sub { margin-top: 5px; font-size: var(--m-fs-body-sm); line-height: 1.55; color: var(--text-secondary); }
.st-seg { margin: 16px var(--m-gutter) 0; }

.st-panel { margin-top: 14px; }
.st-note { display: flex; align-items: flex-start; margin: 0 var(--m-gutter); font-size: var(--m-fs-body-sm); line-height: 1.6; color: var(--text-secondary); }
.st-note b { margin-right: 7px; color: var(--text-primary); font-weight: var(--m-fw-semibold); }
.st-note .icon { width: 15px; height: 15px; margin: 2px 5px 0 0; flex: none; color: var(--text-brand); }

.st-demo { margin: 12px var(--m-gutter) 0; border: 1px solid var(--border-default); border-radius: var(--m-radius-card); overflow: hidden;
  background: var(--bg-surface); box-shadow: var(--shadow-xs); }
.st-demo-head { display: flex; align-items: center; justify-content: space-between; padding: 11px var(--m-card-pad);
  background: var(--bg-surface-2); border-bottom: 1px solid var(--border-subtle); }
.st-demo-title { font-size: 14px; font-weight: var(--m-fw-semibold); color: var(--text-primary); }
.st-demo-body { padding: 6px 14px 14px; }
.st-demo .empty { padding: 30px 10px 24px; }
.st-demo .empty h3 { margin-top: 14px; }
.st-demo .empty p { margin-bottom: 18px; }

.st-sk-chips { display: flex; padding: 10px 0 2px; }
.st-sk-chips .sk { height: 34px; border-radius: var(--m-radius-chip); }
.st-sk-chips .sk + .sk { margin-left: 8px; }
.st-sk-wrap { margin-top: 10px; }
.st-sk-wrap :deep(.sk-card) { border-color: var(--border-subtle); box-shadow: none; }

.st-err-icon { width: 76px; height: 76px; border-radius: 50%; background: var(--status-danger-bg); color: var(--status-danger-fg);
  display: flex; align-items: center; justify-content: center; margin: 0 auto; }
.st-err-icon .icon { width: 32px; height: 32px; }
.st-demo .errorbox { padding: 26px 10px 20px; }
.st-demo .errorbox p { margin-bottom: 18px; }

.st-offline-banner { margin: 10px 0 4px; }
.st-cache-list { margin-top: 4px; }
.st-cache-row { display: flex; align-items: flex-start; padding: 12px 0; opacity: 0.55; }
.st-cache-row + .st-cache-row { border-top: 1px solid var(--border-subtle); }
.st-cache-row .grow { min-width: 0; }
.st-cache-row b { display: block; font-size: var(--m-fs-body); font-weight: var(--m-fw-medium); color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-cache-row span { display: block; margin-top: 2px; font-size: var(--m-fs-caption); color: var(--text-secondary); }
.st-cache-row .tag { flex: none; margin-left: 10px; margin-top: 1px; }
.st-offline-btn { margin-top: 14px; }

.st-spec { margin: 12px var(--m-gutter) 0; padding: 13px 14px; background: var(--bg-surface-2); border: 1px solid var(--border-subtle); border-radius: var(--m-radius-card-sm); }
.st-spec-head { display: flex; align-items: center; font-size: var(--m-fs-caption); font-weight: var(--m-fw-semibold); color: var(--text-secondary); letter-spacing: 0.02em; }
.st-spec-head .icon { width: 14px; height: 14px; margin-right: 5px; color: var(--text-brand); }
.st-spec p { margin-top: 6px; font-size: var(--m-fs-body-sm); line-height: 1.6; color: var(--text-secondary); }
.st-spec p b { color: var(--text-primary); font-weight: var(--m-fw-semibold); }
.st-spec-chips { display: flex; flex-wrap: wrap; margin-top: 8px; }
.st-spec-chips .tag { margin: 0 6px 6px 0; height: 21px; }

.st-foot { margin-top: 18px; padding: 16px var(--m-gutter) 0; border-top: 1px solid var(--border-subtle); text-align: center; font-size: 11px; line-height: 1.7; color: var(--text-tertiary); }
</style>
