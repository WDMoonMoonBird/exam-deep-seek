<template>
  <ManualStep
    :steps="scene.steps"
    :caption="scene.caption"
    :aria-label="scene.ariaLabel"
    :fallback="fallback"
    fallback-alt="题库管理列表页与「新建题目」编辑页截图"
  >
    <template #default="{ step }">
      <DemoFrame chrome="window" title="Deadpan 判题 · 题库管理" :design="720">
        <!-- 两个视图叠在同一个网格单元（grid-area: 1/1）：切换只改透明度，容器高度不跳；
             且两层**始终挂载** —— 正在淡出的那一层也能收到 step 的新状态（v-if 会切断 patch，
             第 2 步「编程题」的高亮就会画不出来）。 -->
        <div class="stage">
          <!-- ================= 视图 A：题库列表（第 0~1 步，第 4 步回到这里） ================= -->
          <section class="view view-list" :class="{ 'is-out': step === 2 || step === 3 }">
            <div class="pg-head">
              <div class="pg-titles">
                <b class="pg-title">题库管理</b>
                <span class="dm-sub">管理你的编程题与实训题；布置作业时从这里选题。</span>
              </div>

              <!-- 新增题目：与真实页同款「图标 + 主标题 + 副说明」两行下拉，展开时箭头转 180° -->
              <span class="dm-btn is-primary dm-target add-btn" :class="{ 'is-hot': step === 1 }">
                新增题目
                <svg class="caret" :class="{ up: step === 1 || step === 2 }" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4.2 6.3 8 10.1l3.8-3.8" />
                </svg>
                <i v-if="step === 1" class="dm-cursor is-on" />
              </span>

              <Transition name="dm-fade">
                <div v-if="step === 1 || step === 2" class="nq-menu">
                  <div class="nq-item dm-target" :class="{ 'is-hot': step === 2 }">
                    <svg class="nq-ico" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M5.8 4.4 3.1 8l2.7 3.6M10.2 4.4 13 8l-2.7 3.6" />
                    </svg>
                    <span class="nq-txt"><b>编程题</b><span class="dm-sub">在线作答 · AI 评分</span></span>
                    <i v-if="step === 2" class="dm-cursor is-on" />
                  </div>
                  <div class="nq-item">
                    <svg class="nq-ico" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M1.8 4.3h3.3l1.3 1.6h7.8v5.8H1.8z" />
                    </svg>
                    <span class="nq-txt">
                      <b>实训题 <span class="beta">BETA</span></b>
                      <span class="dm-sub">上传标准工程包 · 评价式评分</span>
                    </span>
                  </div>
                </div>
              </Transition>

              <!-- 保存成功的提示：antd message 在窗口顶部居中 -->
              <Transition name="toast">
                <div v-if="step === 4" class="toast-wrap"><span class="dm-toast">✓ 创建成功</span></div>
              </Transition>
            </div>

            <div class="tb-bar">
              <span class="dm-input is-ph search">
                <svg class="ico" viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="7.1" cy="7.1" r="4.3" /><path d="M10.4 10.4 14 14" />
                </svg>
                搜索题目标题
              </span>
              <span class="grow" />
              <span class="dm-sub">共 {{ step === 4 ? 5 : 4 }} 道</span>
            </div>

            <div class="tb dm-surface">
              <div class="tb-row is-head">
                <span>标题</span><span>类型</span><span>难度</span>
                <span class="ta-r">满分</span><span>创建时间</span><span class="ta-r">操作</span>
              </div>
              <Transition name="dm-fade">
                <div v-if="step === 4" class="tb-row is-new">
                  <span class="stack"><b>二分查找与复杂度分析</b><span>编程题 · 1 个小题</span></span>
                  <span><span class="dm-tag is-info">编程题</span></span>
                  <span><span class="dm-tag is-warning"><i class="dot" />中等</span></span>
                  <span class="ta-r num">20<u>分</u></span>
                  <span class="stack is-plain"><b>2026-10-12</b><span>23:26</span></span>
                  <span class="ta-r acts"><span class="lnk">编辑</span><span class="lnk is-danger">删除</span></span>
                </div>
              </Transition>
              <div v-for="r in rows" :key="r.title" class="tb-row">
                <span class="stack"><b>{{ r.title }}</b><span>{{ r.sub }}</span></span>
                <span><span class="dm-tag" :class="r.typeCls">{{ r.type }}</span></span>
                <span><span class="dm-tag" :class="r.diffCls"><i class="dot" />{{ r.diff }}</span></span>
                <span class="ta-r num">{{ r.score }}<u>分</u></span>
                <span class="stack is-plain"><b>{{ r.date }}</b><span>{{ r.time }}</span></span>
                <span class="ta-r acts"><span class="lnk">编辑</span><span class="lnk is-danger">删除</span></span>
              </div>
              <!-- 表格底栏：真实 ListPage 的 table-foot（第 N 页 · 每页 20 条 + 分页器） -->
              <div class="tb-foot">
                <span class="dm-sub">第 1 页 · 每页 20 条</span>
                <span class="grow" />
                <span class="pager">
                  <span class="pg is-nav">‹</span>
                  <span class="pg is-on">1</span>
                  <span class="pg is-nav">›</span>
                </span>
              </div>
            </div>
          </section>

          <!-- ================= 视图 B：新建题目（第 2~3 步；第 4 步淡出，让「保存」的落点看得见） ================= -->
          <section class="view view-edit" :class="{ 'is-in': step === 2 || step === 3 }">
            <div class="ep-head">
              <span class="lnk">← 返回题库管理</span>
              <b class="ep-title">新建题目</b>
              <span class="grow" />
              <span class="dm-tag is-info">编程题</span>
            </div>

            <!-- 基本信息条（真实页 lc-top）：大题标题 / 难度 / 总分 / 上传试卷 / 设置 -->
            <div class="dm-surface ep-top">
              <span class="dm-input title-in" :class="{ 'is-ph': step < 3 }">
                <template v-if="step < 3">大题标题</template>
                <span v-else class="tw tw-title">
                  <span class="tw-text">二分查找与复杂度分析</span><i class="caret-blink" />
                </span>
              </span>
              <span class="dm-btn sel">中等<svg class="caret" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.2 6.3 8 10.1l3.8-3.8" /></svg></span>
              <span class="dm-sub">总分 <b class="score">20 分</b></span>
              <span class="grow" />
              <span class="dm-btn">上传试卷</span>
              <span class="dm-btn">设置</span>
            </div>

            <div class="ep-main">
              <!-- 左栏：题干与评分标准（真实页 lc-left） -->
              <div class="dm-surface ep-left">
                <div class="mat">
                  题目材料<span class="dm-tag is-mute">未填写</span>
                  <span class="grow" />
                  <svg class="caret" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.2 6.3 8 10.1l3.8-3.8" /></svg>
                </div>
                <div class="tabs">
                  <span class="tab is-on">第 1 小题<i class="x">×</i></span>
                  <span class="tab add">+</span>
                  <span class="grow" />
                  <span class="dm-sub">主观题</span>
                </div>
                <div class="ep-body">
                  <div class="ep-row">
                    <span class="dm-input is-ph grow">小题标题（选填）</span>
                    <span class="dm-input is-ph score-in">分值</span>
                  </div>
                  <div class="ed-box" :class="{ 'is-ph': step < 3 }">
                    <template v-if="step < 3">请输入题目描述（支持富文本）</template>
                    <template v-else>
                      <div class="tw tw-stem1"><span class="tw-text">给定一个升序整数数组 nums 和目标值 target，</span></div>
                      <div class="tw tw-stem2"><span class="tw-text">用二分查找返回 target 的下标；不存在时返回 -1。</span><i class="caret-blink" /></div>
                    </template>
                  </div>
                  <div class="ed-box is-ta">
                    <span class="ph">评分标准（若不填写，将使用默认标准：代码正确性60% + 代码效率20% + 代码可读性20%）</span>
                  </div>
                </div>
              </div>

              <!-- 右栏：参考答案 + 语言（真实页 lc-right = CodeEditor） -->
              <div class="dm-surface ep-right">
                <div class="ed-head">
                  <svg class="nq-ico" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M5.8 4.4 3.1 8l2.7 3.6M10.2 4.4 13 8l-2.7 3.6" />
                  </svg>
                  <b class="ed-label">参考答案</b>
                  <span class="dm-tag is-info">第 1 小题</span>
                  <span class="grow" />
                  <span class="dm-btn sel">Java<svg class="caret" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.2 6.3 8 10.1l3.8-3.8" /></svg></span>
                  <span class="dm-btn fmt">⚡</span>
                </div>
                <div class="code">
                  <div class="cl"><span class="ln">1</span><span class="src"><span class="k">public class</span> Solution {</span></div>
                  <div class="cl"><span class="ln">2</span><span class="src i1"><span class="k">public int</span> search(<span class="k">int</span>[] nums, <span class="k">int</span> target) {</span></div>
                  <div class="cl"><span class="ln">3</span><span class="src i2"><span class="k">int</span> lo = <span class="n">0</span>, hi = nums.length - <span class="n">1</span>;</span></div>
                  <div class="cl"><span class="ln">4</span><span class="src i2"><span class="k">while</span> (lo &lt;= hi) {</span></div>
                  <div class="cl"><span class="ln">5</span><span class="src i3"><span class="k">int</span> mid = lo + (hi - lo) / <span class="n">2</span>;</span></div>
                  <div class="cl"><span class="ln">6</span><span class="src i3"><span class="k">if</span> (nums[mid] == target) <span class="k">return</span> mid;</span></div>
                  <div class="cl"><span class="ln">7</span><span class="src i3"><span class="k">if</span> (nums[mid] &lt; target) lo = mid + <span class="n">1</span>;</span></div>
                  <div class="cl"><span class="ln">8</span><span class="src i3"><span class="k">else</span> hi = mid - <span class="n">1</span>;</span></div>
                  <div class="cl"><span class="ln">9</span><span class="src i2">}</span></div>
                  <div class="cl"><span class="ln">10</span><span class="src i2"><span class="k">return</span> -<span class="n">1</span>; <span class="c">// 没找到</span></span></div>
                  <div class="cl"><span class="ln">11</span><span class="src i1">}</span></div>
                  <div class="cl"><span class="ln">12</span><span class="src">}</span></div>
                </div>
              </div>
            </div>

            <!-- 底部动作条（真实页 FormPage #actionbar：左状态文本，右取消 / 保存） -->
            <div class="ep-actions">
              <span class="dm-sub">{{ step >= 3 ? '已保存' : '' }}</span>
              <span class="grow" />
              <span class="dm-btn">取消</span>
              <span class="dm-btn is-primary dm-target" :class="{ 'is-hot': step === 4 }">
                保存<i v-if="step === 4" class="dm-cursor is-on" />
              </span>
            </div>
          </section>
        </div>
      </DemoFrame>
    </template>
  </ManualStep>
