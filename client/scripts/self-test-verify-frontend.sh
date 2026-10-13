#!/usr/bin/env bash
# 前端核验脚本的**正反例自测**：注入裸根路径 / 删 chunk ⇒ 必须失败（然后还原）
cd "$(git rev-parse --show-toplevel)/client"
SUM=/tmp/b38-fe-negative.log
: > "$SUM"
PAGE=src/views/admin/GradingRuns.vue
cp "$PAGE" /tmp/b38-page.bak
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
echo "=== 还原校验：正例必须通过 ===" | tee -a "$SUM"
node scripts/verify-frontend.mjs --no-build > /tmp/b38-fe-pos.log 2>&1
echo "pos_rc=$?" | tee -a "$SUM"
diff -q /tmp/b38-page.bak "$PAGE" && echo "PAGE_RESTORED_OK" | tee -a "$SUM"
echo DONE | tee -a "$SUM"
