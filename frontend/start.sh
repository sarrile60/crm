#!/bin/bash
set -e

cd /app/frontend

echo "$(date): Frontend startup script running..."

# Check if build directory exists and has index.html
if [ ! -f "build/index.html" ]; then
    echo "$(date): Build directory missing or incomplete. Running yarn build..."
    yarn build
else
    echo "$(date): Build directory exists."
fi

# Ensure serve.json exists in build folder (critical fix!)
if [ ! -f "build/serve.json" ]; then
    echo "$(date): Creating serve.json in build folder..."
    echo '{"rewrites":[{"source":"/**","destination":"/index.html"}],"headers":[{"source":"**/*.@(js|css)","headers":[{"key":"Cache-Control","value":"public, max-age=31536000, immutable"}]}]}' > build/serve.json
fi

echo "$(date): Starting frontend server..."
# Use serve.json from build folder directly (FIXED!)
exec serve -s build -l 3000
