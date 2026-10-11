#!/usr/bin/env bash
# scripts/dsh-verify/r35c-s1.sh —— R3.5-C S1：独立核对「造尺输入不含学生提交」
set -uo pipefail
P="$1"
echo "=== S1：渲染出的造尺 prompt（$(wc -c < "$P") B / $(wc -l < "$P") 行）==="
echo "--- (a) 具体提交标识/内容（期望 0）---"
for pat in '丁静45' 'UserManagement_副本' 'submissions/s01' 'submissions/s02' '.model.json' 'PROJ_ABS' '本次待评分'; do
  n=$(grep -c "$pat" "$P" 2>/dev/null || true)
  printf '  %-22s hits=%s\n' "$pat" "${n:-0}"
done
echo "--- (b) 通用路径模板（允许：布局说明）---"
grep -n 'submissions/' "$P" | head -5
echo "--- prompt 头部 10 行 ---"
head -10 "$P"
echo "--- 是否要求 model.json 自述（t19 应已移除）---"
if grep -q 'model.json' "$P"; then grep -n 'model.json' "$P" | head -3; else echo "  (无)"; fi
echo "--- 是否含提交内文件清单（如 src/views/Login.vue 的具体文件列举）---"
grep -cE 'src/(views|stores|components)/' "$P" || true