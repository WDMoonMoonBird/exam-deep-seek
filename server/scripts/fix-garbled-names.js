#!/usr/bin/env node
/**
 * 乱码文件名诊断脚本（P3，只读）
 *
 * 背景：修复前，adm-zip 用默认 utf-8 解码 GBK 包的条目名，非法字节被替换为
 * U+FFFD（REPLACEMENT CHARACTER）后直接落盘。落盘时 U+FFFD 已被编码为合法
 * UTF-8 字节序列 EF BF BD，**原始 GBK 字节已永久丢失，无法自动还原**。
 * 因此本脚本只做扫描与报告，绝不重命名、绝不删除任何文件。
 *
 * 用法：node server/scripts/fix-garbled-names.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';

/** 只读模式常量：恒为 true，本脚本不提供任何写操作分支 */
const DRY_RUN = true;

/** U+FFFD REPLACEMENT CHARACTER，乱码判定标志 */
const REPLACEMENT_CHAR = '\uFFFD';

/** 报告中打印的样本条数上限 */
const SAMPLE_LIMIT = 20;

/** 递归深度上限，防御异常软链或超深目录 */
const MAX_DEPTH = 32;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, '../uploads');

/** 待扫描的两个上传根目录 */
const SCAN_ROOTS = [
  { key: 'project-submissions', dir: path.join(UPLOADS_DIR, 'project-submissions') },
  { key: 'projects', dir: path.join(UPLOADS_DIR, 'projects') },
];

/**
 * 判断单个名字是否含 U+FFFD。
 * @param {string} name
 * @returns {boolean}
 */
function isGarbled(name) {
  return typeof name === 'string' && name.includes(REPLACEMENT_CHAR);
}

/**
 * 统计字符串中 U+FFFD 的出现次数。
 * @param {string} name
 * @returns {number}
 */
function countReplacement(name) {
  let n = 0;
  for (const ch of name) {
    if (ch === REPLACEMENT_CHAR) n += 1;
  }
  return n;
}

/**
 * 从 project-submissions 相对路径中解析业务标识。
 * 约定布局：<assignmentId>/<submissionId>/<version>/<...文件路径>
 *
 * @param {string} rootKey 扫描根标识
 * @param {string} relPath 相对扫描根的 posix 风格路径
 * @returns {{assignmentId:string, submissionId:string, version:string}|null}
 */
function parseSubmissionMeta(rootKey, relPath) {
  if (rootKey !== 'project-submissions') return null;
  const segs = relPath.split('/').filter(Boolean);
  if (segs.length < 3) return null;
  return {
    assignmentId: segs[0],
    submissionId: segs[1],
    version: segs[2],
  };
}

/**
 * 递归扫描目录，收集名字含 U+FFFD 的文件与目录。
 * 只读：仅使用 readdirSync，不做任何写操作。
 *
 * @param {string} rootKey 扫描根标识
 * @param {string} rootDir 扫描根绝对路径
 * @param {string} curDir 当前目录绝对路径
 * @param {number} depth 当前递归深度
 * @param {{files:Array, dirs:Array, scannedEntries:number, errors:Array}} acc 累加器
 * @returns {void}
 */
function scanDir(rootKey, rootDir, curDir, depth, acc) {
  if (depth > MAX_DEPTH) {
    acc.errors.push(format('递归深度超过 %d，已跳过：%s', MAX_DEPTH, curDir));
    return;
  }

  let entries = [];
  try {
    entries = fs.readdirSync(curDir, { withFileTypes: true });
  } catch (e) {
    acc.errors.push(format('读取目录失败 %s：%s', curDir, e.message || e));
    return;
  }

  for (const ent of entries) {
    const abs = path.join(curDir, ent.name);
    const relPath = path.relative(rootDir, abs).split(path.sep).join('/');
    acc.scannedEntries += 1;

    if (isGarbled(ent.name)) {
      const record = {
        rootKey,
        absPath: abs,
        relPath,
        name: ent.name,
        replacementCount: countReplacement(ent.name),
        meta: parseSubmissionMeta(rootKey, relPath),
      };
      if (ent.isDirectory()) {
        acc.dirs.push(record);
      } else {
        acc.files.push(record);
      }
    }

    if (ent.isDirectory()) {
      scanDir(rootKey, rootDir, abs, depth + 1, acc);
    }
  }
}

