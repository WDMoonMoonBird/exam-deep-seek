#!/usr/bin/env bash
# scripts/dsh-grader/lib_assignment.sh —— R3.5-B：作业级「一次造尺、N 次量」（S1–S6）
# 由 run.sh 在 --checker-mode build-and-measure | measure-only-reuse 时 source，并调用 run_assignment_flow <mode>。
# 依赖 run.sh/lib.sh 的全局量：HERE DSH WORKDIR OUT LOG_DIR MATERIALS MANIFEST TIMEOUT_SEC STRICT MAX_REBUILD
#   CHECKER_CLI DSH_PROFILE_NAME，以及函数 log() snapshot_dsh_home() changed_paths() scan_key_leak() cleanup_credentials()

MATERIALS="$WORKDIR/materials"   # 与 run.sh 的物料目录约定一致
CHECKER_FROZEN="$OUT/assignment/checker.frozen.json"
ASSIGNMENT_MANIFEST="$OUT/assignment/assignment-manifest.json"
ASSIGNMENT_COVERAGE="$OUT/checker/coverage.json"
GRADING_RESULTS="$OUT/grading-results.json"
MODEL_CALLS=0
REBUILDS_A=0
CHECKER_ID_A=na

measure_stage_a() {  # S4 单份量尺：零 LLM，输出 out/measure/<slug>.json + out/grading-result/<slug>.json
  local slug="$1" sub_id="$2" proj="$3"
  local checker="$CHECKER_FROZEN"
  local result="$OUT/measure/$slug.json"
  mkdir -p "$OUT/measure" "$OUT/grading-result"
  set +e
  python3 "$CHECKER_CLI" --checker "$checker" --submission "$MATERIALS/submissions/$slug" \
    --submission-id "$slug" --rubric "$MATERIALS/rubric.md" --standard "$MATERIALS/standard" \
    --out "$result" --canonical > "$LOG_DIR/measure-$slug.log" 2>&1
  local mrc=$?
  set -e
  if [ "$mrc" -ne 0 ]; then
    grep -hE 'INPUT_PROBLEM|SCORE_WITHHELD|STALE' "$LOG_DIR/measure-$slug.log" | head -2 || true
    return 1
  fi
  set +e
  python3 "$HERE/coverage_report.py" --checker "$checker" \
    --rubric-sections "$MATERIALS/rubric-sections.json" \
    --session-coverage "$OUT/checker/rubric-coverage.json" \
    --matrix "$OUT/measure/matrix-$slug.json" --json "$OUT/measure/coverage-$slug.json" \
    > "$LOG_DIR/coverage-$slug.log" 2>&1
  local crc=$?
  python3 "$HERE/extract_result.py" --project --result "$result" --checker "$checker" \
    --out "$OUT/grading-result/$slug.json" --expect-submission-id "$sub_id" \
    --coverage "$OUT/measure/coverage-$slug.json" \
    > "$LOG_DIR/projection-$slug.log" 2>&1
  local prc=$?
  set -e
  grep -h '^PROJECTION_' "$LOG_DIR/projection-$slug.log" || true
  if [ "$crc" -ne 0 ] || [ "$prc" -ne 0 ]; then
    return 1
  fi
  return 0
}

write_build_prompt() {  # S1：造尺提示（★不含任何学生提交）
  local out="$1"
  local rubric_hash standard_hash sections_n
  rubric_hash="$(python3 - "$MANIFEST" <<'PY'
import json, sys
m = json.load(open(sys.argv[1], encoding='utf-8'))
print('sha256:' + m['rubric']['sha256'].split('sha256:')[-1])
PY
)"
  standard_hash="$(python3 - "$MANIFEST" <<'PY'
import json, sys
m = json.load(open(sys.argv[1], encoding='utf-8'))
print('sha256:' + str(m['standard'].get('extract_digest', m['standard']['sha256'])).split('sha256:')[-1])
PY
)"
  sections_n="$(python3 - "$MATERIALS/rubric-sections.json" <<'PY'
import json, sys
print(json.load(open(sys.argv[1], encoding='utf-8'))['sections_total'])
PY
)"
  cat > "$out" <<EOF
