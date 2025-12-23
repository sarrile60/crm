#!/bin/bash
set -e

cd /app/frontend

# Check if build directory exists and has index.html
if [ ! -f "build/index.html" ]; then
    echo "Build directory missing or incomplete. Running yarn build..."
    yarn build
fi

# Ensure serve.json exists in both locations
if [ ! -f "serve.json" ]; then
    echo '{"rewrites":[{"source":"/**","destination":"/index.html"}]}' > serve.json
fi

if [ ! -f "build/serve.json" ]; then
    cp serve.json build/
fi

echo "Starting frontend server..."
exec serve -s build -l 3000 --config serve.json