/**
 * 打印单条乱码记录（含 project-submissions 业务标识）。
 * @param {{rootKey:string, relPath:string, name:string, meta:object|null}} rec
 * @param {number} idx 序号（从 1 开始）
 * @returns {void}
 */
function printRecord(rec, idx) {
  const prefix = format('  %d) [%s] %s', idx, rec.rootKey, rec.relPath);
  if (rec.meta) {
    console.log(
      format(
        '%s\n     assignmentId=%s  submissionId=%s  version=%s  乱码字符数=%d',
        prefix,
        rec.meta.assignmentId,
        rec.meta.submissionId,
        rec.meta.version,
        rec.replacementCount,
      ),
    );
  } else {
    console.log(format('%s\n     乱码字符数=%d', prefix, rec.replacementCount));
  }
}

/**
 * 主流程：扫描两个上传根目录并输出汇总报告。
 * @returns {void}
 */
function main() {
  console.log('===== 乱码文件名诊断（只读，DRY_RUN=' + DRY_RUN + '）=====');
  console.log('uploads 根目录：' + UPLOADS_DIR);
  console.log('');

  const acc = { files: [], dirs: [], scannedEntries: 0, errors: [] };
  const missingRoots = [];

  for (const root of SCAN_ROOTS) {
    if (!fs.existsSync(root.dir)) {
      missingRoots.push(root.dir);
      continue;
    }
    scanDir(root.key, root.dir, root.dir, 0, acc);
  }

  for (const dir of missingRoots) {
    console.log('目录不存在，已跳过：' + dir);
  }
  if (missingRoots.length) console.log('');

  console.log('已扫描条目总数：' + acc.scannedEntries);
  console.log('乱码文件数：' + acc.files.length);
  console.log('乱码目录数：' + acc.dirs.length);
  console.log('');

  if (acc.dirs.length) {
    console.log('乱码目录样本（最多 ' + SAMPLE_LIMIT + ' 条）：');
    acc.dirs.slice(0, SAMPLE_LIMIT).forEach((rec, i) => printRecord(rec, i + 1));
    if (acc.dirs.length > SAMPLE_LIMIT) {
      console.log('  ...（其余 ' + (acc.dirs.length - SAMPLE_LIMIT) + ' 条省略）');
    }
    console.log('');
  }

  if (acc.files.length) {
    console.log('乱码文件样本（最多 ' + SAMPLE_LIMIT + ' 条）：');
    acc.files.slice(0, SAMPLE_LIMIT).forEach((rec, i) => printRecord(rec, i + 1));
    if (acc.files.length > SAMPLE_LIMIT) {
      console.log('  ...（其余 ' + (acc.files.length - SAMPLE_LIMIT) + ' 条省略）');
    }
    console.log('');
  }

  // 按 assignmentId/submissionId 聚合，便于按人通知重传
  const affected = new Map();
  for (const rec of [...acc.dirs, ...acc.files]) {
    if (!rec.meta) continue;
    const key = rec.meta.assignmentId + '/' + rec.meta.submissionId;
    affected.set(key, (affected.get(key) || 0) + 1);
  }
  if (affected.size) {
    console.log('受影响的提交（assignmentId/submissionId → 乱码条目数）：');
    for (const [key, count] of affected) {
      console.log('  ' + key + ' → ' + count);
    }
    console.log('');
  }

  if (acc.errors.length) {
    console.log('扫描过程中的告警：');
    acc.errors.forEach((msg) => console.log('  - ' + msg));
    console.log('');
  }

  console.log('===== 修复建议 =====');
  if (acc.files.length === 0 && acc.dirs.length === 0) {
    console.log('未发现含 U+FFFD 的历史文件名，无需处理。');
  } else {
    console.log('1. 存量乱码无法自动还原：U+FFFD 落盘后原始 GBK 字节已丢失，');
    console.log('   磁盘上是合法 UTF-8 的 EF BF BD，任何逆向猜测都会产生错误文件名。');
    console.log('2. 学生提交（project-submissions）：按上面「受影响的提交」列表通知对应学生重新上传，');
    console.log('   重传将走已修复的解压链路（rawEntryName + UTF-8→GBK 智能解码），文件名不再乱码。');
    console.log('3. 教师标准包（projects）：由教师重新上传标准工程包覆盖。');
    console.log('4. 确需保留的历史包，可对照学号/提交记录人工改名，请勿批量脚本猜测。');
  }
  console.log('');
  console.log('本脚本为只读诊断，未重命名或删除任何文件。');
}

main();