你是一名严格但公正的课程助教。本次任务**只造一把尺子**（checker.json），不给任何学生提交打分。

物料（只读；★本次输入**不含任何学生提交**）：
- 作业描述：$MATERIALS/assignment.md
- 评分标准：$MATERIALS/rubric.md
- rubric 段落切分（权威口径，共 $sections_n 段）：$MATERIALS/rubric-sections.json
- 物料清单：$MANIFEST
- 标准工程包（对照用，**不是**学生作业）：$MATERIALS/standard

硬约束（违反则本次造尺作废）：
1) materials/ 只读，不要修改其中任何文件。
2) 本环境没有执行类工具：不要运行代码、不要 npm install、不要构建；自检用阅读方式逐条核对。
3) 只允许写这三类产物（**不要**写 grading-result.json，也不要写任何学生分数）：
   a. $OUT/checker/checker.json               尺子本体（schema checker/1）
   b. $OUT/checker/rubric-coverage.json       逐段覆盖率（四态）
   c. $OUT/checker/checker.provenance.json    造尺现场 + 自检记录

【布局与 glob 语义（钉死；写错会被 C8 可量性探针判不合格）】
- 装置量尺时传给执行器的 --submission 是**提交目录** <workdir>/materials/submissions/<slug>；
  含 package.json 的**项目根**在该目录的**下一层**（例如 <slug>/<项目根目录>/）。
- glob 为 fnmatch 语义（不做大括号展开）："**/package.json" 要求 package.json 之前至少有一层目录；"package.json" 只匹配提交目录顶层。
  ✅ 正确："project_root_glob": "**/package.json"（或 "*/package.json"）；required_paths 写**相对项目根**的路径，例如 "src/main.js"。
  ❌ 反例："**/<项目根目录>*"（把具体目录名写进 glob）、"<项目根目录>/package.json"、"package.json"（无前缀）。

【字段白名单与哈希（照抄，不要自己算）】
- 顶层 9 字段：schema_version=checker/1、checker_id、assignment_ref{assignment_id,question_id,rubric_hash,standard_hash}、
  generated{session_id,model,created_at,generator}、scoring{max_score,aggregate=sum_clamped,rounding=half_up_1,zero_credit_rule}、
  input_contract{project_root_glob,required_paths,ignore,encoding=utf-8}、predicates[]、deductions[]、evidence_policy{require_line,quote_max_chars}
- predicates[]：{id,group,item,max_score,rule_type,params}；rule_type 只允许 T0 八种：
  file_exists / dir_contains_file / contains_text / contains_regex / count_regex / count_imports / file_count_in_dir / glob_covers
- checker_id 写占位 "sha256:0000000000000000000000000000000000000000000000000000000000000000"（装置按契约算法填入）
- rubric_hash   = $rubric_hash
- standard_hash = $standard_hash
- predicates[].group 必须等于它覆盖的那一段 rubric 的 head（照抄 rubric-sections.json）
- 【分值自检】所有 predicates[].max_score 相加必须 <= scoring.max_score（建议留 >=3 分余量）；写完逐项加一遍
- 【params 必填清单（逐 rule_type，缺一个字段就会被 validate.py 判 params_missing，本次造尺作废）】
  file_exists{path} ｜ dir_contains_file{dir,name_glob} ｜ contains_text{path,text,min_count} ｜ contains_regex{path,pattern,min_count}
  ｜ count_regex{path_glob,pattern,min,max} ｜ count_imports{path_glob,module} ｜ file_count_in_dir{dir,min,max,ext,recursive} ｜ glob_covers{patterns[]}
  写完 predicates[] 后，**逐条**把它和上面一行对照一遍：字段名必须完全一致（例如 count_regex 只能用 path_glob，不能写 path），缺字段或改名都会直接判不合格。
- 【差额解释】若 sum(predicates[].max_score) < scoring.max_score，必须在顶层 "_note"（或 deductions）里用一句话显式解释差额（例如「未覆盖段落不计分」）；不解释会被闸判 C4 unexplained_gap 不合格。
- 未覆盖的 rubric 段落必须在 rubric-coverage.json 的 uncovered[] 里显式列出（**不允许**用 0 分或满分糊过去）

