#!/bin/sh
# Vercel-like build on other Node versions: CI=1, NODE_ENV=production, no Windows-only state.
cd /tmp
for V in 20.19.5 22.20.0; do
  D=/tmp/node-$V
  if [ ! -x $D/bin/node ]; then
    curl -fsSL https://nodejs.org/dist/v$V/node-v$V-linux-x64.tar.xz -o n.tar.xz || { echo "download $V failed"; continue; }
    mkdir -p $D && tar -xf n.tar.xz -C $D --strip-components=1
  fi
  export PATH=$D/bin:$PATH
  echo "=== node $(node --version)"
  rm -rf /tmp/vtest && git clone -q --depth 1 https://github.com/rdndany/srift-frontend.git /tmp/vtest
  cd /tmp/vtest
  CI=1 npm install 2>&1 | tail -3
  cd apps/web
  CI=1 NODE_ENV=production npm run build 2>&1 | grep -v telemetry | tail -25
  cd /tmp
done
