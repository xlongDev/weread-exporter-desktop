#!/usr/bin/env bash
# WeRead Exporter macOS 一键安装
#
# 用途：从 GitHub Release 下载安装包并安装到 /Applications。
# 关键点：curl 下载链路不会打上 com.apple.quarantine 隔离标记，
#        从根源绕过未签名应用「已损坏，无法打开」的 Gatekeeper 拦截。
#
# 用法（任选其一）：
#   curl -fsSL https://raw.githubusercontent.com/xlongDev/weread-exporter-desktop/main/scripts/install-macos.sh | bash
#   或下载本脚本后执行：bash install-macos.sh
#   安装指定版本：WEREAD_VERSION=v0.1.2 bash install-macos.sh
set -euo pipefail

REPO="xlongDev/weread-exporter-desktop"
VERSION="${WEREAD_VERSION:-latest}"

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) ASSET_ARCH="aarch64" ;;
  x86_64) ASSET_ARCH="x64" ;;
  *) echo "不支持的架构: $ARCH"; exit 1 ;;
esac

if [ "$VERSION" = "latest" ]; then
  echo "查询最新版本..."
  VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" |
    /usr/bin/python3 -c "import json,sys; print(json.load(sys.stdin)['tag_name'])")
fi
echo "目标版本: $VERSION"

TMP=$(mktemp -d)
MNT=""
trap 'if [ -n "$MNT" ]; then hdiutil detach "$MNT" -quiet 2>/dev/null || true; fi; rm -rf "$TMP"' EXIT

DMG_NAME="WeRead.Exporter_${VERSION#v}_${ASSET_ARCH}.dmg"
# 中国网络可设置加速代理前缀，如：WEREAD_MIRROR_PREFIX=https://<你的GH代理>/ bash install-macos.sh
MIRROR="${WEREAD_MIRROR_PREFIX:-}"
DMG_URL="${MIRROR}https://github.com/$REPO/releases/download/$VERSION/$DMG_NAME"
SUMS_URL="${MIRROR}https://github.com/$REPO/releases/download/$VERSION/SHA256SUMS.txt"

echo "下载安装包: $DMG_URL"
curl -fsSL --http1.1 --retry 5 --retry-delay 3 --retry-all-errors -o "$TMP/$DMG_NAME" "$DMG_URL"
curl -fsSL --http1.1 --retry 5 --retry-all-errors -o "$TMP/SHA256SUMS.txt" "$SUMS_URL" || echo "（校验和下载失败，跳过校验）"

if [ -f "$TMP/SHA256SUMS.txt" ]; then
  echo "校验完整性..."
  (cd "$TMP" && shasum -a 256 -c SHA256SUMS.txt 2>/dev/null) | grep -F "$DMG_NAME" ||
    { echo "❌ 校验和不匹配，下载文件可能损坏，已中止安装。"; exit 1; }
fi

MNT=$(mktemp -d)
echo "挂载并安装到 /Applications ..."
hdiutil attach "$TMP/$DMG_NAME" -nobrowse -readonly -mountpoint "$MNT" -quiet
rm -rf "/Applications/WeRead Exporter.app"
if ! cp -R "$MNT/WeRead Exporter.app" /Applications/ 2>/dev/null; then
  echo "⚠️ /Applications 需要管理员权限，改用 sudo 安装："
  sudo cp -R "$MNT/WeRead Exporter.app" /Applications/
  sudo xattr -dr com.apple.quarantine "/Applications/WeRead Exporter.app" 2>/dev/null || true
fi
hdiutil detach "$MNT" -quiet 2>/dev/null || true

# 双保险：清除可能存在的隔离标记（curl 链路通常本就没有）
xattr -dr com.apple.quarantine "/Applications/WeRead Exporter.app" 2>/dev/null || true

echo ""
echo "✅ 安装完成：/Applications/WeRead Exporter"
echo "   直接从启动台或应用程序文件夹打开即可（不会出现「已损坏」提示）。"