rubric-coverage.json：{"schema_version":"rubric-coverage/1","checker_id":"<同上>","uncovered":[{...}],
 "sections":[{"sid":"S001","head":"<照抄>","state":"covered|partially_covered|uncovered|subjective","predicates":["P01"],"reason":"..."}]}
checker.provenance.json：{"schema_version":"checker-provenance/1","generated":{...},
 "self_check":{"method":"reading-only","checker_id":"<占位>","checked":["C1..C8 逐条阅读核对结论"]},
 "inputs":{"rubric_hash":"$rubric_hash","standard_hash":"$standard_hash"}}

完成后打印两行：CHECKER_ID=<占位>、COVERAGE=covered:N/partial:N/uncovered:N/subjective:N
EOF
}

freeze_checker() {  # S3 固化：字节复制 + manifest
  mkdir -p "$OUT/assignment"
  cp -f "$OUT/checker/checker.json" "$CHECKER_FROZEN"
  python3 - "$CHECKER_FROZEN" "$ASSIGNMENT_MANIFEST" "$MANIFEST" "$OUT/diagnostics/measurable.json" "${ASSIGNMENT_MODE:-build-and-measure}" <<'PY'
import hashlib, json, os, sys
frozen, out, man_path, probe_path, mode = sys.argv[1:6]
man = json.load(open(man_path, encoding='utf-8'))
ck = json.load(open(frozen, encoding='utf-8'))
sha = hashlib.sha256(open(frozen, 'rb').read()).hexdigest()
probe = {}
if os.path.isfile(probe_path):
    try:
        probe = json.load(open(probe_path, encoding='utf-8'))
    except ValueError:
        probe = {}
subs = []
for s in man.get('submissions', []):
    subs.append({'slug': s['slug'], 'id': s.get('id'), 'zip_sha256': s.get('zip_sha256'),
                 'project_root': s.get('project_root')})
doc = {'schema_version': 'assignment-manifest/1',
       'assignment_id': ck.get('assignment_ref', {}).get('assignment_id'),
       'checker_id': ck.get('checker_id'),
       'frozen_sha256': 'sha256:' + sha,
       'materials_manifest_digest': 'sha256:' + hashlib.sha256(open(man_path, 'rb').read()).hexdigest(),
       'materials': {'rubric_sha256': man.get('rubric', {}).get('sha256'),
                     'standard_digest': man.get('standard', {}).get('extract_digest'),
                     'rubric_sections_total': man.get('rubric', {}).get('sections_total')},
       'n_submissions': len(subs), 'submissions': subs,
       'device_version': 'dsh-grader/r3.5-b', 'mode': mode,
       'c8': {'checked': bool(probe), 'n': probe.get('submissions_total'),
              'unmeasurable': [r['slug'] for r in probe.get('results', []) if not r['measurable']]}}
with open(out, 'w', encoding='utf-8') as f:
    json.dump(doc, f, ensure_ascii=False, indent=2)
    f.write(chr(10))
print('FROZEN_OK frozen_sha256=sha256:' + sha[:16] + ' n_submissions=%d' % len(subs))
PY
}

frozen_intact() {  # 篡改检测（不一致 ⇒ 退出码 3）
  python3 - "$CHECKER_FROZEN" "$ASSIGNMENT_MANIFEST" "$HERE" <<'PY'
import hashlib, json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(sys.argv[3])), 'dsh-checker'))
import validate as V
frozen, man_path = sys.argv[1], sys.argv[2]
man = json.load(open(man_path, encoding='utf-8'))
if not os.path.isfile(frozen):
    print('TAMPER missing_frozen')
    raise SystemExit(3)
sha = 'sha256:' + hashlib.sha256(open(frozen, 'rb').read()).hexdigest()
ck = json.load(open(frozen, encoding='utf-8'))
recomputed = V.checker_id_of(ck)
if sha != man.get('frozen_sha256'):
    print('TAMPER frozen_sha256_mismatch')
    raise SystemExit(3)
