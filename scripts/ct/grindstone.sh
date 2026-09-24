#!/usr/bin/env bash
#
# Grindstone — Proxmox VE LXC provisioner (community-scripts-style, self-contained)
#
# Run ON THE PROXMOX HOST as root. Creates an unprivileged Debian/Ubuntu CT,
# then pushes scripts/install/grindstone-install.sh into it and runs it there.
#
# Every setting below is interactive with an editable default — nothing here
# assumes a template, storage name, or bridge you may not actually have.
# Pre-set any of them via env var to skip that prompt, e.g.:
#   CTID=150 HOSTNAME=grindstone bash scripts/ct/grindstone.sh
#
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_SCRIPT="${SCRIPT_DIR}/../install/grindstone-install.sh"

# ---------------------------------------------------------------------------
# Look and feel (community-scripts style)
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

fail() {
  msg_error "${1}"
  exit 1
}
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
[[ -f "$INSTALL_SCRIPT" ]] || fail "Missing ${INSTALL_SCRIPT} — run this script from within the grindstone repo."

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
# Push and run the install script inside the CT
# ---------------------------------------------------------------------------
msg_info "Pushing install script into CT $CTID"
pct push "$CTID" "$INSTALL_SCRIPT" /root/grindstone-install.sh --perms 755 || fail "pct push failed."
msg_ok "Pushed install script"

echo
echo "-- Running install inside the CT (this streams live, can take a few minutes) --"
echo
if ! pct exec "$CTID" -- env \
  GIT_REPO="$GIT_REPO" \
  GIT_BRANCH="$GIT_BRANCH" \
  GAME="$GAME" \
  APP_DIR="$APP_DIR" \
  APP_PORT="$APP_PORT" \
  bash /root/grindstone-install.sh; then
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

Re-run this script against the same CTID to redeploy after a git update
(it will fail on "CTID already exists" — destroy first with 'pct destroy $CTID --purge'
 if you want a clean rebuild, or just re-push manually):
  pct push $CTID scripts/install/grindstone-install.sh /root/grindstone-install.sh --perms 755
  pct exec $CTID -- env GIT_REPO="$GIT_REPO" GIT_BRANCH="$GIT_BRANCH" GAME="$GAME" APP_DIR="$APP_DIR" APP_PORT="$APP_PORT" bash /root/grindstone-install.sh

EOF
