#!/bin/bash
# Download FFmpeg WASM core files for self-hosting.
# Runs as postinstall — ensures files exist for both local dev and Vercel builds.

DIR="public/ffmpeg"
CORE_VERSION="0.12.6"
BASE_URL="https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/umd"

mkdir -p "$DIR"

# Only download if files don't exist (cached in node_modules/.cache on Vercel)
if [ ! -f "$DIR/ffmpeg-core.wasm" ]; then
  echo "Downloading FFmpeg WASM core v${CORE_VERSION}..."
  curl -sL -o "$DIR/ffmpeg-core.js" "${BASE_URL}/ffmpeg-core.js"
  curl -sL -o "$DIR/ffmpeg-core.wasm" "${BASE_URL}/ffmpeg-core.wasm"
  echo "FFmpeg WASM files downloaded to ${DIR}/"
else
  echo "FFmpeg WASM files already present."
fi
