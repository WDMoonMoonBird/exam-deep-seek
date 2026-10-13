/**
 * dshRulerAssignment.js —— R2-B35（P0）：作业侧「内容指纹 → 尺子 → 绑定」的解析与落位。
 *
 * 铁律：
 *  1) 指纹只由**发布冻结快照**推导（assignment_questions.standard_hash 必须存在）；无快照的历史作业
 *     ⇒ ok:false reason=snapshot_missing，调用方回落旧路径（不改历史行为、不用活值冒名顶替）。
 *  2) 题目取 type='project' 那道（与 r2b20-export-materials.mjs 的 project_question_not_unique 同口径）；
 *     0 道 / 多道 ⇒ fail-closed（绝不猜）。
 *  3) 命中 ready ⇒ 零 LLM 复用；尺子原始字节**逐字节**落位 run-root（out/checker/checker.json +
 *     out/assignment/checker.frozen.json），供装置 measure-only-reuse 的 frozen 预检使用。
 *  4) 绑定 = assignment_question_rulers 首次绑定；已有绑定不一致 ⇒ fail-closed（RULER_BIND_CONFLICT 留痕）。
 */
import fs from 'fs';
import path from 'path';
import {
  RULER_TAG, bindRulerToQuestion, findAdoptableOldAnchor, findRulerByContentKey, findRulerById,
  hasRawSql, loadBinding, loadSnapshotContent, markRulerFailed, markRulerReady, resolvePollMs,
  resolveRulerForContent, resolveWaitMs, rulerStoreAvailable, RULER_STATUS,
} from './dshRulerStore.js';
import {
  buildAssignmentDescription, computeContentKey, descriptionContentSha256, explainContentKey,
  normalizeRulerText, resolveStandardPackageSha256, resolveUploadsRoot, rubricContentSha256, standardDirDigest, UPLOADS_ROOT_ENV,
} from './dshRulerContentKey.js';

export const CHECKER_JSON_REL = 'out/checker/checker.json';
export const CHECKER_FROZEN_REL = 'out/assignment/checker.frozen.json';

/**
 * ★解析作业内容指纹（只读、零 LLM）。
 * @returns {{ok:true, questionId:number, title:string, content:{standardSha256,rubric,description,rubricSha256,descriptionSha256}, contentKey:string, standardSource:string, explain:object} | {ok:false, reason:string, questionId?:number}}
 */
export async function resolveAssignmentContent({ prisma, assignmentId, questionId = null, uploadsRoot = null } = {}) {
  if (!prisma || !assignmentId) return { ok: false, reason: 'bad_args' };
  let links = [];
  try {
    links = await prisma.$queryRawUnsafe(
      'SELECT aq.question_id, q.type FROM assignment_questions aq JOIN questions q ON q.id = aq.question_id WHERE aq.assignment_id = ?',
      Number(assignmentId),
    );
  } catch (err) {
    return { ok: false, reason: 'link_query_failed:' + String(err && err.message).slice(0, 120) };
  }
  const rows = (links || []).map((r) => ({ questionId: Number(r.question_id), type: r.type }));
  const scoped = questionId ? rows.filter((r) => r.questionId === Number(questionId)) : rows;
  if (scoped.length === 0) return { ok: false, reason: questionId ? 'question_not_bound' : 'no_question_bound' };
  const projects = scoped.filter((r) => r.type === 'project');
  if (projects.length === 0) return { ok: false, reason: 'project_question_missing' };
  if (projects.length > 1) return { ok: false, reason: 'project_question_not_unique:' + projects.length };
  const qid = projects[0].questionId;

  const snap = await loadSnapshotContent(prisma, assignmentId, qid);
  if (!snap.ok) return { ok: false, reason: snap.reason, questionId: qid };
  const rubric = String(snap.rubric ?? '');
  // 题目描述字节：优先用 loadSnapshotContent 的同源构造（保证与老锚点判据逐字节一致），缺失时按同式补算
  const description = snap.description !== undefined ? snap.description : buildAssignmentDescription({ title: snap.title, material: snap.material });
  // ★标准包同源取 zip；目录不可用 ⇒ fail-closed（不回落快照口径，避免同内容两个 key）
  //   uploadsRoot 未显式给出（undefined/null）⇒ 取 env DSH_GRADER_UPLOADS_ROOT，缺省 = 平台真实 uploads/
  const root = uploadsRoot === undefined || uploadsRoot === null ? resolveUploadsRoot() : uploadsRoot;
  const std = resolveStandardPackageSha256({ questionId: qid, uploadsRoot: root });
  if (!std.ok) {
    return { ok: false, reason: 'standard_package_unavailable:' + std.reason, questionId: qid, standardDir: std.dir || null };
  }
  const content = {
    standardSha256: std.sha256,
    // ★发布冻结快照口径（②：'sha256:'+dirSha256(ignore=[])）——老锚点一致性判据用（与 zip 口径互不混用）
    snapshotStandardSha256: String(snap.standardSha256),
    standardDir: std.dir,
    rubric,
    description,
    rubricSha256: rubricContentSha256(rubric),
    descriptionSha256: descriptionContentSha256(description),
  };
  const explain = explainContentKey({ standardSha: content.standardSha256, rubric: content.rubric, description: content.description });
  return {
    ok: true, assignmentId: Number(assignmentId), questionId: qid, title: snap.title,
    standardSource: 'zip', standardDir: std.dir, standardFiles: std.files, snapshotOrigin: snap.origin,
    content, contentKey: explain.contentKey, explain,
  };
}

