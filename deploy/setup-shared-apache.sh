#!/usr/bin/env bash
# Setup for a droplet that ALREADY runs other things (Apache on port 80, other Node versions, a firewall in use).
# Unlike setup-droplet.sh it installs no Caddy, leaves the system Node and the firewall alone, and only ADDS to Apache:
# one new site for the api domain (a reverse proxy, with WebSocket) and a certificate for it through certbot.
#   bash setup-shared-apache.sh https://github.com/rdndany/srift-backend.git api.toklytest.site
# Node 24 goes to /opt/node24 (the game server uses node:sqlite, which needs Node 22.13+), used only by the game's service.
# Safe to run again.
set -euo pipefail

REPO="${1:?usage: setup-shared-apache.sh <git repository url> <api domain>}"
DOMAIN="${2:?usage: setup-shared-apache.sh <git repository url> <api domain>}"
NODE_DIR=/opt/node24

export DEBIAN_FRONTEND=noninteractive
apt-get install -y xz-utils git curl >/dev/null

# Node 24, on its own.
if [ ! -x "$NODE_DIR/bin/node" ]; then
  base=https://nodejs.org/dist/latest-v24.x
  file=$(curl -fsSL "$base/SHASUMS256.txt" | awk '/linux-x64\.tar\.xz$/ {print $2}')
  curl -fsSL "$base/$file" -o /tmp/node24.tar.xz
  mkdir -p "$NODE_DIR"
  tar -xJf /tmp/node24.tar.xz -C "$NODE_DIR" --strip-components=1
  rm /tmp/node24.tar.xz
fi
export PATH="$NODE_DIR/bin:$PATH"
node -v

# The service user and the code.
id solrift >/dev/null 2>&1 || useradd --system --home-dir /opt/solrift --shell /usr/sbin/nologin solrift
mkdir -p /opt/solrift
chown solrift:solrift /opt/solrift
[ -d /opt/solrift/.git ] || sudo -u solrift git clone "$REPO" /opt/solrift
cd /opt/solrift
sudo -u solrift git pull --ff-only
sudo -u solrift env PATH="$PATH" npm ci --workspace=@solrift/server --include-workspace-root --ignore-scripts

# Settings (the example already has the right addresses) and the service, run with Node 24.
[ -f /etc/solrift.env ] || install -m 600 -o root -g root deploy/solrift.env.example /etc/solrift.env
cp deploy/solrift-server.service /etc/systemd/system/solrift-server.service
mkdir -p /etc/systemd/system/solrift-server.service.d
cat > /etc/systemd/system/solrift-server.service.d/node.conf <<EOF
[Service]
ExecStart=
ExecStart=$NODE_DIR/bin/node --import tsx apps/server/src/index.ts
EOF
systemctl daemon-reload
systemctl enable solrift-server
systemctl restart solrift-server

# Apache: a new site for the api domain only. Existing sites are not edited.
a2enmod proxy proxy_http proxy_wstunnel rewrite headers ssl >/dev/null
cat > "/etc/apache2/sites-available/${DOMAIN}.conf" <<EOF
<VirtualHost *:80>
    ServerName ${DOMAIN}
    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "http"
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /(.*) ws://127.0.0.1:8787/\$1 [P,L]
    ProxyPass / http://127.0.0.1:8787/
    ProxyPassReverse / http://127.0.0.1:8787/
    ErrorLog \${APACHE_LOG_DIR}/${DOMAIN}-error.log
    CustomLog \${APACHE_LOG_DIR}/${DOMAIN}-access.log combined
</VirtualHost>
EOF
a2ensite "${DOMAIN}" >/dev/null
apache2ctl configtest
systemctl reload apache2

# The certificate (certbot adds the https site and the redirect, and renews it by itself).
certbot --apache -d "${DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email --redirect

# https needs the proxy header to say https.
conf="/etc/apache2/sites-available/${DOMAIN}-le-ssl.conf"
if [ -f "$conf" ] && ! grep -q 'X-Forwarded-Proto "https"' "$conf"; then
  sed -i 's|RequestHeader set X-Forwarded-Proto "http"|RequestHeader set X-Forwarded-Proto "https"|' "$conf"
fi
apache2ctl configtest
systemctl reload apache2

echo
echo "Done. Check: curl -i https://${DOMAIN}/health     Logs: journalctl -u solrift-server -f"
