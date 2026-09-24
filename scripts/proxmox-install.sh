#!/usr/bin/env bash
#
# Grindstone — Proxmox VE LXC installer
#
# Run this ON THE PROXMOX HOST (as root), not inside a container.
# It creates a new unprivileged Debian/Ubuntu LXC, installs Node.js + pnpm,
# clones/builds Grindstone, and runs it as a systemd service.
#
# Interactive by default — it will ask about your CT template, storage,
# network, etc. instead of assuming names that may not exist on your host.
# Every prompt shows a default (editable) so you can just press Enter to
# accept, and every value can also be pre-set via an environment variable,
# e.g.:
#   CTID=150 HOSTNAME=grindstone bash proxmox-install.sh
#
set -Eeuo pipefail

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
ask() {
  # ask VAR_NAME "Prompt text" "default"
  local __var="$1" __prompt="$2" __default="$3" __reply
  if [[ -n "${!__var:-}" ]]; then
    # already set via env — show it and let the user override or accept
    __default="${!__var}"
  fi
  read -rp "${__prompt} [${__default}]: " __reply
  printf -v "$__var" '%s' "${__reply:-$__default}"
}

confirm() {
  local __prompt="$1" __default="${2:-y}" __reply
  read -rp "${__prompt} [$([[ $__default == y ]] && echo Y/n || echo y/N)]: " __reply
  __reply="${__reply:-$__default}"
  [[ "$__reply" =~ ^[Yy] ]]
}

# ---------------------------------------------------------------------------
# Sanity checks
# ---------------------------------------------------------------------------
if ! command -v pveversion >/dev/null 2>&1; then
  echo "This script must run on a Proxmox VE host (pveversion not found)." >&2
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "Run this script as root on the Proxmox host." >&2
  exit 1
fi

echo "== Grindstone Proxmox LXC installer =="
echo

# ---------------------------------------------------------------------------
# Container identity / sizing
# ---------------------------------------------------------------------------
ask CTID "Container ID" "$(pvesh get /cluster/nextid)"

if pct status "$CTID" >/dev/null 2>&1; then
  echo "CTID $CTID already exists. Pick a different one." >&2
  exit 1
fi

ask HOSTNAME "Hostname" "grindstone"
ask CORES "CPU cores" "2"
ask RAM "RAM (MB)" "2048"
ask SWAP "Swap (MB)" "512"
ask DISK "Disk size (GB)" "8"

# ---------------------------------------------------------------------------
# Storage — list what's actually on this host instead of assuming names
# ---------------------------------------------------------------------------
echo
echo "-- Storage available on this host --"
pvesm status | awk 'NR==1{print;next}{print}'
echo

