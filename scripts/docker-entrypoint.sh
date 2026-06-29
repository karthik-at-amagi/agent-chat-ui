#!/usr/bin/env sh
set -e

mkdir -p /app/public

cat <<EOF > /app/public/env.js
window.__ENV__ = {
  NEXT_PUBLIC_VIDEO_BACKEND_URL: "${NEXT_PUBLIC_VIDEO_BACKEND_URL:-}",
  NEXT_PUBLIC_API_URL: "${NEXT_PUBLIC_API_URL:-}",
  NEXT_PUBLIC_ASSISTANT_ID: "${NEXT_PUBLIC_ASSISTANT_ID:-}",
  DEMO: "${DEMO:-}",
};
EOF

if [ -n "$PORT" ]; then
  exec "$@" -p "$PORT"
else
  exec "$@"
fi
