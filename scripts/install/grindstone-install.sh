#!/usr/bin/env bash
#
# Grindstone — in-container install script.
# Not meant to be run by hand: scripts/ct/grindstone.sh pushes this into a
# freshly-created CT and executes it there. Styled after community-scripts'
# ct/install script conventions (color output, msg_info/msg_ok/msg_error,
# a trap-based error handler) but fully self-contained — nothing here is
# fetched from the network except your own git repo and apt/npm packages.
#
set -Eeuo pipefail

# ---------------------------------------------------------------------------
# Look and feel (community-scripts style)
# ---------------------------------------------------------------------------
YW=$'\033[33m'; GN=$'\033[1;92m'; RD=$'\033[01;31m'; CL=$'\033[m'
BFR="\\r\\033[K"
msg_info() { echo -ne " ${YW}○${CL} ${1}...\r"; }
msg_ok()   { echo -e "${BFR} ${GN}✓${CL} ${1}"; }
msg_error(){ echo -e "${BFR} ${RD}✗${CL} ${1}"; }

LOG_FILE="/root/grindstone-install.log"
: > "$LOG_FILE"

# Run a command, keep the terminal quiet, but capture everything so a
# failure can show exactly what went wrong instead of a bare "exit 1".
run() {
  if ! "$@" >>"$LOG_FILE" 2>&1; then
    return 1
  fi
}

fail() {
  msg_error "Install failed: ${1}. Last 30 lines of ${LOG_FILE}:"
  tail -n 30 "$LOG_FILE" 2>/dev/null || true
  exit 1
}

# Safety net for anything that fails outside an explicit `run ... || fail`
# (e.g. a plain shell builtin), so we never just die with a bare exit code.
trap 'fail "unexpected error at line $LINENO"' ERR

# ---------------------------------------------------------------------------
# Inputs (passed in as env vars by scripts/ct/grindstone.sh via `env`)
# ---------------------------------------------------------------------------
GIT_REPO="${GIT_REPO:?GIT_REPO not set}"
GIT_BRANCH="${GIT_BRANCH:-main}"
GAME="${GAME:-neverness-to-everness}"
APP_DIR="${APP_DIR:-/opt/grindstone}"
APP_PORT="${APP_PORT:-3001}"
NODE_VERSION="${NODE_VERSION:-20}"

# ---------------------------------------------------------------------------
# Base packages
# ---------------------------------------------------------------------------
msg_info "Updating package index"
export DEBIAN_FRONTEND=noninteractive
run apt-get update || fail "apt-get update"
msg_ok "Updated package index"

msg_info "Installing base packages"
run apt-get install -y curl git ca-certificates || fail "apt-get install base packages"
msg_ok "Installed base packages"

# ---------------------------------------------------------------------------
# Node.js — NodeSource repo, then corepack enable (NOT a forced pnpm version:
# this repo pins its pnpm version via package.json's "packageManager" field,
# and corepack reads that automatically so the build uses exactly the
# version the repo declares, not whatever's newest).
# ---------------------------------------------------------------------------
msg_info "Installing Node.js ${NODE_VERSION}.x"
run bash -c "curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -" || fail "NodeSource setup"
run apt-get install -y nodejs || fail "apt-get install nodejs"
msg_ok "Installed Node.js $(node -v 2>/dev/null || echo "${NODE_VERSION}.x")"

msg_info "Enabling corepack"
run corepack enable || fail "corepack enable"
msg_ok "Enabled corepack"

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
msg_info "Cloning ${GIT_REPO} (${GIT_BRANCH})"
if [[ -d "$APP_DIR/.git" ]]; then
  run git -C "$APP_DIR" fetch --depth 1 origin "$GIT_BRANCH" || fail "git fetch"
  run git -C "$APP_DIR" reset --hard "origin/${GIT_BRANCH}" || fail "git reset"
else
  run git clone --branch "$GIT_BRANCH" --depth 1 "$GIT_REPO" "$APP_DIR" || fail "git clone"
fi
msg_ok "Cloned repo into ${APP_DIR}"

msg_info "Installing dependencies (pnpm install) — this can take a few minutes"
run bash -c "cd '$APP_DIR' && pnpm install --frozen-lockfile" || fail "pnpm install"
msg_ok "Installed dependencies"

msg_info "Building (pnpm build)"
run bash -c "cd '$APP_DIR' && pnpm build" || fail "pnpm build"
msg_ok "Built app"

mkdir -p "$APP_DIR/data/images"

if [[ ! -f "$APP_DIR/apps/api/dist/index.js" ]]; then
  msg_error "Build finished but ${APP_DIR}/apps/api/dist/index.js is missing — see ${LOG_FILE}"
  exit 1
fi

# ---------------------------------------------------------------------------
# systemd service
# ---------------------------------------------------------------------------
msg_info "Creating systemd service"
cat > /etc/systemd/system/grindstone.service <<EOF
[Unit]
Description=Grindstone
After=network.target

[Service]
Type=simple
Environment=NODE_ENV=production
Environment=GAME=${GAME}
Environment=PORT=${APP_PORT}
Environment=DATA_DIR=${APP_DIR}/data
WorkingDirectory=${APP_DIR}
ExecStart=${APP_DIR}/apps/api/node_modules/.bin/tsx ${APP_DIR}/apps/api/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
run systemctl daemon-reload || fail "systemctl daemon-reload"
run systemctl enable --now grindstone || fail "systemctl enable grindstone"
msg_ok "Created and started grindstone.service"

# Confirm it's actually listening before declaring success, not just that
# systemd thinks it started (a crash-looping unit still reports "active"
# for the instant right after each restart).
msg_info "Verifying the app is listening on :${APP_PORT}"
LISTENING=0
for i in $(seq 1 15); do
  if ss -tln 2>/dev/null | grep -q ":${APP_PORT} "; then
    LISTENING=1
    break
  fi
  sleep 1
done
if [[ "$LISTENING" -eq 1 ]]; then
  msg_ok "App is listening on :${APP_PORT}"
else
  msg_error "Nothing is listening on :${APP_PORT} after 15s. journalctl -u grindstone:"
  journalctl -u grindstone --no-pager -n 40 || true
  exit 1
fi

# ---------------------------------------------------------------------------
# Root console autologin (unprivileged CT, no password set — pct console
# would otherwise sit at an unusable login prompt since there's no valid
# credential to type)
# ---------------------------------------------------------------------------
msg_info "Enabling passwordless root console login"
mkdir -p /etc/systemd/system/container-getty@1.service.d
cat > /etc/systemd/system/container-getty@1.service.d/override.conf <<'EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin root --noreset --noclear - $TERM
EOF
run systemctl daemon-reload || true
msg_ok "Console will auto-login as root (pct console <ctid>)"

msg_ok "Grindstone install complete"
