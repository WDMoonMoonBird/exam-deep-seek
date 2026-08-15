import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import pino from 'pino';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 日志落盘目录：server/logs（相对本文件 src/utils/ 上溯两级） */
export const LOG_DIR = path.resolve(__dirname, '..', '..', 'logs');

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * 生成本地时区的日期戳 YYYY-MM-DD，用作日志文件名后缀。
 *
 * @param {Date} [date=new Date()] 参考时间
 * @returns {string} 形如 '2026-08-03'
 */
function dayStamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 打开指定日期的日志文件句柄（追加模式）。
 *
 * 使用 pino 自带的 sonic-boom 目标并开启 sync 写入：事故回溯场景下，
 * 进程崩溃/exit 时不能丢失最后几条日志，同步写可保证已调用的 log 必定落盘。
 *
 * @param {string} day 日期戳 YYYY-MM-DD
 * @returns {import('sonic-boom')} 可写目标
 */
function openDestination(day) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  return pino.destination({
    dest: path.join(LOG_DIR, `app-${day}.log`),
    append: true,
    sync: true,
    mkdir: true,
  });
}

/** 当前已打开的日志文件对应的日期戳 */
let currentDay = '';
/** 当前日志文件目标句柄 */
let currentDest = null;
/** 落盘失败仅告警一次，避免刷屏 */
let fileSinkDisabled = false;

/**
 * 按天滚动的文件写入流。
 *
 * 每次写入前比对日期戳，跨天则关闭旧句柄并打开新文件（app-YYYY-MM-DD.log），
 * 因此长期运行的进程跨越零点后会自动切换到新文件，无需重启、无需额外依赖。
 *
 * 容错：任何落盘异常（磁盘满、权限不足等）都被吞掉并降级为「仅控制台」，
 * 日志系统本身绝不允许拖垮业务进程。
 *
 * @type {{write: (chunk: string) => void}}
 */
const dailyFileStream = {
  write(chunk) {
    if (fileSinkDisabled) return;
    try {
      const day = dayStamp();
      if (day !== currentDay || currentDest === null) {
        const previous = currentDest;
        currentDest = openDestination(day);
        currentDay = day;
        if (previous) {
          try {
            previous.flushSync();
            previous.end();
          } catch {
            // 旧句柄收尾失败不影响新文件写入
          }
        }
      }
      currentDest.write(chunk);
    } catch (err) {
      fileSinkDisabled = true;
      process.stderr.write(
        `[logger] 日志落盘失败，已降级为仅控制台输出：${err && err.message ? err.message : err}\n`,
      );
    }
  },
};

/**
 * 构造控制台输出流，保持改动前的行为不变：
 * - development：pino-pretty 彩色美化输出
 * - 其它环境：原始 NDJSON 直出 stdout
 *
 * 这里以「流」而非「transport」方式使用 pino-pretty（同一个包、同样的 options，
 * 输出格式一致），目的是与文件流共用 pino.multistream，且全程不引入 worker 线程，
 * 避免 transport 工作线程在进程退出时丢日志。
 *
 * @returns {NodeJS.WritableStream} 控制台可写流
 */
function createConsoleStream() {
  if (!IS_DEV) return process.stdout;
  try {
    const pretty = require('pino-pretty');
    return pretty({ colorize: true });
  } catch {
    // pino-pretty 缺失时静默降级为原始 JSON，不影响服务启动
    return process.stdout;
  }
}

const logger = pino(
  { level: LOG_LEVEL },
  pino.multistream(
    [
      { level: LOG_LEVEL, stream: createConsoleStream() },
      { level: LOG_LEVEL, stream: dailyFileStream },
    ],
    { dedupe: false },
  ),
);

export default logger;