</template>

<script>
/**
 * meta —— 手册演示的登记信息（自动发现用：新增演示只需新建本文件，无需改 Doc.vue）
 *   order   Number  在「交互演示」区里的排序（建议用对应章节号）
 *   title   String  小节标题
 *   anchor  String  对应原手册章节 id（用于在正文里回指，可空）
 */
export const meta = { order: 6, title: '6. 题库管理 · 新建题目', anchor: 'questions' };
</script>

<script setup>
/**
 * 手册 · 第 6 节「题库管理 · 新建题目」的可播放演示
 *
 * 结构：ManualStep（播放器/步骤驱动） → DemoFrame（外壳 + 设计单位缩放） → 复刻的假界面
 * 镜像：views/teacher/Questions.vue（列表 + 「新增题目」两行下拉）与 QuestionEdit.vue（编辑页）。
 * 界面只按 props.step 渲染状态、状态之间用 CSS transition / keyframes；不调接口、不依赖登录态、
 * 不 import 任何业务组件——假数据直接写在本文件里。
 */
import ManualStep from '../ManualStep.vue';
import DemoFrame from '../DemoFrame.vue';
import { questions as scene } from '../scenes/questions.js';

defineProps({
  /** 截图兜底（由 docs/manual/shots.mjs 生成）；不传则直接显示复刻界面 */
  fallback: { type: String, default: '' },
});

