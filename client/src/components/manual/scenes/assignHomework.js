/**
 * 场景：布置作业（金标样板）
 *
 * 约定：场景文件只放「文案 + 步骤脚本」，不放界面（界面在 sections/*.vue）。
 * 要改演示节奏改这里的 dwell；要改讲解改 caption / ariaLabel / steps[].label。
 */
export const assignHomework = {
  id: 'assign-homework',
  title: '布置作业',
  caption: '点「布置作业」→ 选题目 → 选班级 → 确认时间 → 提交',
  // 读屏用户听到的就是这句：把"剧情"讲清楚（动画层 aria-hidden，不会念出一堆无意义节点）
  ariaLabel:
    '布置作业演示：在作业管理页点右上角「布置作业」按钮，弹出一页式表单；点题目列表里的整行选中一道题，' +
    '再点两个班级按钮，确认默认起止时间后点「立即布置」。仅为演示，不会真的创建作业。',
  steps: [
    { label: '点「布置作业」', dwell: 1500 },
    { label: '点整行选中题目', dwell: 1700 },
    { label: '选择班级', dwell: 1500 },
    { label: '确认起止时间', dwell: 1500 },
    { label: '点「立即布置」', dwell: 1800 },
  ],
};
