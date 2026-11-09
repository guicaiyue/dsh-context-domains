#!/usr/bin/env bash
# 一次把 npm 发布链路打通：登录 → 质量门 → 发版 → 把 token 写进 GitHub Secret NPM_TOKEN。
#
# 用法（在你自己的终端里跑，这样登录链接一出现你就能马上点）：
#   cd ~/Projects/dsh-context-domains && ./scripts/npm-onboard.sh
#
# 关键：npm 的网页登录会话只有 5 分钟左右有效期，通过聊天转发链接一定会过期，
# 所以这一步必须由你在终端里完成。已经登录过（~/.npmrc 里有 _authToken）时，
# 第 1 步会直接跳过。
set -euo pipefail

REGISTRY="https://registry.npmjs.org"
REPO="guicaiyue/dsh-context-domains"
PKG="$(node -p "require('./package.json').name")"
cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "== 1/4 登录 npm（已登录则跳过）=="
if npm whoami --registry="$REGISTRY" >/dev/null 2>&1; then
  echo "  已登录：$(npm whoami --registry="$REGISTRY")"
else
  npm login --registry="$REGISTRY" --auth-type=web
  echo "  已登录：$(npm whoami --registry="$REGISTRY")"
fi

echo "== 2/4 质量门（语法检查 + node --test）=="
npm run verify

echo "== 3/4 发布到 npm =="
VERSION="$(node -p "require('./package.json').version")"
if npm view "$PKG@$VERSION" version --registry="$REGISTRY" >/dev/null 2>&1; then
  echo "  版本 $VERSION 已经发过，跳过（要再发请先 bump version）"
else
  PUBLISH_LOG="$(mktemp)"
  # npm 要求「2FA 或带 Bypass 2FA 的 granular token」才允许发布；
  # 有验证器的话可以 NPM_OTP=123456 ./scripts/npm-onboard.sh
  if [ -n "${NPM_OTP:-}" ]; then
    npm publish --access public --registry="$REGISTRY" --otp="$NPM_OTP" 2>&1 | tee "$PUBLISH_LOG"
  else
    npm publish --access public --registry="$REGISTRY" 2>&1 | tee "$PUBLISH_LOG"
  fi
  if grep -qi "bypass 2fa" "$PUBLISH_LOG"; then
    cat >&2 <<'HINT'

发布被 npm 的 2FA 策略挡住（E403），二选一：
  A) 有验证器：NPM_OTP=你的6位码 ./scripts/npm-onboard.sh
  B) 建一个 Bypass 2FA 的 granular token（CI 也用这个）：
     1. https://www.npmjs.com/settings/xirizhi/tokens → Generate New Token → Granular Access Token
     2. Permissions 选 Read and write；Packages 选 All packages
     3. 勾上 Bypass two-factor authentication
     4. 生成后：
        printf '//registry.npmjs.org/:_authToken=%s\n' 'npm_xxx' >> ~/.npmrc
        npm publish --access public --registry=https://registry.npmjs.org
     详见 docs/PUBLISH.md
HINT
    exit 1
  fi
  echo "  已发布 $PKG@$VERSION"
fi

echo "== 3.5 检查 token 是否真能绕过 2FA =="
TOKEN_CHECK="$(sed -n 's#^//registry.npmjs.org/:_authToken=##p' "$HOME/.npmrc" | tail -1)"
if [ -n "$TOKEN_CHECK" ]; then
  BYPASS="$(timeout 30 curl -s -H "Authorization: Bearer $TOKEN_CHECK" \
    https://registry.npmjs.org/-/npm/v1/tokens \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); print("yes" if any(t.get("bypass_2fa") for t in d.get("objects",[])) else "no")' 2>/dev/null || echo unknown)"
  case "$BYPASS" in
    yes) echo "  token 带 Bypass 2FA，CI 也能发布" ;;
    no)  echo "  ⚠ 这个 token 的 bypass_2fa=false，npm 会拒绝发布。" >&2
         echo "    重新建一个 granular token 并勾上 Bypass two-factor authentication。" >&2 ;;
    *)   echo "  无法确认（查询 token 元数据失败），继续尝试" ;;
  esac
fi

echo "== 4/4 把 token 写进 GitHub Secret NPM_TOKEN =="
TOKEN="$(sed -n 's#^//registry.npmjs.org/:_authToken=##p' "$HOME/.npmrc" | tail -1)"
if [ -z "$TOKEN" ]; then
  echo "  没在 ~/.npmrc 里找到 token，跳过（可手动在仓库 Settings → Secrets 里加）" >&2
else
  printf '%s' "$TOKEN" | gh secret set NPM_TOKEN --repo "$REPO"
  echo "  已写入 $REPO 的 NPM_TOKEN"
fi

echo
echo "完成。之后打标签即自动发版（Release + npm）："
echo "  npm version patch --no-git-tag-version && git commit -am 'chore: release vX.Y.Z'"
echo "  git tag vX.Y.Z && git push origin main --tags"
