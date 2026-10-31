#!/usr/bin/env bash
# 把当前仓库导出成「脱敏历史」并强推到 GitHub 公开仓库（方案 B）。
#
#   开发继续在 Gitee 进行，GitHub 只放脱敏快照。
#   每次导出都会从当前仓库重新克隆 → 重写全部历史 → 强推，因此
#   GitHub 的 commit hash 与 Gitee 必然不同，这是有意为之（不能两边互推）。
#
# 用法：
#   scripts/export-public-repo.sh --dry-run    # 只构建并校验，不推送
#   scripts/export-public-repo.sh              # 构建 + 校验 + 强推 GitHub
#
# 依赖：git、python3 + git-filter-repo（brew install git-filter-repo，
#       或用 PYTHON_BIN 指定装了 git_filter_repo 的解释器）
#
# 可选配置（不写进仓库）：~/.config/exam-deep-seek/public-export.env
#   PUBLIC_REMOTE=git@github.com:<user>/<repo>.git
#   PUBLIC_BRANCHES="master feat/desktop-shell"
#
# 设计：凭据值不落盘。脚本运行时从历史动态提取 API Key 与历史口令，
#       本机路径来自 $HOME，作者邮箱来自提交历史，所以仓库里没有「规则文件」。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF="${HOME:-/tmp}/.config/exam-deep-seek/public-export.env"
[ -f "$CONF" ] && . "$CONF"

DEST="${PUBLIC_REMOTE:-git@github.com:WDMoonMoonBird/exam-deep-seek.git}"
BRANCHES="${PUBLIC_BRANCHES:-master feat/desktop-shell}"
NOREPLY="46070314+WDMoonMoonBird@users.noreply.github.com"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

say() { printf '[export] %s\n' "$*"; }
die() { printf '[export] 失败：%s\n' "$*" >&2; exit 1; }

command -v git >/dev/null || die "缺少 git"
FILTER=""
if command -v git-filter-repo >/dev/null 2>&1; then
  FILTER="git-filter-repo"
else
  for py in ${PYTHON_BIN:-} python3 /opt/homebrew/bin/python3; do
    [ -n "$py" ] || continue
    command -v "$py" >/dev/null 2>&1 || continue
    if "$py" -c 'import git_filter_repo' >/dev/null 2>&1; then FILTER="$py -m git_filter_repo"; break; fi
  done
fi
[ -n "$FILTER" ] || die "缺少 git-filter-repo：brew install git-filter-repo（或 PYTHON_BIN=... 指定解释器）"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/exam-public-export.XXXXXX")"
trap 'if [ -z "${KEEP_TMP:-}" ]; then rm -rf "$TMP"; fi' EXIT

say "克隆 → $TMP/repo"
git clone --no-local --quiet "$REPO_ROOT" "$TMP/repo"
cd "$TMP/repo"
git fetch --quiet origin '+refs/heads/*:refs/remotes/origin/*'
for b in $BRANCHES; do
  git show-ref --verify --quiet "refs/heads/$b" || git branch "$b" "origin/$b" 2>/dev/null || die "分支不存在：$b"
done
git remote remove origin
for b in $(git for-each-ref --format='%(refname:short)' refs/heads); do
  case " $BRANCHES " in *" $b "*) ;; *) git branch -D "$b" >/dev/null 2>&1 || true ;; esac
done
git for-each-ref --format='%(refname)' refs/remotes | while read -r r; do git update-ref -d "$r"; done

# ── 动态收集脱敏字面值 ───────────────────────────────────────────────────
SK_KEYS="$(git log --all -p 2>/dev/null | grep -oE 'sk-[A-Za-z0-9]{20,}' | sort -u || true)"
ROOT_COMMIT="$(git rev-list --max-parents=0 HEAD | tail -1)"
PASSWORDS="$(git show "$ROOT_COMMIT:REQUIREMENTS.md" 2>/dev/null \
  | grep -E '密码|password' | grep -oE '\`[^\`]{6,64}\`' | tr -d '\`' | sort -u || true)"
HOME_PATH="${HOME:-}"
[ -n "$HOME_PATH" ] || HOME_PATH="$(git log --all -p 2>/dev/null | grep -oE '/Users/[A-Za-z0-9._-]+' | head -1 || true)"
AUTHOR_MAILS="$(git log --all --format='%ae' | sort -u | grep -v '@users.noreply.github.com' | grep -v '^$' || true)"

IP_RULE='regex:(?<![0-9.])(?!10\.|127\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?![0-9.])==>203.0.113.10'

{
  for k in $SK_KEYS; do printf '%s==>sk-***REDACTED***\n' "$k"; done
  for p in $PASSWORDS; do printf '%s==>***REDACTED***\n' "$p"; done
  printf 'regex:sk-[A-Za-z0-9]{20,}==>sk-***REDACTED***\n'
  printf '%s==>/Users/you\n' "$HOME_PATH"
  printf 'regex:/Users/[A-Za-z0-9._-]+==>/Users/you\n'
  printf '%s\n' "$IP_RULE"
  for m in $AUTHOR_MAILS; do printf '%s==>***REDACTED***\n' "$m"; done
  printf '***REDACTED***==>***REDACTED***\n***REDACTED***==>***REDACTED***\n'
} > "$TMP/replace-text.txt"

