#!/usr/bin/env bash
#
# Grindstone — Proxmox VE LXC installer
#
# Run this ON THE PROXMOX HOST (as root), not inside a container.
# It creates a new unprivileged Debian LXC, installs Node.js + pnpm,
# clones/builds Grindstone, and runs it as a systemd service.
#
# Usage:
#   bash proxmox-install.sh
#
# All settings can be overridden via environment variables, e.g.:
#   CTID=150 HOSTNAME=grindstone RAM=2048 DISK=8 bash proxmox-install.sh
#
set -Eeuo pipefail

# ---------------------------------------------------------------------------
# Defaults (override via env vars before running, or edit here)
# ---------------------------------------------------------------------------
CTID="${CTID:-$(pvesh get /cluster/nextid)}"
HOSTNAME="${HOSTNAME:-grindstone}"
DISK="${DISK:-8}"              # GB
CORES="${CORES:-2}"
RAM="${RAM:-2048}"             # MB
SWAP="${SWAP:-512}"            # MB
BRIDGE="${BRIDGE:-vmbr0}"
NET_CONFIG="${NET_CONFIG:-dhcp}"   # "dhcp" or a static CIDR e.g. 192.168.1.50/24
GATEWAY="${GATEWAY:-}"             # required if NET_CONFIG is static
STORAGE="${STORAGE:-local-lvm}"    # storage for the CT rootfs
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"  # storage that holds CT templates
TEMPLATE="${TEMPLATE:-debian-12-standard_12.7-1_amd64.tar.zst}"

GIT_REPO="${GIT_REPO:-https://github.com/rootsysadmin/grindstone.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"
GAME="${GAME:-neverness-to-everness}"
APP_DIR="${APP_DIR:-/opt/grindstone}"
APP_PORT="${APP_PORT:-3001}"

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

if pct status "$CTID" >/dev/null 2>&1; then
  echo "CTID $CTID already exists. Set CTID=<free id> and re-run." >&2
  exit 1
fi

echo "==> Installing Grindstone into new CT $CTID ($HOSTNAME)"

# ---------------------------------------------------------------------------
# Ensure the CT template is present
# ---------------------------------------------------------------------------
if ! pveam list "$TEMPLATE_STORAGE" | grep -q "$TEMPLATE"; then
  echo "==> Downloading CT template $TEMPLATE"
  pveam update
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"
fi

# ---------------------------------------------------------------------------
# Create and start the container
# ---------------------------------------------------------------------------
if [[ "$NET_CONFIG" == "dhcp" ]]; then
  NET0="name=eth0,bridge=${BRIDGE},firewall=1,ip=dhcp"
else
  if [[ -z "$GATEWAY" ]]; then
    echo "NET_CONFIG is static ($NET_CONFIG) but GATEWAY is not set." >&2
    exit 1
  fi
  NET0="name=eth0,bridge=${BRIDGE},firewall=1,ip=${NET_CONFIG},gw=${GATEWAY}"
fi

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

# Give the container a moment to bring up networking
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
