#!/usr/bin/env bash
# Phase 8 打包准备：组装 apps/desktop/src-tauri/resources/
#   runtime/ = python-build-standalone（可重定位）+ 锁定版本的引擎依赖
#   engine/  = 引擎 Python 源码副本
# 产物不入库（.gitignore），构建前自动执行；PYTHON_BS_TAG 变更时自动重新下载。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RES="$ROOT/apps/desktop/src-tauri/resources"
CACHE="${HOME}/.cache/weread-packaging"
PYTHON_BS_TAG="20261026"
PY_VER="3.12.16"
# TAURI_TARGET 覆盖构建目标架构（如 x86_64-apple-darwin 交叉构建 Intel 版），默认本机架构
ARCH="$(uname -m)"
if [ -n "${TAURI_TARGET:-}" ]; then
  ARCH="${TAURI_TARGET%%-*}"   # x86_64-apple-darwin -> x86_64
  [ "$ARCH" = "x86_64" ] && ARCH="x86_64"
fi

# 目标三元组 → python-build-standalone 平台段 + 运行时目录布局
IS_WINDOWS=0
case "${TAURI_TARGET:-}" in
  *windows*) IS_WINDOWS=1; PY_ARCH="x86_64-pc-windows-msvc" ;;
esac
case "$ARCH" in
  arm64|aarch64) [ "$IS_WINDOWS" = "0" ] && PY_ARCH="aarch64-apple-darwin" ;;
  x86_64) [ "$IS_WINDOWS" = "0" ] && PY_ARCH="x86_64-apple-darwin" ;;
  *) echo "不支持的架构: $ARCH"; exit 1 ;;
esac

REQ="$ROOT/requirements.txt"
# shasum 仅 macOS 自带；Linux/Windows(Git Bash) 用 sha256sum；哈希包含目标架构
if command -v shasum >/dev/null 2>&1; then
  RUNTIME_HASH=$( (cat "$REQ" "$0"; echo "PY_ARCH=$PY_ARCH") | shasum -a 256 | cut -d' ' -f1)
else
  RUNTIME_HASH=$( (cat "$REQ" "$0"; echo "PY_ARCH=$PY_ARCH") | sha256sum | cut -d' ' -f1)
fi

mkdir -p "$CACHE"

assemble_runtime() {
  local src="$CACHE/python-${PYTHON_BS_TAG}-${PY_ARCH}"
  local dst="$RES/runtime"
  if [ "$IS_WINDOWS" = "1" ]; then dst="$RES/runtime/python"; fi
  # windows: install_only 解压根目录自带 python.exe → runtime/python/
  rm -rf "$dst"
  cp -R "$src" "$dst"
  # 剪裁：无 pip/测试/tk；保 playwright 驱动
  rm -rf "$dst/include" "$dst/share" "$dst/lib/tcl9.0" "$dst/lib/tk9.0" \
         "$dst/lib/libtcl9.0.dylib" "$dst/lib/libtk9.0.dylib"
  local sp="$dst/lib/python${PY_VER%.*}"
  if [ "$IS_WINDOWS" = "1" ]; then sp="$dst/Lib"; fi
  rm -rf "$sp/test" "$sp/idlelib" "$sp/tkinter" "$sp/turtledemo" "$sp/lib2to3" \
         "$sp/ensurepip" "$sp/venv" "$sp/pydoc_data"
  find "$dst" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
  # 锁定版本引擎依赖（装完依赖后再做最终裁剪）
  local PYBIN="$dst/bin/python3"
  if [ "$IS_WINDOWS" = "1" ]; then PYBIN="$dst/python.exe"; fi
  "$PYBIN" -m pip install -q --upgrade pip -i https://mirrors.cloud.tencent.com/pypi/simple/
  "$PYBIN" -m pip install -q -r "$REQ" -i https://mirrors.cloud.tencent.com/pypi/simple/
  "$PYBIN" -m pip uninstall -q -y pip setuptools 2>/dev/null || true
  find "$dst" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
  find "$dst/lib" -type d \( -name "test" -o -name "tests" \) -not -path "*playwright/driver/*" -exec rm -rf {} + 2>/dev/null || true
  "$PYBIN" -c "import playwright, ebooklib, markdown" || {
    echo "运行时依赖验证失败"; exit 1;
  }
}

# 1) 独立 Python（缓存命中则跳过下载）
if [ ! -x "$CACHE/python-${PYTHON_BS_TAG}-${PY_ARCH}/bin/python3" ]; then
  URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_BS_TAG}/cpython-${PY_VER}%2B${PYTHON_BS_TAG}-${PY_ARCH}-install_only.tar.gz"
  echo "下载独立 Python: $URL"
  curl -sL -o "$CACHE/python.tar.gz" "$URL"
  rm -rf "$CACHE/python-${PYTHON_BS_TAG}-${PY_ARCH}"
  mkdir -p "$CACHE/python-extract"
  tar xzf "$CACHE/python.tar.gz" -C "$CACHE/python-extract"
  mv "$CACHE/python-extract/python" "$CACHE/python-${PYTHON_BS_TAG}-${PY_ARCH}"
  rm -rf "$CACHE/python-extract"
fi

# 2) 组装 resources（依赖或脚本变化时重建）
PY_SENTINEL="$RES/runtime/bin/python3"
[ "$IS_WINDOWS" = "1" ] && PY_SENTINEL="$RES/runtime/python/python.exe"
if [ ! -x "$PY_SENTINEL" ] || [ ! -f "$RES/.runtime-hash" ] || [ "$(cat "$RES/.runtime-hash" 2>/dev/null)" != "$RUNTIME_HASH" ]; then
  echo "组装打包运行时..."
  rm -rf "$RES"
  mkdir -p "$RES"
  assemble_runtime
  echo "$RUNTIME_HASH" > "$RES/.runtime-hash"
fi

# 3) 引擎源码副本
mkdir -p "$RES/engine/adapter"
cp "$ROOT/engine/crawl_weread.py" "$ROOT/engine/export_book.py" "$ROOT/engine/main.py" \
   "$ROOT/engine/protocol.py" "$ROOT/engine/__init__.py" "$RES/engine/"
cp "$ROOT/engine/adapter/worker.py" "$ROOT/engine/adapter/__init__.py" "$RES/engine/adapter/"
echo "runtime: $PY_ARCH"

echo "resources 就绪: $(du -sh "$RES" | cut -f1)"
