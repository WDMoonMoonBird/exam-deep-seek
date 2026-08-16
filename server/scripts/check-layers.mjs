#!/usr/bin/env node
/**
 * check-layers.mjs — 分层依赖方向守卫（零依赖，可进 CI）
 * 规则（对齐 docs/refactor-architecture.md）：
 *   domain/        : 禁止 import 任何 npm 包 / node 内置 / domain 之外的相对路径
 *   application/   : 禁止 import 基础设施类 npm 包与 node 内置 IO；禁止相对路径指向 infrastructure|interface
 *   infrastructure/: 禁止相对路径指向 application|interface
 *   interface/     : 禁止相对路径指向 infrastructure
 * 用法：node server/scripts/check-layers.mjs [--save-baseline]
 * 退出码：0 无违规；1 有违规
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const BASELINE_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/layer-violations-baseline.md');
const saveBaseline = process.argv.includes('--save-baseline');

const EXTERNAL_BLACKLIST = [
  'express', '@prisma/client', 'prisma', 'axios', 'socket.io', 'socket.io-client',
  'mysql2', 'multer', 'adm-zip', 'mammoth', 'dotenv', 'jsonwebtoken', 'bcryptjs',
  'pino', 'pino-pretty', 'helmet', 'cors', 'qrcode', 'xlsx', 'ignore',
  'magic-bytes.js', 'express-rate-limit', 'nodemon',
];
const NODE_IO = /^(node:)?(fs|path|child_process|http|https|net|tls|dns|os|worker_threads|readline|stream|zlib|vm|dgram|cluster)$/;

const IMPORT_RE = /(?:import\s+(?:[^'"\n]*?\s+from\s+)?|require\s*\(\s*|import\s*\(\s*)(['"])([^'"]+)\1/g;

function listFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else if (/\.(js|mjs|cjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

const layerOf = (p) => {
  const rel = path.relative(SRC_DIR, p);
  const seg = rel.split(path.sep)[0];
  return ['domain', 'application', 'infrastructure', 'interface'].includes(seg) ? seg : 'unlayered';
};

const violations = [];
const files = listFiles(SRC_DIR);

for (const file of files) {
  const layer = layerOf(file);
  const rel = path.relative(SRC_DIR, file);
  const src = fs.readFileSync(file, 'utf8');
  const imports = [...src.matchAll(IMPORT_RE)].map((m) => m[2]);

  for (const spec of imports) {
    const isExternal = !spec.startsWith('.') && !spec.startsWith('/');
    const isNodeIO = NODE_IO.test(spec);
    const target = isExternal ? 'external' : path.resolve(path.dirname(file), spec);
    const targetLayer = isExternal ? 'external' : layerOf(target);

    const v = (rule, detail) => violations.push({ file: rel, spec, rule, detail });

    if (layer === 'domain') {
      if (isExternal) v('domain-imports-external', '领域层禁止 import 任何 npm 包/内置模块');
      else if (targetLayer !== 'domain') v('domain-imports-outside', '领域层禁止 import domain 之外的相对路径');
    } else if (layer === 'application') {
      if (isExternal) {
        if (isNodeIO || EXTERNAL_BLACKLIST.includes(spec)) v('application-imports-external', '应用层禁止基础设施类依赖');
      } else if (targetLayer === 'infrastructure' || targetLayer === 'interface') {
        v('application-imports-infra', '应用层禁止依赖基础设施/接口层');
      }
    } else if (layer === 'infrastructure') {
      if (!isExternal && (targetLayer === 'application' || targetLayer === 'interface')) {
        v('infrastructure-imports-upper', '基础设施层禁止反向依赖应用/接口层');
      }
    } else if (layer === 'interface') {
      if (!isExternal && targetLayer === 'infrastructure') {
        v('interface-imports-infra', '接口层禁止直接依赖基础设施（应经应用用例）');
      }
    }
  }
}

const unlayered = files.map((f) => path.relative(SRC_DIR, f)).filter((f) => layerOf(path.join(SRC_DIR, f)) === 'unlayered').sort();

const byRule = {};
for (const v of violations) byRule[v.rule] = (byRule[v.rule] || 0) + 1;

const lines = [];
lines.push('# 分层依赖违规基线（P0 快照）');
lines.push('');
lines.push('> 生成时间：' + new Date().toISOString() + '　扫描文件数：' + files.length + '　违规总数：' + violations.length);
lines.push('> 目标：随 P1–P8 逐步清零。每阶段结束后重跑 `node server/scripts/check-layers.mjs` 对比。');
lines.push('');
lines.push('## 按规则统计');
lines.push('');
lines.push('| 规则 | 数量 | 含义 |');
lines.push('|---|---|---|');
const ruleDesc = {
  'domain-imports-external': '领域层 import npm 包/内置模块',
  'domain-imports-outside': '领域层 import 领域外相对路径',
  'application-imports-external': '应用层 import 基础设施类包',
  'application-imports-infra': '应用层 import 基础设施/接口层',
  'infrastructure-imports-upper': '基础设施层反向依赖',
  'interface-imports-infra': '接口层直接依赖基础设施',
};
for (const r of Object.keys(byRule).sort((a, b) => byRule[b] - byRule[a])) {
  lines.push('| ' + r + ' | ' + byRule[r] + ' | ' + (ruleDesc[r] || '') + ' |');
}
lines.push('');
lines.push('## 明细');
lines.push('');
for (const v of violations) {
  lines.push('- `' + v.file + '` → `' + v.spec + '` ［' + v.rule + '］' + v.detail);
}

lines.push('');
lines.push('## 未分层文件（待迁移清单）');
lines.push('');
lines.push('> 以下文件位于 server/src 根目录，尚未归入四层；迁移到层目录后即受规则约束，本清单随迁移逐步清零。');
lines.push('');
for (const f of unlayered) lines.push('- `' + f + '`');

if (saveBaseline) {
  fs.writeFileSync(BASELINE_FILE, lines.join('\n') + '\n');
  console.log('基线已保存：' + BASELINE_FILE);
}
console.log('文件 ' + files.length + ' 个，违规 ' + violations.length + ' 条（' + Object.keys(byRule).length + ' 类规则），未分层待迁移 ' + unlayered.length + ' 个');
for (const r of Object.keys(byRule).sort((a, b) => byRule[b] - byRule[a])) {
  console.log('  ' + r + ': ' + byRule[r]);
}
if (violations.length > 0 && !saveBaseline) {
  console.log('\n违规示例（前 15 条）：');
  for (const v of violations.slice(0, 15)) {
    console.log('  ' + v.file + ' → ' + v.spec + ' [' + v.rule + ']');
  }
}
process.exit(violations.length > 0 ? 1 : 0);