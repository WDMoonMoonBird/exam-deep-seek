/**
 * defectScoring.js — 缺陷预检结果的评分折算层（确定性扣分，零 LLM）
 *
 * 设计：对 precheckProject 扫出的确定性缺陷，按 rubric 语义直接折算扣分，
 *      不让 LLM 参与"发现"，只让 LLM 评剩余部分 —— 消除 C 组式分裂的根源。
 *
 * 折算规则（保守，只扣有把握的）：
 *   - missing_import 且目标是 .vue/.jsx/.tsx 页面/组件且被 router/App 引用
 *     → 判「项目无法启动」：第一项(可运行)全扣 + 该组件对应功能项按比例扣
 *   - missing_key_file（Login.vue/user.js 等 rubric 明确点名的文件）→ 对应功能项全扣
 *   - 折算后的"硬扣分"从总分中扣除；剩余分数空间交 LLM 评"实现质量"
 *
 * 纯函数，输入 precheckProject 输出 + rubric 解析结果，输出扣分明细。
 */

/** 从 rubric 文本解析分项（复用 trustJudgeGrader 的分段逻辑思路，独立实现避免跨服务依赖） */
export function parseRubricDefects(rubric) {
  // 返回每项 { item, maxScore, keywords: [] }
  const items = [];
  const re = /第\s*[零一二三四五六七八九十百0-9]+\s*[项条部分点][、,，:：]?([^。！？\n]*?)[，,]?\s*(\d{1,3})\s*分/g;
  let m;
  while ((m = re.exec(rubric)) !== null) {
    const desc = m[1].trim();
    const maxScore = parseInt(m[2], 10);
    if (desc && maxScore >= 1) {
      items.push({ item: desc.slice(0, 40), maxScore, full: m[0] });
    }
  }
  return items;
}

/**
 * 缺陷 → 扣分折算。
 * @param {object} precheck precheckProject 的返回
 * @param {object} rubricText 评分标准原文
 * @returns {{ hardDeductions: Array<{reason: string, deduct: number}>, totalHardDeduct: number, fatal: boolean }}
 */
export function scoreDefects({ issues = [], rubricText = '' }) {
  const deductions = [];
  const text = String(rubricText);
  let fatal = false;

  // 致命：import 断裂（项目无法启动）——C 组式问题的核心
  const brokenImports = issues.filter((i) => i.type === 'missing_import');
  if (brokenImports.length > 0) {
    fatal = true;
    deductions.push({ reason: 'import 引用不存在的文件（' + brokenImports.map((b) => b.file + '→' + b.target).join('; ') + '），项目无法启动', deduct: 0 /* 由下方按 rubric 折算 */ });
  }

  // 第一项「可运行」全扣（rubric 明示"启动报错按严重程度扣分"，import 断裂=最严重）
  const runMatch = text.match(/第一项[^。]*?(\d{1,3})\s*分/);
  if (runMatch && brokenImports.length > 0) {
    const cap = parseInt(runMatch[1], 10);
    deductions.push({ reason: '「项目初始化与可运行」：import 断裂导致无法启动，全扣', deduct: cap });
  }

  // 缺失关键文件 → 对应功能扣分（Login.vue → 登录/路由项；user.js → Pinia 项）
  const keyFiles = issues.filter((i) => i.type === 'missing_key_file');
  // 简化：把文件→分项标题文字映射（锚定"第X项，标题…"整段，取该段 N 分）
  const itemSegments = [];
  const itemRe = /第\s*[零一二三四五六七八九十百0-9]+\s*[项条部分点][、,，:：]?([^。！？\n]*?)[，,]?\s*(\d{1,3})\s*分/g;
  let im;
  while ((im = itemRe.exec(text)) !== null) {
    itemSegments.push({ title: (im[1] || '').trim(), cap: parseInt(im[2], 10), index: im.index });
  }
  const FILE_ITEM_MAP = [
    // file 关键字 → 分项标题包含的关键字（标题级，不会命中正文）
    { file: 'Login.vue', kw: ['登录'] },           // 第三项 登录功能
    { file: 'Register.vue', kw: ['注册'] },        // 第四项 注册功能
    { file: 'User.vue', kw: ['用户主页', '个人信息'] }, // 第六/七项
    { file: 'UserList.vue', kw: ['用户列表'] },    // 第八项 管理员用户列表
    { file: 'user.js', kw: ['Pinia', '状态管理'] },// 第五项
    { file: 'counter.js', kw: ['Pinia', '状态管理'] },
  ];
  for (const kf of keyFiles) {
    const base = kf.file.split('/').pop();
    const mp = FILE_ITEM_MAP.find((x) => x.file === base);
    if (!mp) continue; // 未映射的文件不硬扣（保守）
    // 在所有分项标题里找第一个标题含任一关键字的项
    const hit = itemSegments.find((seg) => mp.kw.some((k) => seg.title.includes(k)));
    if (!hit || hit.cap < 1) continue;
    deductions.push({ reason: '关键文件缺失：' + base + '（对应功能项"' + hit.title.slice(0, 20) + '"不可用）', deduct: hit.cap });
  }

  // 去重累计（同一理由只扣一次；cap 累计可能超 100 由调用方 clamp）
  const seen = new Set();
  const unique = deductions.filter((d) => {
    const k = d.reason;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const totalHardDeduct = unique.reduce((s, d) => s + d.deduct, 0);
  return { hardDeductions: unique, totalHardDeduct, fatal };
}