if recomputed != ck.get('checker_id') or str(ck.get('checker_id')) != str(man.get('checker_id')):
    print('TAMPER checker_id_mismatch')
    raise SystemExit(3)
print('FROZEN_INTACT sha=' + sha[:16])
PY
}
run_assignment_flow() {  # S1–S6
  local mode="$1"
  ASSIGNMENT_MODE="$mode"
  mkdir -p "$OUT/assignment" "$OUT/measure" "$OUT/probe" "$OUT/grading-result"
  local attempt=0 viol="" SHAPE_RC=1 SHAPE_STRICT_PARTIAL=0

  if [ "$mode" = "build-and-measure" ]; then
    while : ; do
      write_build_prompt "$LOG_DIR/prompt-build.txt"
      if [ "$attempt" -gt 0 ]; then
        {
          echo ""
          echo "【重造提示（第 $attempt 次）】上一版 checker 被判不合格，违规原文如下："
          printf '%s\n' "$viol"
          echo "请只修这些点，其余保持不变；仍须满足 C1–C8。"
        } >> "$LOG_DIR/prompt-build.txt"
      fi
      log "S1 造尺（attempt=${attempt}；输入不含任何学生提交）"
      set +e
      RUNNER_OUT="$(python3 "$HERE/run_with_timeout.py" --timeout "$TIMEOUT_SEC" \
        --out "$LOG_DIR/session-build.out" --err "$LOG_DIR/session-build.err" --cwd "$WORKDIR" \
        -- "$DSH" --profile "$DSH_PROFILE_NAME" "$(cat "$LOG_DIR/prompt-build.txt")")"
      SESSION_RC=$?
      set -e
      MODEL_CALLS=$((MODEL_CALLS + 1))
      CHILD=".$(echo "$RUNNER_OUT" | grep '^RUNNER_CHILD_EXIT=' | cut -d= -f2)"
      CHILD="$(echo "$RUNNER_OUT" | grep '^RUNNER_CHILD_EXIT=' | cut -d= -f2)"
      ELAPSED_A="$(echo "$RUNNER_OUT" | grep '^RUNNER_ELAPSED_SEC=' | cut -d= -f2)"
      log "S1 结束：rc=$SESSION_RC child_exit=$CHILD elapsed=$ELAPSED_A"
      if [ "$SESSION_RC" -eq 124 ] || [ "$CHILD" = "timeout" ]; then
        assignment_summary FAIL 0 0 0 0 "$na" "build-timeout"
        return 124
      fi
      if [ "$SESSION_RC" -ne 0 ] || [ "$CHILD" != "0" ]; then
        assignment_summary FAIL 0 0 0 0 na "build-session-nonzero(rc=$SESSION_RC,child=$CHILD)"
        return 1
      fi
      if [ -f "$OUT/checker/checker.json" ]; then
        python3 - "$OUT/checker/checker.json" "$HERE" > "$LOG_DIR/checker-id-build.txt" 2>&1 <<'PY' || true
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(sys.argv[2])), 'dsh-checker'))
import validate as V
p = sys.argv[1]
ck = json.load(open(p, encoding='utf-8'))
declared = str(ck.get('checker_id', ''))
computed = V.checker_id_of(ck)
if declared != computed and set(declared.replace('sha256:', '')) <= set('0'):
    ck['checker_id'] = computed
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(ck, f, ensure_ascii=False, indent=2)
    print('CHECKER_ID_FILLED=' + computed)
else:
    print('CHECKER_ID_UNCHANGED=' + declared)
