#!/bin/bash
set -e

echo "Waiting for database..."
while ! python -c "
import sys, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django; django.setup()
from django.db import connections
try:
    connections['default'].ensure_connection()
    sys.exit(0)
except Exception:
    sys.exit(1)
" 2>/dev/null; do
    echo " Database not ready, retrying in 2s..."
    sleep 2
done
echo "Database is ready!"

echo "Waiting for Redis..."
while ! python -c "
import os, sys, redis
try:
    r = redis.from_url(os.environ.get('REDIS_URL', 'redis://redis:6379/0'), socket_connect_timeout=2)
    r.ping()
    sys.exit(0)
except Exception:
    sys.exit(1)
" 2>/dev/null; do
    echo " Redis not ready, retrying in 2s..."
    sleep 2
done
echo "Redis is ready!"

echo "Creating migrations..."
python manage.py makemigrations --noinput
echo "Applying migrations..."
python manage.py migrate --noinput
echo "Migrations applied."

echo "Collecting static files..."
python manage.py collectstatic --noinput 2>/dev/null || true
echo "Static files collected."

echo "Starting server..."
exec "$@"
