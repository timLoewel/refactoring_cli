#!/usr/bin/env bash
# Install all dependencies for refactoring-cli.
# Supports Ubuntu/Debian and Arch. Idempotent — safe to re-run.
set -euo pipefail

err() { echo "error: $*" >&2; exit 1; }
log() { echo "==> $*"; }

# Run from repo root regardless of where the script was invoked.
cd "$(dirname "$0")/.."

# --- Detect distro ---
[[ -r /etc/os-release ]] || err "/etc/os-release missing — cannot detect distro"
# shellcheck disable=SC1091
. /etc/os-release
case "${ID:-}:${ID_LIKE:-}" in
  *ubuntu*|*debian*) PKG="apt" ;;
  *arch*)            PKG="pacman" ;;
  *)
    case "${ID_LIKE:-}" in
      *debian*|*ubuntu*) PKG="apt" ;;
      *arch*)            PKG="pacman" ;;
      *) err "unsupported distro: ${ID:-unknown}. Supports Ubuntu/Debian and Arch." ;;
    esac
    ;;
esac
log "detected: ${PRETTY_NAME:-$ID} (using $PKG)"

# --- System prerequisites ---
# bubblewrap + socat are required by Claude Code's native sandbox, which the
# auto-fix-loop relies on to isolate the spawned fix-agent (npm run auto-fix).
need_pkgs=()
command -v curl  >/dev/null || need_pkgs+=(curl)
command -v git   >/dev/null || need_pkgs+=(git)
command -v bash  >/dev/null || need_pkgs+=(bash)
command -v bwrap >/dev/null || need_pkgs+=(bubblewrap)
command -v socat >/dev/null || need_pkgs+=(socat)
if (( ${#need_pkgs[@]} )); then
  log "installing system packages: ${need_pkgs[*]}"
  case "$PKG" in
    apt)    sudo apt-get update && sudo apt-get install -y "${need_pkgs[@]}" ;;
    pacman) sudo pacman -Sy --needed --noconfirm "${need_pkgs[@]}" ;;
  esac
fi

# --- AppArmor profile for bwrap (Ubuntu 24.04+) ---
# Ubuntu 24.04's default AppArmor policy blocks unprivileged user namespaces,
# which bubblewrap needs. Drop a profile that grants `userns` to /usr/bin/bwrap.
# Only relevant on apt-based systems with AppArmor active (skipped on WSL2,
# where /sys/kernel/security/apparmor is absent, and on Arch).
if [[ "$PKG" == "apt" && -d /etc/apparmor.d && -e /sys/kernel/security/apparmor ]]; then
  if [[ ! -f /etc/apparmor.d/bwrap ]]; then
    log "installing AppArmor profile for bwrap (Ubuntu 24.04+ unprivileged userns)"
    sudo tee /etc/apparmor.d/bwrap >/dev/null <<'EOF'
abi <abi/4.0>,
include <tunables/global>

profile bwrap /usr/bin/bwrap flags=(unconfined) {
  userns,
  include if exists <local/bwrap>
}
EOF
    sudo systemctl reload apparmor 2>/dev/null || true
  else
    log "AppArmor profile for bwrap already present"
  fi
fi

# --- uv (Astral Python tool manager) ---
if ! command -v uv >/dev/null; then
  log "installing uv"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
  command -v uv >/dev/null || err "uv installed but ~/.local/bin not on PATH"
else
  log "uv already installed ($(uv --version))"
fi

# --- roam (via uv tool) ---
if ! command -v roam >/dev/null; then
  log "installing roam-code"
  uv tool install roam-code
  hash -r 2>/dev/null || true
else
  log "roam already installed ($(roam --version 2>&1 | head -1))"
fi

# --- Node.js >= 22 (via mise, only if missing/old) ---
need_node=true
if command -v node >/dev/null; then
  major=$(node -v | sed 's/^v//;s/\..*//')
  if [[ "$major" =~ ^[0-9]+$ ]] && (( major >= 22 )); then
    log "node already installed ($(node -v))"
    need_node=false
  else
    log "node $(node -v) is older than required v22"
  fi
fi

if $need_node; then
  if ! command -v mise >/dev/null; then
    log "installing mise (will read Node version from mise.toml)"
    curl -fsSL https://mise.run | sh
    export PATH="$HOME/.local/bin:$PATH"
    command -v mise >/dev/null || err "mise installed but ~/.local/bin not on PATH"
    echo
    echo "Note: add this to your shell rc to keep mise active in new sessions:"
    echo "  bash/zsh:  eval \"\$(mise activate bash)\"   (or 'zsh')"
    echo "  fish:      mise activate fish | source"
    echo
  fi
  log "running 'mise install' to install Node from mise.toml"
  mise install
  eval "$(mise activate bash --shims)" 2>/dev/null || export PATH="$HOME/.local/share/mise/shims:$PATH"
fi

# --- npm dependencies (also runs husky via the 'prepare' lifecycle) ---
log "installing npm dependencies"
npm ci

log "done."
echo
echo "Verify with:"
echo "  npm run build && npm test"
