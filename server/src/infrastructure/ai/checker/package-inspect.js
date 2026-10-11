/**
 * package-inspect.js —— 由 server/src/services/checkerService.js 拆分而来（step 3，源行 665-682 · 733-742 · 744-765 · 767-787 · 789-812）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';

/** 标准包指纹：文件相对路径+大小 排序后 SHA1（判断标准包是否更换） */
function packageFingerprint(rootDir) {
  try {
    const lines = [];
    const walk = (dir, rel) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        const relPath = rel ? rel + '/' + ent.name : ent.name;
        if (ent.isDirectory()) walk(full, relPath);
        else lines.push(relPath + ':' + fs.statSync(full).size);
      }
    };
    walk(rootDir, '');
    return crypto.createHash('sha1').update(lines.sort().join('\n')).digest('hex').slice(0, 12);
  } catch {
    return null;
  }
}

/** 规则参数中作为「路径」使用的字段（按 rule_type） */
const PATH_PARAM_BY_TYPE = {
  file_exists: 'path',
  contains_text: 'path',
  count_regex: 'path',
  contains_regex: 'path',
  dir_contains_file: 'dir',
  file_count_in_dir: 'dir',
  syntax_check: 'dir',
};

/**
 * 收集工程根下全部文件/目录（相对路径，用于路径白名单校验）。
 * @param {string} projectRoot resolveProjectRoot 结果
 * @returns {{files: Set<string>, dirs: Set<string>}}
 */
function collectProjectPaths(projectRoot) {
  const files = new Set();
  const dirs = new Set();
  const walk = (dir, rel) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const relPath = rel ? rel + '/' + ent.name : ent.name;
      if (ent.isDirectory()) {
        dirs.add(relPath);
        walk(path.join(dir, ent.name), relPath);
      } else {
        files.add(relPath);
      }
    }
  };
  walk(projectRoot, '');
  return { files, dirs };
}

/**
 * L1 路径白名单校验：规则引用的 path/dir 必须真实存在于标准工程包（相对工程根）。
 * AI 幻觉不存在的文件（如 DataController.java）会在校准前被拦截并作为反馈，
 * 避免整轮空转（355 卡 76 分的根因）。
 * @param {object} rules
 * @param {{files: Set<string>, dirs: Set<string>}} paths
 * @returns {Array<{id: string, path: string, kind: string}>} 不存在的引用
 */
function validateRulePaths(rules, paths) {
  const errors = [];
  for (const item of rules.objective_items || []) {
    const key = PATH_PARAM_BY_TYPE[item.rule_type];
    if (!key) continue;
    const p = item.params && item.params[key];
    if (typeof p !== 'string' || !p) continue;
    const clean = p.replace(/^\.\//, '');
    const exists = key === 'dir' ? paths.dirs.has(clean) || paths.files.has(clean) : paths.files.has(clean);
    if (!exists) errors.push({ id: item.id, path: p, kind: key });
  }
  return errors;
}

/**
 * L2 校准反馈增强：读取失分规则指向的文件开头片段（供模型修正正则/匹配方式）。
 * @param {string} projectRoot
 * @param {Array} objectiveItems 本轮规则
 * @param {Array} deductions 失分项（runRules 结果）
 * @returns {Array} 附带 snippet 的失分项
 */
function enrichDeductionSnippets(projectRoot, objectiveItems, deductions) {
  const byId = new Map(objectiveItems.map((it) => [it.id, it]));
  return deductions.map((it) => {
    const rule = byId.get(it.id);
    const key = rule && PATH_PARAM_BY_TYPE[rule.rule_type];
    const p = key === 'path' && rule && rule.params && rule.params.path;
    if (!p) return it;
    try {
      const abs = path.resolve(projectRoot, p);
      if (!abs.startsWith(path.resolve(projectRoot) + path.sep)) return it;
      const content = fs.readFileSync(abs, 'utf8').slice(0, 200).replace(/\s+/g, ' ');
      return { ...it, snippet: content };
    } catch {
      return it;
    }
  });
}

export { packageFingerprint, collectProjectPaths, validateRulePaths, enrichDeductionSnippets };
