#!/usr/bin/env bash
# Bring the game server up to date with the repository (run on the droplet, as root): bash /opt/solrift/deploy/update-server.sh
# The world is kept: it lives in /var/lib/solrift, not in the code folder. Players are disconnected for a few seconds.
set -euo pipefail
cd /opt/solrift
sudo -u solrift git pull --ff-only
sudo -u solrift npm ci --workspace=@solrift/server --include-workspace-root --ignore-scripts
systemctl restart solrift-server
sleep 3
systemctl --no-pager --lines=5 status solrift-server
curl -fsS http://127.0.0.1:8787/health && echo
