#!/usr/bin/env bash
#
# Grindstone — Proxmox VE LXC provisioner, single self-contained file.
#
# Run ON THE PROXMOX HOST as root, either:
#   bash scripts/ct/grindstone.sh
# or piped straight from GitHub (no local checkout needed):
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/rootsysadmin/grindstone/main/scripts/ct/grindstone.sh)"
#
# Everything below is interactive with an editable default — nothing assumes
# a template, storage name, or bridge you may not actually have. Pre-set any
# of them via env var to skip that prompt, e.g.:
#   CTID=150 HOSTNAME=grindstone bash scripts/ct/grindstone.sh
#
# One file on purpose: this is meant to be run via `curl | bash`, where
# there's no second file on disk to reference (a two-file ct+install split
# doesn't work for that invocation style). The in-container install logic
# below is embedded and streamed into the CT over `pct exec`.
#
set -Eeuo pipefail

# ---------------------------------------------------------------------------
# Look and feel
# ---------------------------------------------------------------------------
YW=$'\033[33m'; GN=$'\033[1;92m'; RD=$'\033[01;31m'; BL=$'\033[36m'; CL=$'\033[m'
msg_info()  { echo -e " ${YW}○${CL} ${1}"; }
msg_ok()    { echo -e " ${GN}✓${CL} ${1}"; }
msg_error() { echo -e " ${RD}✗${CL} ${1}" >&2; }

