#!/usr/bin/env bash
# First-time setup of a fresh Ubuntu (22.04 or 24.04) droplet for the SolRift game server. Run once, as root:
#   bash setup-droplet.sh https://github.com/rdndany/srift-backend.git api.toklytest.site
# It installs Node 24, Caddy and a firewall, makes the `solrift` user, fetches the code into /opt/solrift and installs the
# service. It stops before starting it: fill in /etc/solrift.env first (see deploy/solrift.env.example), then
#   systemctl enable --now solrift-server
set -euo pipefail

REPO="${1:?usage: setup-droplet.sh <git repository url> <api domain, e.g. api.example.com>}"
DOMAIN="${2:?usage: setup-droplet.sh <git repository url> <api domain, e.g. api.example.com>}"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl git ufw gpg debian-keyring debian-archive-keyring apt-transport-https ca-certificates

# Node 24 (the game server uses node:sqlite, which needs Node 22.13 or newer).
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

# Caddy: the https front door.
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

# Firewall: ssh, http and https only (the game port 8787 stays behind Caddy).
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# The service user and the code.
id solrift >/dev/null 2>&1 || useradd --system --home-dir /opt/solrift --shell /usr/sbin/nologin solrift
mkdir -p /opt/solrift
chown solrift:solrift /opt/solrift
if [ ! -d /opt/solrift/.git ]; then
  sudo -u solrift git clone "$REPO" /opt/solrift
fi
cd /opt/solrift
# Only what the server needs (not the browser game's packages).
sudo -u solrift npm ci --workspace=@solrift/server --include-workspace-root --ignore-scripts

# Settings, Caddy and the service.
if [ ! -f /etc/solrift.env ]; then
  install -m 600 -o root -g root deploy/solrift.env.example /etc/solrift.env
  echo ">> Edit /etc/solrift.env (AUTH_ORIGINS, COOKIE_DOMAIN) before starting the server."
fi
sed -E "s/^[A-Za-z0-9.-]+ \{/${DOMAIN} {/" deploy/Caddyfile > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy
cp deploy/solrift-server.service /etc/systemd/system/solrift-server.service
systemctl daemon-reload

echo
echo "Done. Next: nano /etc/solrift.env, then: systemctl enable --now solrift-server"
echo "Check: curl https://${DOMAIN}/health   (the DNS record for ${DOMAIN} must already point at this droplet)"
