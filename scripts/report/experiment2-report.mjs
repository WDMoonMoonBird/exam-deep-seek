#!/usr/bin/env node
/**
 * experiment2-report.mjs — 实验 2「两班 × 6 包 × 87 项」对比报告生成器（只读输入 → HTML + XLSX）
 *
 * 用法：
 *   node scripts/report/experiment2-report.mjs                 # 生成 HTML + XLSX 到 docs/dsh/
 *   node scripts/report/experiment2-report.mjs --check         # 只校验：输入合法 + 现有报告未过期（不写盘）
 *   node scripts/report/experiment2-report.mjs --selftest      # 反硬编码自证：改写输入 ⇒ 指纹必须变化（临时目录，自动清理）
 *   --input <json> --out-dir <dir>
 *
 * 退出码：0 成功/一致；1 报告与输入不一致（过期）；2 输入缺失/非法（★绝不连生产库，不做任何回退取数）
 *
 * 口径（与报告脚注一致）：
 *   · 失分率 = 未通过人数 / 该班人数；未通过 = breakdown[].status !== 'hit'（hit/miss/missing 三态，取 checker 原文）
 *   · 分数统计用 aiScore（平台 INT 列，与教务可见口径一致）；包/项得分率用 breakdown 原始分（含 0.5）
 *   · σ = 总体标准差（除以 n）；分位数 = 线性插值（Excel QUARTILE.INC 同口径）
 *   · 6 包 A–F = 按条目 title 前缀 1.–6. 归并的六个考核模块（映射见 PACKAGES）
 *   · 评语对照按「该生失分最多的包」归类（并列时取最大失分权重者），两班并排
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const DEFAULT_INPUT = path.join(ROOT, 'docs/dsh/experiment2-export.json');
const DEFAULT_OUT_DIR = path.join(ROOT, 'docs/dsh');
const EXPECTED_SCHEMA = 'experiment2-export/1';
const FINGERPRINT_ID = 'report-metrics';
const PACKAGES = [
  { key: 'A', section: 1, name: '模块一 Spring MVC 环境与配置（web.xml / spring-mvc.xml）' },
  { key: 'B', section: 2, name: '模块二 JavaBean 实体与 getter/setter' },
  { key: 'C', section: 3, name: '模块三 页面跳转与数据传递（PageController）' },
  { key: 'D', section: 4, name: '模块四 请求参数绑定与类型转换' },
  { key: 'E', section: 5, name: '模块五 响应与 JSON 处理（DataController）' },
  { key: 'F', section: 6, name: '模块六 JSP 视图页面' },
];
const HIST_BINS = [[80, 84], [85, 89], [90, 94], [95, 100]];

class InputError extends Error {}

// ─────────────────────────── CLI ───────────────────────────
function parseArgs(argv) {
  const out = { input: DEFAULT_INPUT, outDir: DEFAULT_OUT_DIR, check: false, selftest: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') out.input = path.resolve(argv[++i]);
    else if (a === '--out-dir') out.outDir = path.resolve(argv[++i]);
    else if (a === '--check') out.check = true;
    else if (a === '--selftest') out.selftest = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new InputError('未知参数：' + a);
  }
  return out;
}

// ─────────────────────────── 读取与校验 ───────────────────────────
function loadExport(file) {
  if (!fs.existsSync(file)) {
    throw new InputError('输入数据文件不存在：' + file + '\n  ⇒ 请由队长/导出方补齐（本脚本不连生产库、不做任何回退取数）');
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new InputError('输入数据文件不是合法 JSON：' + file + '（' + e.message + '）');
  }
  if (data.schema !== EXPECTED_SCHEMA) throw new InputError('schema 不匹配：期望 ' + EXPECTED_SCHEMA + '，实际 ' + String(data.schema));
  if (!Array.isArray(data.submissions) || data.submissions.length === 0) throw new InputError('submissions 为空');
  for (const s of data.submissions) {
    if (!s.feedback || !Array.isArray(s.feedback.breakdown) || s.feedback.breakdown.length === 0) {
      throw new InputError('submission #' + s.id + ' 缺少 feedback.breakdown');
    }
    for (const b of s.feedback.breakdown) {
      if (typeof b.item !== 'string' || typeof b.score !== 'number' || typeof b.maxScore !== 'number' || typeof b.status !== 'string') {
        throw new InputError('submission #' + s.id + ' 的条目字段不完整：' + JSON.stringify(b).slice(0, 120));
      }
    }
  }
  return data;
}

// ─────────────────────────── 统计工具（纯函数） ───────────────────────────
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sdPopulation = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
const quantileInc = (sorted, q) => {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};
const fmtPct = (v, d = 1) => (v * 100).toFixed(d) + '%';
const fmtNum = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);
const serialOf = (realName) => { const m = String(realName || '').match(/(\d+)\s*号/); return m ? m[1].padStart(2, '0') : null; };
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ─────────────────────────── 指标计算 ───────────────────────────
function computeReport(data) {
  const byClass = new Map();
  for (const s of data.submissions) {
    if (!byClass.has(s.className)) byClass.set(s.className, []);
    byClass.get(s.className).push(s);
  }
  const classNames = [...byClass.keys()].sort((a, b) => (byClass.get(a)[0].assignmentId - byClass.get(b)[0].assignmentId));
  const itemsPerSub = data.submissions[0].feedback.breakdown.length;
  const itemOrder = data.submissions[0].feedback.breakdown.map((b) => b.item);
  const itemMeta = new Map();
  for (const b of data.submissions[0].feedback.breakdown) itemMeta.set(b.item, { title: b.title, maxScore: b.maxScore, section: Number(String(b.title).split('.')[0]) });
  for (const it of itemOrder) if (!itemMeta.has(it) || !Number.isFinite(itemMeta.get(it).section)) throw new InputError('条目 ' + it + ' 的 title 无法解析模块段（期望 "N.xxx"）');
  for (const s of data.submissions) {
    const codes = s.feedback.breakdown.map((b) => b.item).join(',');
    if (codes !== itemOrder.join(',')) throw new InputError('submission #' + s.id + ' 的条目集合/顺序与首条不一致（87 项需同构）');
  }

  // ① 班级总览 + 分布
  const classes = classNames.map((cn) => {
    const arr = byClass.get(cn);
    const scores = arr.map((s) => s.aiScore).sort((a, b) => a - b);
    const passed = arr.reduce((n, s) => n + s.feedback.breakdown.filter((b) => b.status === 'hit').length, 0);
    const got = arr.reduce((n, s) => n + s.feedback.breakdown.reduce((m, b) => m + b.score, 0), 0);
    const max = arr.reduce((n, s) => n + s.feedback.breakdown.reduce((m, b) => m + b.maxScore, 0), 0);
    const histogram = HIST_BINS.map(([lo, hi]) => {
      const n = scores.filter((v) => v >= lo && v <= hi).length;
      return { label: lo + '–' + hi, lo, hi, count: n, pct: n / arr.length };
    });
    return {
      className: cn, classId: arr[0].classId, assignmentId: arr[0].assignmentId, n: arr.length,
      mean: round(mean(scores)), sd: round(sdPopulation(scores)), median: round(quantileInc(scores, 0.5)),
      q1: round(quantileInc(scores, 0.25)), q3: round(quantileInc(scores, 0.75)),
      min: scores[0], max: scores[scores.length - 1],
      passedItems: passed, totalItems: arr.length * itemsPerSub, passRate: round(passed / (arr.length * itemsPerSub)),
      missRate: round(1 - passed / (arr.length * itemsPerSub)),
      scoreRateByItems: round(got / max),
      histogram,
    };
  });

  // ② 6 包（A–F）对照
  const packages = PACKAGES.map((p) => {
    const codes = itemOrder.filter((it) => itemMeta.get(it).section === p.section);
    const per = classes.map((c) => {
      const arr = byClass.get(c.className);
      const got = arr.reduce((n, s) => n + s.feedback.breakdown.filter((b) => codes.includes(b.item)).reduce((m, b) => m + b.score, 0), 0);
      const max = arr.reduce((n, s) => n + s.feedback.breakdown.filter((b) => codes.includes(b.item)).reduce((m, b) => m + b.maxScore, 0), 0);
      const missCount = arr.reduce((n, s) => n + s.feedback.breakdown.filter((b) => codes.includes(b.item) && b.status !== 'hit').length, 0);
      return { className: c.className, items: codes.length, got: round(got), max: round(max), rate: round(got / max), missRate: round(missCount / (arr.length * codes.length)) };
    });
    return { key: p.key, section: p.section, name: p.name, itemCodes: codes, itemCount: codes.length, maxSum: round(codes.reduce((n, it) => n + itemMeta.get(it).maxScore, 0)), per, deltaPp: round((per[1].rate - per[0].rate) * 100, 1) };
  });

  // ③ 逐项失分率（87 项）
  const itemRows = itemOrder.map((code) => {
    const per = classes.map((c) => {
      const arr = byClass.get(c.className);
      const miss = arr.reduce((n, s) => n + (s.feedback.breakdown.find((b) => b.item === code).status !== 'hit' ? 1 : 0), 0);
      return { className: c.className, miss, n: arr.length, rate: round(miss / arr.length) };
    });
    return {
      item: code, title: itemMeta.get(code).title, maxScore: itemMeta.get(code).maxScore,
      package: PACKAGES.find((p) => p.section === itemMeta.get(code).section).key,
      per, deltaPp: round((per[1].rate - per[0].rate) * 100, 1),
    };
  });
  const ranked = [...itemRows].sort((a, b) => Math.abs(b.deltaPp) - Math.abs(a.deltaPp) || b.per[0].rate - a.per[0].rate || a.item.localeCompare(b.item));
  ranked.forEach((r, i) => { r.diffRank = i + 1; });
  const top20 = ranked.slice(0, 20);

  // ④ 评语（80 条，按「失分最多的包」归类，两班并排）
  const comments = data.submissions.map((s) => {
    const miss = s.feedback.breakdown.filter((b) => b.status !== 'hit');
    const byPkg = {};
    for (const b of miss) {
      const k = PACKAGES.find((p) => p.section === itemMeta.get(b.item).section).key;
      byPkg[k] = byPkg[k] || { count: 0, weight: 0, codes: [] };
      byPkg[k].count += 1;
      byPkg[k].weight += b.maxScore;
      byPkg[k].codes.push(b.item);
    }
    const order = PACKAGES.map((p) => p.key);
    const dominant = [...order.filter((k) => byPkg[k])].sort((x, y) => (byPkg[y].count - byPkg[x].count) || (byPkg[y].weight - byPkg[x].weight) || order.indexOf(x) - order.indexOf(y))[0] || null;
    return {
      submissionId: s.id, className: s.className, classId: s.classId, assignmentId: s.assignmentId,
      student: s.realName, username: s.username, serial: serialOf(s.realName),
      aiScore: s.aiScore, rawScore: s.feedback.raw_score, status: s.status,
      missCount: miss.length, missCodes: miss.map((b) => b.item),
      dominantPackage: dominant, byPackage: byPkg,
      text: (s.feedback.summary && s.feedback.summary.text) || null,
      summaryModel: (s.feedback.summary && s.feedback.summary.model) || null,
      checkerId: s.checkerId, canonicalSha256: s.canonicalSha256,
    };
  });

  // ⑤ 数据告警（只描述，不修改数据）
  const dataWarnings = [];
  const truncated = comments.filter((c) => {
    const facts = (data.submissions.find((s) => s.id === c.submissionId).feedback.summary || {}).facts;
    return facts && facts.failed_items && facts.failed_items.length === 12 && c.missCount > 12;
  }).length;
  if (truncated) dataWarnings.push('summary.facts.failed_items 被截断至 12 条：' + truncated + '/' + data.submissions.length + ' 条 ⇒ 逐项失分率一律以 breakdown.status 为准（已核对为不可通过集合的超集）');
  const rounded = comments.filter((c) => c.rawScore !== c.aiScore).length;
  if (rounded) dataWarnings.push('raw_score 与 aiScore 不等（INT 列截断 0.5）：' + rounded + '/' + data.submissions.length + ' 条 ⇒ 分数统计用 aiScore，包/项得分率用 breakdown 原始分');
  const maxSum = itemOrder.reduce((n, it) => n + itemMeta.get(it).maxScore, 0);
  if (maxSum !== 100) dataWarnings.push('87 项满分合计 = ' + maxSum + '，平台 max_score = 100 ⇒ 报告中的「得分率」分母一律为 ' + maxSum + '（差 ' + round(100 - maxSum, 1) + ' 分不在 87 项覆盖范围内）');
  const finalScored = data.submissions.filter((s) => s.finalScore != null).length;
  if (finalScored !== data.submissions.length) dataWarnings.push('finalScore 非空仅 ' + finalScored + '/' + data.submissions.length + ' 条（教师未定案）⇒ 全部以 aiScore 呈现');

  return {
    meta: {
      schema: data.schema, inputGeneratedAt: data.generatedAt,
      sourceNote: data.source && data.source.note, assignments: data.source && data.source.assignments, questionId: data.source && data.source.questionId,
      rulers: data.rulers || [], classes: data.classes || [], counts: data.counts || {},
      itemCount: itemsPerSub, submissionCount: data.submissions.length, classNames,
    },
    classes, packages, items: itemRows, rankedItems: ranked, top20, comments, dataWarnings,
  };
}

// 指纹：只在指标层做规范化（不含生成时间 ⇒ 同输入必同指纹）
function fingerprintOf(report) {
  const pick = {
    meta: { schema: report.meta.schema, inputGeneratedAt: report.meta.inputGeneratedAt, assignments: report.meta.assignments, questionId: report.meta.questionId, rulers: report.meta.rulers.map((r) => r.checkerId), itemCount: report.meta.itemCount, submissionCount: report.meta.submissionCount, classNames: report.meta.classNames },
    classes: report.classes,
    packages: report.packages.map((p) => ({ key: p.key, per: p.per, maxSum: p.maxSum, itemCount: p.itemCount })),
    items: report.items,
    comments: report.comments.map((c) => ({ submissionId: c.submissionId, aiScore: c.aiScore, missCodes: c.missCodes, dominantPackage: c.dominantPackage, textHash: simpleHash(c.text || '') })),
  };
  return simpleHash(stableStringify(pick));
}
function stableStringify(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
function simpleHash(s) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = (h1 ^ c) >>> 0; h1 = (h1 * 0x01000193) >>> 0; h2 = (h2 + c * (i + 1)) >>> 0; }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0'));
}

// ─────────────────────────── SVG 图（零依赖） ───────────────────────────
const SVG = { w: 720, h: 260, pad: { l: 56, r: 16, t: 18, b: 46 } };
function svgFrame(body, { w = SVG.w, h = SVG.h } = {}) {
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="auto" role="img" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="12">' +
    '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="#fff"/>' + body + '</svg>';
}
function groupedBars(groups, series, { yMax, yLabel, color = ['#2563eb', '#f59e0b'] } = {}) {
  const { w, h, pad } = SVG;
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const yOf = (v) => pad.t + innerH - (v / yMax) * innerH;
  let out = '';
  for (let i = 0; i <= 4; i++) {
    const v = (yMax / 4) * i, y = yOf(v);
    out += '<line x1="' + pad.l + '" y1="' + y + '" x2="' + (w - pad.r) + '" y2="' + y + '" stroke="#e5e7eb"/>' +
      '<text x="' + (pad.l - 6) + '" y="' + (y + 4) + '" text-anchor="end" fill="#6b7280">' + Math.round(v) + '</text>';
  }
  const slot = innerW / groups.length, barW = Math.min(26, (slot - 10) / series.length);
  groups.forEach((g, gi) => {
    const cx = pad.l + slot * gi + slot / 2;
    series.forEach((s, si) => {
      const v = s.values[gi], x = cx - (series.length * barW) / 2 + si * barW;
      out += '<rect x="' + x + '" y="' + yOf(v) + '" width="' + barW + '" height="' + (pad.t + innerH - yOf(v)) + '" fill="' + color[si % color.length] + '" rx="2"><title>' + esc(g) + ' · ' + esc(s.name) + ' = ' + fmtNum(v, 1) + '</title></rect>';
    });
    out += '<text x="' + cx + '" y="' + (h - pad.b + 18) + '" text-anchor="middle" fill="#374151">' + esc(g) + '</text>';
  });
  series.forEach((s, si) => {
    out += '<rect x="' + (pad.l + si * 130) + '" y="6" width="10" height="10" fill="' + color[si % color.length] + '"/><text x="' + (pad.l + si * 130 + 15) + '" y="15" fill="#374151">' + esc(s.name) + '</text>';
  });
  out += '<text x="' + pad.l + '" y="' + (h - 6) + '" fill="#6b7280">' + esc(yLabel || '') + '</text>';
  return svgFrame(out);
}
function divergentBars(rows, { label, color = '#7c3aed' } = {}) {
  const rowH = 20, w = SVG.w, h = rows.length * rowH + 54, padL = 150, padR = 70;
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const mid = padL + (w - padL - padR) / 2;
  const scale = (w - padL - padR) / 2 / maxAbs;
  let out = '';
  out += '<line x1="' + mid + '" y1="26" x2="' + mid + '" y2="' + (h - 24) + '" stroke="#9ca3af" stroke-dasharray="3 3"/>';
  rows.forEach((r, i) => {
    const y = 30 + i * rowH, len = Math.abs(r.value) * scale;
    const x = r.value >= 0 ? mid : mid - len;
    out += '<rect x="' + x + '" y="' + y + '" width="' + Math.max(1, len) + '" height="' + (rowH - 7) + '" fill="' + color + '" rx="2"><title>' + esc(r.label) + ' Δ=' + fmtNum(r.value, 1) + 'pp</title></rect>';
    out += '<text x="' + (padL - 8) + '" y="' + (y + 11) + '" text-anchor="end" fill="#374151">' + esc(r.label) + '</text>';
    // 负值标签画在条内（白字），避免与左侧标签列相撞；正值标签画在条右端外侧
    if (r.value >= 0) {
      out += '<text x="' + (mid + len + 4) + '" y="' + (y + 11) + '" text-anchor="start" fill="#6b7280">+' + fmtNum(r.value, 1) + 'pp</text>';
    } else {
      out += '<text x="' + (x + 4) + '" y="' + (y + 11) + '" text-anchor="start" fill="#ffffff">' + fmtNum(r.value, 1) + 'pp</text>';
    }
  });
  out += '<text x="' + mid + '" y="' + (h - 6) + '" text-anchor="middle" fill="#6b7280">' + esc(label) + '</text>';
  return svgFrame(out, { w, h });
}

// ─────────────────────────── HTML ───────────────────────────
function renderHtml(report, fingerprint, opts) {
  const meta = report.meta, c0 = report.classes[0], c1 = report.classes[1];
  const cls = (i) => report.classes[i].className;
  const histSvg = groupedBars(c0.histogram.map((b) => b.label), [
    { name: cls(0), values: c0.histogram.map((b) => b.count) },
    { name: cls(1), values: c1.histogram.map((b) => b.count) },
  ], { yMax: Math.max(1, ...c0.histogram.map((b) => b.count), ...c1.histogram.map((b) => b.count)), yLabel: '人数（分档：整数分段 [lo,hi]）' });
  const pkgSvg = groupedBars(report.packages.map((p) => p.key + '（' + p.itemCount + ' 项）'), [
    { name: cls(0), values: report.packages.map((p) => p.per[0].rate * 100) },
    { name: cls(1), values: report.packages.map((p) => p.per[1].rate * 100) },
  ], { yMax: 100, yLabel: '包得分率 %（= 该包条目原始分之和 / 满分之和）' });
  const top20Svg = divergentBars(report.top20.map((r) => ({ label: r.item + ' ' + (r.title.length > 20 ? r.title.slice(0, 20) + '…' : r.title), value: r.deltaPp })), { label: 'Δ 失分率（' + cls(1) + ' − ' + cls(0) + '，正值=2 班失分更多）· 单位 pp' });

  const statRows = [
    ['提交数 n', c0.n, c1.n], ['均值', c0.mean, c1.mean], ['σ（总体）', c0.sd, c1.sd], ['中位数', c0.median, c1.median],
    ['Q1 / Q3', c0.q1 + ' / ' + c0.q3, c1.q1 + ' / ' + c1.q3], ['最小 / 最大', c0.min + ' / ' + c0.max, c1.min + ' / ' + c1.max],
    ['通过项 / 总项', c0.passedItems + ' / ' + c0.totalItems, c1.passedItems + ' / ' + c1.totalItems],
    ['项得分率', fmtPct(c0.scoreRateByItems), fmtPct(c1.scoreRateByItems)],
    ['失分率（按项）', fmtPct(c0.missRate), fmtPct(c1.missRate)],
  ].map(([k, a, b]) => '<tr><th>' + esc(k) + '</th><td>' + esc(a) + '</td><td>' + esc(b) + '</td></tr>').join('');

  const pkgRows = report.packages.map((p) => '<tr><td class="k">' + p.key + '</td><td>' + esc(p.name) + '</td><td>' + p.itemCount + '</td><td>' + p.maxSum + '</td><td>' +
    fmtPct(p.per[0].rate, 2) + '</td><td>' + fmtPct(p.per[1].rate, 2) + '</td><td class="' + (p.deltaPp >= 0 ? 'pos' : 'neg') + '">' + (p.deltaPp >= 0 ? '+' : '') + p.deltaPp + ' pp</td><td>' +
    fmtPct(p.per[0].missRate, 1) + ' / ' + fmtPct(p.per[1].missRate, 1) + '</td></tr>').join('');

  const itemRows = report.rankedItems.map((r) => '<tr' + (r.diffRank <= 20 ? ' class="top"' : '') + '><td>' + r.diffRank + '</td><td class="k">' + r.item + '</td><td>' + r.package + '</td><td>' + esc(r.title) + '</td>' +
    '<td>' + r.maxScore + '</td><td>' + r.per[0].miss + '/' + r.per[0].n + '</td><td>' + fmtPct(r.per[0].rate) + '</td><td>' + r.per[1].miss + '/' + r.per[1].n + '</td><td>' + fmtPct(r.per[1].rate) + '</td><td class="' + (r.deltaPp >= 0 ? 'neg' : 'pos') + '">' + (r.deltaPp >= 0 ? '+' : '') + r.deltaPp + '</td></tr>').join('');

  const commentBlocks = report.packages.map((p) => {
    const cols = report.classes.map((c, ci) => {
      const list = report.comments.filter((x) => x.className === c.className && x.dominantPackage === p.key).sort((a, b) => String(a.serial).localeCompare(String(b.serial)));
      return '<div class="col"><h4>' + esc(c.className) + '（' + list.length + ' 条）</h4>' + (list.length ? list.map((x) =>
        '<div class="cmt"><div class="cmt-h"><b>' + esc(x.serial) + ' 号</b> ' + esc(x.student) + ' · ' + x.aiScore + ' 分 · 失分 ' + x.missCount + ' 项' + (ci === 0 ? '' : '') + '</div>' +
        '<div class="cmt-m">未通过：' + esc(x.byPackage[p.key].codes.join(' ')) + '</div><div class="cmt-t">' + esc(x.text) + '</div></div>').join('') : '<p class="none">（无学生以本包为主要失分包）</p>') + '</div>';
    }).join('');
    return '<section class="pkg-block"><h3>包 ' + p.key + ' · ' + esc(p.name) + '（' + p.itemCount + ' 项 / 满分 ' + p.maxSum + '）</h3><div class="two-col">' + cols + '</div></section>';
  }).join('');

  const unassigned = report.comments.filter((x) => !x.dominantPackage);
  const unassignedBlock = unassigned.length ? '<section class="pkg-block"><h3>无未通过项（0 失分，不归入任何包）</h3><div class="two-col">' + report.classes.map((c) => {
    const list = unassigned.filter((x) => x.className === c.className).sort((a, b) => String(a.serial).localeCompare(String(b.serial)));
    return '<div class="col"><h4>' + esc(c.className) + '（' + list.length + ' 条）</h4>' + (list.length ? list.map((x) =>
      '<div class="cmt"><div class="cmt-h"><b>' + esc(x.serial) + ' 号</b> ' + esc(x.student) + ' · ' + x.aiScore + ' 分 · 未通过 0 项</div>' +
      '<div class="cmt-t">' + esc(x.text) + '</div></div>').join('') : '<p class="none">（无）</p>') + '</div>';
  }).join('') + '</div></section>' : '';

  const allComments = report.comments.slice().sort((a, b) => (a.dominantPackage || 'Z').localeCompare(b.dominantPackage || 'Z') || a.classId - b.classId || String(a.serial).localeCompare(String(b.serial)))
    .map((x) => '<tr><td>' + esc(x.dominantPackage || '—') + '</td><td>' + esc(x.className) + '</td><td>' + esc(x.student) + '</td><td>' + x.aiScore + '</td><td>' + esc(x.missCodes.join(' ')) + '</td><td class="txt">' + esc(x.text) + '</td></tr>').join('');

  const footnote = '<ol>' +
    '<li>数据来源：' + esc(meta.sourceNote || '') + '（输入文件 <code>docs/dsh/experiment2-export.json</code>，schema <code>' + esc(meta.schema) + '</code>，导出时间 ' + esc(meta.inputGeneratedAt) + '）。</li>' +
    '<li>assignment id = ' + esc((meta.assignments || []).join(' / ')) + '；question id = ' + esc(String(meta.questionId)) + '；班级：' + report.classes.map((c) => esc(c.className) + '(classId ' + c.classId + ', n=' + c.n + ')').join('、') + '。</li>' +
    '<li>尺子/checker 版本：' + (meta.rulers || []).map((r) => 'rulerId=' + esc(String(r.rulerId)) + ' status=' + esc(r.status) + ' checker_id=' + esc(String(r.checkerId).slice(0, 26)) + '… boundTo=' + esc(JSON.stringify(r.boundTo))).join('；') + '。</li>' +
    '<li>口径：未通过 = <code>breakdown[].status !== "hit"</code>（hit/miss/missing 三态取 checker 原文）；失分率 = 未通过人数 / 该班人数；得分率 = Σ原始分 / Σ满分。</li>' +
    '<li>分数统计用 <code>aiScore</code>（平台 INT 列）；σ = 总体标准差（÷n）；分位数 = 线性插值（Excel QUARTILE.INC 同口径）。</li>' +
    '<li>包 A–F = 按条目 title 前缀 <code>1.–6.</code> 归并的六个考核模块（A=1.x … F=6.x）；评语按「该生失分最多的包」归类（并列取失分权重），两班并排；无未通过项者单列。</li>' +
    '<li><b>两种 Δ 方向不同</b>：包表 Δ = 得分率差（正 = 2 班更高）；项表/图 Δ = 失分率差（正 = 2 班失分更多），单位 pp。</li>' +
    '<li>报告由 <code>scripts/report/experiment2-report.mjs</code> 生成（指纹 <code>' + fingerprint + '</code>），生成时间 ' + esc(opts.generatedAt) + '；可用 <code>--check</code> 校验是否与输入一致。</li>' +
    (report.dataWarnings.length ? '<li><b>数据告警</b>：' + report.dataWarnings.map(esc).join('；') + '。</li>' : '') +
    '</ol>';

  return '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><title>实验 2 两班对比报告</title>' +
    '<style>body{font-family:system-ui,-apple-system,"PingFang SC",sans-serif;margin:0;padding:28px;color:#111827;background:#f9fafb}' +
    'h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px;border-left:4px solid #2563eb;padding-left:8px}h3{font-size:14px;margin:14px 0 6px}h4{font-size:13px;margin:0 0 6px;color:#374151}' +
    'section,footer{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:14px}' +
    'table{border-collapse:collapse;width:100%;font-size:12.5px}th,td{border:1px solid #e5e7eb;padding:4px 7px;text-align:left;vertical-align:top}' +
    'thead th{background:#f3f4f6;position:sticky;top:0}tr.top td{background:#fff7ed}td.k{font-weight:600;white-space:nowrap}.neg{color:#b91c1c}.pos{color:#047857}' +
    '.scroll{max-height:520px;overflow:auto}.two-col{display:flex;gap:12px}.two-col>.col{flex:1;min-width:0}' +
    '.cmt{border:1px solid #eef2f7;border-radius:6px;padding:6px 8px;margin-bottom:6px;background:#fbfdff}.cmt-h{font-size:12px;color:#374151}.cmt-m{font-size:11.5px;color:#b45309}.cmt-t{font-size:12px;color:#1f2937;margin-top:3px;line-height:1.45}' +
    '.none{color:#6b7280;font-size:12px}td.txt{min-width:320px;line-height:1.45}code{background:#f3f4f6;padding:0 3px;border-radius:3px}' +
    'footer{font-size:12px;color:#374151}footer ol{margin:0;padding-left:20px;line-height:1.6}</style></head><body>' +
    '<h1>实验 2 · 两班对比报告（6 包 × 87 项）</h1>' +
    '<p style="margin:0 0 12px;color:#6b7280;font-size:12.5px">生成时间 ' + esc(opts.generatedAt) + ' · 指纹 <code>' + fingerprint + '</code> · 数据导出时间 ' + esc(meta.inputGeneratedAt) + '</p>' +
    '<section><h2>1 总览（两班）</h2><table><thead><tr><th>指标</th><th>' + esc(c0.className) + '</th><th>' + esc(c1.className) + '</th></tr></thead><tbody>' + statRows + '</tbody></table></section>' +
    '<section><h2>2 分数分布</h2>' + histSvg + '</section>' +
    '<section><h2>3 六个包（A–F）对照</h2>' + pkgSvg + '<table style="margin-top:10px"><thead><tr><th>包</th><th>名称</th><th>项数</th><th>满分</th><th>' + esc(c0.className) + ' 得分率</th><th>' + esc(c1.className) + ' 得分率</th><th>Δ 得分率 pp<br>（' + esc(c1.className) + ' − ' + esc(c0.className) + '，正=2 班更高）</th><th>项失分率（两班）</th></tr></thead><tbody>' + pkgRows + '</tbody></table></section>' +
    '<section><h2>4 逐项失分率（87 项，按差异最大排序）</h2>' + top20Svg + '<div style="margin-top:10px" class="scroll"><table><thead><tr><th>差异排名</th><th>条目</th><th>包</th><th>说明</th><th>满分</th><th>' + esc(c0.className) + ' 未通过</th><th>率</th><th>' + esc(c1.className) + ' 未通过</th><th>率</th><th>Δ 失分率 pp<br>（' + esc(c1.className) + ' − ' + esc(c0.className) + '，正=2 班失分更多）</th></tr></thead><tbody>' + itemRows + '</tbody></table></div><p style="font-size:12px;color:#6b7280">橙色行 = 差异 Top 20；全部 87 项见上表与 XLSX「逐项失分率」sheet。</p></section>' +
    '<section><h2>5 评语对照（80 条：按包分组 + 无失分组，两班并排）</h2>' + commentBlocks + unassignedBlock + '<h3>全量评语表（80 条）</h3><div class="scroll"><table><thead><tr><th>包</th><th>班</th><th>学生</th><th>AI 分</th><th>未通过条目</th><th>AI 总评</th></tr></thead><tbody>' + allComments + '</tbody></table></div></section>' +
    '<footer><h3 style="margin-top:0">口径与数据来源脚注</h3>' + footnote + '</footer>' +
    '<script type="application/json" id="' + FINGERPRINT_ID + '">' + JSON.stringify({ fingerprint, itemCount: meta.itemCount, submissionCount: meta.submissionCount }) + '</script>' +
    '</body></html>\n';
}

// ─────────────────────────── XLSX ───────────────────────────
async function loadXlsx() {
  for (const rel of ['server/node_modules/xlsx/xlsx.mjs', 'node_modules/xlsx/xlsx.mjs']) {
    const p = path.join(ROOT, rel);
    if (fs.existsSync(p)) return await import(pathToFileURL(p).href);
  }
  return null;
}
function buildSheets(report, fingerprint, opts) {
  const c0 = report.classes[0], c1 = report.classes[1];
  const overview = [
    ['实验 2 两班对比报告'], [],
    ['数据来源', report.meta.sourceNote || ''], ['assignment id', (report.meta.assignments || []).join(' / ')],
    ['question id', report.meta.questionId], ['导出时间(输入)', report.meta.inputGeneratedAt], ['生成时间', opts.generatedAt], ['指纹', fingerprint],
    ['尺子/checker', (report.meta.rulers || []).map((r) => 'rulerId=' + r.rulerId + ' checker_id=' + r.checkerId + ' boundTo=' + JSON.stringify(r.boundTo)).join('；')], [],
    ['指标', c0.className, c1.className],
    ['提交数 n', c0.n, c1.n], ['均值', c0.mean, c1.mean], ['σ(总体)', c0.sd, c1.sd], ['中位数', c0.median, c1.median],
    ['Q1', c0.q1, c1.q1], ['Q3', c0.q3, c1.q3], ['最小', c0.min, c1.min], ['最大', c0.max, c1.max],
    ['通过项', c0.passedItems, c1.passedItems], ['总项', c0.totalItems, c1.totalItems], ['项得分率', c0.scoreRateByItems, c1.scoreRateByItems], ['项失分率', c0.missRate, c1.missRate], [],
    ['口径'], ['未通过 = breakdown[].status !== "hit"；失分率 = 未通过人数/班人数'],
    ['注', '分数用 aiScore（INT 列）；σ=总体标准差；分位数=线性插值；得分率分母=87 项满分之和'],
    ...report.dataWarnings.map((w) => ['数据告警', w]),
  ];
  const pkg = [['包', '名称', '项数', '满分', c0.className + ' 得分', c1.className + ' 得分', c0.className + ' 得分率', c1.className + ' 得分率', 'Δ 得分率 pp（2班−1班，正=2班更高）', c0.className + ' 项失分率', c1.className + ' 项失分率'],
    ...report.packages.map((p) => [p.key, p.name, p.itemCount, p.maxSum, p.per[0].got, p.per[1].got, p.per[0].rate, p.per[1].rate, p.deltaPp, p.per[0].missRate, p.per[1].missRate])];
  const dist = [['分档', c0.className + ' 人数', c0.className + ' 占比', c1.className + ' 人数', c1.className + ' 占比'],
    ...c0.histogram.map((b, i) => [b.label, b.count, b.pct, c1.histogram[i].count, c1.histogram[i].pct])];
  const items = [['差异排名', '条目', '包', '说明', '满分', c0.className + ' 未通过', c0.className + ' 失分率', c1.className + ' 未通过', c1.className + ' 失分率', 'Δ 失分率 pp（2班−1班，正=2班失分更多）'],
    ...report.rankedItems.map((r) => [r.diffRank, r.item, r.package, r.title, r.maxScore, r.per[0].miss, r.per[0].rate, r.per[1].miss, r.per[1].rate, r.deltaPp])];
  const cmts = [['归类包', '班', '序号', '学生', 'AI 分', '未通过数', '未通过条目', 'AI 总评(摘要)', 'checker_id'],
    ...report.comments.slice().sort((a, b) => (a.dominantPackage || 'Z').localeCompare(b.dominantPackage || 'Z') || a.classId - b.classId || String(a.serial).localeCompare(String(b.serial)))
      .map((c) => [c.dominantPackage || '', c.className, c.serial, c.student, c.aiScore, c.missCount, c.missCodes.join(' '), c.text, c.checkerId])];
  return [
    { name: '总览', rows: overview, widths: [18, 60, 60] },
    { name: '6包对照', rows: pkg, widths: [6, 44, 6, 8, 14, 14, 12, 12, 9, 15, 15] },
    { name: '分数分布', rows: dist, widths: [10, 10, 10, 10, 10] },
    { name: '逐项失分率', rows: items, widths: [9, 7, 5, 46, 6, 12, 12, 12, 12, 9] },
    { name: '评语对照', rows: cmts, widths: [8, 12, 6, 14, 7, 9, 22, 90, 40] },
  ];
}
function writeXlsx(XLSX, sheets, outFile, metaRows) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    ws['!cols'] = s.widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  // ★SheetJS 的 ESM 构建不自带 fs（writeFile 会退化到浏览器下载并抛错）⇒ 自行落盘
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', compression: true });
  fs.writeFileSync(outFile, buf);
  return { sheetNames: sheets.map((s) => s.name), rows: sheets.map((s) => s.rows.length) };
}

// ─────────────────────────── 主流程 ───────────────────────────
function generate({ input, outDir, now }) {
  const data = loadExport(input);
  const report = computeReport(data);
  const fingerprint = fingerprintOf(report);
  const htmlFile = path.join(outDir, 'experiment2-report.html');
  const xlsxFile = path.join(outDir, 'experiment2-report.xlsx');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(htmlFile, renderHtml(report, fingerprint, { generatedAt: now }), 'utf8');
  return { data, report, fingerprint, htmlFile, xlsxFile };
}

function readFingerprintFromHtml(file) {
  if (!fs.existsSync(file)) return null;
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(new RegExp('<script type="application/json" id="' + FINGERPRINT_ID + '">([\\s\\S]*?)</script>'));
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('用法: node scripts/report/experiment2-report.mjs [--input f.json] [--out-dir dir] [--check] [--selftest]');
    return 0;
  }
  if (args.selftest) return await selftest(args);

  if (args.check) {
    const data = loadExport(args.input);                      // 缺失/非法 ⇒ InputError ⇒ 退出码 2
    const report = computeReport(data);
    const fp = fingerprintOf(report);
    const htmlFile = path.join(args.outDir, 'experiment2-report.html');
    const xlsxFile = path.join(args.outDir, 'experiment2-report.xlsx');
    const embedded = readFingerprintFromHtml(htmlFile);
    const okHtml = !!embedded && embedded.fingerprint === fp;
    const okXlsx = fs.existsSync(xlsxFile) && fs.statSync(xlsxFile).size > 2000;
    console.log('输入：' + args.input + '（schema=' + data.schema + '，' + report.meta.submissionCount + ' 提交 / ' + report.meta.itemCount + ' 项 / ' + report.meta.classNames.length + ' 班）');
    console.log('重算指纹：' + fp + '；报告内指纹：' + (embedded ? embedded.fingerprint : '(缺失)'));
    console.log('HTML ' + (okHtml ? 'OK' : 'STALE') + '：' + htmlFile + (fs.existsSync(htmlFile) ? '（' + fs.statSync(htmlFile).size + ' B）' : '（不存在）'));
    console.log('XLSX ' + (okXlsx ? 'OK' : 'MISSING') + '：' + xlsxFile + (fs.existsSync(xlsxFile) ? '（' + fs.statSync(xlsxFile).size + ' B）' : '（不存在）'));
    const warn = report.dataWarnings.length ? '数据告警 ' + report.dataWarnings.length + ' 条（见报告脚注）' : '无数据告警';
    console.log((okHtml && okXlsx) ? '结论：PASS —— 报告与输入一致（' + warn + '）' : '结论：FAIL —— 报告缺失或已过期，请重跑生成');
    return (okHtml && okXlsx) ? 0 : 1;
  }

  const now = new Date().toISOString();
  const { report, fingerprint, htmlFile, xlsxFile } = generate({ input: args.input, outDir: args.outDir, now });
  const XLSX = await loadXlsx();
  let xlsxInfo = null;
  if (XLSX) {
    const sheets = buildSheets(report, fingerprint, { generatedAt: now });
    xlsxInfo = writeXlsx(XLSX, sheets, xlsxFile, null);
  }
  console.log('输入：' + args.input);
  console.log('指纹：' + fingerprint + '（' + report.meta.submissionCount + ' 提交 / ' + report.meta.itemCount + ' 项 / 两班：' + report.meta.classNames.join('、') + '）');
  console.log('HTML：' + htmlFile + '（' + fs.statSync(htmlFile).size + ' B）');
  if (xlsxInfo) console.log('XLSX：' + xlsxFile + '（' + fs.statSync(xlsxFile).size + ' B；sheets=' + xlsxInfo.sheetNames.join('/') + '）');
  else console.log('XLSX：跳过（未找到 SheetJS：server/node_modules/xlsx/xlsx.mjs）');
  if (report.dataWarnings.length) report.dataWarnings.forEach((w) => console.log('告警：' + w));
  return 0;
}

async function selftest(args) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exp2-selftest-'));
  try {
    const base = JSON.parse(fs.readFileSync(args.input, 'utf8'));
    const fp0 = fingerprintOf(computeReport(base));
    const mutated = JSON.parse(JSON.stringify(base));
    const t = mutated.submissions[0];
    const item = t.feedback.breakdown.find((b) => b.maxScore > 0);
    item.score = item.maxScore; item.status = 'hit';                    // 让首位学生少一个失分项
    t.aiScore = Math.min(100, t.aiScore + 1);
    const fp1 = fingerprintOf(computeReport(mutated));
    const mutatedFile = path.join(tmpDir, 'mutated.json');
    fs.writeFileSync(mutatedFile, JSON.stringify(mutated));
    const gen = generate({ input: mutatedFile, outDir: tmpDir, now: 'selftest' });
    const embedded = readFingerprintFromHtml(gen.htmlFile);
    const htmlReflectsMutated = !!embedded && embedded.fingerprint === fp1;
    const changed = fp0 !== fp1;
    console.log('selftest：基线指纹 ' + fp0 + ' / 变异指纹 ' + fp1);
    console.log('selftest：变异后指纹变化 = ' + changed + '；生成 HTML 反映变异 = ' + htmlReflectsMutated);
    console.log('selftest：结论 ' + (changed && htmlReflectsMutated ? 'PASS —— 分数/失分率由输入推导，未硬编码' : 'FAIL —— 疑似硬编码'));
    return (changed && htmlReflectsMutated) ? 0 : 1;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().then((code) => process.exit(code)).catch((e) => {
  if (e instanceof InputError) { console.error('输入错误（退出码 2）：' + e.message); process.exit(2); }
  console.error('生成失败：' + (e && e.stack || e));
  process.exit(2);
});