/** 列表假数据：字段与 Questions.vue 的列一一对应（标题两行式 / 类型 / 难度 / 满分 / 创建时间） */
const rows = [
  { title: 'Java 集合与异常处理综合', sub: '编程题 · 3 个小题', type: '编程题', typeCls: 'is-info', diff: '中等', diffCls: 'is-warning', score: 100, date: '2026-10-08', time: '14:32' },
  { title: '学生成绩管理系统（实训）', sub: '实训题', type: '实训题', typeCls: 'is-accent', diff: '困难', diffCls: 'is-danger', score: 100, date: '2026-10-05', time: '09:18' },
  { title: 'Python 数据结构基础练习', sub: '编程题 · 2 个小题', type: '编程题', typeCls: 'is-info', diff: '简单', diffCls: 'is-success', score: 60, date: '2026-09-28', time: '20:05' },
  { title: '操作系统进程调度计算题', sub: '编程题 · 1 个小题', type: '编程题', typeCls: 'is-info', diff: '困难', diffCls: 'is-danger', score: 30, date: '2026-09-21', time: '10:47' },
];
</script>

<style scoped>
/* 尺寸一律 calc(var(--u) * N)：N 是设计稿（design=720）上的像素，随容器查询等比缩放 */
.stage { display: grid; }
.view { grid-area: 1 / 1; min-width: 0; align-self: start; transition: opacity 320ms var(--ease-out) 480ms; }
/* 第 2~3 步列表让位给编辑页；第 4 步回到列表（都留 480ms 延迟：先看清「点哪儿」，再翻页） */
/* 预留「第 4 步多出来的那一行」的高度：否则新增行一出现，整个演示容器就被顶高 44u（页面跳动） */
.view-list { min-height: calc(var(--u) * 368); }
.view-list.is-out { opacity: 0; }
.view-edit { opacity: 0; }
.view-edit.is-in { opacity: 1; }

