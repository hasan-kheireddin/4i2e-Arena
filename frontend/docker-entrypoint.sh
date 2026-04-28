#!/bin/sh
set -eu

if [ ! -x node_modules/.bin/vite ]; then
    echo "Frontend dependencies missing; installing..."
    npm install
else
    echo "Frontend dependencies present."
fi

exec "$@"
