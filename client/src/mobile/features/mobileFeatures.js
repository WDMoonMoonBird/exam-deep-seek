/**
 * mobileFeatures —— 移动端 v1 功能开关（纯前端配置，无依赖）
 *
 * 依据：docs/mobile-app/09-v1-scope-and-deferred-backlog.md §2.3 / §5
 *       docs/mobile-app/10-v1-implementation-contract.md §7.10
 *
 * 规则（契约）：
 *   · 开关为 false 时：组件不渲染、不发起请求、不出现空占位假数据；
 *   · 开关为 true 前：必须先满足 09/08 中对应「解除条件」并更新文档状态；
 *   · 不得为延期项预留死 UI（设计稿保留在 docs，生产组件不挂载）。
 *
 * v1 口径：除 multiSchoolLogin（D14，纯前端 UI）外全部 false。
 * 页面用法：import { mobileFeatures } from '../../features/mobileFeatures.js';
 *           <section v-if="mobileFeatures.scoreAggregates">…</section>
 */
export const mobileFeatures = {
  scoreAggregates: false,       // D1/D4：学期均分/班级排名/超过百分比/等级分布/班均对比
  scoreComposition: false,      // D2：分数构成、逐题满分分母
  generalAiBreakdown: false,    // D3：通用题 AI 结构化分项（实训题 project 接口不受此开关约束）
  assignmentAverage: false,     // D5：作业均分
  urgeAndNotification: false,   // D6：催交/通知/推送
  rejectWorkflow: false,        // D7：打回/退回重做
  handoffToken: false,          // D8：免登录接力 token（v1 只复制需登录的链接）
  batchAtomicReview: false,     // D9：按 submissionIds 的原子批量审核/批量评语统计
  assignmentEditDelete: false,  // D10：作业编辑/删除
  questionUsage: false,         // D11：题库使用次数/最近使用/服务端 type 筛选
  adminArea: false,             // D12：管理端 3 屏（v1 不注册 /m/admin 路由）
  requestTraceId: false,        // D13：错误页 requestId / 可追踪编号
  multiSchoolLogin: true,       // D14：多学校登录选择态（登录接口已返回 1002 + schools）
};

/** 读取单个开关（非布尔值一律视为关闭，避免误开延期能力） */
export function isMobileFeatureEnabled(key) {
  return mobileFeatures[key] === true;
}

export default mobileFeatures;