{
  printf 'regex:sk-[A-Za-z0-9]{20,}==>sk-***REDACTED***\n'
  printf '%s==>/Users/you\n' "$HOME_PATH"
  printf 'regex:/Users/[A-Za-z0-9._-]+==>/Users/you\n'
  printf '%s\n' "$IP_RULE"
  for m in $AUTHOR_MAILS; do printf '%s==>%s\n' "$m" "$NOREPLY"; done
} > "$TMP/replace-message.txt"

{
  for m in $AUTHOR_MAILS; do
    for n in $(git log --all --format='%an' --author="<$m>" 2>/dev/null | sort -u); do
      printf '%s <%s> %s <%s>\n' "$n" "$NOREPLY" "$n" "$m"
    done
  done
} > "$TMP/mailmap.txt"

cat > "$TMP/paths.txt" <<'PATHS'
regex:^".*"$
reports/
docs/dsh/evidence/
docs/reports/
docs/test-results/
docs/defects/
docs/mobile-app/preview/shots/
macos/ExamDesk/Vendor/
凭据处置清单-2026-10-18.md
审查总报告.md
审查计划.md
审查计划-v2.md
docs/dsh/W10-终局审查.md
docs/dsh/W3-架构审查.md
glob:*.xls
glob:*.xlsx
glob:*.pdf
PATHS

# ── 重写历史 ─────────────────────────────────────────────────────────────
say "重写历史：删敏感路径 + 替换密钥/IP/邮箱 + 重写提交身份"
$FILTER --force \
  --refs $BRANCHES \
  --invert-paths --paths-from-file "$TMP/paths.txt" \
  --replace-text "$TMP/replace-text.txt" \
  --replace-message "$TMP/replace-message.txt" \
  --mailmap "$TMP/mailmap.txt" >/dev/null
git tag -l | xargs -r -n 1 git tag -d >/dev/null 2>&1 || true
git reflog expire --expire=now --all
git gc --prune=now --quiet

# ── 校验：命中即中止 ─────────────────────────────────────────────────────
say "校验历史..."
git log $BRANCHES -p > "$TMP/history.txt" 2>/dev/null || true
FAIL=0
ok()  { printf '  ✓ %s\n' "$1"; }
bad() { printf '  ✗ %s：%s\n' "$1" "$2"; FAIL=1; }
count_re() { grep -cE -- "$1" "$TMP/history.txt" 2>/dev/null || true; }
count_fixed() { grep -cF -- "$1" "$TMP/history.txt" 2>/dev/null || true; }

n="$(count_re 'sk-[A-Za-z0-9]{20,}')"; [ "${n:-0}" -eq 0 ] && ok "sk- API Key" || bad "sk- API Key" "$n 处"
n="$(count_re '[0-9]{5,12}@qq\.com')"; [ "${n:-0}" -eq 0 ] && ok "QQ 邮箱" || bad "QQ 邮箱" "$n 处"
n="$(count_re '***REDACTED***')"; [ "${n:-0}" -eq 0 ] && ok "***REDACTED***" || bad "***REDACTED***" "$n 处"

HOME_LEAKS="$(grep -oE '/Users/[A-Za-z0-9._-]+' "$TMP/history.txt" 2>/dev/null | grep -vE '^/Users/you$' | sort -u | head -5 || true)"
[ -z "$HOME_LEAKS" ] && ok "本机路径" || bad "本机路径" "$(echo "$HOME_LEAKS" | tr '\n' ' ')"

IP_LEAKS="$(grep -oE '(^|[^0-9A-Za-z.])([0-9]{1,3}\.){3}[0-9]{1,3}([^0-9A-Za-z.]|$)' "$TMP/history.txt" 2>/dev/null \
  | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' \
  | awk -F. '($1<=255 && $2<=255 && $3<=255 && $4<=255) && !($1==10 || $1==127 || $1==0 || ($1==192 && $2==168) || ($1==172 && $2>=16 && $2<=31) || ($1==203 && $2==0 && $3==113) || ($1==198 && $2==51 && $3==100) || ($1==192 && $2==0 && $3==2))' \
  | sort -u | head -5 || true)"
[ -z "$IP_LEAKS" ] && ok "公网 IP" || bad "公网 IP" "$(echo "$IP_LEAKS" | tr '\n' ' ')"

for p in $PASSWORDS; do
  n="$(count_fixed "$p")"; [ "${n:-0}" -eq 0 ] && ok "历史口令" || bad "历史口令" "$n 处"
done

[ "$FAIL" -eq 0 ] || die "校验未通过，已中止（未推送）"
say "提交 $(git rev-list --count --all) 条；体积 $(git count-objects -vH | awk '/size-pack/{print $2 $3}')"

if [ "$DRY_RUN" -eq 1 ]; then
  say "--dry-run：跳过推送（仓库保留在 $TMP/repo，KEEP_TMP 已生效时不会删）"
  exit 0
fi

say "强推 → $DEST"
git remote add public "$DEST"
git push -f public $BRANCHES
say "完成：公开仓库历史已更新（与 Gitee 历史不同步，属预期）"