mapfile -t ROOTFS_STORAGES < <(pvesm status --content rootdir | awk 'NR>1{print $1}')
if [[ ${#ROOTFS_STORAGES[@]} -eq 0 ]]; then
  echo "No storage on this host accepts container rootdir content. Check 'pvesm status'." >&2
  exit 1
fi
DEFAULT_ROOTFS_STORAGE="${ROOTFS_STORAGES[0]}"
ask STORAGE "Storage for the CT rootfs (from the list above)" "$DEFAULT_ROOTFS_STORAGE"

mapfile -t TEMPLATE_STORAGES < <(pvesm status --content vztmpl | awk 'NR>1{print $1}')
if [[ ${#TEMPLATE_STORAGES[@]} -eq 0 ]]; then
  echo "No storage on this host accepts vztmpl (CT template) content. Check 'pvesm status'." >&2
  exit 1
fi
DEFAULT_TEMPLATE_STORAGE="${TEMPLATE_STORAGES[0]}"
ask TEMPLATE_STORAGE "Storage that holds/will hold the CT template" "$DEFAULT_TEMPLATE_STORAGE"

# ---------------------------------------------------------------------------
# Template — pick from what's actually downloaded or downloadable
# ---------------------------------------------------------------------------
echo
echo "-- Templates already downloaded on ${TEMPLATE_STORAGE} --"
EXISTING_TEMPLATES="$(pveam list "$TEMPLATE_STORAGE" 2>/dev/null | awk 'NR>1{print $1}' | sed "s#^${TEMPLATE_STORAGE}:vztmpl/##")"
if [[ -n "$EXISTING_TEMPLATES" ]]; then
  echo "$EXISTING_TEMPLATES"
else
  echo "(none yet)"
fi

if [[ -z "${TEMPLATE:-}" ]]; then
  if [[ -n "$EXISTING_TEMPLATES" ]] && confirm "Use an already-downloaded template?" y; then
    echo
    select TEMPLATE in $EXISTING_TEMPLATES; do
      [[ -n "$TEMPLATE" ]] && break
    done
  else
    echo
    echo "Refreshing template index (pveam update)..."
    pveam update >/dev/null
    echo
    echo "-- Debian/Ubuntu templates available to download --"
    mapfile -t CANDIDATES < <(pveam available --section system | awk '{print $2}' | grep -Ei '^(debian|ubuntu)-' | sort -V)
    if [[ ${#CANDIDATES[@]} -eq 0 ]]; then
      echo "No Debian/Ubuntu templates found in the index — pick manually with 'pveam available'." >&2
      exit 1
    fi
    select TEMPLATE in "${CANDIDATES[@]}"; do
      [[ -n "$TEMPLATE" ]] && break
    done
    echo "==> Downloading $TEMPLATE"
    pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"
  fi
else
  echo
  echo "Using TEMPLATE from environment: $TEMPLATE"
  if ! pveam list "$TEMPLATE_STORAGE" 2>/dev/null | grep -q "$TEMPLATE"; then
    echo "==> Not present on ${TEMPLATE_STORAGE}, downloading"
    pveam update >/dev/null
    pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"
  fi
fi

# ---------------------------------------------------------------------------
# Network
# ---------------------------------------------------------------------------
echo
echo "-- Network bridges on this host --"
BRIDGES="$(ls /sys/class/net 2>/dev/null | grep '^vmbr' || true)"
echo "${BRIDGES:-none found}"
ask BRIDGE "Bridge to attach the CT to" "$(echo "$BRIDGES" | head -n1)"

ask NET_MODE "Networking (dhcp or static)" "dhcp"
if [[ "$NET_MODE" == "static" ]]; then
  ask NET_CIDR "Static IP with CIDR (e.g. 192.168.1.50/24)" "${NET_CIDR:-}"
  ask GATEWAY "Gateway IP" "${GATEWAY:-}"
  NET0="name=eth0,bridge=${BRIDGE},firewall=1,ip=${NET_CIDR},gw=${GATEWAY}"
else
  NET0="name=eth0,bridge=${BRIDGE},firewall=1,ip=dhcp"
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
  CTID            : $CTID
  Hostname        : $HOSTNAME
  Cores / RAM / Swap / Disk : $CORES / ${RAM}MB / ${SWAP}MB / ${DISK}GB
  Rootfs storage  : $STORAGE
  Template storage: $TEMPLATE_STORAGE
  Template        : $TEMPLATE
  Network         : $NET0
  Repo            : $GIT_REPO ($GIT_BRANCH)
  Game            : $GAME
  App dir / port  : $APP_DIR / $APP_PORT
EOF
echo
confirm "Proceed with these settings?" y || { echo "Aborted."; exit 1; }

# ---------------------------------------------------------------------------
# Create and start the container
# ---------------------------------------------------------------------------
echo "==> Creating CT $CTID"
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
  --start 0

echo "==> Starting CT $CTID"
pct start "$CTID"

echo "==> Waiting for network inside the CT"
for i in $(seq 1 30); do
  if pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# ---------------------------------------------------------------------------
# Provision Grindstone inside the CT
# ---------------------------------------------------------------------------
echo "==> Installing dependencies inside CT $CTID"
pct exec "$CTID" -- bash -c '
  set -Eeuo pipefail
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y curl git ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  corepack enable
'

echo "==> Cloning Grindstone (${GIT_REPO}#${GIT_BRANCH}) into ${APP_DIR}"
pct exec "$CTID" -- bash -c "
  set -Eeuo pipefail
  git clone --branch '${GIT_BRANCH}' --depth 1 '${GIT_REPO}' '${APP_DIR}'
"

echo "==> Installing and building"
pct exec "$CTID" -- bash -c "
  set -Eeuo pipefail
  cd '${APP_DIR}'
  pnpm install --frozen-lockfile
  pnpm build
  mkdir -p '${APP_DIR}/data/images'
"

echo "==> Creating systemd service"
pct exec "$CTID" -- bash -c "
  set -Eeuo pipefail
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
ExecStart=/usr/bin/node ${APP_DIR}/apps/api/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now grindstone
"

CT_IP="$(pct exec "$CTID" -- hostname -I | awk '{print $1}')"

cat <<EOF

==> Done.

  Container : $CTID ($HOSTNAME)
  Game      : $GAME
  URL       : http://${CT_IP}:${APP_PORT}

Check status inside the CT with:
  pct exec $CTID -- systemctl status grindstone
  pct exec $CTID -- journalctl -u grindstone -f

Re-deploy after a git update:
  pct exec $CTID -- bash -c "cd ${APP_DIR} && git pull && pnpm install --frozen-lockfile && pnpm build && systemctl restart grindstone"

EOF
