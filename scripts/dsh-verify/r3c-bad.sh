#!/usr/bin/env bash
# scripts/dsh-verify/r3c-bad.sh —— R3-C 不合格路径：C 手工构造违规 checker ⇒ 装置 exit 5、不写 grading-result.json、原文进 diagnostics
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
R=/tmp/r3c/bad; rm -rf "$R"; mkdir -p "$R"
SRC_CK="${1:-/tmp/dsh-r3-verify/out/checker/checker.json}"
G="$DSH_REPO_ROOT/scripts/dsh-grader/run.sh"
echo "=== 构造违规 checker：删掉 evidence_policy.quote_max_chars（C1 必挂）==="
python3 - "$SRC_CK" "$R/broken.json" <<'PY'
import json, sys
c = json.load(open(sys.argv[1], encoding='utf-8'))
c['evidence_policy'].pop('quote_max_chars', None)
c['predicates'][0]['max_score'] = 999  # 同时制造 C4 越界
json.dump(c, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('broken.json 已写: quote_max_chars 删除 + predicates[0].max_score=999')
PY
echo "=== A) 直接跑 shape_gate.sh（只读既有 workdir 不可行；用 run.sh measure-only 全链路）==="
bash "$G" --submissions 1 --workdir "$R/wd" --timeout 300 --checker "$R/broken.json" --dsh-bin "$DSH_BIN" > "$R/run.out" 2>&1
RC=$?
echo "run_rc=$RC (期望 5)"
echo "grading-result.json 是否写出: $([ -f "$R/wd/out/grading-result.json" ] && echo YES-缺陷 || echo no)"
echo "---- 闸输出 ----"; grep -E '^SHAPE_|^VIOLATION' "$R/wd/out/logs/shape-s01.txt" 2>/dev/null | head -10
echo "---- 诊断归档 ----"; ls "$R/wd/out/diagnostics" 2>/dev/null | head -6
echo "---- 摘要行 ----"; grep -E 'RUN_RESULT|RUN_EXIT_CODE|SHAPE_VALID|CHECKER_ID' "$R/run.out" | tail -5