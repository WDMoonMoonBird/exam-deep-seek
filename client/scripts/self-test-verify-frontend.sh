#!/usr/bin/env bash
# 前端核验脚本的**正反例自测**：注入裸根路径 / 删 chunk ⇒ 必须失败（然后还原）
cd "$(git rev-parse --show-toplevel)/client"
SUM=/tmp/b38-fe-negative.log
: > "$SUM"

# ★自愈：本脚本会**就地改工作树**（注入反例）。无论正常结束还是被 kill（Ctrl-C / CI 超时），
#   都必须把真正动过的文件还原回去 —— 否则会留下"注入态"污染工作树（W4 实测踩到过一次）。
MUTATED=/tmp/w1-selftest-mutated.list
: > "$MUTATED"
mark_mutated() { printf '%s\t%s\n' "$1" "$2" >> "$MUTATED"; }
restore_all() {
  if [ -s "$MUTATED" ]; then
    while IFS="$(printf '\t')" read -r mf mb; do
      [ -n "$mf" ] && [ -f "$mb" ] && cp -f "$mb" "$mf"
    done < "$MUTATED"
  fi
  : > "$MUTATED"
  for f in dist/assets/*.bak; do [ -f "$f" ] && mv -f "$f" "${f%.bak}"; done
  return 0
}
trap restore_all EXIT INT TERM
PAGE=src/views/admin/GradingRuns.vue
cp "$PAGE" /tmp/b38-page.bak && mark_mutated "$PAGE" /tmp/b38-page.bak
echo "=== 反例 1：页面里注入裸根资源（href=\"/assets/x.css\"） ===" | tee -a "$SUM"
node -e "const fs=require('fs');const p=process.argv[1];let s=fs.readFileSync(p,'utf8');s=s.replace('<template>','<template>\n  <!-- 反例注入 -->\n  <link rel=\"stylesheet\" href=\"/assets/injected.css\" />');fs.writeFileSync(p,s);" "$PAGE"
node scripts/verify-frontend.mjs --no-build > /tmp/b38-fe-neg1.log 2>&1
echo "neg1_rc=$? （期望非 0）" | tee -a "$SUM"
grep -E '^FAIL|SUMMARY' /tmp/b38-fe-neg1.log | tee -a "$SUM"
cp /tmp/b38-page.bak "$PAGE"
echo "=== 反例 2：删掉页面 chunk（改名） ===" | tee -a "$SUM"
CHUNK=$(ls dist/assets | grep -E '^GradingRuns-.*\.js$' | head -1)
mv "dist/assets/$CHUNK" "dist/assets/$CHUNK.bak"
node scripts/verify-frontend.mjs --no-build > /tmp/b38-fe-neg2.log 2>&1
echo "neg2_rc=$? （期望非 0）" | tee -a "$SUM"
grep -E '^FAIL|SUMMARY' /tmp/b38-fe-neg2.log | tee -a "$SUM"
mv "dist/assets/$CHUNK.bak" "dist/assets/$CHUNK"
echo "=== 反例 3：视图里注入**裸请求**（await request.get 既无 try/catch 又非 safe*）⇒ ⑮ 静态门禁必须报红 ===" | tee -a "$SUM"
PAGE2=src/views/admin/Schools.vue
cp "$PAGE2" /tmp/w1-page2.bak && mark_mutated "$PAGE2" /tmp/w1-page2.bak
node -e "const fs=require('fs');const p=process.argv[1];let s=fs.readFileSync(p,'utf8');const n=s.replace('async function fetch() {','async function fetch() {\n  const injected = await request.get(\'/admin/teachers\');',1);if(n===s){console.error('INJECT_FAILED：未找到 fetch() 锚点');process.exit(2);}fs.writeFileSync(p,n);" "$PAGE2" || { echo "INJECT_FAILED（反例 3 注入未生效 ⇒ 本次反例无效）" | tee -a "$SUM"; cp /tmp/w1-page2.bak "$PAGE2"; exit 2; }
node scripts/verify-frontend.mjs --no-build > /tmp/w1-fe-neg3.log 2>&1
echo "neg3_rc=$? （期望非 0）" | tee -a "$SUM"
grep -E '^FAIL ⑮|SUMMARY' /tmp/w1-fe-neg3.log | tee -a "$SUM"
cp /tmp/w1-page2.bak "$PAGE2"
echo "=== 反例 4（W1-r2）：删掉控制流码分支（200+code 1002 又变回 reject）⇒ ⑮c4/⑮c5/⑮h故障③ 必须报红 ===" | tee -a "$SUM"
REQ=src/api/request.js
cp "$REQ" /tmp/w1-req.bak && mark_mutated "$REQ" /tmp/w1-req.bak
node -e "const fs=require('fs');const p=process.argv[1];let s=fs.readFileSync(p,'utf8');const before=s;s=s.replace('if (isControlFlowEnvelope(res)) return body;','');if(s===before){console.error('INJECT_FAILED：未找到控制流分支');process.exit(2);}fs.writeFileSync(p,s);" "$REQ" || { echo "INJECT_FAILED（反例 4 注入未生效 ⇒ 本次反例无效）" | tee -a "$SUM"; cp /tmp/w1-req.bak "$REQ"; exit 2; }
node scripts/verify-frontend.mjs --no-build > /tmp/w1-fe-neg4.log 2>&1
echo "neg4_rc=$? （期望非 0）" | tee -a "$SUM"
grep -E '^FAIL ⑮|SUMMARY' /tmp/w1-fe-neg4.log | tee -a "$SUM"
cp /tmp/w1-req.bak "$REQ"
diff -q /tmp/w1-req.bak "$REQ" && echo "REQUEST_JS_RESTORED_OK" | tee -a "$SUM"
echo "=== 反例 5（W4/F6）：去掉 curatedMessage 的 401 分支（401 文案退回服务端原文）⇒ ⑮d 必须报红 ===" | tee -a "$SUM"
APIERR=src/api/apiError.js
cp "$APIERR" /tmp/w4-apierr.bak && mark_mutated "$APIERR" /tmp/w4-apierr.bak
# ★锚点必须落在 curatedMessage 内：'if (s === 401) …' 在 httpMessageOf / apiErrorCopy 里也各有一处（首处替换会误伤别的函数 ⇒ 反例假绿）
node -e "const fs=require('fs');const p=process.argv[1];let s=fs.readFileSync(p,'utf8');const blk='const s = Number(status) || 0;\n  if (s === 401) return AUTH_EXPIRED_MESSAGE;\n  if (s >= 500) return httpMessageOf(s);';const rep='const s = Number(status) || 0;\n  if (s >= 500) return httpMessageOf(s);';if(!s.includes(blk)){console.error('INJECT_FAILED：未找到 curatedMessage 的 401 分支');process.exit(2);}fs.writeFileSync(p,s.replace(blk,rep));" "$APIERR" || { echo "INJECT_FAILED（反例 5 注入未生效 ⇒ 本次反例无效）" | tee -a "$SUM"; cp /tmp/w4-apierr.bak "$APIERR"; exit 2; }
node scripts/verify-frontend.mjs --no-build > /tmp/w4-fe-neg5.log 2>&1
echo "neg5_rc=$? （期望非 0）" | tee -a "$SUM"
grep -E '^FAIL ⑮d|SUMMARY' /tmp/w4-fe-neg5.log | tee -a "$SUM"
cp /tmp/w4-apierr.bak "$APIERR"
diff -q /tmp/w4-apierr.bak "$APIERR" && echo "APIERROR_JS_RESTORED_OK" | tee -a "$SUM"
echo "=== 反例 6（W6/F1）：删掉 QuestionEdit.vue 的 loadError 常驻空态渲染（状态仍被置位、但页面不消费）⇒ ⑮h故障② 必须报红 ===" | tee -a "$SUM"
QEV=src/views/teacher/QuestionEdit.vue
cp "$QEV" /tmp/w6-qev.bak && mark_mutated "$QEV" /tmp/w6-qev.bak
# 两处替换：① 删掉 a-empty 空态块与其配对的 <template v-else> ② 删掉配对的 </template>（保持模板可解析）
node -e "const fs=require('fs');const p=process.argv[1];let s=fs.readFileSync(p,'utf8');const before=s;s=s.replace(/<a-empty v-if=\"loadError\"[\s\S]*?<\/a-empty>\s*<template v-else>/,'');s=s.replace('\n    </template>\n\n    <!-- 底部动作条','\n\n    <!-- 底部动作条');if(s===before){console.error('INJECT_FAILED：未找到空态块');process.exit(2);}if(/v-if=\"loadError\"/.test(s)){console.error('INJECT_FAILED：空态条件仍残留');process.exit(2);}fs.writeFileSync(p,s);" "$QEV" || { echo "INJECT_FAILED（反例 6 注入未生效 ⇒ 本次反例无效）" | tee -a "$SUM"; cp /tmp/w6-qev.bak "$QEV"; exit 2; }
node scripts/verify-frontend.mjs --no-build > /tmp/w6-fe-neg6.log 2>&1
echo "neg6_rc=$? （期望非 0）" | tee -a "$SUM"
grep -E '^FAIL ⑮h|SUMMARY' /tmp/w6-fe-neg6.log | cut -c1-260 | tee -a "$SUM"
cp /tmp/w6-qev.bak "$QEV"
diff -q /tmp/w6-qev.bak "$QEV" && echo "QUESTIONEDIT_VUE_RESTORED_OK" | tee -a "$SUM"
echo "=== 反例 7（W8/F1）：把 401 跳转写回裸根（window.location.href = '/login'）⇒ ⑯b 必须报红 ===" | tee -a "$SUM"
REQ10=src/api/request.js
cp "$REQ10" /tmp/w8-req.bak && mark_mutated "$REQ10" /tmp/w8-req.bak
# 替换整段兜底实现（不能只把 withAppBase 换成字符串变量：门禁按"跳转点目标是否字面量"判定，变量属合规）
node -e "const fs=require('fs');const p=process.argv[1];let s=fs.readFileSync(p,'utf8');const blk=\"    const target = withAppBase('/login') + '?expired=1';\n    if (typeof window !== 'undefined' && window.location) window.location.assign(target);\";const rep=\"    if (typeof window !== 'undefined' && window.location) window.location.href = '/login';\";if(!s.includes(blk)){console.error('INJECT_FAILED：未找到 base 感知跳转段');process.exit(2);}fs.writeFileSync(p,s.replace(blk,rep));" "$REQ10" || { echo "INJECT_FAILED（反例 7 注入未生效 ⇒ 本次反例无效）" | tee -a "$SUM"; cp /tmp/w8-req.bak "$REQ10"; exit 2; }
node scripts/verify-frontend.mjs --no-build > /tmp/w8-fe-neg7.log 2>&1
echo "neg7_rc=$? （期望非 0）" | tee -a "$SUM"
grep -E '^FAIL ⑯|SUMMARY' /tmp/w8-fe-neg7.log | cut -c1-300 | tee -a "$SUM"
cp /tmp/w8-req.bak "$REQ10"
diff -q /tmp/w8-req.bak "$REQ10" && echo "REQUEST_JS_BASEAWARE_RESTORED_OK" | tee -a "$SUM"
echo "=== 还原校验：正例必须通过 ===" | tee -a "$SUM"
node scripts/verify-frontend.mjs --no-build > /tmp/b38-fe-pos.log 2>&1
echo "pos_rc=$?" | tee -a "$SUM"
diff -q /tmp/b38-page.bak "$PAGE" && echo "PAGE_RESTORED_OK" | tee -a "$SUM"
echo DONE | tee -a "$SUM"
