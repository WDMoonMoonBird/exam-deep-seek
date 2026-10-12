/**
 * snapshotHash.js —— W3（R2-B2）评分标准/标准包的哈希口径。
 *
 * ★口径与 scripts/dsh-checker/validate.py 保持同一套（不得另写一套）：
 *   - content_sha256(path)  = 文件字节 sha256 hex（validate.py:49-57）
 *   - dir_sha256(root, ign) = 'sha256:absent'（目录不存在）或
 *                             'sha256:' + sha256(Σ(rel + '\n' + digest + '\n'))，digest 为：
 *                               普通文件 → content_sha256；软链 → 'symlink:<target>'；不可读 → 'unreadable'
 *                             entry 按 rel 的 UTF-8 字节序排序（validate.py:111-131 + walk_filtered:82-108）
 *   - 平台的 rubric 是 DB 文本（不是文件）⇒ 用 rubric 正文做同口径内容哈希（textSha256），
 *     对应 check.py:415 的 'sha256:' + content_sha256(rubric_path)。
 * 交叉验证见 server/test/unit/w11-snapshot-hash.test.js（对同一 fixture 与 python3 validate.py 逐位对拍）。
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { standardDir } from './projectPaths.js';

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** 文件字节内容哈希（hex，不含前缀） */
export function contentSha256(absPath) {
  return sha256Hex(fs.readFileSync(absPath));
}

/** 平台侧内容口径：文本 → 'sha256:<hex>'（对齐 check.py 的 'sha256:' + content_sha256(...)） */
export function textSha256(text) {
  return 'sha256:' + sha256Hex(Buffer.from(String(text ?? ''), 'utf8'));
}

/**
 * 忽略规则（validate.py is_ignored 的可用子集）：
 * 支持 'x/**'（前缀目录整体忽略）与「任意深度同名」（双星号前缀写法）两种写法；平台标准包使用空 ignore。
 */
export function isIgnored(relPosix, ignore = []) {
  for (const raw of ignore || []) {
    if (!raw) continue;
    if (raw.endsWith('/**')) {
      const prefix = raw.slice(0, -3);
      if (relPosix === prefix || relPosix.startsWith(prefix + '/')) return true;
    }
    if (raw.startsWith('**/')) {
      const name = raw.slice(3);
      if (relPosix === name || relPosix.endsWith('/' + name)) return true;
    }
    if (relPosix === raw) return true;
  }
  return false;
}

/** 目录遍历（不跟随软链，目录按 realpath 去重），按 rel 的 UTF-8 字节序排序 */
export function walkFiltered(root, ignore = []) {
  const out = [];
  const seen = new Set();
  const stack = [['', root]];
  while (stack.length) {
    const [rel, cur] = stack.pop();
    let names;
    try { names = fs.readdirSync(cur).sort(); } catch { continue; }
    for (const name of names) {
      const r = rel ? rel + '/' + name : name;
      if (isIgnored(r, ignore)) continue;
      const p = path.join(cur, name);
      let st;
      try { st = fs.lstatSync(p); } catch { continue; }
      if (st.isSymbolicLink()) { out.push({ rel: r, abs: p, isLink: true }); continue; }
      if (st.isDirectory()) {
        let real;
        try { real = fs.realpathSync(p); } catch { real = p; }
        if (seen.has(real)) continue;
        seen.add(real);
        stack.push([r, p]);
      } else {
        out.push({ rel: r, abs: p, isLink: false });
      }
    }
  }
  out.sort((a, b) => Buffer.compare(Buffer.from(a.rel, 'utf8'), Buffer.from(b.rel, 'utf8')));
  return out;
}

/** 目录哈希：返回 { digest, entries }；目录不存在 → digest='sha256:absent' */
export function dirSha256(root, ignore = []) {
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) return { digest: 'sha256:absent', entries: 0 };
  const h = crypto.createHash('sha256');
  let n = 0;
  for (const e of walkFiltered(root, ignore)) {
    let digest;
    if (e.isLink) {
      let target = '?';
      try { target = fs.readlinkSync(e.abs); } catch { /* 保持 '?' */ }
      digest = 'symlink:' + target;
    } else {
      try { digest = contentSha256(e.abs); } catch { digest = 'unreadable'; }
    }
    h.update(e.rel, 'utf8');
    h.update('\n');
    h.update(digest, 'utf8');
    h.update('\n');
    n += 1;
  }
  return { digest: 'sha256:' + h.digest('hex'), entries: n };
}

/** 标准工程包目录哈希（题目级） */
export function standardPackSha256(questionId, ignore = []) {
  try {
    return dirSha256(standardDir(questionId), ignore).digest;
  } catch {
    return 'sha256:absent';
  }
}