PY
        grep -h 'CHECKER_ID_' "$LOG_DIR/checker-id-build.txt" || true
      fi
      local gstrict=""
      [ "$STRICT" -eq 1 ] && gstrict="--strict"
      set +e
      bash "$HERE/shape_gate.sh" --workdir "$WORKDIR" --slug s01 $gstrict > "$LOG_DIR/shape-build.txt" 2>&1
      SHAPE_RC=$?
      set -e
      grep -E '^SHAPE_|^VIOLATION|^MEASURABLE=|^UNMEASURABLE ' "$LOG_DIR/shape-build.txt" | tail -14 || true
      if [ "$SHAPE_RC" -eq 0 ]; then
        break
      fi
      viol="$(grep -E '^VIOLATION|^SHAPE_C[1-8]=FAIL' "$LOG_DIR/shape-build.txt" | head -20)"
      if [ "$SHAPE_RC" -eq 1 ]; then
        SHAPE_STRICT_PARTIAL=1
        break
      fi
      if [ "$attempt" -lt "$MAX_REBUILD" ]; then
        attempt=$((attempt + 1))
        REBUILDS_A=$((REBUILDS_A + 1))
        log "SHAPE_FAIL（C1–C8）⇒ 第 $attempt 次重造（K=${MAX_REBUILD}）"
        continue
      fi
      assignment_summary FAIL 0 0 0 0 na "shape-gate-failed(rebuilds=$REBUILDS_A)"
      return 5
    done
  else
    if [ ! -f "$CHECKER_FROZEN" ]; then
      assignment_summary FAIL 0 0 0 0 na "missing_frozen（measure-only-reuse 需先 build-and-measure）"
      return 5
    fi
    if [ -f "$OUT/checker/checker.json" ]; then :; else mkdir -p "$OUT/checker"; cp -f "$CHECKER_FROZEN" "$OUT/checker/checker.json"; fi
    [ -f "$OUT/diagnostics/measurable.json" ] || printf '%s' '{"schema_version":"measurable-probe/1","results":[]}' > "$OUT/diagnostics/measurable.json"
  fi

  CHECKER_ID_A="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1],encoding="utf-8")).get("checker_id","na"))' "$OUT/checker/checker.json" 2> /dev/null || echo na)"

  if [ "$mode" = "measure-only-reuse" ]; then
    # S3 复用：manifest 是锚点，绝不能重写（否则篡改会被「洗白」）；先做一次完整性校验
    set +e
    frozen_intact > "$LOG_DIR/frozen-precheck.txt" 2>&1
    local prc=$?
    set -e
    grep -h "FROZEN_" "$LOG_DIR/frozen-precheck.txt" || true
    if [ "$prc" -eq 3 ]; then
      assignment_summary FAIL 0 0 0 0 "$CHECKER_ID_A" "frozen-tampered(precheck)"
      echo "RUN_EXIT=3"
      return 3
    fi
  else
  log "S3 固化（frozen + assignment-manifest）"
  set +e
  freeze_checker
  local frc=$?
  set -e
  if [ "$frc" -ne 0 ]; then
    assignment_summary FAIL 0 0 0 0 "$CHECKER_ID_A" "freeze-failed"
    return 1
  fi
  grep -h 'FROZEN_OK' "$LOG_DIR/shape-build.txt" 2> /dev/null || true
  fi

  local n=0 measured=0 failed=0 unmeas=0 ok_list="" failed_list="" unmeas_list=""
  log "S4 量尺（逐份，零 LLM）"
  while IFS='|' read -r slug sid zip proot; do
    [ -n "$slug" ] || continue
    n=$((n + 1))
    if grep -q "UNMEASURABLE $slug " "$LOG_DIR/shape-build.txt" 2> /dev/null; then
      unmeas=$((unmeas + 1))
      unmeas_list="$unmeas_list$slug "
      log "S4 ${slug}：UNMEASURABLE（C8 预检判定）⇒ 该份无分"
      continue
    fi
    set +e
    frozen_intact > "$LOG_DIR/frozen-$slug.txt" 2>&1
    local trc=$?
    set -e
    grep -h 'FROZEN_' "$LOG_DIR/frozen-$slug.txt" || true
    if [ "$trc" -eq 3 ]; then
      assignment_summary FAIL "$n" "$measured" "$failed" "$unmeas" "$CHECKER_ID_A" "frozen-tampered($slug)"
      echo "RUN_EXIT=3"
      return 3
    fi
    if measure_stage_a "$slug" "$sid" "$proot"; then
      measured=$((measured + 1))
      ok_list="$ok_list$slug "
    else
      failed=$((failed + 1))
      failed_list="$failed_list$slug "
      log "S4 ${slug}：failed（无分，不编造）"
    fi
  done < <(python3 - "$MANIFEST" <<'PY'
import json, sys
m = json.load(open(sys.argv[1], encoding='utf-8'))
for s in m['submissions']:
    print('|'.join([s['slug'], s['id'], s['zip'], s.get('project_root', '')]))
PY
  )

  log "S5 作业级产物（reconciliation / comparability / coverage / grading-results）"
  python3 - "$OUT" "$CHECKER_ID_A" "$ASSIGNMENT_MANIFEST" "$ok_list" "$failed_list" "$unmeas_list" <<'PY' || true