/** 尺子行的审计元信息（造尺时写入 grading_rulers） */
export function rulerMetaFromContent(content, { model = null, sourceRunId = null } = {}) {
  return {
    standardSha256: content.standardSha256,
    rubricSha256: content.rubricSha256,
    descriptionSha256: content.descriptionSha256,
    model,
    sourceRunId,
  };
}

/** ★把尺子原始字节逐字节落位 run-root（无 raw 时用 checkerJson 兜底；两者皆无 ⇒ ok:false，绝不半成品落位） */
export function writeRulerCheckerFiles({ runRoot, ruler, checkerJson = null } = {}) {
  const raw = ruler && ruler.checkerRaw ? Buffer.from(ruler.checkerRaw) : null;
  let body = raw;
  if (!body && checkerJson) body = Buffer.from(typeof checkerJson === 'string' ? checkerJson : JSON.stringify(checkerJson, null, 2), 'utf8');
  if (!body || body.length === 0) return { ok: false, reason: 'raw_bytes_unavailable' };
  const frozen = path.join(runRoot, CHECKER_FROZEN_REL);
  const plain = path.join(runRoot, CHECKER_JSON_REL);
  fs.mkdirSync(path.dirname(frozen), { recursive: true });
  fs.writeFileSync(frozen, body);
  fs.mkdirSync(path.dirname(plain), { recursive: true });
  fs.writeFileSync(plain, body);
  return { ok: true, bytes: body.length, frozenPath: frozen, plainPath: plain, byteExact: !!raw };
}

/** 读本作业已绑定的尺子（含一致性判据：绑定的 content_key vs 当前解析出的 content_key） */
export async function loadBoundRuler({ prisma, assignmentId, questionId, contentKey = null } = {}) {
  if (!hasRawSql(prisma)) return null;
  const binding = await loadBinding({ prisma, assignmentId, questionId });
  if (!binding) return null;
  const ruler = await findRulerById(prisma, binding.rulerId);
  return {
    binding, ruler,
    consistent: !!(ruler && contentKey && String(ruler.contentKey) === String(contentKey)),
  };
}

/**
 * ★校验收到的 checker 是否与当前内容同源（就地登记/复用的必要条件）：
 *   ① assignment_ref.rubric_hash == textSha256(当前 rubric)（平台口径，见 utils/snapshotHash.textSha256）
 *   ② 按 checker 自己的 ignore 复算**当前标准包目录**摘要 == assignment_ref.standard_hash（装置口径，check.py:412-423 同规则）
 * 任一不可判或不等 ⇒ { ok:false, reason }（fail-closed；绝不用无法证明同内容的尺子）
 */
