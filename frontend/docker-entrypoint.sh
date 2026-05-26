#!/bin/sh
set -eu

has_usable_deps() {
    [ -x node_modules/.bin/vite ] || return 1
    node -e "require('rollup')" >/dev/null 2>&1 || return 1
    node node_modules/vite/bin/vite.js --version >/dev/null 2>&1 || return 1
}

if ! has_usable_deps; then
    echo "Frontend dependencies missing or incomplete; installing..."
    mkdir -p node_modules
    find node_modules -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
    npm ci --include=optional --no-audit --no-fund
    if ! has_usable_deps; then
        echo "Frontend dependencies still incomplete after install." >&2
        exit 1
    fi
else
    echo "Frontend dependencies present."
fi

exec "$@"