header_info() {
  echo -e "${BL}"
  cat <<'EOF'
   ____      _           _     _
  / ___|_ __(_)_ __   __| |___| |_ ___  _ __   ___
 | |  _| '__| | '_ \ / _` / __| __/ _ \| '_ \ / _ \
 | |_| | |  | | | | | (_| \__ \ || (_) | | | |  __/
  \____|_|  |_|_| |_|\__,_|___/\__\___/|_| |_|\___|
EOF
  echo -e "${CL}"
}

fail() { msg_error "${1}"; exit 1; }
trap 'fail "Unexpected error at line $LINENO"' ERR

ask() {
  # ask VAR_NAME "Prompt text" "default"
  local __var="$1" __prompt="$2" __default="$3" __reply
  if [[ -n "${!__var:-}" ]]; then
    __default="${!__var}"
  fi
  read -rp " ${__prompt} [${__default}]: " __reply
  printf -v "$__var" '%s' "${__reply:-$__default}"
}

confirm() {
  local __prompt="$1" __default="${2:-y}" __reply
  read -rp " ${__prompt} [$([[ $__default == y ]] && echo Y/n || echo y/N)]: " __reply
  __reply="${__reply:-$__default}"
  [[ "$__reply" =~ ^[Yy] ]]
}

header_info

# ---------------------------------------------------------------------------
# Sanity checks
# ---------------------------------------------------------------------------
command -v pveversion >/dev/null 2>&1 || fail "This must run on a Proxmox VE host (pveversion not found)."
[[ $EUID -eq 0 ]] || fail "Run this as root on the Proxmox host."

# ---------------------------------------------------------------------------
# Container identity / sizing
# ---------------------------------------------------------------------------
ask CTID "Container ID" "$(pvesh get /cluster/nextid)"
pct status "$CTID" >/dev/null 2>&1 && fail "CTID $CTID already exists. Pick a different one."

ask HOSTNAME "Hostname" "grindstone"
ask CORES "CPU cores" "2"
ask RAM "RAM (MB)" "2048"
ask SWAP "Swap (MB)" "512"
ask DISK "Disk size (GB)" "8"

# ---------------------------------------------------------------------------
# Storage — list what's actually on this host instead of assuming names
# ---------------------------------------------------------------------------
echo
msg_info "Storage available on this host:"
pvesm status
echo

mapfile -t ROOTFS_STORAGES < <(pvesm status --content rootdir | awk 'NR>1{print $1}')
[[ ${#ROOTFS_STORAGES[@]} -gt 0 ]] || fail "No storage accepts container rootdir content. Check 'pvesm status'."
ask STORAGE "Storage for the CT rootfs" "${ROOTFS_STORAGES[0]}"

mapfile -t TEMPLATE_STORAGES < <(pvesm status --content vztmpl | awk 'NR>1{print $1}')
[[ ${#TEMPLATE_STORAGES[@]} -gt 0 ]] || fail "No storage accepts vztmpl (CT template) content. Check 'pvesm status'."
ask TEMPLATE_STORAGE "Storage that holds/will hold the CT template" "${TEMPLATE_STORAGES[0]}"

# ---------------------------------------------------------------------------
# Template — pick from what's actually downloaded or downloadable
# ---------------------------------------------------------------------------
echo
msg_info "Templates already on ${TEMPLATE_STORAGE}:"
EXISTING_TEMPLATES="$(pveam list "$TEMPLATE_STORAGE" 2>/dev/null | awk 'NR>1{print $1}' | sed "s#^${TEMPLATE_STORAGE}:vztmpl/##")"
echo "${EXISTING_TEMPLATES:-  (none yet)}"

if [[ -z "${TEMPLATE:-}" ]]; then
  if [[ -n "$EXISTING_TEMPLATES" ]] && confirm "Use an already-downloaded template?" y; then
    echo
    select TEMPLATE in $EXISTING_TEMPLATES; do [[ -n "$TEMPLATE" ]] && break; done
  else
    echo
    msg_info "Refreshing template index (pveam update)"
    pveam update >/dev/null
    mapfile -t CANDIDATES < <(pveam available --section system | awk '{print $2}' | grep -Ei '^(debian|ubuntu)-' | sort -V)
    [[ ${#CANDIDATES[@]} -gt 0 ]] || fail "No Debian/Ubuntu templates found — check 'pveam available' manually."
    echo
    echo "-- Debian/Ubuntu templates available to download --"
    select TEMPLATE in "${CANDIDATES[@]}"; do [[ -n "$TEMPLATE" ]] && break; done
    msg_info "Downloading $TEMPLATE"
    pveam download "$TEMPLATE_STORAGE" "$TEMPLATE" || fail "Template download failed."
    msg_ok "Downloaded $TEMPLATE"
  fi
else
  echo
  msg_info "Using TEMPLATE from environment: $TEMPLATE"
  if ! pveam list "$TEMPLATE_STORAGE" 2>/dev/null | grep -q "$TEMPLATE"; then
    pveam update >/dev/null
    pveam download "$TEMPLATE_STORAGE" "$TEMPLATE" || fail "Template download failed."
  fi
fi

# ---------------------------------------------------------------------------
# Network
# ---------------------------------------------------------------------------
echo
msg_info "Network bridges on this host:"
BRIDGES="$(ls /sys/class/net 2>/dev/null | grep '^vmbr' || true)"
echo "${BRIDGES:-  none found}"
ask BRIDGE "Bridge to attach the CT to" "$(echo "$BRIDGES" | head -n1)"

ask NET_MODE "Networking (dhcp or static)" "dhcp"

if confirm "Enable the per-CT firewall on this interface? (leave off unless you already manage Proxmox firewall rules — an enabled per-CT firewall with no rules silently drops all inbound traffic, including the app's port)" n; then
  CT_FIREWALL=1
else
  CT_FIREWALL=0
fi

if [[ "$NET_MODE" == "static" ]]; then
  ask NET_CIDR "Static IP with CIDR (e.g. 192.168.1.50/24)" "${NET_CIDR:-}"
  ask GATEWAY "Gateway IP" "${GATEWAY:-}"
  NET0="name=eth0,bridge=${BRIDGE},firewall=${CT_FIREWALL},ip=${NET_CIDR},gw=${GATEWAY}"
else
  NET0="name=eth0,bridge=${BRIDGE},firewall=${CT_FIREWALL},ip=dhcp"
fi

# ---------------------------------------------------------------------------
# App settings
# ---------------------------------------------------------------------------
echo
ask GIT_REPO "Git repo URL to deploy" "https://github.com/rootsysadmin/grindstone.git"
ask GIT_BRANCH "Git branch" "main"
ask GAME "Game slug (GAME env var for the app)" "neverness-to-everness"
ask APP_DIR "Install directory inside the CT" "/opt/grindstone"
ask APP_PORT "App port" "3001"

echo
echo "-- Summary --"
cat <<EOF
  CTID             : $CTID
  Hostname         : $HOSTNAME
  Cores/RAM/Swap/Disk: $CORES / ${RAM}MB / ${SWAP}MB / ${DISK}GB
  Rootfs storage   : $STORAGE
  Template storage : $TEMPLATE_STORAGE
  Template         : $TEMPLATE
  Network          : $NET0
  Repo             : $GIT_REPO ($GIT_BRANCH)
  Game             : $GAME
  App dir / port   : $APP_DIR / $APP_PORT
EOF
echo
confirm "Proceed?" y || fail "Aborted by user."

# ---------------------------------------------------------------------------
# Create and start the container
# ---------------------------------------------------------------------------
msg_info "Creating CT $CTID"
pct create "$CTID" "${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}" \
  --hostname "$HOSTNAME" \
  --unprivileged 1 \
  --cores "$CORES" \
  --memory "$RAM" \
  --swap "$SWAP" \
  --rootfs "${STORAGE}:${DISK}" \
  --net0 "$NET0" \
  --features nesting=0 \
  --onboot 1 \
  --start 0 || fail "pct create failed."
msg_ok "Created CT $CTID"

msg_info "Starting CT $CTID"
pct start "$CTID" || fail "pct start failed."
msg_ok "Started CT $CTID"

msg_info "Waiting for network inside the CT (up to 60s)"
NET_UP=0
for i in $(seq 1 60); do
  if pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1; then
    NET_UP=1
    break
  fi
  sleep 1
done
[[ "$NET_UP" -eq 1 ]] || fail "CT never got working DNS/network after 60s. Check 'pct exec $CTID -- ip addr' and the bridge/DHCP setup before re-running."
msg_ok "Network is up inside the CT"

# ---------------------------------------------------------------------------
# In-container install script, embedded so this stays one file even when
# run via `curl | bash` with no local checkout to reference.
# ---------------------------------------------------------------------------
read -r -d '' INSTALL_SCRIPT <<'GRINDSTONE_INSTALL_EOF' || true
set -Eeuo pipefail

YW=$'\033[33m'; GN=$'\033[1;92m'; RD=$'\033[01;31m'; CL=$'\033[m'
BFR="\\r\\033[K"
msg_info() { echo -ne " ${YW}○${CL} ${1}...\r"; }
msg_ok()   { echo -e "${BFR} ${GN}✓${CL} ${1}"; }
msg_error(){ echo -e "${BFR} ${RD}✗${CL} ${1}"; }

LOG_FILE="/root/grindstone-install.log"
: > "$LOG_FILE"

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
trap 'fail "unexpected error at line $LINENO"' ERR

GIT_REPO="${GIT_REPO:?GIT_REPO not set}"
GIT_BRANCH="${GIT_BRANCH:-main}"
GAME="${GAME:-neverness-to-everness}"
APP_DIR="${APP_DIR:-/opt/grindstone}"
APP_PORT="${APP_PORT:-3001}"
NODE_VERSION="${NODE_VERSION:-20}"

msg_info "Updating package index"
export DEBIAN_FRONTEND=noninteractive
run apt-get update || fail "apt-get update"
msg_ok "Updated package index"

msg_info "Installing base packages"
run apt-get install -y curl git ca-certificates || fail "apt-get install base packages"
msg_ok "Installed base packages"

msg_info "Installing Node.js ${NODE_VERSION}.x"
run bash -c "curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -" || fail "NodeSource setup"
run apt-get install -y nodejs || fail "apt-get install nodejs"
msg_ok "Installed Node.js $(node -v 2>/dev/null || echo "${NODE_VERSION}.x")"

msg_info "Enabling corepack"
run corepack enable || fail "corepack enable"
msg_ok "Enabled corepack"

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

msg_info "Enabling passwordless root console login"
mkdir -p /etc/systemd/system/container-getty@1.service.d
cat > /etc/systemd/system/container-getty@1.service.d/override.conf <<'INNER_EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin root --noreset --noclear - $TERM
INNER_EOF
run systemctl daemon-reload || true
msg_ok "Console will auto-login as root (pct console <ctid>)"

msg_ok "Grindstone install complete"
GRINDSTONE_INSTALL_EOF

echo
echo "-- Running install inside the CT (this streams live, can take a few minutes) --"
echo
if ! pct exec "$CTID" -- env \
  GIT_REPO="$GIT_REPO" \
  GIT_BRANCH="$GIT_BRANCH" \
  GAME="$GAME" \
  APP_DIR="$APP_DIR" \
  APP_PORT="$APP_PORT" \
  bash -c "$INSTALL_SCRIPT"; then
  fail "Install failed inside the CT — see the output above (also saved at /root/grindstone-install.log inside CT $CTID: pct exec $CTID -- cat /root/grindstone-install.log)."
fi

CT_IP="$(pct exec "$CTID" -- hostname -I | awk '{print $1}')"

echo
msg_ok "Grindstone is up"
cat <<EOF

  Container : $CTID ($HOSTNAME)
  Game      : $GAME
  URL       : http://${CT_IP}:${APP_PORT}

Root shell (no password — attaches via the host):
  pct enter $CTID

Console (auto-logs in as root, no password prompt):
  pct console $CTID

Check status inside the CT with:
  pct exec $CTID -- systemctl status grindstone
  pct exec $CTID -- journalctl -u grindstone -f

EOF
