/**
 * classLossDistribution.js —— R2-B68（WAVE3）：按「班级 × 判据项」聚合失分分布。
 *
 * 口径（**复用既有批改结果**，不新写评分/判据链路）：
 *   · 结果来源 = Submission.aiFeedback（source='dsh-checker'）里的 breakdown[] —— 与教师审核页 / 管理员
 *     批改记录页消费的是**同一份投影**（上游：dshCheckerConsumer.buildWriteback 写入，字段 item/title/status/
 *     score/maxScore/comment）；
 *   · 每项 status：'hit' 命中 / 'miss' 未命中 / 其它（未知）⇒ 未知**不计入分母**，单独计数上报（不猜、不折算）；
 *   · 失分率 = miss / (hit + miss)（分母为 0 ⇒ null，前端显示「—」）；分子/分母一并返回，便于核对。
 *
 * 本模块**零 import**（prisma 由调用方注入）⇒ 纯函数可被自测与 client/scripts/verify-frontend.mjs 直接 import，
 * 不建 DB 连接、不起副作用。只读：本模块没有任何写路径。
 */

export const ITEM_STATUS = { hit: 'hit', miss: 'miss' };

/** 解析 Submission.aiFeedback（JSON 字符串或对象）⇒ { ok, source, items[] }；坏数据/缺字段一律安全降级 */
export function parseLossBreakdown(aiFeedback) {
  let doc = aiFeedback;
  if (typeof doc === 'string') {
    if (!doc.trim()) return { ok: false, reason: 'empty', source: null, items: [] };
    try { doc = JSON.parse(doc); } catch { return { ok: false, reason: 'bad_json', source: null, items: [] }; }
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, reason: 'not_object', source: null, items: [] };
  const raw = Array.isArray(doc.breakdown) ? doc.breakdown : [];
  const items = raw.filter((it) => it && typeof it === 'object').map((it) => ({
    item: String(it.item !== undefined && it.item !== null ? it.item : (it.name || '')).slice(0, 50),
    title: String(it.title || '').slice(0, 80),
    status: it.status === undefined || it.status === null ? null : String(it.status).slice(0, 24),
    score: Number(it.score) || 0,
    maxScore: Number(it.maxScore !== undefined ? it.maxScore : it.max_score) || 0,
  }));
  return { ok: true, reason: 'ok', source: doc.source || null, items };
}

/**
 * 聚合（纯函数）：
 * @param {Array<{id?:number, studentId?:number, aiFeedback?:string|object, checkerId?:string|null, canonicalSha256?:string|null}>} submissions
 * @returns {{items:Array, totals:object, versions:Array}} items 按失分率降序（并列按 miss 降序、item 升序）
 */
export function aggregateLossByItem(submissions) {
  const rows = new Map();
  const versions = new Map();
  const totals = { submissionsScanned: 0, submissionsWithItems: 0, items: 0, hits: 0, misses: 0, unknown: 0 };

  for (const s of Array.isArray(submissions) ? submissions : []) {
    if (!s) continue;
    totals.submissionsScanned += 1;
    if (s.checkerId || s.canonicalSha256) {
      const k = String(s.checkerId || '(no-checker)') + '|' + String(s.canonicalSha256 || '');
      const v = versions.get(k) || { checkerId: s.checkerId || null, canonicalSha256: s.canonicalSha256 || null, submissions: 0 };
      v.submissions += 1;
      versions.set(k, v);
    }
    const parsed = parseLossBreakdown(s.aiFeedback);
    if (!parsed.ok || !parsed.items.length) continue;
    totals.submissionsWithItems += 1;
    const seen = new Set();   // 同一提交内同项只计一次（脏数据重复行不重复计分）
    for (const it of parsed.items) {
      const key = it.item || it.title;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const row = rows.get(key) || { item: key, title: it.title || '', hit: 0, miss: 0, unknown: 0, scoreSum: 0, maxScoreSum: 0 };
      if (!row.title && it.title) row.title = it.title;
      if (it.status === ITEM_STATUS.hit) { row.hit += 1; totals.hits += 1; }
      else if (it.status === ITEM_STATUS.miss) { row.miss += 1; totals.misses += 1; }
      else { row.unknown += 1; totals.unknown += 1; }
      row.scoreSum += it.score;
      row.maxScoreSum += it.maxScore;
      rows.set(key, row);
    }
  }

  const items = [...rows.values()].map((r) => {
    const denominator = r.hit + r.miss;
    return {
      item: r.item,
      title: r.title,
      hit: r.hit,
      miss: r.miss,
      unknown: r.unknown,
      numerator: r.miss,
      denominator,
      lossRate: denominator > 0 ? Number((r.miss / denominator).toFixed(4)) : null,
      scoreSum: r.scoreSum,
      maxScoreSum: r.maxScoreSum,
      avgScore: denominator > 0 ? Number((r.scoreSum / denominator).toFixed(2)) : null,
    };
  }).sort((a, b) => {
    const ra = a.lossRate === null ? -1 : a.lossRate;
    const rb = b.lossRate === null ? -1 : b.lossRate;
    return (rb - ra) || (b.miss - a.miss) || String(a.item).localeCompare(String(b.item));
  });

  totals.items = items.length;
  return { items, totals, versions: [...versions.values()] };
}

