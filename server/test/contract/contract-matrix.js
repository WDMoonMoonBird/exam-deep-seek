/**
 * contract-matrix —— 契约核对矩阵构建器（供契约测试与报告使用）。
 *
 * 数据源：
 *  - 契约：server/src/domain/ports/repositories.js（8 仓储）、gateways.js（5 端口）、
 *           server/src/domain/events.js（EventBus 契约，额外覆盖）
 *  - 实现：infrastructure/ 下真实适配器类（import 后读原型方法，零 DB / 零网络副作用）
 *  - 使用：应用层（use-cases / app.js / controllers）实际调用的方法清单（静态审计结论）
 *
 * 本模块只做「形状」审计，不实例化、不调用外部依赖。
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { QuestionRepository } from '../../src/infrastructure/persistence/question.repository.js';
import { SubmissionRepository } from '../../src/infrastructure/persistence/submission.repository.js';
import { SystemConfigRepository } from '../../src/infrastructure/persistence/system-config.repository.js';
import { DeepSeekGateway } from '../../src/infrastructure/ai/deepseek-gateway.js';
import { CachingAiGateway } from '../../src/infrastructure/ai/caching-ai-gateway.js';
import { SocketNotifier } from '../../src/infrastructure/notifier/socket-notifier.js';
import { InMemoryRateLimiter } from '../../src/infrastructure/rate-limit/in-memory-rate-limiter.js';
import { InMemoryEventBus } from '../../src/infrastructure/events/in-memory-event-bus.js';
import { CompileExecutor } from '../../src/infrastructure/execution/compile-executor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../src');

function readSrc(rel) {
  return readFileSync(path.join(SRC, rel), 'utf-8');
}

/**
 * 从 JSDoc 注释块中解析 @typedef 名称与 @property 方法清单。
 * 处理类型描述中的嵌套花括号（如 {criteria: {a?: number} => Promise<{list: Array}>}）。
 */
export function parsePortMethods(text) {
  const blocks = text.match(/\/\*\*[\s\S]*?\*\//g) || [];
  const result = [];
  for (const block of blocks) {
    const tdef = block.match(/@typedef\s*\{[^}]*\}\s+([A-Za-z_$][\w$]*)/);
    if (!tdef) continue;
    const port = tdef[1];
    const methods = [];
    let idx = 0;
    while (idx < block.length) {
      const start = block.indexOf('@property', idx);
      if (start < 0) break;
      let i = start + '@property'.length;
      while (i < block.length && /\s/.test(block[i])) i++;
      if (block[i] !== '{') { idx = start + 1; continue; }
      let depth = 0;
      let j = i;
      while (j < block.length) {
        if (block[j] === '{') depth++;
        else if (block[j] === '}') { depth--; if (depth === 0) break; }
        j++;
      }
      const m = block.slice(j + 1).match(/^\s+([A-Za-z_$][\w$]*)/);
      if (m) {
        const rest = block.slice(j + 1 + m[0].length).trim();
        methods.push({ name: m[1], desc: rest.slice(0, 80) });
      }
      idx = j + 1;
    }
    result.push({ port, methods });
  }
  return result;
}

/** 读类的原型方法名集合（不含 constructor/私有方法） */
export function classMethods(cls) {
  const proto = cls.prototype || {};
  const names = [];
  for (const n of Object.getOwnPropertyNames(proto)) {
    if (n === 'constructor' || n.startsWith('#')) continue;
    const v = proto[n];
    if (typeof v === 'function') names.push(n);
  }
  return names.sort();
}

/** 原型方法是否为 async 函数（async 函数必定返回 Promise） */
export function isAsyncMethod(cls, name) {
  const fn = (cls.prototype || {})[name];
  return typeof fn === 'function' && fn.constructor && fn.constructor.name === 'AsyncFunction';
}

/**
 * 契约核对矩阵：契约端口方法 → 适配器实现状态。
 * status: 一致 | 命名不一致 | 无实现适配器 | 契约缺实现
 */
export function buildContractMatrix() {
  const reposSrc = readSrc('domain/ports/repositories.js');
  const gatewaysSrc = readSrc('domain/ports/gateways.js');
  const eventsSrc = readSrc('domain/events.js');

  const repos = parsePortMethods(reposSrc);
  const gateways = parsePortMethods(gatewaysSrc);
  const eventBus = parsePortMethods(eventsSrc).find(p => p.port === 'EventBus');

  const implTable = {
    QuestionRepository: { cls: QuestionRepository },
    SubmissionRepository: { cls: SubmissionRepository },
    SystemConfigRepository: { cls: SystemConfigRepository },
    AiGateway: { cls: DeepSeekGateway, alt: CachingAiGateway },
    NotificationPort: { cls: SocketNotifier },
    RateLimiterPort: { cls: InMemoryRateLimiter },
    ExecutorPort: { cls: CompileExecutor },
    EventBus: { cls: InMemoryEventBus },
  };

  // 应用层实际使用的方法（静态审计结论，见 agent-contract 报告 §2/§5）
  const usedByApp = {
    QuestionRepository: ['create', 'findById'],
    SubmissionRepository: ['findById', 'findScoreContext', 'update', 'findAssignmentContext', 'findByAssignmentAndQuestion', 'create', 'resetByAssignment'],
    SystemConfigRepository: ['get', 'set', 'getApiKey', 'getBaseUrl', 'getModel', 'getConcurrency', 'loadAll', 'clearCache'],
    AiGateway: ['grade', 'parsePaper'],
    NotificationPort: ['notifyGraded', 'notifyProjectGraded'],
    RateLimiterPort: ['isBlocked', 'recordFailure', 'recordSuccess', 'cleanup'],
    EventBus: ['publish', 'subscribe'],
    ExecutorPort: ['compileCheck'],
  };

  const rows = [];

  const addRows = (ports, kind) => {
    for (const { port, methods } of ports) {
      const impl = implTable[port];
      for (const m of methods) {
        const implemented = impl ? classMethods(impl.cls).includes(m.name) : false;
        const used = (usedByApp[port] || []).includes(m.name);
        let status;
        let note = '';
        if (!impl) {
          status = '契约缺实现';
          note = '无适配器类（infrastructure 下无实现，应用层未使用）';
        } else if (implemented) {
          status = '一致';
          note = used ? '已实现且被应用层使用' : '已实现（未被应用层使用）';
        } else {
          status = '命名不一致';
          const actual = classMethods(impl.cls);
          note = '适配器方法集[' + actual.join(', ') + ']中无同名方法';
        }
        rows.push({ kind, port, method: m.name, contractDesc: m.desc, implemented, used, status, note });
      }
    }
  };

  addRows(repos, '仓储');
  addRows(gateways, '端口');
  if (eventBus) addRows([eventBus], '事件');

  return { rows, repos, gateways, eventBus };
}

/** 生成 Markdown 表格文本（供报告引用） */
export function matrixToMarkdown(matrix) {
  const lines = [];
  lines.push('| 类型 | 端口 | 契约方法 | 实现状态 | 被应用层使用 | 说明 |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of matrix.rows) {
    lines.push('| ' + r.kind + ' | ' + r.port + ' | ' + r.method + ' | ' + r.status + ' | ' + (r.used ? '✅' : '—') + ' | ' + r.note + ' |');
  }
  return lines.join('\n');
}

/** 汇总统计 */
export function matrixStats(matrix) {
  const stats = { total: matrix.rows.length };
  for (const r of matrix.rows) {
    stats[r.status] = (stats[r.status] || 0) + 1;
  }
  return stats;
}
