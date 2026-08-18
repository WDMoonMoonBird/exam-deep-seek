<template>
  <div class="health-report">
    <div class="hr-head">
      <span class="hr-title">标准包检查报告
        <QuestionCircleOutlined class="hr-help" @click="helpOpen = true" />
      </span>
      <span class="hr-score" :class="passed ? 'ok' : 'warn'">
        标准包得分 <b>{{ report.score }}/{{ report.max_score }}</b>
        <span v-if="threshold">（就绪阈值 ≥{{ threshold }}）</span>
      </span>
    </div>

    <!-- 帮助弹窗：解释什么是"标准包检查报告" -->
    <a-modal v-model:open="helpOpen" title="什么是标准包检查报告？" :footer="null" width="560px">
      <p style="margin-bottom:8px;">检查报告是系统在<strong>标准工程包</strong>（教师上传的参考答案工程）上试运行本次生成的评分规则后得到的结果：</p>
      <ul style="padding-left:18px;line-height:1.9;color:#555;">
        <li><b>标准包得分</b>：当前规则在标准包上能拿到的分数，达到就绪阈值（默认 90 分）即视为规则合格；</li>
        <li><b>失分项</b>：标准包未满足的规则项。若属于标准包自身缺陷（如未封装 Axios、接口无兜底），可<strong>豁免</strong>或<strong>转主观评分</strong>，不影响规则就绪；</li>
        <li><b>注意</b>：标准包 ≠ 满分答案。规则的满分由评分标准决定，教师的标准工程包通常是 90~95 分水平，这是正常现象。</li>
      </ul>
      <a-divider style="margin:8px 0;" />
      <p style="margin-bottom:8px;"><b>失分项怎么处理？</b>（每个失分项可选以下一种操作，处理完即可启用规则）</p>
      <ul style="padding-left:18px;line-height:1.9;color:#555;">
        <li><b>豁免</b>：认定为<strong>标准包自身缺陷</strong>（如未封装 Axios、接口无兜底），该失分不计入校准——规则依然会对学生评分，但标准包不再因此卡住就绪；</li>
        <li><b>接受失分</b>：认可规则判定无误（标准包确实没做到），<strong>保留该项扣分</strong>；只要标准包得分达到就绪阈值（≥90）仍可就绪；</li>
        <li><b>转主观</b>：该项<strong>不再用确定性规则</strong>判定，改为由 AI 对每份学生提交做主观评分（单次小调用、温度 0）——适合难以用静态检查准确判定的项，或"标准包没做但要求学生做"的项。</li>
      </ul>
      <a-divider style="margin:8px 0;" />
      <p style="margin-bottom:8px;"><b>评分规则是如何生成的？</b>（系统自动完成，无需教师参与）</p>
      <ul style="padding-left:18px;line-height:1.9;color:#555;">
        <li>输入：<b>评分标准</b>（教师填写/默认标准）、<b>满分</b>、<b>固定分项</b>（从评分标准提炼）、<b>标准工程包文件树</b>（路径的事实依据）、<b>题目描述</b>、<b>事实字段清单</b>（可检查的工程事实）；</li>
        <li>AI 据此生成规则 JSON（只生成参数，不写代码）→ 在标准工程包上试运行校准 → 达到阈值即就绪 → 教师一键确认启用；</li>
        <li>此后所有学生提交都由<strong>确定性规则引擎</strong>评分（同代码必同分），AI 不再参与客观分。</li>
      </ul>
    </a-modal>
    <a-table
      :columns="columns"
      :data-source="report.items || []"
      :pagination="false"
      size="small"
      row-key="id"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <a-tag :color="STATUS_COLOR[record.status]">{{ STATUS_LABEL[record.status] }}</a-tag>
        </template>
        <template v-else-if="column.key === 'note'">
          <span class="hr-note">{{ record.note }}</span>
        </template>
        <template v-else-if="column.key === 'action' && actionable">
          <a-space size="4" v-if="record.status === 'pending' || record.status === 'miss'">
            <a-button size="small" @click="$emit('action', record, 'to_subjective')">转主观</a-button>
            <a-button size="small" @click="$emit('action', record, 'exempt')">豁免</a-button>
            <a-button size="small" type="primary" ghost @click="$emit('action', record, 'accept')">接受失分</a-button>
          </a-space>
          <span v-else-if="record.status === 'exempt'" class="hr-done">已豁免（缺陷登记）</span>
          <span v-else-if="record.status === 'accept'" class="hr-done">已接受</span>
          <span v-else class="hr-done">—</span>
        </template>
        <template v-else-if="column.key === 'deduction'">
          <span class="hr-deduct">-{{ record.deduction }}</span>
        </template>
      </template>
      <template #emptyText><a-empty description="标准包无失分项" :image="false" /></template>
    </a-table>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';

const props = defineProps({
  report: { type: Object, default: () => ({ score: 0, max_score: 0, items: [] }) },
  threshold: { type: Number, default: 0 },
  actionable: { type: Boolean, default: false },
});
defineEmits(['action']);

const helpOpen = ref(false);

const STATUS_LABEL = { miss: '失分', exempt: '已知缺陷豁免', pending: '待确认', accept: '已接受' };
const STATUS_COLOR = { miss: 'red', exempt: 'green', pending: 'orange', accept: 'blue' };

const columns = [
  { title: '失分规则（中文）', dataIndex: 'ruleLabel', key: 'ruleLabel' },
  { title: '评分组', dataIndex: 'group', key: 'group', width: 100 },
  { title: '失分', dataIndex: 'deduction', key: 'deduction', width: 64 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 110 },
  { title: '说明 / 操作', dataIndex: 'note', key: 'note' },
  ...(props.actionable ? [{ title: '处理', key: 'action', width: 190 }] : []),
];
</script>

<style scoped>
.health-report { border: 1px solid #e5e6eb; border-radius: 8px; padding: 10px 12px; background: #fafafa; }
.hr-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.hr-title { font-weight: 600; font-size: 13px; }
.hr-help { color: #1677ff; cursor: pointer; margin-left: 6px; font-size: 13px; }
.hr-score { font-size: 12px; color: #666; }
.hr-score.ok b { color: #52c41a; }
.hr-score.warn b { color: #fa8c16; }
.hr-note { font-size: 12px; color: #888; }
.hr-deduct { color: #f5222d; font-weight: 600; }
.hr-done { font-size: 12px; color: #999; }
</style>