/**
 * 读模型（只读；prisma 由调用方注入）：
 * @param {{prisma:object, assignmentId:number, classId?:number|null, visibleClassIds?:number[]|null}} opts
 *   visibleClassIds 为数组时：classId 必须命中（否则 {ok:false, reason:'forbidden'}）；未传 classId ⇒ 收敛到可见班级并集。
 * @returns {Promise<{ok:true, ...}|{ok:false, reason:string}>}
 */
export async function loadClassLossDistribution({ prisma, assignmentId, classId = null, visibleClassIds = null } = {}) {
  const aid = Number(assignmentId);
  if (!Number.isInteger(aid) || aid <= 0) return { ok: false, reason: 'bad_assignment' };
  const cid = classId === null || classId === undefined || classId === '' ? null : Number(classId);
  if (cid !== null && (!Number.isInteger(cid) || cid <= 0)) return { ok: false, reason: 'bad_class' };
  const scope = Array.isArray(visibleClassIds) ? visibleClassIds : null;
  if (cid !== null && scope && !scope.includes(cid)) return { ok: false, reason: 'forbidden' };

  const where = { assignmentId: aid };
  if (cid !== null) {
    const rows = await prisma.studentClass.findMany({ where: { classId: cid }, select: { studentId: true } });
    where.studentId = { in: rows.map((r) => r.studentId) };
  } else if (scope) {
    const rows = scope.length ? await prisma.studentClass.findMany({ where: { classId: { in: scope } }, select: { studentId: true } }) : [];
    where.studentId = { in: rows.map((r) => r.studentId) };
  }

  const submissions = await prisma.submission.findMany({
    where,
    select: { id: true, studentId: true, aiScore: true, finalScore: true, status: true, aiFeedback: true, checkerId: true, canonicalSha256: true },
  });
  const agg = aggregateLossByItem(submissions);

  // assignment / ruler 版本（尺子绑定 + 内容指纹）。
  // ★生成的 Prisma Client DMMF **不含** grading_rulers / assignment_question_rulers（B35 起这两张表由原始 SQL 管理，
  //   见 schema 注释与 dshRulerStore.js）⇒ 这里同样走**参数化只读** $queryRaw（不用 Unsafe 版本、保持零 import）。
  //   BigInt 统一转字符串，避免 JSON 序列化抛错。
  const bindings = await prisma.$queryRaw`SELECT question_id AS questionId, ruler_id AS rulerId FROM assignment_question_rulers WHERE assignment_id = ${aid}`;
  const rulerById = new Map();
  for (const b of bindings) {
    const rows = await prisma.$queryRaw`SELECT id, content_key AS contentKey, status, checker_id AS checkerId, rubric_sha256 AS rubricSha256, standard_sha256 AS standardSha256 FROM grading_rulers WHERE id = ${b.rulerId} LIMIT 1`;
    if (rows[0]) rulerById.set(String(b.rulerId), rows[0]);
  }

  return {
    ok: true,
    assignmentId: aid,
    classId: cid,
    items: agg.items,
    totals: agg.totals,
    versions: agg.versions,
    rulers: bindings.map((b) => {
      const r = rulerById.get(String(b.rulerId));
      return {
        // ★$queryRaw 对 UNSIGNED INT 列返回 BigInt（question_id / ruler_id 都是）⇒ 一律显式收窄：
        //   questionId → Number（原列就是 INT）、rulerId → String（BIGINT，避免 JSON.stringify 抛错）
        questionId: Number(b.questionId),
        rulerId: String(b.rulerId),
        contentKey: r ? r.contentKey : null,
        status: r ? r.status : null,
        checkerId: r ? r.checkerId : null,
        rubricSha256: r ? r.rubricSha256 : null,
        standardSha256: r ? r.standardSha256 : null,
      };
    }),
  };
}
