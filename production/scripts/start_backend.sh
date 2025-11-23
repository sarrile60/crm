#!/bin/bash
# Production Backend Startup Script

set -e

echo "🚀 Starting production backend..."

# Load environment variables
export $(cat /app/production/.env.production | xargs)

# Create log directory
mkdir -p /var/log/gunicorn

# Change to backend directory
cd /app/production/backend

# Start Gunicorn with Uvicorn workers
exec gunicorn main:app \
  --config gunicorn.conf.py \
  --workers $WORKERS \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 127.0.0.1:8001 \
  --access-logfile /var/log/gunicorn/access.log \
  --error-logfile /var/log/gunicorn/error.log \
  --log-level warning
