#!/bin/bash
set -e

cd /app/frontend

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [FRONTEND] $1"
}

log "Starting frontend service..."

# Failsafe 1: Ensure serve.json exists in root
if [ ! -f "serve.json" ]; then
    log "Creating serve.json in root..."
    cat > serve.json << 'SERVEJSON'
{
  "rewrites": [{ "source": "/**", "destination": "/index.html" }],
  "headers": [{ "source": "**/*.@(js|css)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }]
}
SERVEJSON
fi

# Failsafe 2: Ensure public/serve.json exists (for future builds)
if [ ! -f "public/serve.json" ]; then
    log "Creating serve.json in public folder..."
    cp serve.json public/serve.json
fi

# Failsafe 3: Check if build directory exists and is valid
if [ ! -f "build/index.html" ]; then
    log "Build directory missing or invalid. Rebuilding..."
    yarn build
    log "Build complete."
fi

# Failsafe 4: ALWAYS ensure serve.json is in build folder before starting
log "Ensuring serve.json in build folder..."
cp serve.json build/serve.json 2>/dev/null || cat > build/serve.json << 'SERVEJSON'
{
  "rewrites": [{ "source": "/**", "destination": "/index.html" }],
  "headers": [{ "source": "**/*.@(js|css)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }]
}
SERVEJSON

# Verify all required files exist
if [ ! -f "build/index.html" ] || [ ! -f "build/serve.json" ]; then
    log "ERROR: Required files missing after all failsafes!"
    exit 1
fi

log "All checks passed. Starting serve..."

# Start serve WITHOUT --config flag (it auto-detects build/serve.json)
exec serve -s build -l 3000
