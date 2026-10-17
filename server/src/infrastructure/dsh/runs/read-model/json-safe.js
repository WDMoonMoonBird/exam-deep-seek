/**
 * infrastructure/dsh/runs/read-model/json-safe.js —— 读模型的 **JSON 安全化 / 原始行归一**（B3 纯搬运：从 read-model.js 原样搬出）。
 *
 * ★只读：纯函数，无 I/O。BIGINT（id/job_id/token 列）经 Prisma 原始查询返回 BigInt ⇒ 出口先归一为 Number。
 */
/** ★递归 JSON 安全化：Prisma 原始 SQL 的 BIGINT 会返回 BigInt（res.json 直接抛 TypeError）⇒ 出口统一归一 */
export function toJsonSafe(value) {
  if (typeof value === 'bigint') return Number(value);
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toJsonSafe(v);
    return out;
  }
  return value;
}

/** ★BIGINT（id/job_id/token 列）经 Prisma 原始查询返回 BigInt ⇒ 必须先归一为 Number，否则 res.json 抛错 */
export function normalizeRawRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) out[k] = typeof v === 'bigint' ? Number(v) : v;
  return out;
}