export function verifyCheckerMatchesContent({ parsed, content } = {}) {
  if (!parsed || !content) return { ok: false, reason: 'missing_inputs' };
  const ar = parsed.assignment_ref || {};
  if (!ar.rubric_hash) return { ok: false, reason: 'rubric_hash_absent' };
  if (ar.rubric_hash !== content.rubricSha256) return { ok: false, reason: 'rubric_hash_mismatch' };
  if (!content.standardDir) return { ok: false, reason: 'current_standard_dir_unknown' };
  const expected = ar.standard_hash || null;
  if (!expected) return { ok: false, reason: 'standard_hash_absent' };
  const ignore = (parsed.input_contract || {}).ignore || [];
  const recomputed = standardDirDigest(content.standardDir, ignore);
  if (!recomputed || recomputed !== expected) return { ok: false, reason: 'standard_digest_mismatch' };
  return { ok: true };
}

/**
 * 兜底「就地登记」：该作业已有 ready 的旧 checker（+锚点原始字节）时，登记成 content_key 尺子（**零 LLM**），
 * 供本批迁移期把老尺子纳入新表（不重复造尺）。返回 null ⇒ 不满足登记条件（调用方 fail-closed 或回落）。
 */
export async function registerRulerFromLocalChecker({ prisma, assignmentId, questionId, content, log = console } = {}) {
  if (!hasRawSql(prisma)) return null;
  // ★单表查询（避免与 grading_assignment_anchors 的排序规则冲突，见 findAdoptableOldAnchor 注释）
  const rows = await prisma.$queryRawUnsafe(
    'SELECT c.checker_id, c.checker_json FROM grading_checkers c '
    + 'WHERE c.assignment_id = ? AND (c.question_id = ? OR c.question_id IS NULL) AND c.status = ? '
    + 'ORDER BY c.id DESC LIMIT 5',
    Number(assignmentId), Number(questionId), 'ready',
  ).catch(() => []);
  for (const candidate of rows || []) {
    if (!candidate || !candidate.checker_id) continue;
    const aRows = await prisma.$queryRawUnsafe(
      'SELECT frozen_sha256, checker_raw FROM grading_assignment_anchors WHERE assignment_id = ? AND checker_id = ? LIMIT 1',
      Number(assignmentId), candidate.checker_id,
    ).catch(() => []);
    const anchorRow = (aRows && aRows[0]) || null;
    let raw = anchorRow && anchorRow.checker_raw ? Buffer.from(anchorRow.checker_raw) : null;
    let parsed = null;
    if (!raw && candidate.checker_json) {
      try {
        parsed = typeof candidate.checker_json === 'string' ? JSON.parse(candidate.checker_json) : candidate.checker_json;
        raw = Buffer.from(JSON.stringify(parsed, null, 2), 'utf8');
      } catch { raw = null; }
    }
    if (!raw || raw.length === 0) continue;
    if (!parsed) { try { parsed = JSON.parse(raw.toString('utf8')); } catch { parsed = null; } }
    if (!parsed || parsed.checker_id !== candidate.checker_id) continue;
    // ★同级校验（A 复核 B②）：就地登记必须证明「与当前内容同源」，否则会把内容不符的旧尺登记成当前 content_key 的 ready 尺
    const verify = verifyCheckerMatchesContent({ parsed, content });
    if (!verify.ok) {
      if (typeof log?.log === 'function') log.log('RULER_INGEST_SKIP checker_id=' + candidate.checker_id + ' assignment=' + assignmentId + ' reason=' + verify.reason);
      continue;
    }
    if (typeof log?.log === 'function') {
      log.log('RULER_INGEST_LOCAL checker_id=' + candidate.checker_id + ' assignment=' + assignmentId + ' question=' + questionId
        + ' checker_raw_bytes=' + raw.length + ' source=' + (raw && anchorRow && anchorRow.checker_raw ? 'anchor_raw' : 'checker_json'));
    }
    return { checkerId: candidate.checker_id, frozenSha256: (anchorRow && anchorRow.frozen_sha256) || null, checkerRaw: raw, checkerJson: parsed, source: 'local_checker' };
  }
  return null;
}

