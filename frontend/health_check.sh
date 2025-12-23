#!/bin/bash
# Health check for frontend - ensures build exists

if [ ! -f "/app/frontend/build/index.html" ]; then
    echo "$(date): Build missing, triggering rebuild..."
    cd /app/frontend
    yarn build
    supervisorctl restart frontend
fi
