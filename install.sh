#!/usr/bin/env bash
# OpenTomato 本地环境一键安装 / 启动脚本
#
# 用法：
#   ./install.sh            # 安装依赖 + 构建 core + 启动开发模式
#   ./install.sh --no-dev   # 只安装 + 构建，不启动
#   ./install.sh --clean    # 先清掉 node_modules / dist / out 再安装
set -euo pipefail

cd "$(dirname "$0")"

RUN_DEV=1
CLEAN=0
for arg in "$@"; do
  case "$arg" in
    --no-dev) RUN_DEV=0 ;;
    --clean)  CLEAN=1 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "未知参数: $arg"; exit 1 ;;
  esac
done

log() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }

# 1. bun 是否存在
if ! command -v bun >/dev/null 2>&1; then
  log "未检测到 bun，正在安装..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

# 2. 版本检查：bun.lock 是 lockfileVersion 2，低于 1.4 的 bun 会忽略并重写锁文件
WANT=$(sed -nE 's/.*"packageManager": *"bun@([0-9.]+)".*/\1/p' package.json)
HAVE=$(bun --version)
log "bun 版本: 本机 ${HAVE}，项目期望 ${WANT:-未指定}"
ver_lt() { [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -n1)" = "$1" ] && [ "$1" != "$2" ]; }
if [ -n "$WANT" ] && ver_lt "$HAVE" "$WANT"; then
  warn "bun 版本过低，无法解析 bun.lock，正在升级..."
  if [ -x /opt/homebrew/bin/bun ] && command -v brew >/dev/null 2>&1 && brew list bun >/dev/null 2>&1; then
    brew upgrade bun || brew install bun
  else
    bun upgrade
  fi
  HAVE=$(bun --version)
  log "升级后 bun 版本: ${HAVE}"
  if ver_lt "$HAVE" "$WANT"; then
    warn "仍低于 ${WANT}，请手动升级后重试"
    exit 1
  fi
fi

# 3. 可选清理
if [ "$CLEAN" = 1 ]; then
  log "清理旧产物"
  rm -rf node_modules packages/*/node_modules packages/core/dist packages/desktop/out
fi

# 4. 安装依赖（workspace 一次装完，包含 Electron 二进制下载）
log "安装依赖"
bun install

# 4b. 补拉 Electron 二进制
#   bun 会执行 electron 的 postinstall，但 Node 的 fetch 默认不走 HTTP(S)_PROXY，
#   代理环境下会静默失败，导致 `bun run dev` 报 "Electron uninstall"。
ELECTRON_DIR=$(cd packages/desktop && node -e "process.stdout.write(require('path').dirname(require.resolve('electron/package.json')))")
if [ ! -f "$ELECTRON_DIR/path.txt" ] || [ ! -d "$ELECTRON_DIR/dist" ]; then
  log "下载 Electron 二进制（走 HTTP(S)_PROXY；可设 ELECTRON_MIRROR 用镜像）"
  export NODE_USE_ENV_PROXY=1
  if ! (cd "$ELECTRON_DIR" && node install.js); then
    warn "直连下载失败，改用 npmmirror 镜像重试"
    (cd "$ELECTRON_DIR" && ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" node install.js)
  fi
fi

# 5. 先构建 core：desktop 通过 workspace 引用 core 的 dist，不先 build 会解析失败
log "构建 @opentomato/core"
bun run --filter @opentomato/core build

# 6. 类型检查（失败不阻塞启动，只提示）
log "类型检查"
bun run typecheck || warn "typecheck 有报错，仍继续启动"

if [ "$RUN_DEV" = 1 ]; then
  log "启动开发模式（core watch + electron-vite dev），Ctrl+C 退出"
  exec bun run dev
else
  log "完成。启动开发模式请执行: bun run dev"
fi