/**
 * ★作业侧总入口：内容指纹 → 解析尺子（复用/等待/造尺/采纳）→ 绑定。
 *
 * @param {object} args
 * @param {'build'|'reuse'} args.mode
 *        'reuse'：消费方（worker 复用/控制器触发）——命中 ready 即零 LLM 复用；无行时只允许「就地登记」本地已入库尺子；
 *                 绝不跑装置、绝不造尺（无来源 ⇒ ok:false failClosed）
 *        'build'：造尺入口（r2b7/worker 造尺流程）——可采纳老锚点，或抢占 building 后**由调用方**造尺
 *                 （status='claimed_here' ⇒ 调用方必须 completeClaimedRuler / markRulerFailed 收尾）
 * @param {boolean|null} args.claimOnly  build 模式默认 true（抢占即交回所有权）；给 buildFn 时可设 false
 * @param {Function|null} args.buildFn   就地造尺函数（不跑装置的场景用；一般留空走 claimOnly）
 * @returns {{ok:boolean, status?:string, reason?:string, failClosed?:boolean, contentOk?:boolean, needsBuild?:boolean,
 *            content?:object, contentKey?:string, ruler?:object, zeroLlm?:boolean, binding?:object, questionId?:number, adopted?:boolean}}
 */
export async function resolveRulerForAssignment({
  prisma, assignmentId, questionId = null, uploadsRoot = null,
  mode = 'reuse', buildFn = null, claimOnly = null, pollIntervalMs = resolvePollMs(), waitTimeoutMs = resolveWaitMs(),
  sleep, now, log = console, jobTag = '', allowRetryFailed = null,
} = {}) {
  const contentRes = await resolveAssignmentContent({ prisma, assignmentId, questionId, uploadsRoot });
  if (!contentRes.ok) {
    // 内容指纹不可解析（无快照 / 无标准包 / 题目不唯一）⇒ 不参与内容化复用，调用方回落旧路径（行为不变）
    return { ok: false, reason: contentRes.reason, contentOk: false, failClosed: false, questionId: contentRes.questionId };
  }
  const { content, contentKey } = contentRes;
  const meta = rulerMetaFromContent(content);

  if (!(await rulerStoreAvailable(prisma))) {
    if (typeof log?.log === 'function') log.log(RULER_TAG.unavailable + ' assignment=' + assignmentId + ' content_key=' + contentKey + '（回落旧路径）');
    return { ok: false, reason: 'ruler_store_unavailable', contentOk: true, content, contentKey, questionId: contentRes.questionId };
  }

  // 已有绑定 ⇒ 先校验一致（不一致 ⇒ fail-closed，绝不静默换尺）
  const pre = await loadBoundRuler({ prisma, assignmentId, questionId: contentRes.questionId, contentKey });
  if (pre && pre.ruler && !pre.consistent) {
    const line = RULER_TAG.bindConflict + ' assignment=' + assignmentId + ' question=' + contentRes.questionId
      + ' bound_ruler=' + pre.binding.rulerId + ' bound_content_key=' + (pre.ruler.contentKey || '(none)')
      + ' current_content_key=' + contentKey;
    if (typeof log?.warn === 'function') log.warn(line);
    return { ok: false, reason: 'bind_conflict', failClosed: true, contentOk: true, content, contentKey, questionId: contentRes.questionId, binding: pre.binding, ruler: pre.ruler };
  }
  if (pre && pre.ruler && pre.ruler.status === RULER_STATUS.ready) {
    if (typeof log?.log === 'function') {
      log.log(RULER_TAG.reuse + ' content_key=' + contentKey + ' checker_id=' + (pre.ruler.checkerId || '(none)')
        + ' hit=bound checker_raw_bytes=' + pre.ruler.checkerRawBytes + (jobTag ? ' ' + jobTag : ''));
    }
    return { ok: true, status: 'reuse', zeroLlm: true, ruler: pre.ruler, binding: pre.binding, contentOk: true, content, contentKey, questionId: contentRes.questionId, reason: 'already_bound' };
  }

  const adoptOldAnchor = async () => findAdoptableOldAnchor({ prisma, content, assignmentId, log });
  const adoptLocalChecker = async () => registerRulerFromLocalChecker({ prisma, assignmentId, questionId: contentRes.questionId, content, log });
  const adoptProvider = mode === 'build' ? adoptOldAnchor : async () => (await adoptOldAnchor()) || (await adoptLocalChecker());

  const res = await resolveRulerForContent({
    prisma, contentKey, meta,
    buildFn,
    claimOnly: claimOnly === null ? (mode === 'build' && typeof buildFn !== 'function') : !!claimOnly,
    adoptProvider,
    pollIntervalMs, waitTimeoutMs, sleep, now, log, jobTag,
    allowRetryFailed: allowRetryFailed === null ? mode === 'build' : !!allowRetryFailed,
  });
  const base = { contentOk: true, content, contentKey, questionId: contentRes.questionId, standardSource: contentRes.standardSource, explain: contentRes.explain };

  if (res.status === 'unavailable') return { ok: false, ...base, reason: 'ruler_store_unavailable' };
  if (res.status === 'claimed_here') {
    return { ok: true, ...base, status: 'claimed_here', needsBuild: true, zeroLlm: false, ruler: res.ruler, reason: 'builder_is_caller' };
  }
  if (res.status !== 'reuse' && res.status !== 'adopted' && res.status !== 'built') {
    return {
      ok: false, ...base, reason: res.reason || res.status, status: res.status, failClosed: true,
      ruler: res.ruler || null, waitedMs: res.waitedMs, polls: res.polls,
    };
  }
  const ruler = res.ruler || (await findRulerByContentKey(prisma, contentKey));
  const bound = await bindRulerToQuestion({ prisma, assignmentId, questionId: contentRes.questionId, rulerId: ruler.id, contentKey, log });
  if (!bound.ok) {
    return { ok: false, ...base, reason: bound.reason || 'bind_failed', failClosed: true, status: res.status, ruler, binding: bound.binding || null };
  }
  return {
    ok: true, ...base, status: res.status, zeroLlm: !!res.zeroLlm, ruler, binding: bound.binding || null,
    adopted: res.status === 'adopted', waitedMs: res.waitedMs, polls: res.polls,
  };
}