/* ---------- 视图 A：列表页 ---------- */
.pg-head { display: flex; align-items: flex-start; gap: calc(var(--u) * 10); position: relative; }
.pg-titles { display: flex; flex-direction: column; gap: calc(var(--u) * 2); flex: 1; min-width: 0; }
.pg-title { font-size: calc(var(--u) * 14); font-weight: 600; color: var(--text-strong); }
.add-btn { flex: none; }
.grow { flex: 1; min-width: 0; }

/* 「新增题目」下拉：面板 12u 圆角 + 描边 + 阴影，行内是图标 + 两行文案 */
.nq-menu { position: absolute; top: calc(100% + var(--u) * 6); right: 0; z-index: 3; min-width: calc(var(--u) * 232); padding: calc(var(--u) * 4); border: 1px solid var(--border-default); border-radius: calc(var(--u) * 10); background: var(--card-bg); box-shadow: 0 12px 28px rgba(16, 24, 40, 0.14); }
.nq-item { position: relative; display: flex; align-items: center; gap: calc(var(--u) * 8); padding: calc(var(--u) * 6) calc(var(--u) * 8); border-radius: calc(var(--u) * 7); }
.nq-ico { width: calc(var(--u) * 14); height: calc(var(--u) * 14); flex: none; color: var(--text-brand); }
.nq-ico path { fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
.nq-txt { display: flex; flex-direction: column; line-height: 1.35; }
.nq-txt b { display: flex; align-items: center; gap: calc(var(--u) * 4); font-size: calc(var(--u) * 12); font-weight: 500; color: var(--text-primary); }
.beta { display: inline-flex; align-items: center; height: calc(var(--u) * 14); padding: 0 calc(var(--u) * 4); border: 1px solid var(--status-warning-bd); border-radius: calc(var(--u) * 4); background: var(--status-warning-bg); color: var(--status-warning-fg); font-size: calc(var(--u) * 9); font-weight: 400; }

.tb-bar { display: flex; align-items: center; gap: calc(var(--u) * 8); margin: calc(var(--u) * 10) 0; }
.search { width: calc(var(--u) * 200); gap: calc(var(--u) * 5); }
.ico { width: calc(var(--u) * 12); height: calc(var(--u) * 12); flex: none; }
.ico circle, .ico path { fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; }

.tb-row { display: grid; grid-template-columns: minmax(0, 1fr) calc(var(--u) * 76) calc(var(--u) * 74) calc(var(--u) * 60) calc(var(--u) * 94) calc(var(--u) * 90); align-items: center; gap: calc(var(--u) * 6); padding: calc(var(--u) * 6) calc(var(--u) * 10); border-bottom: 1px solid var(--border-subtle); font-size: calc(var(--u) * 12); color: var(--text-primary); }
.tb-row.is-head { background: var(--bg-surface-2); color: var(--text-tertiary); font-size: calc(var(--u) * 11); }
.tb-row.is-new { animation: row-in 1400ms var(--ease-out) both; }
@keyframes row-in { from { background: var(--status-success-bg); } to { background: transparent; } }
.tb-foot { display: flex; align-items: center; gap: calc(var(--u) * 8); padding: calc(var(--u) * 6) calc(var(--u) * 10); }
.pager { display: inline-flex; align-items: center; gap: calc(var(--u) * 4); }
.pg { display: inline-flex; align-items: center; justify-content: center; min-width: calc(var(--u) * 20); height: calc(var(--u) * 20); padding: 0 calc(var(--u) * 4); border: 1px solid var(--border-default); border-radius: calc(var(--u) * 5); font-size: calc(var(--u) * 11); color: var(--text-secondary); }
.pg.is-on { border-color: var(--brand-600); color: var(--text-brand); }
.pg.is-nav { color: var(--text-disabled); }
.ta-r { text-align: right; }
.stack { display: flex; flex-direction: column; gap: calc(var(--u) * 1); min-width: 0; }
.stack > b { font-weight: 500; font-size: calc(var(--u) * 12); line-height: 1.35; color: var(--text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stack > span { font-size: calc(var(--u) * 10.5); line-height: 1.4; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stack.is-plain > b { font-weight: 400; font-size: calc(var(--u) * 11.5); color: var(--text-secondary); }
.num { font-variant-numeric: tabular-nums; font-weight: 500; }
.num > u { text-decoration: none; margin-left: calc(var(--u) * 2); font-weight: 400; font-size: calc(var(--u) * 10.5); color: var(--text-tertiary); }
.acts { display: flex; align-items: center; justify-content: flex-end; gap: calc(var(--u) * 6); }
.lnk { font-size: calc(var(--u) * 12); color: var(--text-brand); white-space: nowrap; }
.lnk.is-danger { color: var(--status-danger-fg); }
.dot { display: inline-block; width: calc(var(--u) * 5); height: calc(var(--u) * 5); margin-right: calc(var(--u) * 4); border-radius: 50%; background: currentColor; }
/* 难度标签：StatusTag 的 success / warning / danger 三档 */
.dm-tag.is-success { background: var(--status-success-bg); border-color: var(--status-success-bd); color: var(--status-success-fg); }
.dm-tag.is-warning { background: var(--status-warning-bg); border-color: var(--status-warning-bd); color: var(--status-warning-fg); }
.dm-tag.is-danger { background: var(--status-danger-bg); border-color: var(--status-danger-bd); color: var(--status-danger-fg); }

.toast-wrap { position: absolute; top: calc(var(--u) * 2); left: 50%; z-index: 4; }
.toast-enter-active { transition: opacity 260ms var(--ease-out) 900ms, transform 260ms var(--ease-out) 900ms; }
.toast-leave-active { transition: opacity 160ms var(--ease-out), transform 160ms var(--ease-out); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, calc(var(--u) * -6)); }
.toast-enter-to, .toast-leave-from { transform: translate(-50%, 0); }

/* ---------- 视图 B：新建题目页 ---------- */
.view-edit { display: flex; flex-direction: column; gap: calc(var(--u) * 8); }
.ep-head { display: flex; align-items: center; gap: calc(var(--u) * 10); }
.ep-title { font-size: calc(var(--u) * 13); font-weight: 600; color: var(--text-strong); }
.ep-top { display: flex; align-items: center; gap: calc(var(--u) * 8); padding: calc(var(--u) * 8) calc(var(--u) * 12); }
.title-in { width: calc(var(--u) * 232); font-size: calc(var(--u) * 13); font-weight: 700; }
.title-in.is-ph { font-weight: 400; }
.score { font-size: calc(var(--u) * 13); color: var(--text-brand); }
.sel { gap: calc(var(--u) * 4); }
.caret { width: calc(var(--u) * 10); height: calc(var(--u) * 10); flex: none; transition: transform var(--duration-base) var(--ease-out); }
.caret path { fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.caret.up { transform: rotate(180deg); }

.ep-main { display: flex; align-items: stretch; gap: calc(var(--u) * 8); }
.ep-left { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.mat { display: flex; align-items: center; gap: calc(var(--u) * 6); padding: calc(var(--u) * 6) calc(var(--u) * 10); background: var(--bg-surface-2); border-bottom: 1px solid var(--border-subtle); font-size: calc(var(--u) * 11.5); color: var(--text-secondary); }
.tabs { display: flex; align-items: center; gap: calc(var(--u) * 5); padding: calc(var(--u) * 5) calc(var(--u) * 8); background: var(--bg-surface-2); border-bottom: 1px solid var(--border-subtle); }
.tab { display: inline-flex; align-items: center; gap: calc(var(--u) * 5); height: calc(var(--u) * 22); padding: 0 calc(var(--u) * 8); border: 1px solid transparent; border-radius: calc(var(--u) * 6); font-size: calc(var(--u) * 11.5); color: var(--text-secondary); }
.tab.is-on { background: var(--card-bg); border-color: var(--border-strong); color: var(--text-brand); font-weight: 500; }
.tab .x { color: var(--text-disabled); font-size: calc(var(--u) * 12); }
.tab.add { padding: 0 calc(var(--u) * 7); color: var(--text-tertiary); font-size: calc(var(--u) * 14); }
.ep-body { display: flex; flex-direction: column; gap: calc(var(--u) * 8); padding: calc(var(--u) * 10); }
.ep-row { display: flex; align-items: center; gap: calc(var(--u) * 8); }
.score-in { width: calc(var(--u) * 78); flex: none; }
.ed-box { min-height: calc(var(--u) * 62); padding: calc(var(--u) * 8) calc(var(--u) * 10); border: 1px solid var(--border-default); border-radius: calc(var(--u) * 7); font-size: calc(var(--u) * 12); line-height: 1.7; }
.ed-box.is-ph, .ed-box .ph { color: var(--text-tertiary); }
.ed-box.is-ph { font-size: calc(var(--u) * 11.5); }
.ed-box.is-ta { min-height: calc(var(--u) * 46); font-size: calc(var(--u) * 11.5); }

.ep-right { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ed-head { display: flex; align-items: center; gap: calc(var(--u) * 6); padding: calc(var(--u) * 6) calc(var(--u) * 10); background: var(--bg-surface-2); border-bottom: 1px solid var(--border-subtle); }
.ed-label { font-size: calc(var(--u) * 11.5); font-weight: 600; color: var(--text-secondary); }
.fmt { padding: 0 calc(var(--u) * 8); }
.code { padding: calc(var(--u) * 8) 0; background: var(--bg-sunken); font-family: var(--font-mono); font-size: calc(var(--u) * 10.5); line-height: 1.55; }
.cl { display: flex; gap: calc(var(--u) * 8); }
.ln { width: calc(var(--u) * 20); flex: none; text-align: right; color: var(--text-disabled); }
.src { white-space: pre; color: var(--text-primary); }
.src.i1 { padding-left: calc(var(--u) * 10); }
.src.i2 { padding-left: calc(var(--u) * 20); }
.src.i3 { padding-left: calc(var(--u) * 30); }
.k { color: var(--violet-600); }
.n { color: var(--amber-700); }
.c { color: var(--text-tertiary); }

.ep-actions { display: flex; align-items: center; gap: calc(var(--u) * 8); padding: calc(var(--u) * 6) calc(var(--u) * 12); background: var(--bg-surface-2); border: 1px solid var(--border-subtle); border-radius: calc(var(--u) * 8); }

/* ---------- 打字感（第 4 步）：宽度按「设计稿上这句话有多宽」逐字推进 ---------- */
.tw { display: inline-flex; align-items: center; }
.tw-text { display: inline-block; overflow: hidden; white-space: nowrap; width: 0; }
.tw-title { --tw-w: calc(var(--u) * 132); }
.tw-title .tw-text { animation: tw-type 900ms steps(10, end) both; }
.tw-stem1 { --tw-w: calc(var(--u) * 259); }
.tw-stem1 .tw-text { animation: tw-type 1000ms steps(25, end) both; }
.tw-stem2 { --tw-w: calc(var(--u) * 273); }
.tw-stem2 .tw-text { animation: tw-type 1100ms steps(27, end) both; animation-delay: 760ms; }
@keyframes tw-type { to { width: var(--tw-w); } }
.caret-blink { width: calc(var(--u) * 1.5); height: calc(var(--u) * 13); margin-left: calc(var(--u) * 1); background: var(--brand-600); animation: caret-blink 1s step-end infinite; }
@keyframes caret-blink { 50% { opacity: 0; } }
/* reduced-motion：播放器会禁用全部动画（直接显示终态），打字动画被禁掉会停在 0 宽度上 —— 把宽度交还给内容 */
@media (prefers-reduced-motion: reduce) {
  .tw-text { width: auto; }
}
</style>