import json, os, sys
out, cid, man_path, ok, failed, unmeas = sys.argv[1:7]
ok = [x for x in ok.split() if x]
failed = [x for x in failed.split() if x]
unmeas = [x for x in unmeas.split() if x]
man = json.load(open(man_path, encoding='utf-8'))
rows, digests = [], {}
counts = {'items_total': 0, 'hit': 0, 'miss': 0, 'missing': 0, 'empty': 0, 'unreadable': 0, 'unsupported': 0}
for slug in ok:
    doc = json.load(open(os.path.join(out, 'measure', slug + '.json'), encoding='utf-8'))
    digests[slug] = doc.get('canonical_sha256')
    items = doc.get('items', [])
    counts['items_total'] += len(items)
    for it in items:
        st = it.get('status', 'miss')
        counts[st] = counts.get(st, 0) + 1
    counts['unsupported'] += len((doc.get('reconciliation') or {}).get('unsupported') or [])
    rows.append({'slug': slug, 'canonical_sha256': doc.get('canonical_sha256'), 'totals': doc.get('totals'), 'items': len(items)})
cov_path = os.path.join(out, 'reconciliation', 'coverage.json')
uncovered = []
if os.path.isfile(cov_path):
    cov = json.load(open(cov_path, encoding='utf-8'))
    uncovered = [{'sid': u.get('sid'), 'head': u.get('head')} for u in cov.get('uncovered', [])]
    counts['assessed_max_score'] = sum(r.get('max_score') or 0 for r in (json.load(open(os.path.join(out, 'checker', 'checker.json'), encoding='utf-8')).get('predicates') or []))
with open(os.path.join(out, 'assignment', 'reconciliation.json'), 'w', encoding='utf-8') as f:
    json.dump({'schema_version': 'assignment-reconciliation/1', 'checker_id': cid, 'rows': rows,
               'counts': counts, 'uncovered_sections': uncovered},
              f, ensure_ascii=False, indent=2)
    f.write(chr(10))
with open(os.path.join(out, 'assignment', 'comparability.json'), 'w', encoding='utf-8') as f:
    json.dump({'schema_version': 'comparability/1', 'assignment_id': man.get('assignment_id'), 'checker_id': cid,
               'n': len(ok) + len(failed) + len(unmeas), 'ok': ok, 'failed': failed, 'unmeasurable': unmeas,
               'digests': digests, 'comparable_within': True, 'comparable_across': False,
               'comparable_group': [ok] if ok else [],
               'policy': {'uncovered': 'not_assessed（不计入满分基数，不得静默算 0 分或满分）',
                          'canonical': '仅用于同一份跨遍比对，跨份比较无意义'}},
              f, ensure_ascii=False, indent=2)
    f.write(chr(10))
pairs = []
for slug in ok:
    p = os.path.join(out, 'grading-result', slug + '.json')
    if os.path.isfile(p):
        pairs.append(json.load(open(p, encoding='utf-8')))
with open(os.path.join(out, 'grading-results.json'), 'w', encoding='utf-8') as f:
    json.dump(pairs, f, ensure_ascii=False, indent=2)
    f.write(chr(10))