/** 造尺所有权在调用方（status='claimed_here'）时的收尾：置 ready（写 checker_id/frozen_sha256/原始字节） */
export async function completeClaimedRuler({ prisma, contentKey, checkerId, frozenSha256 = null, checkerRaw = null, model = null, sourceRunId = null, log = console } = {}) {
  const r = await markRulerReady({ prisma, contentKey, checkerId, frozenSha256, checkerRaw, model, sourceRunId });
  if (typeof log?.log === 'function') {
    log.log(RULER_TAG.built + ' content_key=' + contentKey + ' checker_id=' + checkerId + ' via=claimed_here'
      + ' checker_raw_bytes=' + (checkerRaw ? Buffer.from(checkerRaw).length : 0) + ' MARKED=' + (r.ok ? 'yes' : 'no'));
  }
  return r;
}

/** 造尺所有权在调用方时的失败收尾（原因留痕，可重试） */
export async function failClaimedRuler({ prisma, contentKey, reason, model = null, log = console } = {}) {
  const r = await markRulerFailed({ prisma, contentKey, reason, model });
  if (typeof log?.warn === 'function') log.warn(RULER_TAG.buildFailed + ' content_key=' + contentKey + ' reason=' + String(reason || 'unknown').slice(0, 300) + ' (claimed_here)');
  return r;
}

/** 首次绑定 / 校验一致（供控制器等调用方在解析后进行） */
export async function bindResolvedRuler({ prisma, assignmentId, questionId, ruler, contentKey, log = console } = {}) {
  return bindRulerToQuestion({ prisma, assignmentId, questionId, rulerId: ruler && ruler.id, contentKey, log });
}

/** 便捷：从 ruler 行取 checker JSON（无 raw 时返回 null） */
export function checkerJsonOfRuler(ruler) {
  if (!ruler || !ruler.checkerRaw) return null;
  try { return JSON.parse(Buffer.from(ruler.checkerRaw).toString('utf8')); } catch { return null; }
}

export { normalizeRulerText, computeContentKey, resolveUploadsRoot, UPLOADS_ROOT_ENV };
