#!/bin/bash
set -e

cd /app/frontend

echo "$(date): Frontend startup script running..."

# Check if build directory exists and has index.html
if [ ! -f "build/index.html" ]; then
    echo "$(date): Build directory missing or incomplete. Running yarn build..."
    yarn build
else
    echo "$(date): Build directory exists, starting server..."
fi

# Ensure serve.json exists
if [ ! -f "serve.json" ]; then
    echo '{"rewrites":[{"source":"/**","destination":"/index.html"}],"headers":[{"source":"**/*.@(js|css)","headers":[{"key":"Cache-Control","value":"public, max-age=31536000, immutable"}]}]}' > serve.json
fi

if [ ! -f "build/serve.json" ]; then
    cp serve.json build/
fi

echo "$(date): Starting frontend server..."
exec serve -s build -l 3000 --config serve.json