print('S5_OK rows=%d projections=%d uncovered=%d' % (len(rows), len(pairs), len(uncovered)))
PY
  if [ -f "$OUT/reconciliation/coverage.json" ]; then cp -f "$OUT/reconciliation/coverage.json" "$ASSIGNMENT_COVERAGE"; fi

  local result=PASS code=0
  if [ "$measured" -eq 0 ]; then
    result=FAIL
    code=1
  elif [ "$failed" -gt 0 ] || [ "$unmeas" -gt 0 ]; then
    result=PARTIAL
    [ "$STRICT" -eq 1 ] && code=1
  fi
  if [ "$SHAPE_STRICT_PARTIAL" = "1" ]; then result=PARTIAL; code=1; fi
  assignment_summary "$result" "$n" "$measured" "$failed" "$unmeas" "$CHECKER_ID_A" ok
  echo "ASSIGNMENT_REBUILDS=$REBUILDS_A ASSIGNMENT_MODE=$mode"
  echo "ASSIGNMENT_OK_SLUGS=$ok_list"
  echo "ASSIGNMENT_FAILED_SLUGS=$failed_list"
  echo "ASSIGNMENT_UNMEASURABLE_SLUGS=$unmeas_list"
  echo "ASSIGNMENT_FROZEN_SHA256=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1],encoding="utf-8")).get("frozen_sha256","na"))' "$ASSIGNMENT_MANIFEST" 2> /dev/null || echo na)"
  echo "ASSIGNMENT_PRODUCTS=$OUT/assignment/reconciliation.json,$OUT/assignment/comparability.json,$ASSIGNMENT_COVERAGE,$GRADING_RESULTS"
  echo "RUN_STDOUT_FALLBACK_SCOPE=measure-extract-only（该开关只作用于逐份提取层；score-only 走投影 out/results/<slug>.model.json，不受此开关影响）"
  assignment_isolation_tail
  echo "RUN_EXIT=$code"
  return $code
}

assignment_summary() {  # S6 汇总（单行计数字段，便于对拍）
  local result="$1" n="$2" measured="$3" failed="$4" unmeas="$5" cid="$6" reason="$7"
  echo "ASSIGNMENT_RESULT=$result N=$n MEASURED=$measured FAILED=$failed UNMEASURABLE=$unmeas CHECKER_ID=$cid MODEL_CALLS=$MODEL_CALLS MEASURE_CALLS=0"
  [ "$reason" = "ok" ] || echo "ASSIGNMENT_FAIL_REASON=$reason"
}
assignment_isolation_tail() {  # 作业级模式的收尾：隔离旁证 + 泄漏扫描 + 凭据清理（复用既有函数/全局量）
  set +e
  snapshot_dsh_home "$LOG_DIR/dsh-home-after.txt"
  snapshot_ports "$LOG_DIR/ports-after.txt"
  changed_paths "$LOG_DIR/dsh-home-before.txt" "$LOG_DIR/dsh-home-after.txt" > "$LOG_DIR/dsh-home-changed.txt"
  local child
  child="$(find "$HOME_DIR" -type f 2> /dev/null | grep -oE 'session-[0-9a-f-]{36}' | head -1 | sed 's/^session-//' || true)"
  python3 "$HERE/classify_changes.py" --changed "$LOG_DIR/dsh-home-changed.txt" \
    --control "$LOG_DIR/dsh-home-control-merged.txt" --host-session "${DSH_SESSION_ID:-}" \
    --child-session "$child" --isolated-home "$HOME_DIR" --workdir "$WORKDIR" \
    --dsh-home "$DSH_HOME_REAL" > "$LOG_DIR/dsh-home-classified.txt" 2> /dev/null || true
  local unattr
  unattr="$(sed -n '/^__UNATTRIBUTED__$/,/^__OTHER__$/p' "$LOG_DIR/dsh-home-classified.txt" | grep -v '^__' || true)"
  if [ -n "$unattr" ]; then
    echo "ASSIGNMENT_ISOLATION=FAIL"
    printf '%s\n' "$unattr" | head -5
  else
    echo "ASSIGNMENT_ISOLATION=PASS"
  fi
  local leak
  leak="$(scan_key_leak "$OUT" "$GRADER_HOME/.credentials.yaml" || true)"
  if [ -n "$leak" ]; then
    echo "ASSIGNMENT_LEAK_SCAN=FAIL"
  else
    echo "ASSIGNMENT_LEAK_SCAN=PASS（精确值比对 + sk- 形态比对）"
  fi
  cleanup_credentials "$GRADER_HOME"
  set -e
}
