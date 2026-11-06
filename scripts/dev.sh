#!/usr/bin/env bash
# 开发模式：tauri dev（自动并行 vite + cargo）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/desktop"
npx tauri dev "$@"
